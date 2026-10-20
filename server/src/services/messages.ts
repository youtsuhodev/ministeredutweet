import { existsSync, mkdirSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResultSetHeader } from 'mysql2/promise';
import { getOne, query, withTransaction } from '../config/database.js';
import { decryptMessage, encryptMessage } from './messageCrypto.js';
import { sendPushToUser } from './push.js';
import { isUserVisible, onClientEvent, publishToUsers } from './realtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* Médias de la messagerie : dossier PRIVÉ (jamais servi par /uploads), accessible uniquement via
   GET /api/messages/media/:fichier qui vérifie que l'appelant est membre de la conversation. */
export const privateUploadsDir = resolve(__dirname, '../../private-uploads');
if (!existsSync(privateUploadsDir)) mkdirSync(privateUploadsDir, { recursive: true });

export class MessagingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const DM_POLICIES = ['everyone', 'mutual', 'none'] as const;
export type DmPolicy = (typeof DM_POLICIES)[number];

export const MAX_BODY = 2000;
export const MAX_GROUP_MEMBERS = 50;
const MEDIA_NAME_RE = /^\d{13}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface Person {
  uid: string;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
}

export interface MessageDto {
  id: number;
  conversationId: number;
  kind: 'text' | 'system';
  sender: Person | null;
  body: string;
  media: { url: string; type: 'image' | 'video' | 'audio'; duration: number | null } | null;
  createdAt: number;
  deleted: boolean;
}

export interface MemberDto extends Person {
  verified: boolean;
  role: 'owner' | 'member';
  lastRead: number;
}

export interface ConversationDto {
  id: number;
  type: 'direct' | 'group';
  title: string | null;
  members: MemberDto[];
  lastMessage: { preview: string; at: number; senderUid: string | null } | null;
  unread: number;
  muted: boolean;
  role: 'owner' | 'member';
  updatedAt: number;
}

interface ConversationRow {
  id: number;
  type: 'direct' | 'group';
  title: string | null;
  created_by: string;
  direct_key: string | null;
  last_message_id: number | null;
  last_message_at: number;
}

interface MembershipRow {
  conversation_id: number;
  uid: string;
  role: 'owner' | 'member';
  joined_at: number;
  last_read_message_id: number;
  cleared_before_id: number;
  muted: number;
}

interface MessageRow {
  id: number;
  conversation_id: number;
  sender_uid: string;
  kind: 'text' | 'system';
  body: string | null;
  media: string | null;
  media_type: 'image' | 'video' | 'audio' | null;
  media_duration: number | null;
  created_at: number;
  deleted_at: number | null;
  s_pseudo: string | null;
  s_name: string | null;
  s_avatar: string | null;
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

const MEDIA_LABEL = { image: '📷 Photo', video: '🎬 Vidéo', audio: '🎤 Message vocal' } as const;

/* ── Réglage « qui peut m'écrire » ──────────────────────────────────────────── */

export async function getDmPolicy(uid: string): Promise<DmPolicy> {
  const row = await getOne<{ dm_policy: string }>('SELECT dm_policy FROM users WHERE uid = ?', [uid]);
  return (DM_POLICIES as readonly string[]).includes(row?.dm_policy ?? '') ? (row!.dm_policy as DmPolicy) : 'mutual';
}

export async function setDmPolicy(uid: string, policy: DmPolicy): Promise<void> {
  await query('UPDATE users SET dm_policy = ? WHERE uid = ?', [policy, uid]);
}

/* Autorisation d'écrire à `targetUid` : compte existant, pas de blocage, et réglage du destinataire respecté.
   Lève MessagingError sinon. Vérifiée à la création ET à chaque envoi dans une conversation directe. */
export async function assertCanMessage(senderUid: string, targetUid: string): Promise<void> {
  if (senderUid === targetUid) throw new MessagingError('Tu ne peux pas t’écrire à toi-même');
  const target = await getOne<{ status: string; dm_policy: string }>(
    'SELECT status, dm_policy FROM users WHERE uid = ?',
    [targetUid],
  );
  if (!target || target.status === 'banned') throw new MessagingError('Utilisateur introuvable', 404);
  const blocked = await getOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM blocks
     WHERE (blocker_uid = ? AND blocked_uid = ?) OR (blocker_uid = ? AND blocked_uid = ?)`,
    [senderUid, targetUid, targetUid, senderUid],
  );
  if ((blocked?.n ?? 0) > 0) throw new MessagingError('Tu ne peux pas écrire à cette personne', 403);
  if (target.dm_policy === 'none') {
    throw new MessagingError('Cette personne n’accepte pas les messages privés', 403);
  }
  if (target.dm_policy === 'mutual') {
    const follows = await getOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM follows
       WHERE (follower_uid = ? AND followed_uid = ?) OR (follower_uid = ? AND followed_uid = ?)`,
      [senderUid, targetUid, targetUid, senderUid],
    );
    if ((follows?.n ?? 0) < 2) {
      throw new MessagingError('Cette personne n’accepte les messages que de ses abonnés mutuels', 403);
    }
  }
}

