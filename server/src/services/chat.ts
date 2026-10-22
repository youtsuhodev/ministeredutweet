import { getOne, query } from '../config/database.js';
import { logModAction } from './moderation.js';
import { chatOnlineCount, publishToChat } from './realtime.js';

/* Salon public : un seul fil, ouvert à tous les comptes. Texte seul, messages courts, conservation limitée. */

export const CHAT_MAX_LENGTH = 500;
const RETENTION_DAYS = Math.max(1, Math.min(365, Number(process.env.CHAT_RETENTION_DAYS) || 30));

export class ChatError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface ChatMessageDto {
  id: number;
  createdAt: number;
  body: string;
  deleted: boolean;
  author: {
    uid: string;
    pseudo: string;
    displayName: string | null;
    avatar: string | null;
    verified: boolean;
    role: string;
  };
}

interface Row {
  id: number;
  uid: string;
  body: string;
  created_at: number;
  deleted_at: number | null;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
  verified: number;
  role: string;
}

const SELECT = `SELECT m.id, m.uid, m.body, m.created_at, m.deleted_at, u.pseudo, u.displayName, u.avatar, u.verified, u.role
                FROM chat_messages m JOIN users u ON u.uid = m.uid`;

function toDto(r: Row): ChatMessageDto {
  const deleted = r.deleted_at != null;
  return {
    id: Number(r.id),
    createdAt: Number(r.created_at),
    body: deleted ? '' : r.body,
    deleted,
    author: {
      uid: r.uid,
      pseudo: r.pseudo,
      displayName: r.displayName,
      avatar: r.avatar,
      verified: !!r.verified,
      role: r.role,
    },
  };
}

/* Derniers messages (ordre chronologique), ou ceux d'avant `beforeId`. Les comptes bloqués (dans un sens ou
   l'autre) sont masqués. */
export async function listChat(viewerUid: string, beforeId: number | null, limit: number) {
  const lim = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = await query<Row[]>(
    `${SELECT}
     WHERE (? IS NULL OR m.id < ?)
       AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_uid = ? AND b.blocked_uid = m.uid) OR (b.blocker_uid = m.uid AND b.blocked_uid = ?))
     ORDER BY m.id DESC LIMIT ${lim + 1}`,
    [beforeId, beforeId, viewerUid, viewerUid],
  );
  const hasMore = rows.length > lim;
  return { messages: rows.slice(0, lim).reverse().map(toDto), hasMore, online: chatOnlineCount() };
}

/* Anti-doublon : le même texte du même compte dans les 30 s est refusé. */
const lastSent = new Map<string, { body: string; at: number }>();

export function cleanChatBody(raw: unknown): string {
  if (typeof raw !== 'string') throw new ChatError('Message invalide');
  const body = raw
    // biome-ignore lint/suspicious/noControlCharactersInRegex: on retire volontairement les caractères de contrôle
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!body) throw new ChatError('Message vide');
  if (body.length > CHAT_MAX_LENGTH) throw new ChatError(`Message trop long (${CHAT_MAX_LENGTH} caractères maximum)`);
  return body;
}

async function blockPeers(uid: string): Promise<Set<string>> {
  const rows = await query<{ blocker_uid: string; blocked_uid: string }[]>(
    'SELECT blocker_uid, blocked_uid FROM blocks WHERE blocker_uid = ? OR blocked_uid = ?',
    [uid, uid],
  );
  const peers = new Set<string>();
  for (const r of rows) peers.add(r.blocker_uid === uid ? r.blocked_uid : r.blocker_uid);
  return peers;
}

export async function sendChat(uid: string, raw: unknown): Promise<ChatMessageDto> {
  const body = cleanChatBody(raw);
  const prev = lastSent.get(uid);
  const now = Date.now();
  if (prev && prev.body === body && now - prev.at < 30_000)
    throw new ChatError('Tu viens déjà d’envoyer ce message', 429);
  const result = await query<{ insertId: number }>(
    'INSERT INTO chat_messages (uid, body, created_at) VALUES (?, ?, ?)',
    [uid, body, now],
  );
  lastSent.set(uid, { body, at: now });
  if (lastSent.size > 5000) lastSent.clear();
  const row = await getOne<Row>(`${SELECT} WHERE m.id = ?`, [result.insertId]);
  if (!row) throw new ChatError('Envoi impossible', 500);
  const dto = toDto(row);
  publishToChat({ type: 'chat_message', message: dto }, await blockPeers(uid));
  return dto;
}

/* Suppression par l'auteur, ou par la modération (tracée dans le journal de modération). */
export async function deleteChat(actor: { uid: string; role: string }, id: number): Promise<void> {
  const row = await getOne<{ uid: string; deleted_at: number | null }>(
    'SELECT uid, deleted_at FROM chat_messages WHERE id = ?',
    [id],
  );
  if (!row || row.deleted_at != null) throw new ChatError('Message introuvable', 404);
  const own = row.uid === actor.uid;
  const moderator = actor.role === 'moderator' || actor.role === 'admin';
  if (!own && !moderator) throw new ChatError('Tu ne peux supprimer que tes propres messages', 403);
  /* Le texte est effacé de la base : une suppression est définitive. */
  await query(
    "UPDATE chat_messages SET body = '', deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL",
    [Date.now(), actor.uid, id],
  );
  if (!own) await logModAction({ actorUid: actor.uid, action: 'delete_chat', targetUid: row.uid });
  publishToChat({ type: 'chat_deleted', messageId: id });
}

/* Extrait d'un message pour un signalement (le texte est celui d'un autre compte, jamais le sien). */
export async function getChatMessageForReport(reporterUid: string, id: number) {
  const row = await getOne<{ uid: string; body: string; deleted_at: number | null }>(
    'SELECT uid, body, deleted_at FROM chat_messages WHERE id = ?',
    [id],
  );
  if (!row || row.deleted_at != null) throw new ChatError('Message introuvable', 404);
  if (row.uid === reporterUid) throw new ChatError('Tu ne peux pas signaler ton propre message', 400);
  return { senderUid: row.uid, excerpt: row.body.slice(0, 300) };
}

/* Suppression des messages plus anciens que la durée de conservation. */
export async function purgeOldChatMessages(): Promise<number> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const r = await query<{ affectedRows: number }>('DELETE FROM chat_messages WHERE created_at < ?', [cutoff]);
  return r.affectedRows;
}

export const CHAT_RETENTION_DAYS = RETENTION_DAYS;
