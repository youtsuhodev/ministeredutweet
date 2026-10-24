import { randomBytes } from 'node:crypto';
import { getOne, query, withTransaction } from '../config/database.js';
import { hashSessionId, sha256Hex } from '../utils/crypto.js';
import { countHashtags, type HashtagTrend } from '../utils/hashtags.js';
import { notifyIndexNow, publicPostPath } from './indexnow.js';
import { purgeUserMessaging } from './messages.js';
import { pushForNotification } from './push.js';
import { decryptSecret, encryptSecret, isSecretEncryptionEnabled } from './secrets.js';
import { removeUploadsIfUnreferenced } from './uploads.js';

export interface User {
  uid: string;
  pseudo: string;
  passwordHash: string;
  displayName: string | null;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  verified: number;
  /* 0 tant que le compte n'a pas enregistré ses clés de récupération (pop-up affichée). */
  recovery_ack: number;
  /* 1 pour un compte créé avant la suppression des e-mails : la pop-up explique le changement. */
  legacy_notice: number;
  totp_secret: string | null;
  totp_enabled: number;
  /* Dernier pas TOTP (30 s) déjà consommé : empêche de rejouer un code. */
  totp_last_step: number | null;
  createdAt: number;
  /* 'user' | 'moderator' | 'admin' */
  role: string;
  /* 'active' | 'suspended' | 'banned' */
  status: string;
  suspended_until: number | null;
  status_reason: string | null;
  age_confirmed_at: number | null;
  pseudo_changed_at: number | null;
}

/* ── Utilisateurs ───────────────────────────────────────────────────────────── */

/* Le secret TOTP est chiffré en base (si TOTP_ENCRYPTION_KEY est définie) : on le déchiffre ici, une fois. */
function hydrateUser(user: User | null): User | null {
  if (user) user.totp_secret = decryptSecret(user.totp_secret);
  return user;
}

export async function findUserByPseudo(pseudo: string) {
  return hydrateUser(await getOne<User>('SELECT * FROM users WHERE pseudo = ?', [pseudo]));
}

export async function findUserByUid(uid: string) {
  return hydrateUser(await getOne<User>('SELECT * FROM users WHERE uid = ?', [uid]));
}

export async function createUser(uid: string, pseudo: string, passwordHash: string) {
  const now = Date.now();
  /* L'inscription n'est possible qu'après confirmation de l'âge minimum : on ne garde que la date de cette confirmation. */
  await query('INSERT INTO users (uid, pseudo, passwordHash, createdAt, age_confirmed_at) VALUES (?, ?, ?, ?, ?)', [
    uid,
    pseudo,
    passwordHash,
    now,
    now,
  ]);
}

const UPDATABLE_USER_FIELDS = new Set([
  'displayName',
  'bio',
  'location',
  'website',
  'avatar',
  'banner',
  'passwordHash',
  'recovery_ack',
  'totp_secret',
  'totp_enabled',
  'totp_last_step',
  'pseudo',
  'pseudo_changed_at',
  'role',
  'status',
  'suspended_until',
  'status_reason',
]);

export async function updateUser(uid: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE_USER_FIELDS.has(k));
  if (keys.length === 0) return;
  const sets = keys.map((k) => `\`${k}\` = ?`).join(', ');
  const values = keys.map((k) => {
    const value = fields[k];
    return k === 'totp_secret' && typeof value === 'string' ? encryptSecret(value) : value;
  });
  /* Avatar / bannière remplacés ou retirés : l'ancien fichier est supprimé du disque s'il n'est plus utilisé. */
  const touchesMedia = keys.includes('avatar') || keys.includes('banner');
  const before = touchesMedia
    ? await getOne<{ avatar: string | null; banner: string | null }>('SELECT avatar, banner FROM users WHERE uid = ?', [
        uid,
      ])
    : null;
  await query(`UPDATE users SET ${sets} WHERE uid = ?`, [...values, uid]);
  if (before) await removeUploadsIfUnreferenced([before.avatar, before.banner]);
}

/* Consomme un pas TOTP de façon atomique : faux si ce pas (ou un plus récent) a déjà servi. */
export async function claimTotpStep(uid: string, step: number): Promise<boolean> {
  const result = await query<{ affectedRows: number }>(
    'UPDATE users SET totp_last_step = ? WHERE uid = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
    [step, uid, step],
  );
  return result.affectedRows === 1;
}