/* ── Accès ──────────────────────────────────────────────────────────────────── */

async function getConversation(id: number): Promise<ConversationRow | null> {
  return getOne<ConversationRow>(
    'SELECT id, type, title, created_by, direct_key, last_message_id, last_message_at FROM conversations WHERE id = ?',
    [id],
  );
}

async function getMembership(uid: string, conversationId: number): Promise<MembershipRow | null> {
  return getOne<MembershipRow>('SELECT * FROM conversation_members WHERE conversation_id = ? AND uid = ?', [
    conversationId,
    uid,
  ]);
}

async function memberUids(conversationId: number): Promise<string[]> {
  const rows = await query<{ uid: string }[]>('SELECT uid FROM conversation_members WHERE conversation_id = ?', [
    conversationId,
  ]);
  return rows.map((r) => r.uid);
}

/* Conversation + appartenance de `uid`, ou 404 (on ne révèle pas l'existence d'une conversation à un tiers). */
async function requireMember(uid: string, conversationId: number) {
  const [conv, membership] = await Promise.all([getConversation(conversationId), getMembership(uid, conversationId)]);
  if (!conv || !membership) throw new MessagingError('Conversation introuvable', 404);
  return { conv, membership };
}

export async function findUserByPseudoLoose(pseudo: string): Promise<Person | null> {
  return getOne<Person>('SELECT uid, pseudo, displayName, avatar FROM users WHERE pseudo = ? AND status <> ?', [
    pseudo,
    'banned',
  ]);
}

/* ── Conversations ──────────────────────────────────────────────────────────── */

export async function openDirectConversation(me: string, otherUid: string): Promise<number> {
  await assertCanMessage(me, otherUid);
  const key = [me, otherUid].sort().join(':');
  const find = () => getOne<{ id: number }>('SELECT id FROM conversations WHERE direct_key = ?', [key]);
  const existing = await find();
  if (existing) return existing.id;
  try {
    return await withTransaction(async (conn) => {
      const now = Date.now();
      const [res] = await conn.execute(
        `INSERT INTO conversations (type, created_by, direct_key, created_at, last_message_at)
         VALUES ('direct', ?, ?, ?, ?)`,
        [me, key, now, now],
      );
      const id = (res as ResultSetHeader).insertId;
      for (const uid of [me, otherUid]) {
        await conn.execute(
          'INSERT INTO conversation_members (conversation_id, uid, role, joined_at) VALUES (?, ?, ?, ?)',
          [id, uid, 'member', now],
        );
      }
      return id;
    });
  } catch (err) {
    /* Deux demandes simultanées : la seconde tombe sur la clé unique et reprend la conversation créée. */
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      const again = await find();
      if (again) return again.id;
    }
    throw err;
  }
}

export async function createGroup(me: Person, title: string, others: Person[]): Promise<number> {
  const name = title.trim().slice(0, 60);
  if (!name) throw new MessagingError('Donne un nom au groupe');
  const unique = [...new Map(others.filter((p) => p.uid !== me.uid).map((p) => [p.uid, p])).values()];
  if (unique.length < 1) throw new MessagingError('Ajoute au moins une personne');
  if (unique.length + 1 > MAX_GROUP_MEMBERS)
    throw new MessagingError(`Un groupe compte ${MAX_GROUP_MEMBERS} membres au plus`);
  for (const p of unique) {
    try {
      await assertCanMessage(me.uid, p.uid);
    } catch (err) {
      if (err instanceof MessagingError) throw new MessagingError(`@${p.pseudo} : ${err.message}`, err.status);
      throw err;
    }
  }
  const id = await withTransaction(async (conn) => {
    const now = Date.now();
    const [res] = await conn.execute(
      `INSERT INTO conversations (type, title, created_by, created_at, last_message_at)
       VALUES ('group', ?, ?, ?, ?)`,
      [name, me.uid, now, now],
    );
    const convId = (res as ResultSetHeader).insertId;
    await conn.execute('INSERT INTO conversation_members (conversation_id, uid, role, joined_at) VALUES (?, ?, ?, ?)', [
      convId,
      me.uid,
      'owner',
      now,
    ]);
    for (const p of unique) {
      await conn.execute(
        'INSERT INTO conversation_members (conversation_id, uid, role, joined_at) VALUES (?, ?, ?, ?)',
        [convId, p.uid, 'member', now],
      );
    }
    return convId;
  });
  await postSystemMessage(id, me.uid, 'a créé le groupe');
  return id;
}

