import { Router } from 'express';
import { patchRouter } from '../middleware/asyncHandler.js';
import { authMiddleware, currentUser } from '../middleware/auth.js';
import { byUser, rateLimit } from '../middleware/rateLimit.js';
import {
  addMobilisationComment,
  addMobilisationMedia,
  createMobilisation,
  deleteMobilisation,
  deleteMobilisationComment,
  getMobilisation,
  getMobilisationBySlug,
  getParticipants,
  joinMobilisation,
  leaveMobilisation,
  listMobilisationComments,
  listMobilisationMedia,
  listMobilisations,
  MobilisationError,
  updateMobilisation,
} from '../services/mobilisations.js';
import { isSafeUploadPath, parseId, toInt } from '../utils/validation.js';

const router = patchRouter(Router());
router.use(authMiddleware);

function fail(res: import('express').Response, err: unknown) {
  if (err instanceof MobilisationError) return res.status(err.status).json({ error: err.message });
  throw err;
}

const createLimiter = rateLimit({ windowMs: 60_000, max: 5, message: 'Trop de mobilisations créées, ralentis', key: byUser });
const commentLimiter = rateLimit({ windowMs: 60_000, max: 30, message: 'Tu commentes trop vite', key: byUser });
const mediaLimiter = rateLimit({ windowMs: 60_000, max: 20, message: 'Trop de médias, ralentis', key: byUser });

router.get('/', async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const before = parseId(req.query.before);
    const limit = toInt(req.query.limit, 20, 1, 50);
    res.json(await listMobilisations(uid, { status, before: before ?? undefined, limit }));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const mob = await getMobilisation(id, currentUser(req).uid);
    if (!mob) return res.status(404).json({ error: 'Mobilisation introuvable' });
    res.json(mob);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const mob = await getMobilisationBySlug(slug, currentUser(req).uid);
    if (!mob) return res.status(404).json({ error: 'Mobilisation introuvable' });
    res.json(mob);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', createLimiter, async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const { title, description, practicalInfo, eventDate, location, image } = req.body ?? {};
    const mob = await createMobilisation(uid, { title, description, practicalInfo, eventDate, location, image });
    res.status(201).json(mob);
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const { title, description, practicalInfo, eventDate, location, image, status } = req.body ?? {};
    await updateMobilisation(id, currentUser(req).uid, { title, description, practicalInfo, eventDate, location, image, status });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    await deleteMobilisation(id, currentUser(req).uid);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    await joinMobilisation(id, currentUser(req).uid);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    await leaveMobilisation(id, currentUser(req).uid);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:id/participants', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const limit = toInt(req.query.limit, 50, 1, 200);
    res.json(await getParticipants(id, limit));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:id/media', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const before = parseId(req.query.before);
    const limit = toInt(req.query.limit, 20, 1, 50);
    res.json(await listMobilisationMedia(id, { before: before ?? undefined, limit }));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/media', mediaLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const { url, type } = req.body ?? {};
    if (!isSafeUploadPath(url)) return res.status(400).json({ error: 'URL de média invalide' });
    if (type !== 'image' && type !== 'video') return res.status(400).json({ error: 'Type de média invalide' });
    const media = await addMobilisationMedia(id, currentUser(req).uid, url, type);
    res.status(201).json(media);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const before = parseId(req.query.before);
    const limit = toInt(req.query.limit, 30, 1, 100);
    res.json(await listMobilisationComments(id, { before: before ?? undefined, limit }));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/comments', commentLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Mobilisation introuvable' });
    const { body } = req.body ?? {};
    const comment = await addMobilisationComment(id, currentUser(req).uid, body);
    res.status(201).json(comment);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const commentId = parseId(req.params.commentId);
    if (!commentId) return res.status(404).json({ error: 'Commentaire introuvable' });
    await deleteMobilisationComment(commentId, currentUser(req).uid);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