/* Au démarrage, si une clé de chiffrement vient d'être configurée : chiffre les secrets TOTP encore en clair. */
export async function encryptLegacyTotpSecrets(): Promise<number> {
  if (!isSecretEncryptionEnabled()) return 0;
  const rows = await query<{ uid: string; totp_secret: string }[]>(
    "SELECT uid, totp_secret FROM users WHERE totp_secret IS NOT NULL AND totp_secret NOT LIKE 'enc:v1:%'",
  );
  for (const row of rows) {
    await query('UPDATE users SET totp_secret = ? WHERE uid = ? AND totp_secret = ?', [
      encryptSecret(row.totp_secret),
      row.uid,
      row.totp_secret,
    ]);
  }
  return rows.length;
}

/* ── Sessions ───────────────────────────────────────────────────────────────── */

/* `id` est la valeur brute du cookie ; seule son empreinte est stockée. */
export async function createSession(id: string, uid: string, expiresAt: number, userAgent?: string) {
  await query('INSERT INTO sessions (id, uid, expires_at, user_agent) VALUES (?, ?, ?, ?)', [
    hashSessionId(id),
    uid,
    expiresAt,
    userAgent ? userAgent.slice(0, 255) : null,
  ]);
}

/* `id` est la valeur brute du cookie. */
export async function deleteSession(id: string) {
  await query('DELETE FROM sessions WHERE id = ?', [hashSessionId(id)]);
}

export async function deleteSessionOfUser(uid: string, id: string) {
  await query('DELETE FROM sessions WHERE id = ? AND uid = ?', [id, uid]);
}

/* Révoque toutes les sessions d'un compte, sauf éventuellement `exceptId`. */
export async function deleteUserSessions(uid: string, exceptId?: string) {
  if (exceptId) await query('DELETE FROM sessions WHERE uid = ? AND id <> ?', [uid, exceptId]);
  else await query('DELETE FROM sessions WHERE uid = ?', [uid]);
}

export async function listSessions(uid: string) {
  return query<{ id: string; expires_at: number; user_agent: string | null; created_at: string }[]>(
    'SELECT id, expires_at, user_agent, created_at FROM sessions WHERE uid = ? AND expires_at > ? ORDER BY created_at DESC',
    [uid, Date.now()],
  );
}

export async function purgeExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
}

/* ── Codes de secours (2FA) ─────────────────────────────────────────────────── */

/* Alphabet sans caractères ambigus (0/O, 1/I/L). 10 caractères = ~50 bits par code. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_COUNT = 10;

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashRecoveryCode(uid: string, code: string): string {
  return sha256Hex(`wouaff-recovery:${uid}:${normalizeRecoveryCode(code)}`);
}

/** Forme d'un code de secours saisi (par opposition à un code TOTP à 6 chiffres). */
export function looksLikeRecoveryCode(code: string): boolean {
  return normalizeRecoveryCode(code).length === 10;
}

/* Remplace les codes existants par un nouveau lot ; renvoie les codes en clair (affichés une seule fois). */
export async function regenerateRecoveryCodes(uid: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const bytes = randomBytes(10);
    let raw = '';
    for (const b of bytes) raw += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  await withTransaction(async (conn) => {
    await conn.execute(      'DELETE FROM bookmarks WHERE uid = ?',
      'DELETE FROM recovery_codes WHERE uid = ?', [uid]);
    for (const code of codes) {
      await conn.execute('INSERT IGNORE INTO recovery_codes (uid, code_hash) VALUES (?, ?)', [
        uid,
        hashRecoveryCode(uid, code),
      ]);
    }
  });
  return codes;
}

/* Consomme un code de secours (usage unique, atomique). */
export async function consumeRecoveryCode(uid: string, code: string): Promise<boolean> {
  if (!looksLikeRecoveryCode(code)) return false;
  const result = await query<{ affectedRows: number }>(
    'UPDATE recovery_codes SET used_at = ? WHERE uid = ? AND code_hash = ? AND used_at IS NULL',
    [Date.now(), uid, hashRecoveryCode(uid, code)],
  );
  return result.affectedRows === 1;
}

