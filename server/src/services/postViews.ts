import { createHmac, randomBytes } from 'node:crypto';
import { getOne, query } from '../config/database.js';

/* Vues uniques d'un post : un visiteur (= une adresse IP) n'est compté qu'une fois par post.
   On ne stocke jamais l'adresse : seulement un HMAC-SHA256 (clé VIEW_HASH_KEY, 16 caractères minimum, ex.
   `openssl rand -hex 32`). Sans clé, une clé aléatoire propre au processus est utilisée : les vues restent uniques
   tant que le serveur tourne, mais un redémarrage permet de recompter un visiteur. */

let fallbackKey: string | undefined;
function hmacKey(): string {
  const key = process.env.VIEW_HASH_KEY?.trim();
  if (key && key.length >= 16) return key;
  if (!fallbackKey) {
    fallbackKey = randomBytes(32).toString('hex');
    console.warn('[VUES] VIEW_HASH_KEY absente : définis-la pour que les vues uniques survivent aux redémarrages.');
  }
  return fallbackKey;
}

/* IPv4-mappée → IPv4 ; IPv6 → préfixe /64 (une même connexion change souvent les 64 derniers bits). */
function normalizeIp(raw: string): string {
  const ip = raw.split('%')[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(':')) return ip;
  const halves = ip.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const groups =
    halves.length > 1 ? [...left, ...Array(Math.max(8 - left.length - right.length, 0)).fill('0'), ...right] : left;
  return `${groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export function viewerHash(ip: string | undefined): string {
  return createHmac('sha256', hmacKey())
    .update(normalizeIp(ip || 'unknown'))
    .digest('hex');
}

/* Enregistre des vues. Ignore les reposts, les posts inconnus et l'auteur qui regarde son propre post. */
export async function recordViews(ids: number[], hash: string, viewerUid?: string): Promise<number[]> {
  const unique = [...new Set(ids)].slice(0, 50);
  const counted: number[] = [];
  if (unique.length === 0) return counted;
  const rows = await query<{ id: number; uid: string }[]>(
    `SELECT id, uid FROM posts WHERE repost_of IS NULL AND id IN (${unique.map(() => '?').join(',')})`,
    unique,
  );
  for (const row of rows) {
    if (viewerUid && row.uid === viewerUid) continue;
    const res = await query<{ affectedRows: number }>(
      'INSERT IGNORE INTO post_views (post_id, viewer_hash) VALUES (?, ?)',
      [row.id, hash],
    );
    /* INSERT IGNORE n'ajoute rien si ce visiteur a déjà vu ce post : le compteur ne bouge alors pas. */
    if (res.affectedRows === 1) {
      await query('UPDATE posts SET views_count = views_count + 1 WHERE id = ?', [row.id]);
      counted.push(row.id);
    }
  }
  return counted;
}

export interface PostStats {
  views: number;
  likes: number;
  reposts: number;
  replies: number;
  engagements: number;
  /* % d'interactions (likes + reposts + réponses) rapportées aux vues */
  engagementRate: number;
  /* nouveaux visiteurs uniques par jour, 7 derniers jours (UTC) */
  daily: { date: string; views: number }[];
  createdAt: string;
}

/* Statistiques d'un post : réservées à son auteur (null si le post n'existe pas ou n'est pas à `uid`). */
export async function getPostStats(postId: number, uid: string): Promise<PostStats | null> {
  const post = await getOne<{ views_count: number; created_at: string | Date }>(
    'SELECT views_count, created_at FROM posts WHERE id = ? AND uid = ? AND repost_of IS NULL',
    [postId, uid],
  );
  if (!post) return null;
  const counts = await getOne<{ likes: number; reposts: number; replies: number }>(
    `SELECT (SELECT COUNT(*) FROM likes WHERE post_id = ?) AS likes,
            (SELECT COUNT(*) FROM posts WHERE repost_of = ?) AS reposts,
            (SELECT COUNT(*) FROM comments WHERE post_id = ?) AS replies`,
    [postId, postId, postId],
  );
  const rows = await query<{ d: string | Date; n: number }[]>(
    `SELECT DATE(first_seen) AS d, COUNT(*) AS n FROM post_views
     WHERE post_id = ? AND first_seen >= (UTC_TIMESTAMP() - INTERVAL 6 DAY)
     GROUP BY DATE(first_seen)`,
    [postId],
  );
  const byDay = new Map(
    rows.map((r) => [typeof r.d === 'string' ? r.d.slice(0, 10) : r.d.toISOString().slice(0, 10), r.n]),
  );
  const daily = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, views: Number(byDay.get(date) ?? 0) };
  });
  const likes = Number(counts?.likes ?? 0);
  const reposts = Number(counts?.reposts ?? 0);
  const replies = Number(counts?.replies ?? 0);
  const views = Number(post.views_count);
  const engagements = likes + reposts + replies;
  return {
    views,
    likes,
    reposts,
    replies,
    engagements,
    engagementRate: views > 0 ? Math.round((engagements / views) * 1000) / 10 : 0,
    daily,
    createdAt: new Date(post.created_at).toISOString(),
  };
}
