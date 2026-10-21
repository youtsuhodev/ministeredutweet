import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { getOne, query } from '../config/database.js';

/* Web Push (VAPID). Tout vient de l'environnement : sans VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, les
   notifications push sont simplement désactivées (aucune valeur de repli, aucune clé en dur).
   Générer les clés avec : npm run vapid */

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';

/* Le « sujet » VAPID doit être un mailto: ou une URL https. */
function vapidSubject(): string | null {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;
  const contact = process.env.CONTACT_EMAIL?.trim();
  if (contact) return `mailto:${contact}`;
  const appUrl = process.env.APP_URL?.trim();
  return appUrl?.startsWith('https://') ? appUrl : null;
}

const subject = vapidSubject();
let configured = false;
if (publicKey && privateKey && subject) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error('[PUSH] Clés VAPID invalides, push désactivé :', (err as Error).message);
  }
}

export const isPushEnabled = () => configured;
export const getVapidPublicKey = () => (configured ? publicKey : null);

/* Le serveur envoie une requête à l'« endpoint » fourni par le client : on n'accepte que les services push
   des navigateurs (sinon un utilisateur pourrait faire contacter une adresse interne par le serveur — SSRF). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^updates-autopush\.(?:stage\.)?mozaws\.net$/,
  /\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

export function isAllowedEndpoint(endpoint: string): boolean {
  if (endpoint.length > 2000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

const hashEndpoint = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

const MAX_SUBSCRIPTIONS_PER_USER = 10;

export async function saveSubscription(
  uid: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  userAgent?: string,
) {
  /* ON DUPLICATE KEY : un même appareil qui change de compte est simplement rattaché au nouvel utilisateur. */
  await query(
    `INSERT INTO push_subscriptions (uid, endpoint_hash, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE uid = VALUES(uid), endpoint = VALUES(endpoint), p256dh = VALUES(p256dh),
                             auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [uid, hashEndpoint(sub.endpoint), sub.endpoint, sub.p256dh, sub.auth, userAgent?.slice(0, 255) ?? null],
  );
  /* Garde les plus récents : un compte ne peut pas accumuler des abonnements sans limite. */
  await query(
    `DELETE FROM push_subscriptions WHERE uid = ? AND id NOT IN (
       SELECT id FROM (SELECT id FROM push_subscriptions WHERE uid = ? ORDER BY id DESC LIMIT ${MAX_SUBSCRIPTIONS_PER_USER}) AS keep
     )`,
    [uid, uid],
  );
}

export async function removeSubscription(uid: string, endpoint: string) {
  await query('DELETE FROM push_subscriptions WHERE uid = ? AND endpoint_hash = ?', [uid, hashEndpoint(endpoint)]);
}

export async function removeAllSubscriptions(uid: string) {
  await query('DELETE FROM push_subscriptions WHERE uid = ?', [uid]);
}

interface SubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /* Chemin interne ouvert au clic (même origine uniquement). */
  url: string;
  /* Une notification de même tag en remplace une précédente. */
  tag?: string;
  /* Avec un tag : la notification remplaçante alerte à nouveau (son / vibration). */
  renotify?: boolean;
  /* Nombre de notifications non lues, pour le badge de l'icône. */
  unread?: number;
}

export async function sendPushToUser(uid: string, payload: PushPayload): Promise<number> {
  if (!configured) return 0;
  const subs = await query<SubscriptionRow[]>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE uid = ?',
    [uid],
  );
  if (subs.length === 0) return 0;
  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
          urgency: 'normal',
        });
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        /* 404 / 410 : l'abonnement n'existe plus (appli désinstallée, permission retirée). */
        if (status === 404 || status === 410) await query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
        else console.warn(`[PUSH] Envoi échoué (${status ?? 'réseau'})`);
      }
    }),
  );
  return delivered;
}

export interface PushPrefs {
  newPosts: boolean;
  activity: boolean;
}

export async function getPushPrefs(uid: string): Promise<PushPrefs> {
  const row = await getOne<{ push_new_posts: number; push_activity: number }>(
    'SELECT push_new_posts, push_activity FROM users WHERE uid = ?',
    [uid],
  );
  return { newPosts: !row || !!row.push_new_posts, activity: !row || !!row.push_activity };
}

export async function setPushPrefs(uid: string, prefs: Partial<PushPrefs>): Promise<void> {
  const sets: string[] = [];
  const values: number[] = [];
  if (typeof prefs.newPosts === 'boolean') {
    sets.push('push_new_posts = ?');
    values.push(prefs.newPosts ? 1 : 0);
  }
  if (typeof prefs.activity === 'boolean') {
    sets.push('push_activity = ?');
    values.push(prefs.activity ? 1 : 0);
  }
  if (sets.length === 0) return;
  await query(`UPDATE users SET ${sets.join(', ')} WHERE uid = ?`, [...values, uid]);
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const ACTION_TEXT: Record<string, string> = {
  follow: "s'est abonné à ton compte",
  like: 'a aimé ton post',
  repost: 'a reposté ton post',
  comment: 'a répondu à ton post',
  mention: "t'a mentionné",
};

/* Construit puis envoie la notification push correspondant à une ligne de la table notifications.
   Appelé sans attendre (void) : un échec push ne doit jamais faire échouer l'action de l'utilisateur. */
export async function pushForNotification(
  uid: string,
  type: string,
  opts: { actorUid?: string | null; postId?: number | null; message?: string | null },
): Promise<void> {
  if (!configured) return;
  try {
    const hasSubs = await getOne<{ id: number }>('SELECT id FROM push_subscriptions WHERE uid = ? LIMIT 1', [uid]);
    if (!hasSubs) return;
    /* Réglage « activité » (likes, réponses, mentions, abonnements) ; les messages de la plateforme passent toujours. */
    if (opts.actorUid) {
      const prefs = await getOne<{ push_activity: number }>('SELECT push_activity FROM users WHERE uid = ?', [uid]);
      if (prefs && !prefs.push_activity) return;
    }

    const unread = await getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM notifications WHERE uid = ? AND is_read = 0',
      [uid],
    );
    const postId = opts.postId ?? null;

    if (!opts.actorUid) {
      /* Notification de la plateforme (modération) : message libre. */
      await sendPushToUser(uid, {
        title: 'Ministère du vide',
        body: clip(opts.message || 'Tu as une nouvelle notification.', 140),
        url: postId ? `/post/${postId}` : '/notifications',
        tag: `sys-${type}-${postId ?? 'x'}`,
        unread: unread?.count,
      });
      return;
    }

    const actor = await getOne<{ pseudo: string; displayName: string | null }>(
      'SELECT pseudo, displayName FROM users WHERE uid = ?',
      [opts.actorUid],
    );
    if (!actor) return;
    const post = postId ? await getOne<{ text: string | null }>('SELECT text FROM posts WHERE id = ?', [postId]) : null;
    const name = actor.displayName || actor.pseudo;
    const action = ACTION_TEXT[type] ?? 'a interagi avec toi';
    await sendPushToUser(uid, {
      title: `${name} ${action}`,
      body: post?.text ? clip(post.text, 120) : `@${actor.pseudo}`,
      url: type === 'follow' ? `/${actor.pseudo}` : postId ? `/post/${postId}` : '/notifications',
      tag: `${type}-${opts.actorUid}-${postId ?? 'x'}`,
      unread: unread?.count,
    });
  } catch (err) {
    console.warn('[PUSH] pushForNotification:', (err as Error).message);
  }
}
