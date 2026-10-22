import { Router } from 'express';
import { patchRouter } from '../middleware/asyncHandler.js';
import { authMiddleware, currentUser } from '../middleware/auth.js';
import { byUser, rateLimit } from '../middleware/rateLimit.js';
import {
  CHAT_MAX_LENGTH,
  CHAT_RETENTION_DAYS,
  ChatError,
  deleteChat,
  getChatMessageForReport,
  listChat,
  sendChat,
} from '../services/chat.js';
import { createReport, REPORT_CATEGORIES, type ReportCategory } from '../services/rtdb.js';
import { toInt } from '../utils/validation.js';

const router = patchRouter(Router());
router.use(authMiddleware);

function fail(res: import('express').Response, err: unknown) {
  if (err instanceof ChatError) return res.status(err.status).json({ error: err.message });
  throw err;
}

const idParam = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/* Au plus 8 messages toutes les 10 s et 60 par heure et par compte : assez pour discuter, pas pour inonder. */
const burstLimiter = rateLimit({
  windowMs: 10_000,
  max: 8,
  message: 'Doucement, tu écris trop vite',
  key: byUser,
});
const hourLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 600,
  message: 'Trop de messages envoyés, réessaie plus tard',
  key: byUser,
});

router.get('/', async (req, res) => {
  try {
    const before = idParam(req.query.before);
    res.json({
      ...(await listChat(currentUser(req).uid, before, toInt(req.query.limit, 50, 1, 100))),
      maxLength: CHAT_MAX_LENGTH,
      retentionDays: CHAT_RETENTION_DAYS,
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', burstLimiter, hourLimiter, async (req, res) => {
  try {
    res.status(201).json(await sendChat(currentUser(req).uid, req.body?.body));
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Message introuvable' });
    await deleteChat(currentUser(req), id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

/* Signalement : alimente la file de modération existante (le modérateur voit l'extrait). */
router.post(
  '/:id/report',
  rateLimit({ windowMs: 10 * 60_000, max: 10, message: 'Trop de signalements, réessaie plus tard', key: byUser }),
  async (req, res) => {
    try {
      const id = idParam(req.params.id);
      if (!id) return res.status(404).json({ error: 'Message introuvable' });
      const { category, reason } = (req.body ?? {}) as { category?: unknown; reason?: unknown };
      const cat: ReportCategory = (REPORT_CATEGORIES as readonly unknown[]).includes(category)
        ? (category as ReportCategory)
        : 'other';
      const msg = await getChatMessageForReport(currentUser(req).uid, id);
      const details = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
      const text = `[Salon public] « ${msg.excerpt.slice(0, 250)} »${details ? ` — ${details}` : ''}`;
      await createReport(currentUser(req).uid, null, msg.senderUid, text.slice(0, 500), cat, msg.excerpt);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  },
);

export default router;