export async function countRecoveryCodes(uid: string): Promise<number> {
  const row = await getOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM recovery_codes WHERE uid = ? AND used_at IS NULL',
    [uid],
  );
  return Number(row?.n ?? 0);
}

export async function deleteRecoveryCodes(uid: string) {
  await query(      'DELETE FROM bookmarks WHERE uid = ?',
      'DELETE FROM recovery_codes WHERE uid = ?', [uid]);
}

/* ── Clés de récupération du compte (mot de passe oublié) ───────────────────── */

/* Distinctes des codes de secours 2FA : celles-ci servent à réinitialiser le mot de passe sans e-mail.
   12 caractères de l'alphabet à 31 symboles = ~59 bits par clé ; seule l'empreinte est stockée. */
export const ACCOUNT_KEY_COUNT = 10;

function normalizeAccountKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashAccountKey(uid: string, key: string): string {
  return sha256Hex(`wouaff-account-key:${uid}:${normalizeAccountKey(key)}`);
}

export function looksLikeAccountKey(key: string): boolean {
  return normalizeAccountKey(key).length === 12;
}

/* Remplace les clés existantes par un nouveau lot ; renvoie les clés en clair (affichées une seule fois). */
export async function regenerateAccountKeys(uid: string): Promise<string[]> {
  const keys: string[] = [];
  for (let i = 0; i < ACCOUNT_KEY_COUNT; i++) {
    let raw = '';
    /* Tirage sans biais : on écarte les octets qui fausseraient le modulo. */
    while (raw.length < 12) {
      for (const b of randomBytes(16)) {
        if (b < 248 && raw.length < 12) raw += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
      }
    }
    keys.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`);
  }
  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM account_recovery_keys WHERE uid = ?', [uid]);
    for (const key of keys) {
      await conn.execute('INSERT IGNORE INTO account_recovery_keys (uid, key_hash) VALUES (?, ?)', [
        uid,
        hashAccountKey(uid, key),
      ]);
    }
  });
  return keys;
}

/* Consomme une clé (usage unique, atomique). */
export async function consumeAccountKey(uid: string, key: string): Promise<boolean> {
  if (!looksLikeAccountKey(key)) return false;
  const result = await query<{ affectedRows: number }>(
    'UPDATE account_recovery_keys SET used_at = ? WHERE uid = ? AND key_hash = ? AND used_at IS NULL',
    [Date.now(), uid, hashAccountKey(uid, key)],
  );
  return result.affectedRows === 1;
}

export async function countAccountKeys(uid: string): Promise<number> {
  const row = await getOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM account_recovery_keys WHERE uid = ? AND used_at IS NULL',
    [uid],
  );
  return Number(row?.n ?? 0);
}

/* ── Tendances ──────────────────────────────────────────────────────────────── */

/* Nombre de posts récents examinés pour calculer les tendances. */
const TREND_SCAN_LIMIT = 5000;

/**
 * Tendances calculées depuis les posts : un hashtag compte une fois par post qui le
 * contient. `days = 0` couvre tout l'historique, sinon fenêtre glissante en jours.
 */
const TREND_CACHE_MS = 60_000;
const trendCache = new Map<string, { at: number; value: HashtagTrend[] }>();

export async function getTrendingHashtags(days = 0, limit = 10): Promise<HashtagTrend[]> {
  const window = Math.max(0, Math.trunc(days));
  const max = Math.max(1, Math.trunc(limit));
  /* Cache de 60 s : sans lui, chaque ouverture de la colonne de droite relisait jusqu'à 5000 posts. */
  const cacheKey = `${window}:${max}`;
  const hit = trendCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TREND_CACHE_MS) return hit.value;
  const rows = await query<{ text: string | null }[]>(
    `SELECT text FROM posts
     WHERE text IS NOT NULL AND text LIKE '%#%'${window > 0 ? ` AND created_at >= NOW() - INTERVAL ${window} DAY` : ''}
     ORDER BY created_at DESC
     LIMIT ${TREND_SCAN_LIMIT}`,
  );
  const value = countHashtags(rows.map((row) => row.text)).slice(0, max);
  if (trendCache.size >= 200) trendCache.clear(); // borne la mémoire (days/limit viennent de la requête)
  trendCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/* ── Posts ──────────────────────────────────────────────────────────────────── */

export async function createPost(
  uid: string,
  text: string | null,
  image: string | null,
  video?: string | null,
  audio?: string | null,
  audioDuration?: number | null,
  isPublic = false,
) {
  const result = await query<{ insertId: number }>(
    'INSERT INTO posts (uid, text, image, video, audio, audio_duration, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uid, text, image, video || null, audio || null, audio ? (audioDuration ?? null) : null, isPublic ? 1 : 0],
  );
  return result.insertId;
}

/* Pseudos cités dans un texte (même règle que les notifications de mention). */
export function extractMentions(text: string | null): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(MENTION_RE)].map((m) => m[1]))];
}

/* Modifie le texte d'un post (pas d'un repost) appartenant à `uid` ; le média reste inchangé.
   Renvoie le post modifié, ou null s'il n'existe pas / n'appartient pas à `uid` / est un repost. */
export async function updatePostText(postId: number, uid: string, text: string | null) {
  const row = await getOne<{
    id: number;
    text: string | null;
    image: string | null;
    video: string | null;
    audio: string | null;
  }>('SELECT id, text, image, video, audio FROM posts WHERE id = ? AND uid = ? AND repost_of IS NULL', [postId, uid]);
  if (!row) return null;
  const hasMedia = !!(row.image || row.video || row.audio);
  if (!text && !hasMedia) return { error: 'empty' as const };
  if ((row.text ?? null) === text) return { previousText: row.text, changed: false as const };
  await query('UPDATE posts SET text = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ? AND uid = ?', [text, postId, uid]);
  return { previousText: row.text, changed: true as const };
}

export async function findPostById(postId: number) {
  return getOne<{ id: number; uid: string; text: string | null; repost_of: number | null; is_public: number }>(
    'SELECT * FROM posts WHERE id = ?',
    [postId],
  );
}

/* Supprime un post (ou annule un repost) appartenant à `uid`. Faux s'il n'existe pas / pas à lui. */
export async function deletePost(postId: number, uid: string): Promise<boolean> {
  const row = await getOne<{
    id: number;
    image: string | null;
    video: string | null;
    audio: string | null;
    is_public: number;
  }>('SELECT id, image, video, audio, is_public FROM posts WHERE id = ? AND uid = ?', [postId, uid]);
  if (!row) return false;
  await purgePost(row);
  return true;
}

/* Suppression d'un post par la modération (sans condition d'auteur). */
export async function deletePostAsModerator(postId: number): Promise<boolean> {
  const row = await getOne<{
    id: number;
    image: string | null;
    video: string | null;
    audio: string | null;
    is_public: number;
  }>('SELECT id, image, video, audio, is_public FROM posts WHERE id = ?', [postId]);
  if (!row) return false;
  await purgePost(row);
  return true;
}

async function purgePost(row: {
  id: number;
  image: string | null;
  video: string | null;
  audio: string | null;
  is_public: number;
}) {
  const postId = row.id;
  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM bookmarks WHERE post_id = ?', [postId]);
    await conn.execute('DELETE FROM posts WHERE repost_of = ?', [postId]);
    await conn.execute('DELETE FROM likes WHERE post_id = ?', [postId]);
    await conn.execute('DELETE FROM comments WHERE post_id = ?', [postId]);
    await conn.execute('DELETE FROM notifications WHERE post_id = ?', [postId]);
    await conn.execute('DELETE FROM post_views WHERE post_id = ?', [postId]);
    await conn.execute('DELETE FROM posts WHERE id = ?', [postId]);
  });
  /* Un post public supprimé (par son auteur ou la modération) : on prévient les moteurs, la page répond 410. */
  if (row.is_public) notifyIndexNow([publicPostPath(postId)]);
  /* Le média du post part aussi du disque (droit à l'effacement), sauf s'il sert encore ailleurs. */
  await removeUploadsIfUnreferenced([row.image, row.video, row.audio]);
}

export async function toggleLike(uid: string, postId: number) {
  const existing = await getOne<{ uid: string }>('SELECT uid FROM likes WHERE uid = ? AND post_id = ?', [uid, postId]);
  if (existing) {
    await query('DELETE FROM likes WHERE uid = ? AND post_id = ?', [uid, postId]);
    return false;
  }
  await query('INSERT IGNORE INTO likes (uid, post_id) VALUES (?, ?)', [uid, postId]);
  return true;
}

export async function toggleRepost(uid: string, postId: number) {
  const existing = await getOne<{ id: number }>('SELECT id FROM posts WHERE uid = ? AND repost_of = ?', [uid, postId]);
  if (existing) {
    await query('DELETE FROM posts WHERE id = ?', [existing.id]);
    return false;
  }
  /* IGNORE + index UNIQUE (uid, repost_of) : un double-clic ne crée jamais deux reposts. */
  await query('INSERT IGNORE INTO posts (uid, repost_of) VALUES (?, ?)', [uid, postId]);
  return true;
}

/* ── Abonnements & blocages ─────────────────────────────────────────────────── */

/* Marque-pages privés : enregistrer / retirer un post d'origine. Rien n'est notifié ni exposé. */
export async function toggleBookmark(uid: string, postId: number) {
  const existing = await getOne<{ uid: string }>('SELECT uid FROM bookmarks WHERE uid = ? AND post_id = ?', [
    uid,
    postId,
  ]);
  if (existing) {
    await query('DELETE FROM bookmarks WHERE uid = ? AND post_id = ?', [uid, postId]);
    return false;
  }
  await query('INSERT IGNORE INTO bookmarks (uid, post_id) VALUES (?, ?)', [uid, postId]);
  return true;
}

export async function toggleFollow(followerUid: string, followedUid: string) {
  const existing = await getOne<{ follower_uid: string }>(
    'SELECT follower_uid FROM follows WHERE follower_uid = ? AND followed_uid = ?',
    [followerUid, followedUid],
  );
  if (existing) {
    await query('DELETE FROM follows WHERE follower_uid = ? AND followed_uid = ?', [followerUid, followedUid]);
    return false;
  }
  await query('INSERT IGNORE INTO follows (follower_uid, followed_uid) VALUES (?, ?)', [followerUid, followedUid]);
  return true;
}

export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const row = await getOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM blocks
     WHERE (blocker_uid = ? AND blocked_uid = ?) OR (blocker_uid = ? AND blocked_uid = ?)`,
    [a, b, b, a],
  );
  return (row?.n || 0) > 0;
}

