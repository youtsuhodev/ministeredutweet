import { getOne, query } from '../config/database.js';

/* Posts « publics » : l'auteur a choisi de les rendre visibles sans connexion (page /p/:id, indexable).
   Seuls les posts d'origine (pas les reposts) de comptes actifs sont exposés. */

export interface PublicPost {
  id: number;
  text: string | null;
  image: string | null;
  video: string | null;
  audio: string | null;
  createdAt: Date;
  editedAt: Date | null;
  pseudo: string;
  displayName: string | null;
  verified: boolean;
}

interface Row {
  id: number;
  text: string | null;
  image: string | null;
  video: string | null;
  audio: string | null;
  created_at: string | Date;
  edited_at: string | Date | null;
  pseudo: string;
  displayName: string | null;
  verified: number;
}

const SELECT = `SELECT p.id, p.text, p.image, p.video, p.audio, p.created_at, p.edited_at,
                       u.pseudo, u.displayName, u.verified
                FROM posts p JOIN users u ON u.uid = p.uid`;
const VISIBLE = "p.is_public = 1 AND p.repost_of IS NULL AND u.status = 'active'";

const toPost = (r: Row): PublicPost => ({
  id: r.id,
  text: r.text,
  image: r.image,
  video: r.video,
  audio: r.audio,
  createdAt: new Date(r.created_at),
  editedAt: r.edited_at ? new Date(r.edited_at) : null,
  pseudo: r.pseudo,
  displayName: r.displayName,
  verified: !!r.verified,
});

export async function getPublicPost(id: number): Promise<PublicPost | null> {
  const row = await getOne<Row>(`${SELECT} WHERE p.id = ? AND ${VISIBLE}`, [id]);
  return row ? toPost(row) : null;
}

/* Petit cache mémoire : ces listes sont publiques et réclamées par les robots, pas besoin de la base à chaque fois. */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: PublicPost[] }>();

export async function listPublicPosts(limit: number, offset = 0): Promise<PublicPost[]> {
  const lim = Math.max(1, Math.min(10000, Math.trunc(limit)));
  const off = Math.max(0, Math.trunc(offset));
  const key = `${lim}:${off}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const rows = await query<Row[]>(
    `${SELECT} WHERE ${VISIBLE} ORDER BY p.created_at DESC, p.id DESC LIMIT ${lim} OFFSET ${off}`,
  );
  const value = rows.map(toPost);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/* Bascule la visibilité publique d'un de ses posts (pas d'un repost). Null si le post n'existe pas / n'est pas à `uid`. */
export async function setPostPublic(postId: number, uid: string, isPublic: boolean) {
  const row = await getOne<{ is_public: number }>(
    'SELECT is_public FROM posts WHERE id = ? AND uid = ? AND repost_of IS NULL',
    [postId, uid],
  );
  if (!row) return null;
  if (!!row.is_public === isPublic) return { changed: false as const };
  await query('UPDATE posts SET is_public = ? WHERE id = ? AND uid = ?', [isPublic ? 1 : 0, postId, uid]);
  cache.clear();
  return { changed: true as const };
}

/* Pourquoi /p/:id répond 410 : texte pour les journaux du serveur uniquement (jamais renvoyé au visiteur). */
export async function explainHidden(id: number): Promise<string> {
  const row = await getOne<{ is_public: number; repost_of: number | null; status: string }>(
    'SELECT p.is_public, p.repost_of, u.status FROM posts p JOIN users u ON u.uid = p.uid WHERE p.id = ?',
    [id],
  );
  if (!row) return 'post introuvable en base';
  if (row.repost_of) return `ligne de repost de #${row.repost_of} : utilise l'id du post d'origine`;
  if (!row.is_public) return 'is_public = 0 : le post est privé';
  return `compte « ${row.status} » (seuls les comptes « active » sont exposés)`;
}