/* ── Construction des DTO ───────────────────────────────────────────────────── */

function previewOf(row: Pick<MessageRow, 'conversation_id' | 'kind' | 'body' | 'media_type' | 'deleted_at'>): string {
  if (row.deleted_at) return 'Message supprimé';
  const text = row.body ? decryptMessage(row.body, `c${row.conversation_id}`) : '';
  if (row.kind === 'system') return text;
  if (text) return clip(text, 100);
  return row.media_type ? MEDIA_LABEL[row.media_type] : '';
}

function toMessageDto(row: MessageRow): MessageDto {
  const deleted = !!row.deleted_at;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    kind: row.kind,
    sender: row.s_pseudo
      ? { uid: row.sender_uid, pseudo: row.s_pseudo, displayName: row.s_name, avatar: row.s_avatar }
      : null,
    body: deleted || !row.body ? '' : decryptMessage(row.body, `c${row.conversation_id}`),
    media:
      !deleted && row.media && row.media_type
        ? { url: `/api/messages/media/${row.media}`, type: row.media_type, duration: row.media_duration }
        : null,
    createdAt: row.created_at,
    deleted,
  };
}

const MESSAGE_COLUMNS = `msg.id, msg.conversation_id, msg.sender_uid, msg.kind, msg.body, msg.media, msg.media_type,
       msg.media_duration, msg.created_at, msg.deleted_at,
       u.pseudo AS s_pseudo, u.displayName AS s_name, u.avatar AS s_avatar`;