export async function toggleBlock(blockerUid: string, blockedUid: string): Promise<boolean> {
  const existing = await getOne<{ blocker_uid: string }>(
    'SELECT blocker_uid FROM blocks WHERE blocker_uid = ? AND blocked_uid = ?',
    [blockerUid, blockedUid],
  );
  if (existing) {
    await query('DELETE FROM blocks WHERE blocker_uid = ? AND blocked_uid = ?', [blockerUid, blockedUid]);
    return false;
  }
  await withTransaction(async (conn) => {
    await conn.execute('INSERT IGNORE INTO blocks (blocker_uid, blocked_uid) VALUES (?, ?)', [blockerUid, blockedUid]);
    await conn.execute(
      `DELETE FROM follows WHERE (follower_uid = ? AND followed_uid = ?) OR (follower_uid = ? AND followed_uid = ?)`,
      [blockerUid, blockedUid, blockedUid, blockerUid],
    );
  });
  return true;
}

export async function listBlocked(uid: string) {
  return query<{ uid: string; pseudo: string; displayName: string | null; avatar: string | null }[]>(
    `SELECT u.uid, u.pseudo, u.displayName, u.avatar
     FROM blocks b JOIN users u ON u.uid = b.blocked_uid
     WHERE b.blocker_uid = ? ORDER BY b.created_at DESC`,
    [uid],
  );
}

