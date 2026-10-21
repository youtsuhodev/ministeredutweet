import { getOne, query } from '../config/database.js';
import { isPushEnabled, sendPushToUser } from './push.js';
import { isUserVisible } from './realtime.js';

/* Une notification push à tous les abonnés à chaque nouveau post (réglage push_new_posts, activé par défaut).
   Exclus : l'auteur, les comptes bannis, les comptes qui ont bloqué l'auteur (ou que l'auteur a bloqués) et
   ceux qui ont l'appli ouverte à l'écran (ils voient déjà le post). */

/* Garde-fou : un même auteur ne déclenche pas plus d'une diffusion par minute (spam / boucle de publication). */
const COOLDOWN_MS = 60_000;
const lastBroadcast = new Map<string, number>();
const BATCH = 25;

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export async function pushNewPost(postId: number, authorUid: string): Promise<void> {
  if (!isPushEnabled()) return;
  try {
    const now = Date.now();
    if (now - (lastBroadcast.get(authorUid) ?? 0) < COOLDOWN_MS) return;
    lastBroadcast.set(authorUid, now);
    if (lastBroadcast.size > 2000) {
      for (const [uid, at] of lastBroadcast) if (now - at > COOLDOWN_MS) lastBroadcast.delete(uid);
    }

    const [author, post] = await Promise.all([
      getOne<{ pseudo: string; displayName: string | null }>('SELECT pseudo, displayName FROM users WHERE uid = ?', [
        authorUid,
      ]),
      getOne<{ text: string | null; image: string | null; video: string | null; audio: string | null }>(
        'SELECT text, image, video, audio FROM posts WHERE id = ?',
        [postId],
      ),
    ]);
    if (!author || !post) return;

    const recipients = await query<{ uid: string }[]>(
      `SELECT u.uid FROM users u
       WHERE u.push_new_posts = 1 AND u.uid <> ? AND u.status <> 'banned'
         AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.uid = u.uid)
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_uid = u.uid AND b.blocked_uid = ?) OR (b.blocker_uid = ? AND b.blocked_uid = u.uid)
         )`,
      [authorUid, authorUid, authorUid],
    );
    const targets = recipients.map((r) => r.uid).filter((uid) => !isUserVisible(uid));
    if (targets.length === 0) return;

    const media = post.image ? '📷 Photo' : post.video ? '🎥 Vidéo' : post.audio ? '🎤 Message vocal' : '';
    const body = post.text ? clip(post.text, 120) : media || 'Nouveau post';
    const payload = {
      title: `${author.displayName || author.pseudo} a publié`,
      body,
      url: `/post/${postId}`,
      /* Même tag : les notifications de nouveaux posts se remplacent au lieu de s'empiler. */
      tag: 'new-post',
      renotify: true,
    };
    for (let i = 0; i < targets.length; i += BATCH) {
      await Promise.all(targets.slice(i, i + BATCH).map((uid) => sendPushToUser(uid, payload).catch(() => 0)));
    }
  } catch (err) {
    console.warn('[PUSH] pushNewPost:', (err as Error).message);
  }
}