async function getMessageDto(messageId: number): Promise<MessageDto | null> {
  const row = await getOne<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages msg LEFT JOIN users u ON u.uid = msg.sender_uid WHERE msg.id = ?`,
    [messageId],
  );
  return row ? toMessageDto(row) : null;
}

async function buildConversationDtos(
  uid: string,
  rows: Array<
    ConversationRow & {
      role: 'owner' | 'member';
      muted: number;
      last_read_message_id: number;
      cleared_before_id: number;
    }
  >,
): Promise<ConversationDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const marks = placeholders(ids.length);

  const members = await query<
    Array<{
      conversation_id: number;
      uid: string;
      role: 'owner' | 'member';
      last_read_message_id: number;
      pseudo: string;
      displayName: string | null;
      avatar: string | null;
      verified: number;
    }>
  >(
    `SELECT m.conversation_id, m.uid, m.role, m.last_read_message_id, u.pseudo, u.displayName, u.avatar, u.verified
     FROM conversation_members m JOIN users u ON u.uid = m.uid
     WHERE m.conversation_id IN (${marks}) ORDER BY m.joined_at, m.uid`,
    ids,
  );

  const lastIds = rows.map((r) => r.last_message_id).filter((v): v is number => !!v);
  const lastRows = lastIds.length
    ? await query<MessageRow[]>(
        `SELECT ${MESSAGE_COLUMNS} FROM messages msg LEFT JOIN users u ON u.uid = msg.sender_uid
         WHERE msg.id IN (${placeholders(lastIds.length)})`,
        lastIds,
      )
    : [];
  const lastById = new Map(lastRows.map((r) => [r.id, r]));

  const unreadRows = await query<{ conversation_id: number; n: number }[]>(
    `SELECT msg.conversation_id, COUNT(*) AS n
     FROM messages msg JOIN conversation_members m ON m.conversation_id = msg.conversation_id AND m.uid = ?
     WHERE msg.conversation_id IN (${marks})
       AND msg.id > GREATEST(m.last_read_message_id, m.cleared_before_id)
       AND msg.sender_uid <> ? AND msg.deleted_at IS NULL AND msg.kind = 'text'
     GROUP BY msg.conversation_id`,
    [uid, ...ids, uid],
  );
  const unreadById = new Map(unreadRows.map((r) => [r.conversation_id, Number(r.n)]));

  return rows.map((r) => {
    const last = r.last_message_id ? lastById.get(r.last_message_id) : undefined;
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      members: members
        .filter((m) => m.conversation_id === r.id)
        .map((m) => ({
          uid: m.uid,
          pseudo: m.pseudo,
          displayName: m.displayName,
          avatar: m.avatar,
          verified: !!m.verified,
          role: m.role,
          lastRead: m.last_read_message_id,
        })),
      lastMessage: last
        ? { preview: previewOf(last), at: last.created_at, senderUid: last.s_pseudo ? last.sender_uid : null }
        : null,
      unread: unreadById.get(r.id) ?? 0,
      muted: !!r.muted,
      role: r.role,
      updatedAt: r.last_message_at,
    };
  });
}

const CONVERSATION_SELECT = `SELECT c.id, c.type, c.title, c.created_by, c.direct_key, c.last_message_id, c.last_message_at,
       m.role, m.muted, m.last_read_message_id, m.cleared_before_id
     FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id`;

export async function listConversations(uid: string, limit = 30, offset = 0): Promise<ConversationDto[]> {
  const lim = Math.max(1, Math.trunc(limit));
  const off = Math.max(0, Math.trunc(offset));
  const rows = await query<Parameters<typeof buildConversationDtos>[1]>(
    `${CONVERSATION_SELECT}
     WHERE m.uid = ? AND c.last_message_id IS NOT NULL AND c.last_message_id > m.cleared_before_id
     ORDER BY c.last_message_at DESC, c.id DESC LIMIT ${lim} OFFSET ${off}`,
    [uid],
  );
  return buildConversationDtos(uid, rows);
}

export async function getConversationDto(uid: string, conversationId: number): Promise<ConversationDto> {
  const rows = await query<Parameters<typeof buildConversationDtos>[1]>(
    `${CONVERSATION_SELECT} WHERE m.uid = ? AND c.id = ?`,
    [uid, conversationId],
  );
  const [dto] = await buildConversationDtos(uid, rows);
  if (!dto) throw new MessagingError('Conversation introuvable', 404);
  return dto;
}

/* Nombre de conversations (non muettes) ayant au moins un message non lu : pastille de la navigation. */
export async function unreadConversationCount(uid: string): Promise<number> {
  const row = await getOne<{ n: number }>(
    `SELECT COUNT(DISTINCT msg.conversation_id) AS n
     FROM messages msg JOIN conversation_members m ON m.conversation_id = msg.conversation_id
     WHERE m.uid = ? AND m.muted = 0
       AND msg.id > GREATEST(m.last_read_message_id, m.cleared_before_id)
       AND msg.sender_uid <> ? AND msg.deleted_at IS NULL AND msg.kind = 'text'`,
    [uid, uid],
  );
  return Number(row?.n ?? 0);
}

/* ── Messages ───────────────────────────────────────────────────────────────── */

export async function getMessages(
  uid: string,
  conversationId: number,
  before: number | null,
  limit = 30,
): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
  const { membership } = await requireMember(uid, conversationId);
  const lim = Math.min(50, Math.max(1, Math.trunc(limit)));
  const params: unknown[] = [conversationId, membership.cleared_before_id];
  let beforeSql = '';
  if (before) {
    beforeSql = 'AND msg.id < ?';
    params.push(before);
  }
  const rows = await query<MessageRow[]>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages msg LEFT JOIN users u ON u.uid = msg.sender_uid
     WHERE msg.conversation_id = ? AND msg.id > ? ${beforeSql}
     ORDER BY msg.id DESC LIMIT ${lim + 1}`,
    params,
  );
  const hasMore = rows.length > lim;
  return { messages: rows.slice(0, lim).reverse().map(toMessageDto), hasMore };
}

async function postSystemMessage(conversationId: number, actorUid: string, text: string): Promise<MessageDto | null> {
  const now = Date.now();
  const id = await withTransaction(async (conn) => {
    const [res] = await conn.execute(
      `INSERT INTO messages (conversation_id, sender_uid, kind, body, created_at) VALUES (?, ?, 'system', ?, ?)`,
      [conversationId, actorUid, encryptMessage(text, `c${conversationId}`), now],
    );
    const messageId = (res as ResultSetHeader).insertId;
    await conn.execute('UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?', [
      messageId,
      now,
      conversationId,
    ]);
    return messageId;
  });
  const dto = await getMessageDto(id);
  if (dto) publishToUsers(await memberUids(conversationId), { type: 'message', conversationId, message: dto });
  return dto;
}

export interface Sender extends Person {
  verified?: number | boolean;
}