export const REPORT_CATEGORIES = ['spam', 'harassment', 'hate', 'violence', 'illegal', 'sexual', 'other'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export async function createReport(
  reporterUid: string,
  postId: number | null,
  reportedUid: string | null,
  reason: string | null,
  category: ReportCategory = 'other',
  excerpt: string | null = null,
) {
  await query(
    'INSERT IGNORE INTO reports (reporter_uid, post_id, reported_uid, reason, category, post_excerpt) VALUES (?, ?, ?, ?, ?, ?)',
    [reporterUid, postId, reportedUid, reason, category, excerpt ? excerpt.slice(0, 300) : null],
  );
}

/* ── Notifications ──────────────────────────────────────────────────────────── */

const DEDUPED_TYPES = new Set(['like', 'repost', 'follow']);

export async function createNotification(uid: string, type: string, actorUid: string, postId?: number) {
  if (uid === actorUid) return;
  if (await isBlockedEitherWay(uid, actorUid)) return;
  /* Un like/unlike répété ne doit pas spammer : une seule notification par (acteur, type, post). */
  if (DEDUPED_TYPES.has(type)) {
    const existing = await getOne<{ id: number }>(
      'SELECT id FROM notifications WHERE uid = ? AND type = ? AND actor_uid = ? AND post_id <=> ?',
      [uid, type, actorUid, postId ?? null],
    );
    if (existing) return;
  }
  await query('INSERT INTO notifications (uid, type, actor_uid, post_id) VALUES (?, ?, ?, ?)', [
    uid,
    type,
    actorUid,
    postId ?? null,
  ]);
  /* Push sur les appareils abonnés (sans attendre : un échec push ne bloque jamais l'action). */
  void pushForNotification(uid, type, { actorUid, postId });
}

/* Notification émise par la plateforme (modération) : pas d'acteur, un message libre. */
export async function createSystemNotification(uid: string, type: string, message: string, postId?: number) {
  await query('INSERT INTO notifications (uid, type, actor_uid, post_id, message) VALUES (?, ?, NULL, ?, ?)', [
    uid,
    type,
    postId ?? null,
    message.slice(0, 500),
  ]);
  void pushForNotification(uid, type, { postId, message });
}

const MENTION_RE = /(?:^|[^\w])@([a-zA-Z0-9_]{3,30})/g;

/* Notifie chaque @pseudo cité (une fois), sauf l'auteur et ceux déjà notifiés pour ce post. */
export async function notifyMentions(
  text: string,
  actorUid: string,
  postId: number,
  skipUids: string[] = [],
  skipPseudos: string[] = [],
) {
  const skip = new Set(skipPseudos.map((p) => p.toLowerCase()));
  const pseudos = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) if (!skip.has(m[1].toLowerCase())) pseudos.add(m[1]);
  for (const pseudo of [...pseudos].slice(0, 10)) {
    const target = await findUserByPseudo(pseudo);
    if (target && !skipUids.includes(target.uid)) await createNotification(target.uid, 'mention', actorUid, postId);
  }
}

