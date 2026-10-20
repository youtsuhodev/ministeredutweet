import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { patchRouter } from '../middleware/asyncHandler.js';
import { authMiddleware, currentUser } from '../middleware/auth.js';
import { byUser, rateLimit } from '../middleware/rateLimit.js';
import {
  addMembers,
  createGroup,
  DM_POLICIES,
  type DmPolicy,
  deleteMessage,
  findUserByPseudoLoose,
  getConversationDto,
  getDmPolicy,
  getMessageForReport,
  getMessages,
  leaveConversation,
  listConversations,
  MAX_GROUP_MEMBERS,
  MessagingError,
  markRead,
  openDirectConversation,
  type Person,
  privateUploadsDir,
  registerUpload,
  removeMember,
  renameGroup,
  resolveMediaForUser,
  sendMessage,
  setDmPolicy,
  setMuted,
  unreadConversationCount,
} from '../services/messages.js';
import { createReport, REPORT_CATEGORIES, type ReportCategory } from '../services/rtdb.js';
import { finalizeUpload } from '../services/uploads.js';
import { toInt } from '../utils/validation.js';

const router = patchRouter(Router());
router.use(authMiddleware);

/* Les erreurs métier (MessagingError) deviennent des réponses JSON claires ; le reste part au gestionnaire global. */
function fail(res: import('express').Response, err: unknown) {
  if (err instanceof MessagingError) return res.status(err.status).json({ error: err.message });
  throw err;
}

const idParam = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const toPerson = (u: ReturnType<typeof currentUser>): Person => ({
  uid: u.uid,
  pseudo: u.pseudo,
  displayName: u.displayName,
  avatar: u.avatar,
});

/* Liste de pseudos fournie par le client → personnes existantes (les inconnus provoquent une erreur claire). */
async function resolvePseudos(raw: unknown): Promise<Person[]> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_GROUP_MEMBERS) {
    throw new MessagingError('Liste de personnes invalide');
  }
  const people: Person[] = [];
  for (const p of raw) {
    if (typeof p !== 'string') throw new MessagingError('Liste de personnes invalide');
    const person = await findUserByPseudoLoose(p.replace(/^@/, '').trim());
    if (!person) throw new MessagingError(`@${String(p).slice(0, 30)} est introuvable`, 404);
    people.push(person);
  }
  return people;
}

const sendLimiter = rateLimit({ windowMs: 60_000, max: 60, message: 'Tu envoies trop de messages, ralentis', key: byUser });
const createLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 20,
  message: 'Trop de nouvelles conversations, réessaie plus tard',
  key: byUser,
});
const manageLimiter = rateLimit({ windowMs: 60_000, max: 30, message: 'Trop de requêtes, ralentis un peu', key: byUser });
const uploadLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 40,
  message: "Trop d'envois, réessaie plus tard",
  key: byUser,
});

/* ── Réglages ───────────────────────────────────────────────────────────────── */

router.get('/settings', async (req, res) => {
  res.json({ dmPolicy: await getDmPolicy(currentUser(req).uid) });
});

router.put('/settings', manageLimiter, async (req, res) => {
  const policy = (req.body as { dmPolicy?: unknown })?.dmPolicy;
  if (typeof policy !== 'string' || !(DM_POLICIES as readonly string[]).includes(policy)) {
    return res.status(400).json({ error: 'Réglage invalide' });
  }
  await setDmPolicy(currentUser(req).uid, policy as DmPolicy);
  res.json({ dmPolicy: policy });
});

router.get('/unread', async (req, res) => {
  res.json({ count: await unreadConversationCount(currentUser(req).uid) });
});

/* ── Conversations ──────────────────────────────────────────────────────────── */

router.get('/conversations', async (req, res) => {
  res.json(
    await listConversations(
      currentUser(req).uid,
      toInt(req.query.limit, 30, 1, 50),
      toInt(req.query.offset, 0, 0, 100000),
    ),
  );
});