export async function sendMessage(
  sender: Sender,
  conversationId: number,
  input: { body?: unknown; mediaFile?: unknown; duration?: unknown },
): Promise<MessageDto> {
  const { conv } = await requireMember(sender.uid, conversationId);
  const members = await query<Array<{ uid: string; muted: number }>>(
    'SELECT uid, muted FROM conversation_members WHERE conversation_id = ?',
    [conversationId],
  );
  if (conv.type === 'direct') {
    const other = members.find((m) => m.uid !== sender.uid);
    if (!other) throw new MessagingError('Conversation introuvable', 404);
    await assertCanMessage(sender.uid, other.uid);
  }

  const body = typeof input.body === 'string' ? input.body.replace(/\r\n/g, '\n').trim() : '';
  if (body.length > MAX_BODY) throw new MessagingError(`Message trop long (${MAX_BODY} caractères maximum)`);

  let media: { filename: string; type: 'image' | 'video' | 'audio'; duration: number | null } | null = null;
  if (input.mediaFile !== undefined && input.mediaFile !== null && input.mediaFile !== '') {
    const filename = typeof input.mediaFile === 'string' ? input.mediaFile : '';
    if (!MEDIA_NAME_RE.test(filename)) throw new MessagingError('Pièce jointe invalide');
    const row = await getOne<{ media_type: 'image' | 'video' | 'audio' }>(
      'SELECT media_type FROM message_media WHERE filename = ? AND uploader_uid = ? AND message_id IS NULL',
      [filename, sender.uid],
    );
    if (!row || !existsSync(resolve(privateUploadsDir, filename))) throw new MessagingError('Pièce jointe invalide');
    media = { filename, type: row.media_type, duration: null };
  }
  if (!body && !media) throw new MessagingError('Message vide');

  const duration = input.duration;
  if (media?.type === 'audio' && typeof duration === 'number' && Number.isFinite(duration)) {
    media.duration = Math.min(120, Math.max(1, Math.round(duration)));
  }

  const now = Date.now();
  const messageId = await withTransaction(async (conn) => {
    const [res] = await conn.execute(
      `INSERT INTO messages (conversation_id, sender_uid, kind, body, media, media_type, media_duration, created_at)
       VALUES (?, ?, 'text', ?, ?, ?, ?, ?)`,
      [
        conversationId,
        sender.uid,
        body ? encryptMessage(body, `c${conversationId}`) : null,
        media?.filename ?? null,
        media?.type ?? null,
        media?.duration ?? null,
        now,
      ],
    );
    const id = (res as ResultSetHeader).insertId;
    await conn.execute('UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?', [
      id,
      now,
      conversationId,
    ]);
    await conn.execute(
      'UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND uid = ?',
      [id, conversationId, sender.uid],
    );
    if (media) await conn.execute('UPDATE message_media SET message_id = ? WHERE filename = ?', [id, media.filename]);
    return id;
  });

  const dto = await getMessageDto(messageId);
  if (!dto) throw new MessagingError('Erreur serveur', 500);
  /* `muted` : les clients concernés n'affichent ni badge ni notification locale pour ce message. */
  publishToUsers(
    members.map((m) => m.uid),
    { type: 'message', conversationId, message: dto, muted: members.filter((m) => m.muted).map((m) => m.uid) },
  );
  void pushNewMessage(conv, sender, dto, members);
  return dto;
}

/* Push aux membres qui ne regardent pas l'appli en ce moment (et n'ont pas mis la conversation en sourdine). */
async function pushNewMessage(
  conv: ConversationRow,
  sender: Sender,
  dto: MessageDto,
  members: Array<{ uid: string; muted: number }>,
): Promise<void> {
  try {
    const name = sender.displayName || sender.pseudo;
    const title = conv.type === 'group' ? `${conv.title ?? 'Groupe'} · ${name}` : name;
    const body = dto.body ? clip(dto.body, 120) : dto.media ? MEDIA_LABEL[dto.media.type] : 'Nouveau message';
    for (const m of members) {
      if (m.uid === sender.uid || m.muted || isUserVisible(m.uid)) continue;
      await sendPushToUser(m.uid, { title, body, url: `/messages/${conv.id}`, tag: `dm-${conv.id}` });
    }
  } catch (err) {
    console.warn('[MESSAGES] push:', (err as Error).message);
  }
}

export async function markRead(uid: string, conversationId: number, upTo?: number | null): Promise<void> {
  const { conv, membership } = await requireMember(uid, conversationId);
  const target = Math.min(upTo ?? conv.last_message_id ?? 0, conv.last_message_id ?? 0);
  if (target <= membership.last_read_message_id) return;
  await query(
    'UPDATE conversation_members SET last_read_message_id = GREATEST(last_read_message_id, ?) WHERE conversation_id = ? AND uid = ?',
    [target, conversationId, uid],
  );
  publishToUsers(await memberUids(conversationId), { type: 'read', conversationId, uid, messageId: target });
}