export interface NotificationRow {
  id: number;
  type: string;
  is_read: number;
  created_at: string;
  post_id: number | null;
  post_text: string | null;
  actor_uid: string | null;
  actor_pseudo: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  actor_verified: number | null;
  message: string | null;
}

export async function getNotifications(uid: string, limit = 50, offset = 0) {
  const lim = Math.max(1, Math.trunc(limit));
  const off = Math.max(0, Math.trunc(offset));
  return query<NotificationRow[]>(
    `SELECT n.id, n.type, n.is_read, n.created_at, n.post_id, p.text AS post_text,
            a.uid AS actor_uid, a.pseudo AS actor_pseudo, a.displayName AS actor_name,
            a.avatar AS actor_avatar, a.verified AS actor_verified, n.message
     FROM notifications n
     LEFT JOIN users a ON a.uid = n.actor_uid
     LEFT JOIN posts p ON p.id = n.post_id
     WHERE n.uid = ?
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT ${lim} OFFSET ${off}`,
    [uid],
  );
}

export async function markNotificationsRead(uid: string) {
  await query('UPDATE notifications SET is_read = 1 WHERE uid = ? AND is_read = 0', [uid]);
}

export async function getUnreadNotificationCount(uid: string) {
  const result = await getOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM notifications WHERE uid = ? AND is_read = 0',
    [uid],
  );
  return result?.count || 0;
}

/* ── Commentaires ───────────────────────────────────────────────────────────── */

export async function createComment(postId: number, uid: string, text: string, parentId: number | null = null) {
  const result = await query<{ insertId: number }>(
    'INSERT INTO comments (post_id, parent_id, uid, text) VALUES (?, ?, ?, ?)',
    [postId, parentId, uid, text],
  );
  return result.insertId;
}

