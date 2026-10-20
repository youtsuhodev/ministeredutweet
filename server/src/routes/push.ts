import { Router } from 'express';
import { patchRouter } from '../middleware/asyncHandler.js';
import { authMiddleware, currentUser } from '../middleware/auth.js';
import { byUser, rateLimit } from '../middleware/rateLimit.js';
import {
  getVapidPublicKey,
  isAllowedEndpoint,
  isPushEnabled,
  removeSubscription,
  saveSubscription,
  sendPushToUser,
} from '../services/push.js';

const router = patchRouter(Router());

/* Clé publique VAPID (nécessaire au navigateur pour s'abonner) ; { enabled: false } si le serveur n'a pas de clés. */
router.get('/config', authMiddleware, (_req, res) => {
  res.json({ enabled: isPushEnabled(), publicKey: getVapidPublicKey() });
});

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

router.post(
  '/subscribe',
  authMiddleware,
  rateLimit({ windowMs: 60_000, max: 20, message: 'Trop de tentatives', key: byUser }),
  async (req, res) => {
    if (!isPushEnabled()) return res.status(503).json({ error: 'Notifications push non configurées sur ce serveur' });
    const { endpoint, keys } = (req.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    if (
      !isStr(endpoint, 2000) ||
      !isAllowedEndpoint(endpoint) ||
      !isStr(keys?.p256dh, 255) ||
      !isStr(keys?.auth, 255)
    ) {
      return res.status(400).json({ error: 'Abonnement invalide' });
    }
    try {
      await saveSubscription(
        currentUser(req).uid,
        { endpoint, p256dh: keys.p256dh, auth: keys.auth },
        req.get('user-agent') ?? undefined,
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[PUSH] Subscribe error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
);

router.post('/unsubscribe', authMiddleware, async (req, res) => {
  const { endpoint } = (req.body ?? {}) as { endpoint?: unknown };
  if (!isStr(endpoint, 2000)) return res.status(400).json({ error: 'Abonnement invalide' });
  try {
    await removeSubscription(currentUser(req).uid, endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUSH] Unsubscribe error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Notification de test vers tous les appareils du compte (bouton dans les paramètres). */
router.post(
  '/test',
  authMiddleware,
  rateLimit({ windowMs: 60_000, max: 5, message: 'Trop de tests, patiente un instant', key: byUser }),
  async (req, res) => {
    if (!isPushEnabled()) return res.status(503).json({ error: 'Notifications push non configurées sur ce serveur' });
    try {
      const sent = await sendPushToUser(currentUser(req).uid, {
        title: 'Ministère du vide',
        body: 'Les notifications fonctionnent sur cet appareil ✅',
        url: '/notifications',
        tag: 'push-test',
      });
      res.json({ sent });
    } catch (err) {
      console.error('[PUSH] Test error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
);

export default router;