export async function setMuted(uid: string, conversationId: number, muted: boolean): Promise<void> {
  await requireMember(uid, conversationId);
  await query('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND uid = ?', [
    muted ? 1 : 0,
    conversationId,
    uid,
  ]);
}

async function removeMediaFile(filename: string | null): Promise<void> {
  if (!filename || !MEDIA_NAME_RE.test(filename)) return;
  await query('DELETE FROM message_media WHERE filename = ?', [filename]);
  await unlink(resolve(privateUploadsDir, filename)).catch(() => {});
}

export async function deleteMessage(uid: string, messageId: number): Promise<void> {
  const msg = await getOne<{
    id: number;
    conversation_id: number;
    sender_uid: string;
    kind: string;
    media: string | null;
    deleted_at: number | null;
  }>('SELECT id, conversation_id, sender_uid, kind, media, deleted_at FROM messages WHERE id = ?', [messageId]);
  if (!msg || msg.sender_uid !== uid || msg.kind !== 'text') throw new MessagingError('Message introuvable', 404);
  await requireMember(uid, msg.conversation_id);
  if (msg.deleted_at) return;
  await query(
    'UPDATE messages SET deleted_at = ?, body = NULL, media = NULL, media_type = NULL, media_duration = NULL WHERE id = ?',
    [Date.now(), messageId],
  );
  await removeMediaFile(msg.media);
  publishToUsers(await memberUids(msg.conversation_id), {
    type: 'message_deleted',
    conversationId: msg.conversation_id,
    messageId,
  });
}