/* Commentaire d'un post (pour vérifier qu'on répond bien à un commentaire de CE post). */
export async function findComment(commentId: number) {
  return getOne<{ id: number; post_id: number; parent_id: number | null; uid: string }>(
    'SELECT id, post_id, parent_id, uid FROM comments WHERE id = ?',
    [commentId],
  );
}

export interface CommentRow {
  id: number;
  parent_id: number | null;
  text: string;
  created_at: string;
  uid: string;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
  verified: number;
  reply_count: number;
}

/* Commentaires de premier niveau d'un post (avec le nombre de réponses de chacun). */
export async function getComments(postId: number, viewerUid: string, limit = 50, offset = 0) {
  const lim = Math.max(1, Math.trunc(limit));
  const off = Math.max(0, Math.trunc(offset));
  return query<CommentRow[]>(
    `SELECT c.id, c.parent_id, c.text, c.created_at, u.uid, u.pseudo, u.displayName, u.avatar, u.verified,
            (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS reply_count
     FROM comments c JOIN users u ON c.uid = u.uid
     WHERE c.post_id = ? AND c.parent_id IS NULL AND u.status <> 'banned'
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_uid = ? AND b.blocked_uid = c.uid) OR (b.blocker_uid = c.uid AND b.blocked_uid = ?))
     ORDER BY c.created_at ASC, c.id ASC
     LIMIT ${lim} OFFSET ${off}`,
    [postId, viewerUid, viewerUid],
  );
}

/* Réponses à un commentaire, de la plus ancienne à la plus récente. */
export async function getReplies(parentId: number, viewerUid: string, limit = 100, offset = 0) {
  const lim = Math.max(1, Math.trunc(limit));
  const off = Math.max(0, Math.trunc(offset));
  return query<CommentRow[]>(
    `SELECT c.id, c.parent_id, c.text, c.created_at, u.uid, u.pseudo, u.displayName, u.avatar, u.verified, 0 AS reply_count
     FROM comments c JOIN users u ON c.uid = u.uid
     WHERE c.parent_id = ? AND u.status <> 'banned'
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_uid = ? AND b.blocked_uid = c.uid) OR (b.blocker_uid = c.uid AND b.blocked_uid = ?))
     ORDER BY c.created_at ASC, c.id ASC
     LIMIT ${lim} OFFSET ${off}`,
    [parentId, viewerUid, viewerUid],
  );
}

/* Supprime un commentaire (et ses réponses). Renvoie le nombre de commentaires supprimés, 0 si introuvable / interdit. */
export async function deleteComment(commentId: number, postId: number, uid: string): Promise<number> {
  /* L'auteur du commentaire ou celui du post peut le supprimer. */
  const row = await getOne<{ id: number }>(
    `SELECT c.id FROM comments c JOIN posts p ON p.id = c.post_id
     WHERE c.id = ? AND c.post_id = ? AND (c.uid = ? OR p.uid = ?)`,
    [commentId, postId, uid, uid],
  );
  if (!row) return 0;
  const result = await query<{ affectedRows: number }>('DELETE FROM comments WHERE id = ? OR parent_id = ?', [
    commentId,
    commentId,
  ]);
  return result.affectedRows;
}

/* ── RGPD : export & suppression ────────────────────────────────────────────── */