router.post('/conversations/direct', createLimiter, async (req, res) => {
  try {
    const me = currentUser(req);
    const pseudo = (req.body as { pseudo?: unknown })?.pseudo;
    if (typeof pseudo !== 'string') return res.status(400).json({ error: 'Pseudo manquant' });
    const other = await findUserByPseudoLoose(pseudo.replace(/^@/, '').trim());
    if (!other) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const id = await openDirectConversation(me.uid, other.uid);
    res.json({ id });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/conversations/group', createLimiter, async (req, res) => {
  try {
    const { title, pseudos } = (req.body ?? {}) as { title?: unknown; pseudos?: unknown };
    if (typeof title !== 'string') return res.status(400).json({ error: 'Nom du groupe manquant' });
    const people = await resolvePseudos(pseudos);
    const id = await createGroup(toPerson(currentUser(req)), title, people);
    res.json({ id });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Conversation introuvable' });
    res.json(await getConversationDto(currentUser(req).uid, id));
  } catch (err) {
    fail(res, err);
  }
});

router.put('/conversations/:id', manageLimiter, async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const title = (req.body as { title?: unknown })?.title;
    if (!id || typeof title !== 'string') return res.status(400).json({ error: 'Requête invalide' });
    await renameGroup(currentUser(req).uid, id, title);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

/* Direct : masque la conversation pour moi. Groupe : je quitte le groupe. */
router.delete('/conversations/:id', manageLimiter, async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Conversation introuvable' });
    await leaveConversation(currentUser(req).uid, id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.put('/conversations/:id/read', async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Conversation introuvable' });
    const upTo = idParam((req.body as { upTo?: unknown })?.upTo);
    await markRead(currentUser(req).uid, id, upTo);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.put('/conversations/:id/mute', manageLimiter, async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Conversation introuvable' });
    const muted = (req.body as { muted?: unknown })?.muted === true;
    await setMuted(currentUser(req).uid, id, muted);
    res.json({ muted });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/conversations/:id/members', manageLimiter, async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Conversation introuvable' });
    const people = await resolvePseudos((req.body as { pseudos?: unknown })?.pseudos);
    await addMembers(toPerson(currentUser(req)), id, people);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/conversations/:id/members/:pseudo', manageLimiter, async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const target = await findUserByPseudoLoose(String(req.params.pseudo));
    if (!id || !target) return res.status(404).json({ error: 'Introuvable' });
    await removeMember(currentUser(req).uid, id, target);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

/* ── Messages ───────────────────────────────────────────────────────────────── */

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Conversation introuvable' });
    res.json(
      await getMessages(currentUser(req).uid, id, idParam(req.query.before), toInt(req.query.limit, 30, 1, 50)),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post('/conversations/:id/messages', sendLimiter, async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Conversation introuvable' });
    const { body, media, duration } = (req.body ?? {}) as { body?: unknown; media?: unknown; duration?: unknown };
    const user = currentUser(req);
    res.json(await sendMessage(toPerson(user), id, { body, mediaFile: media, duration }));
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/items/:id', manageLimiter, async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(404).json({ error: 'Message introuvable' });
    await deleteMessage(currentUser(req).uid, id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

/* Signalement d'un message reçu : alimente la file de modération existante (le modérateur voit l'extrait). */
router.post(
  '/items/:id/report',
  rateLimit({ windowMs: 10 * 60_000, max: 10, message: 'Trop de signalements, réessaie plus tard', key: byUser }),
  async (req, res) => {
    try {
      const id = idParam(req.params.id);
      if (!id) return res.status(404).json({ error: 'Message introuvable' });
      const { category, reason } = (req.body ?? {}) as { category?: unknown; reason?: unknown };
      const cat: ReportCategory = (REPORT_CATEGORIES as readonly unknown[]).includes(category)
        ? (category as ReportCategory)
        : 'other';
      const msg = await getMessageForReport(currentUser(req).uid, id);
      const details = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
      const text = `[Message privé] « ${msg.excerpt.slice(0, 250)} »${details ? ` — ${details}` : ''}`;
      await createReport(currentUser(req).uid, null, msg.senderUid, text.slice(0, 500), cat, msg.excerpt);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  },
);

/* ── Médias privés ──────────────────────────────────────────────────────────── */

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
};
const AUDIO_EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
};
const baseMime = (mime: string) => mime.split(';')[0].trim().toLowerCase();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, privateUploadsDir),
  filename: (_req, file, cb) => {
    const mime = baseMime(file.mimetype);
    cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}.${EXT_BY_MIME[mime] ?? AUDIO_EXT_BY_MIME[mime] ?? 'bin'}`);
  },
});
const uploadMedia = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    EXT_BY_MIME[baseMime(file.mimetype)] ? cb(null, true) : cb(new Error('Type de fichier non supporté')),
});
const uploadAudio = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    AUDIO_EXT_BY_MIME[baseMime(file.mimetype)] ? cb(null, true) : cb(new Error('Type audio non supporté')),
});

router.post(
  '/upload',
  uploadLimiter,
  (req, res, next) => {
    const isAudio = req.query.kind === 'audio';
    (isAudio ? uploadAudio : uploadMedia).single('file')(req, res, (err) => {
      if (!err) return next();
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
      res.status(400).json({
        error: tooBig ? (isAudio ? 'Message vocal trop volumineux (4 Mo max)' : 'Fichier trop volumineux (30 Mo max)') : (err as Error).message,
      });
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
    const kind = req.query.kind === 'audio' ? 'audio' : 'post';
    const result = await finalizeUpload(req.file.path, kind);
    if (!result) {
      return res.status(400).json({
        error: kind === 'audio' ? "Ce fichier n'est pas un enregistrement audio valide" : "Ce fichier n'est pas une image ou une vidéo valide",
      });
    }
    await registerUpload(currentUser(req).uid, result.filename, result.type);
    res.json({ file: result.filename, type: result.type });
  },
);

/* Un média n'est servi qu'aux membres de la conversation (les noms de fichiers ne sont pas un secret suffisant). */
router.get('/media/:file', async (req, res) => {
  const path = await resolveMediaForUser(currentUser(req).uid, String(req.params.file));
  if (!path) return res.status(404).json({ error: 'Média introuvable' });
  res.sendFile(path, {
    dotfiles: 'deny',
    cacheControl: false,
    headers: {
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
});

export default router;