/* Message tel que vu par un modérateur à la suite d'un signalement : l'appelant doit être membre. */
export async function getMessageForReport(uid: string, messageId: number) {
  const msg = await getOne<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages msg LEFT JOIN users u ON u.uid = msg.sender_uid WHERE msg.id = ?`,
    [messageId],
  );
  if (msg?.kind !== 'text' || msg.deleted_at) throw new MessagingError('Message introuvable', 404);
  const { membership } = await requireMember(uid, msg.conversation_id);
  if (msg.id <= membership.cleared_before_id || msg.sender_uid === uid) {
    throw new MessagingError('Message introuvable', 404);
  }
  const dto = toMessageDto(msg);
  return { id: msg.id, senderUid: msg.sender_uid, excerpt: dto.body || (dto.media ? MEDIA_LABEL[dto.media.type] : '') };
}

/* ── Quitter / gérer un groupe ──────────────────────────────────────────────── */

export async function leaveConversation(uid: string, conversationId: number): Promise<void> {
  const { conv, membership } = await requireMember(uid, conversationId);
  if (conv.type === 'direct') {
    /* Conversation directe : « supprimer » = masquer l'historique pour soi ; un nouveau message la fait réapparaître. */
    await query('UPDATE conversation_members SET cleared_before_id = ? WHERE conversation_id = ? AND uid = ?', [
      conv.last_message_id ?? 0,
      conversationId,
      uid,
    ]);
    return;
  }
  await postSystemMessage(conversationId, uid, 'a quitté le groupe');
  await query('DELETE FROM conversation_members WHERE conversation_id = ? AND uid = ?', [conversationId, uid]);
  const rest = await query<{ uid: string; role: string }[]>(
    'SELECT uid, role FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at, uid',
    [conversationId],
  );
  if (rest.length === 0) {
    await deleteConversationData(conversationId);
    return;
  }
  if (membership.role === 'owner' && !rest.some((r) => r.role === 'owner')) {
    await query('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND uid = ?', [
      'owner',
      conversationId,
      rest[0].uid,
    ]);
  }
  publishToUsers([...rest.map((r) => r.uid), uid], { type: 'conversation', conversationId });
}

async function requireGroupOwner(uid: string, conversationId: number) {
  const { conv, membership } = await requireMember(uid, conversationId);
  if (conv.type !== 'group') throw new MessagingError('Cette action ne concerne que les groupes');
  if (membership.role !== 'owner') throw new MessagingError('Réservé au créateur du groupe', 403);
  return conv;
}

export async function renameGroup(uid: string, conversationId: number, title: string): Promise<void> {
  await requireGroupOwner(uid, conversationId);
  const name = title.trim().slice(0, 60);
  if (!name) throw new MessagingError('Donne un nom au groupe');
  await query('UPDATE conversations SET title = ? WHERE id = ?', [name, conversationId]);
  await postSystemMessage(conversationId, uid, `a renommé le groupe en « ${name} »`);
  publishToUsers(await memberUids(conversationId), { type: 'conversation', conversationId });
}

export async function addMembers(actor: Person, conversationId: number, people: Person[]): Promise<void> {
  const conv = await requireGroupOwner(actor.uid, conversationId);
  const current = new Set(await memberUids(conversationId));
  const fresh = [...new Map(people.filter((p) => !current.has(p.uid)).map((p) => [p.uid, p])).values()];
  if (fresh.length === 0) throw new MessagingError('Ces personnes sont déjà dans le groupe');
  if (current.size + fresh.length > MAX_GROUP_MEMBERS) {
    throw new MessagingError(`Un groupe compte ${MAX_GROUP_MEMBERS} membres au plus`);
  }
  for (const p of fresh) {
    try {
      await assertCanMessage(actor.uid, p.uid);
    } catch (err) {
      if (err instanceof MessagingError) throw new MessagingError(`@${p.pseudo} : ${err.message}`, err.status);
      throw err;
    }
  }
  const now = Date.now();
  for (const p of fresh) {
    /* Un nouvel arrivant ne voit pas l'historique antérieur à son arrivée. */
    await query(
      `INSERT INTO conversation_members (conversation_id, uid, role, joined_at, last_read_message_id, cleared_before_id)
       VALUES (?, ?, 'member', ?, ?, ?)`,
      [conversationId, p.uid, now, conv.last_message_id ?? 0, conv.last_message_id ?? 0],
    );
  }
  await postSystemMessage(conversationId, actor.uid, `a ajouté ${fresh.map((p) => `@${p.pseudo}`).join(', ')}`);
  publishToUsers(await memberUids(conversationId), { type: 'conversation', conversationId });
}

export async function removeMember(actorUid: string, conversationId: number, target: Person): Promise<void> {
  await requireGroupOwner(actorUid, conversationId);
  if (target.uid === actorUid) throw new MessagingError('Utilise « Quitter le groupe »');
  const m = await getMembership(target.uid, conversationId);
  if (!m) throw new MessagingError('Cette personne n’est pas dans le groupe', 404);
  await query('DELETE FROM conversation_members WHERE conversation_id = ? AND uid = ?', [conversationId, target.uid]);
  await postSystemMessage(conversationId, actorUid, `a retiré @${target.pseudo}`);
  publishToUsers([...(await memberUids(conversationId)), target.uid], { type: 'conversation', conversationId });
}

async function deleteConversationData(conversationId: number): Promise<void> {
  const media = await query<{ filename: string }[]>(
    `SELECT mm.filename FROM message_media mm JOIN messages m ON m.id = mm.message_id WHERE m.conversation_id = ?`,
    [conversationId],
  );
  await query(
    'DELETE FROM message_media WHERE message_id IN (SELECT id FROM (SELECT id FROM messages WHERE conversation_id = ?) AS x)',
    [conversationId],
  );
  await query('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
  await query('DELETE FROM conversation_members WHERE conversation_id = ?', [conversationId]);
  await query('DELETE FROM conversations WHERE id = ?', [conversationId]);
  for (const f of media) await unlink(resolve(privateUploadsDir, f.filename)).catch(() => {});
}

/* ── Médias privés ──────────────────────────────────────────────────────────── */

export async function registerUpload(uid: string, filename: string, type: 'image' | 'video' | 'audio'): Promise<void> {
  await query('INSERT INTO message_media (filename, uploader_uid, media_type, created_at) VALUES (?, ?, ?, ?)', [
    filename,
    uid,
    type,
    Date.now(),
  ]);
}

/* Chemin d'un média si `uid` peut le voir (membre de la conversation, message postérieur à son arrivée). */
export async function resolveMediaForUser(uid: string, filename: string): Promise<string | null> {
  if (!MEDIA_NAME_RE.test(filename)) return null;
  const row = await getOne<{ n: number }>(
    `SELECT COUNT(*) AS n
     FROM message_media mm
     JOIN messages msg ON msg.id = mm.message_id AND msg.deleted_at IS NULL
     JOIN conversation_members m ON m.conversation_id = msg.conversation_id AND m.uid = ?
     WHERE mm.filename = ? AND msg.id > m.cleared_before_id`,
    [uid, filename],
  );
  if (!row?.n) return null;
  const full = resolve(privateUploadsDir, filename);
  return existsSync(full) ? full : null;
}

/* Fichiers envoyés mais jamais joints à un message (abandon, erreur) : supprimés après 24 h. */
export async function sweepOrphanMessageMedia(minAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - minAgeMs;
  const rows = await query<{ filename: string }[]>(
    'SELECT filename FROM message_media WHERE message_id IS NULL AND created_at < ?',
    [cutoff],
  );
  for (const r of rows) await removeMediaFile(r.filename);
  /* Fichiers sans ligne en base (échec entre l'écriture et l'enregistrement) */
  let removed = rows.length;
  const known = new Set(
    (await query<{ filename: string }[]>('SELECT filename FROM message_media')).map((r) => r.filename),
  );
  for (const name of await readdir(privateUploadsDir)) {
    if (!MEDIA_NAME_RE.test(name) || known.has(name)) continue;
    try {
      const full = resolve(privateUploadsDir, name);
      const info = await stat(full);
      if (info.isFile() && info.mtimeMs < cutoff) {
        await unlink(full);
        removed++;
      }
    } catch {
      /* au prochain passage */
    }
  }
  return removed;
}

/* ── Suppression de compte (RGPD) ───────────────────────────────────────────── */

export async function purgeUserMessaging(uid: string): Promise<void> {
  /* Conversations directes : supprimées pour les deux (l'interlocuteur n'a plus personne en face). */
  const directs = await query<{ conversation_id: number }[]>(
    `SELECT m.conversation_id FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id
     WHERE m.uid = ? AND c.type = 'direct'`,
    [uid],
  );
  for (const d of directs) await deleteConversationData(d.conversation_id);

  /* Groupes : ses messages sont effacés, il quitte le groupe et la propriété passe au plus ancien membre. */
  const groups = await query<{ conversation_id: number; role: string }[]>(
    'SELECT conversation_id, role FROM conversation_members WHERE uid = ?',
    [uid],
  );
  const media = await query<{ filename: string }[]>('SELECT filename FROM message_media WHERE uploader_uid = ?', [uid]);
  await query(
    'DELETE FROM message_media WHERE message_id IN (SELECT id FROM (SELECT id FROM messages WHERE sender_uid = ?) AS x) OR uploader_uid = ?',
    [uid, uid],
  );
  await query('DELETE FROM messages WHERE sender_uid = ?', [uid]);
  await query('DELETE FROM conversation_members WHERE uid = ?', [uid]);
  for (const f of media) await unlink(resolve(privateUploadsDir, f.filename)).catch(() => {});
  for (const g of groups) {
    const rest = await query<{ uid: string; role: string }[]>(
      'SELECT uid, role FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at, uid',
      [g.conversation_id],
    );
    if (rest.length === 0) {
      await deleteConversationData(g.conversation_id);
    } else {
      if (!rest.some((r) => r.role === 'owner')) {
        await query('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND uid = ?', [
          'owner',
          g.conversation_id,
          rest[0].uid,
        ]);
      }
      /* last_message_id peut pointer vers un message effacé : on le recale sur le dernier restant. */
      const last = await getOne<{ id: number; created_at: number }>(
        'SELECT id, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1',
        [g.conversation_id],
      );
      await query(
        'UPDATE conversations SET last_message_id = ?, last_message_at = COALESCE(?, last_message_at) WHERE id = ?',
        [last?.id ?? null, last?.created_at ?? null, g.conversation_id],
      );
      publishToUsers(
        rest.map((r) => r.uid),
        { type: 'conversation', conversationId: g.conversation_id },
      );
    }
  }
}

/* ── Évènements envoyés par les clients (WebSocket) ─────────────────────────── */

const membershipCache = new Map<string, number>();

onClientEvent((uid, event) => {
  if (event.type !== 'typing') return;
  const conversationId = Number(event.conversationId);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) return;
  void (async () => {
    try {
      const key = `${uid}:${conversationId}`;
      const cachedAt = membershipCache.get(key);
      if (!cachedAt || Date.now() - cachedAt > 60_000) {
        if (!(await getMembership(uid, conversationId))) return;
        membershipCache.set(key, Date.now());
        if (membershipCache.size > 5000) membershipCache.clear();
      }
      const others = (await memberUids(conversationId)).filter((u) => u !== uid);
      publishToUsers(others, { type: 'typing', conversationId, uid });
    } catch {
      /* évènement éphémère : on ignore */
    }
  })();
});

export function startMessagingMaintenance(): void {
  const run = () => {
    sweepOrphanMessageMedia().catch((err) => console.error('[MESSAGES] sweep:', (err as Error).message));
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