export async function exportUserData(uid: string) {
  const [profile, posts, comments, likes, bookmarks, following, followers, notifications, blocks, sessions, chatMessages] =
    await Promise.all([
      getOne<Record<string, unknown>>(
        'SELECT uid, pseudo, displayName, avatar, banner, bio, location, website, verified, totp_enabled, createdAt FROM users WHERE uid = ?',
        [uid],
      ),
      query<unknown[]>(
        'SELECT id, text, image, video, audio, audio_duration, repost_of, created_at, edited_at FROM posts WHERE uid = ?',
        [uid],
      ),
      query<unknown[]>('SELECT id, post_id, parent_id, text, created_at FROM comments WHERE uid = ?', [uid]),
      query<unknown[]>('SELECT post_id, created_at FROM likes WHERE uid = ?', [uid]),
      query<unknown[]>(
        'SELECT p.id AS post_id, b.created_at FROM bookmarks b JOIN posts p ON p.id = b.post_id WHERE b.uid = ?',
        [uid],
      ),
      query<unknown[]>(
        'SELECT u.pseudo, f.created_at FROM follows f JOIN users u ON u.uid = f.followed_uid WHERE f.follower_uid = ?',
        [uid],
      ),
      query<unknown[]>(
        'SELECT u.pseudo, f.created_at FROM follows f JOIN users u ON u.uid = f.follower_uid WHERE f.followed_uid = ?',
        [uid],
      ),
      query<unknown[]>('SELECT type, actor_uid, post_id, created_at FROM notifications WHERE uid = ?', [uid]),
      query<unknown[]>('SELECT blocked_uid, created_at FROM blocks WHERE blocker_uid = ?', [uid]),
      query<unknown[]>('SELECT user_agent, created_at, expires_at FROM sessions WHERE uid = ?', [uid]),
      query<unknown[]>('SELECT id, body, created_at FROM chat_messages WHERE uid = ? AND deleted_at IS NULL', [uid]),
    ]);
  return {
    exportedAt: new Date().toISOString(),
    profile,
    posts,
    comments,
    likes,
    bookmarks,
    following,
    followers,
    notifications,
    blocks,
    sessions,
    chatMessages,
  };
}

/* Suppression définitive : toutes les données du compte, en une transaction. */
export async function deleteAccount(uid: string) {
  /* Médias à effacer du disque une fois la transaction validée. */
  const [ownPosts, owner] = await Promise.all([
    query<{ image: string | null; video: string | null; audio: string | null }[]>(
      'SELECT image, video, audio FROM posts WHERE uid = ?',
      [uid],
    ),
    getOne<{ avatar: string | null; banner: string | null }>('SELECT avatar, banner FROM users WHERE uid = ?', [uid]),
  ]);
  await purgeUserMessaging(uid);
  await withTransaction(async (conn) => {
    await conn.execute('DELETE r FROM posts r JOIN posts o ON r.repost_of = o.id WHERE o.uid = ?', [uid]);
    await conn.execute(
      'DELETE FROM bookmarks WHERE uid = ? OR post_id IN (SELECT id FROM (SELECT id FROM posts WHERE uid = ?) AS mine)',
      [uid],
    );
    for (const sql of [
      'DELETE FROM notifications WHERE uid = ? OR actor_uid = ?',
      'DELETE FROM likes WHERE uid = ? OR post_id IN (SELECT id FROM (SELECT id FROM posts WHERE uid = ?) AS mine)',
      /* Les réponses des autres aux commentaires du compte partent avec eux (pas de clé étrangère sur parent_id). */
      'DELETE FROM comments WHERE parent_id IN (SELECT id FROM (SELECT id FROM comments WHERE uid = ?) AS mine) OR uid = ?',
      'DELETE FROM comments WHERE uid = ? OR post_id IN (SELECT id FROM (SELECT id FROM posts WHERE uid = ?) AS mine)',
      'DELETE FROM follows WHERE follower_uid = ? OR followed_uid = ?',
      'DELETE FROM blocks WHERE blocker_uid = ? OR blocked_uid = ?',
      'DELETE FROM reports WHERE reporter_uid = ? OR reported_uid = ?',
    ]) {
      await conn.execute(sql, [uid, uid]);
    }
    await conn.execute(      'DELETE FROM bookmarks WHERE uid = ?',
      'DELETE FROM recovery_codes WHERE uid = ?', [uid]);
    await conn.execute('DELETE FROM account_recovery_keys WHERE uid = ?', [uid]);
    await conn.execute('DELETE FROM chat_messages WHERE uid = ?', [uid]);
    await conn.execute('DELETE FROM sessions WHERE uid = ?', [uid]);
    await conn.execute('DELETE FROM push_subscriptions WHERE uid = ?', [uid]);
    await conn.execute(
      'DELETE FROM post_views WHERE post_id IN (SELECT id FROM (SELECT id FROM posts WHERE uid = ?) AS mine)',
      [uid],
    );
    await conn.execute('DELETE FROM posts WHERE uid = ?', [uid]);
    await conn.execute('DELETE FROM users WHERE uid = ?', [uid]);
  });
  await removeUploadsIfUnreferenced([
    ...ownPosts.flatMap((p) => [p.image, p.video, p.audio]),
    owner?.avatar,
    owner?.banner,
  ]);
}
