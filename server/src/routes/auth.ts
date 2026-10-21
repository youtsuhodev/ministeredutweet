import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { type Request, type Response, Router } from 'express';
import { v4 as uuid } from 'uuid';
import { patchRouter } from '../middleware/asyncHandler.js';
import {
  authMiddleware,
  clearSessionCookies,
  currentUser,
  readSessionCookie,
  setSessionCookie,
} from '../middleware/auth.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  claimTotpStep,
  consumeAccountKey,
  consumeRecoveryCode,
  countAccountKeys,
  countRecoveryCodes,
  createSession,
  createUser,
  deleteAccount,
  deleteRecoveryCodes,
  deleteSession,
  deleteSessionOfUser,
  deleteUserSessions,
  exportUserData,
  findUserByPseudo,
  findUserByUid,
  listSessions,
  looksLikeAccountKey,
  looksLikeRecoveryCode,
  regenerateAccountKeys,
  regenerateRecoveryCodes,
  updateUser,
} from '../services/rtdb.js';
import { passwordProblem } from '../utils/passwords.js';
import { generateTotpSecret, totpUri, verifyTotpStep } from '../utils/totp.js';
import { isValidPassword, PASSWORD_ERROR, PSEUDO_RE, RESERVED_PSEUDOS } from '../utils/validation.js';

/* patchRouter : toute erreur d'un handler async part vers le gestionnaire d'erreurs Express (sinon, en
   Express 4, la requête restait suspendue jusqu'au délai de 30 s). */
const router = patchRouter(Router());

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
/* Âge minimum de l'inscription : 15 ans (consentement numérique en France). */
const MIN_AGE = 15;
/* Hash factice : on compare toujours, que le compte existe ou non (pas d'écart de timing). */
const DUMMY_HASH = bcrypt.hashSync('wouaff-dummy-password', BCRYPT_ROUNDS);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Trop de tentatives, réessaie dans 15 minutes',
});
const bodyPseudo = (req: Request): string => String((req.body as { pseudo?: unknown })?.pseudo ?? '').toLowerCase();
const loginByPseudoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives sur ce compte, réessaie dans 15 minutes',
  key: (req) => `login:${bodyPseudo(req)}`,
});
/* Les clés de récupération sont des secrets à haute entropie, mais on limite quand même les essais par compte. */
const recoverByPseudoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: 'Trop de tentatives de récupération sur ce compte, réessaie plus tard',
  key: (req) => `recover:${bodyPseudo(req)}`,
});
const exportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Trop de demandes, réessaie plus tard' });

async function startSession(req: Request, res: Response, uid: string) {
  /* 256 bits aléatoires ; seule l'empreinte de cette valeur est stockée en base. */
  const sessionId = randomBytes(32).toString('hex');
  await createSession(sessionId, uid, Date.now() + SESSION_MS, req.headers['user-agent']);
  setSessionCookie(req, res, sessionId, SESSION_MS);
}

/* Vérifie un code TOTP et consomme son pas : un même code ne sert qu'une seule fois (anti-rejeu). */
async function consumeTotp(
  user: { uid: string; totp_secret: string | null; totp_last_step: number | null },
  code: unknown,
): Promise<boolean> {
  if (!user.totp_secret || typeof code !== 'string') return false;
  const last = user.totp_last_step == null ? null : Number(user.totp_last_step);
  const step = verifyTotpStep(user.totp_secret, code.trim(), last);
  return step !== null && (await claimTotpStep(user.uid, step));
}

/* Deuxième facteur : code TOTP à 6 chiffres, ou code de secours (à usage unique). */
async function consumeSecondFactor(
  user: { uid: string; totp_secret: string | null; totp_last_step: number | null },
  code: unknown,
): Promise<boolean> {
  if (typeof code !== 'string') return false;
  if (looksLikeRecoveryCode(code)) return consumeRecoveryCode(user.uid, code);
  return consumeTotp(user, code);
}

const TOTP_UNAVAILABLE = {
  error: 'La double authentification est momentanément indisponible, contacte le support',
};

router.post('/register', authLimiter, verifyCaptcha, async (req, res) => {
  try {
    const { pseudo, password, ageConfirmed } = req.body ?? {};
    if (typeof pseudo !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }
    if (ageConfirmed !== true) {
      return res.status(400).json({ error: `Tu dois avoir au moins ${MIN_AGE} ans pour créer un compte` });
    }
    if (!PSEUDO_RE.test(pseudo)) {
      return res
        .status(400)
        .json({ error: 'Le pseudo doit faire 3 à 30 caractères (lettres, chiffres et underscores uniquement)' });
    }
    if (RESERVED_PSEUDOS.has(pseudo.toLowerCase())) {
      return res.status(400).json({ error: 'Ce pseudo est réservé' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: PASSWORD_ERROR });
    }
    const weak = passwordProblem(password, { pseudo });
    if (weak) return res.status(400).json({ error: weak });
    if (await findUserByPseudo(pseudo)) {
      return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
    }
    const uid = uuid();
    try {
      await createUser(uid, pseudo, await bcrypt.hash(password, BCRYPT_ROUNDS));
    } catch (err) {
      /* Course entre deux inscriptions simultanées : l'index UNIQUE tranche. */
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
      }
      throw err;
    }
    await startSession(req, res, uid);
    res.json({ uid, pseudo });
  } catch (err) {
    console.error('[AUTH] Register error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/login', authLimiter, verifyCaptcha, loginByPseudoLimiter, async (req, res) => {
  try {
    const { pseudo, password, code } = req.body ?? {};
    if (typeof pseudo !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Pseudo et mot de passe requis' });
    }
    const user = await findUserByPseudo(pseudo.trim());
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Ce compte a été banni', code: 'ACCOUNT_BANNED' });
    }
    if (user.totp_enabled) {
      /* 2FA activée mais secret illisible (clé de chiffrement perdue…) : on refuse plutôt que de laisser passer. */
      if (!user.totp_secret) return res.status(503).json(TOTP_UNAVAILABLE);
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(401).json({ error: 'Code de double authentification requis', needs2fa: true });
      }
      if (!(await consumeSecondFactor(user, code))) {
        return res.status(401).json({ error: 'Code de double authentification invalide', needs2fa: true });
      }
    }
    await startSession(req, res, user.uid);
    res.json({ uid: user.uid, pseudo: user.pseudo });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/logout', async (req, res) => {
  const sessionId = readSessionCookie(req);
  if (sessionId) await deleteSession(sessionId).catch(() => {});
  clearSessionCookies(req, res);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = currentUser(req);
  res.json({
    uid: user.uid,
    pseudo: user.pseudo,
    displayName: user.displayName,
    avatar: user.avatar,
    banner: user.banner,
    bio: user.bio,
    location: user.location,
    website: user.website,
    verified: !!user.verified,
    totpEnabled: !!user.totp_enabled,
    createdAt: user.createdAt,
    role: user.role,
    status: user.status,
    suspendedUntil: user.status === 'suspended' ? user.suspended_until : null,
    statusReason: user.status === 'active' ? null : user.status_reason,
    recoveryCodesLeft: user.totp_enabled ? await countRecoveryCodes(user.uid) : 0,
    recoveryNoticePending: !user.recovery_ack,
    legacyNotice: !!user.legacy_notice,
    recoveryKeysLeft: await countAccountKeys(user.uid),
  });
});

/* ── Mot de passe oublié : pseudo + clé de récupération ─────────────────────── */

router.post('/recover', authLimiter, verifyCaptcha, recoverByPseudoLimiter, async (req, res) => {
  const { pseudo, key, password } = req.body ?? {};
  if (typeof pseudo !== 'string' || typeof key !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  if (!isValidPassword(password)) return res.status(400).json({ error: PASSWORD_ERROR });
  const weak = passwordProblem(password, { pseudo });
  if (weak) return res.status(400).json({ error: weak });
  const invalid = { error: 'Pseudo ou clé de récupération invalide' };
  const user = await findUserByPseudo(pseudo.trim());
  if (!user || !looksLikeAccountKey(key) || !(await consumeAccountKey(user.uid, key))) {
    /* Même coût de calcul que le cas réussi : pas d'écart de timing selon que le pseudo existe. */
    if (!user) await bcrypt.hash(password, BCRYPT_ROUNDS);
    return res.status(401).json(invalid);
  }
  await updateUser(user.uid, { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) });
  /* Toutes les sessions sont révoquées : la personne qui avait le mot de passe perdu est déconnectée. */
  await deleteUserSessions(user.uid);
  res.json({ ok: true, keysLeft: await countAccountKeys(user.uid) });
});

router.post('/password', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: PASSWORD_ERROR });
  }
  const weak = passwordProblem(newPassword, { pseudo: user.pseudo });
  if (weak) return res.status(400).json({ error: weak });
  const full = await findUserByUid(user.uid);
  if (!full || !(await bcrypt.compare(currentPassword, full.passwordHash))) {
    return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
  }
  await updateUser(user.uid, { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
  await deleteUserSessions(user.uid, (req as unknown as { sessionId: string }).sessionId);
  res.json({ ok: true });
});

/* ── Double authentification (appli d'authentification, TOTP) ───────────────── */

router.post('/2fa/setup', authMiddleware, async (req, res) => {
  const user = currentUser(req);
  if (user.totp_enabled) return res.status(409).json({ error: 'La double authentification est déjà active' });
  const secret = generateTotpSecret();
  await updateUser(user.uid, { totp_secret: secret, totp_enabled: 0, totp_last_step: null });
  res.json({ secret, uri: totpUri(secret, user.pseudo) });
});

router.post('/2fa/enable', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  const full = await findUserByUid(user.uid);
  if (!full?.totp_secret || !(await consumeTotp(full, req.body?.code))) {
    return res.status(400).json({ error: 'Code invalide' });
  }
  await updateUser(user.uid, { totp_enabled: 1 });
  /* Codes de secours : affichés une seule fois, seule leur empreinte est conservée. */
  res.json({ ok: true, recoveryCodes: await regenerateRecoveryCodes(user.uid) });
});

router.post('/2fa/disable', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  const full = await findUserByUid(user.uid);
  const { password, code } = req.body ?? {};
  if (!full || typeof password !== 'string' || !(await bcrypt.compare(password, full.passwordHash))) {
    return res.status(403).json({ error: 'Mot de passe incorrect' });
  }
  if (full.totp_enabled && !full.totp_secret) return res.status(503).json(TOTP_UNAVAILABLE);
  if (full.totp_secret && !(await consumeSecondFactor(full, code))) {
    return res.status(400).json({ error: 'Code invalide' });
  }
  await updateUser(user.uid, { totp_secret: null, totp_enabled: 0, totp_last_step: null });
  await deleteRecoveryCodes(user.uid);
  res.json({ ok: true });
});

/* Nouveau lot de codes de secours (les anciens cessent de fonctionner). */
router.post('/2fa/recovery-codes', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  const full = await findUserByUid(user.uid);
  const { password, code } = req.body ?? {};
  if (!full || typeof password !== 'string' || !(await bcrypt.compare(password, full.passwordHash))) {
    return res.status(403).json({ error: 'Mot de passe incorrect' });
  }
  if (!full.totp_enabled) return res.status(409).json({ error: "La double authentification n'est pas active" });
  if (!full.totp_secret) return res.status(503).json(TOTP_UNAVAILABLE);
  if (!(await consumeTotp(full, code))) return res.status(400).json({ error: 'Code invalide' });
  res.json({ recoveryCodes: await regenerateRecoveryCodes(user.uid) });
});

/* ── Changement de pseudo ───────────────────────────────── */

const PSEUDO_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/* Mot de passe (et deuxième facteur si actif) exigés pour toute modification sensible de l'identité. */
async function reauthenticate(req: Request, res: Response) {
  const user = currentUser(req);
  const full = await findUserByUid(user.uid);
  const { password, code } = req.body ?? {};
  if (!full || typeof password !== 'string' || !(await bcrypt.compare(password, full.passwordHash))) {
    res.status(403).json({ error: 'Mot de passe incorrect' });
    return null;
  }
  if (full.totp_enabled) {
    if (!full.totp_secret) {
      res.status(503).json(TOTP_UNAVAILABLE);
      return null;
    }
    if (!(await consumeSecondFactor(full, code))) {
      res.status(400).json({ error: 'Code de double authentification invalide', needs2fa: true });
      return null;
    }
  }
  return full;
}

router.post('/pseudo', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  const pseudo = typeof req.body?.pseudo === 'string' ? req.body.pseudo.trim() : '';
  if (!PSEUDO_RE.test(pseudo)) {
    return res
      .status(400)
      .json({ error: 'Le pseudo doit faire 3 à 30 caractères (lettres, chiffres et underscores uniquement)' });
  }
  if (RESERVED_PSEUDOS.has(pseudo.toLowerCase())) return res.status(400).json({ error: 'Ce pseudo est réservé' });
  if (pseudo === user.pseudo) return res.status(400).json({ error: "C'est déjà ton pseudo" });
  const full = await reauthenticate(req, res);
  if (!full) return;
  const last = full.pseudo_changed_at == null ? 0 : Number(full.pseudo_changed_at);
  if (last && Date.now() - last < PSEUDO_COOLDOWN_MS) {
    const next = new Date(last + PSEUDO_COOLDOWN_MS).toLocaleDateString('fr-FR');
    return res.status(429).json({ error: `Tu pourras changer de pseudo à partir du ${next}` });
  }
  const taken = await findUserByPseudo(pseudo);
  if (taken && taken.uid !== full.uid) return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
  try {
    await updateUser(full.uid, { pseudo, pseudo_changed_at: Date.now() });
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
    throw err;
  }
  res.json({ ok: true, pseudo });
});

/* ── Clés de récupération du compte ─────────────────────────────────────────── */

/* Génère un nouveau lot (les anciennes clés cessent de fonctionner). Tant que le compte n'a pas confirmé avoir
   enregistré ses clés (inscription ou ancien compte), la session suffit ; ensuite, le mot de passe (et le
   deuxième facteur) sont exigés. */
router.post('/recovery-keys', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  if (user.recovery_ack) {
    const full = await reauthenticate(req, res);
    if (!full) return;
  }
  res.json({ recoveryKeys: await regenerateAccountKeys(user.uid) });
});

/* La personne confirme avoir enregistré ses clés : la pop-up ne s'affiche plus. */
router.post('/recovery-keys/ack', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  if ((await countAccountKeys(user.uid)) === 0) {
    return res.status(409).json({ error: "Génère d'abord tes clés de récupération" });
  }
  await updateUser(user.uid, { recovery_ack: 1 });
  res.json({ ok: true });
});

/* ── Sessions ───────────────────────────────────────────────────────────────── */

router.get('/sessions', authMiddleware, async (req, res) => {
  const current = (req as unknown as { sessionId: string }).sessionId;
  const sessions = await listSessions(currentUser(req).uid);
  res.json(
    sessions.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      current: s.id === current,
    })),
  );
});

router.delete('/sessions/:id', authMiddleware, async (req, res) => {
  await deleteSessionOfUser(currentUser(req).uid, req.params.id);
  res.json({ ok: true });
});

router.post('/sessions/revoke-others', authMiddleware, async (req, res) => {
  await deleteUserSessions(currentUser(req).uid, (req as unknown as { sessionId: string }).sessionId);
  res.json({ ok: true });
});

/* ── RGPD : export et suppression du compte ─────────────────────────────────── */

router.get('/export', authMiddleware, exportLimiter, async (req, res) => {
  const data = await exportUserData(currentUser(req).uid);
  res.setHeader('Content-Disposition', 'attachment; filename="ministere-du-vide-export.json"');
  res.json(data);
});

router.delete('/account', authMiddleware, authLimiter, async (req, res) => {
  const user = currentUser(req);
  const full = await findUserByUid(user.uid);
  const { password, code } = req.body ?? {};
  if (!full || typeof password !== 'string' || !(await bcrypt.compare(password, full.passwordHash))) {
    return res.status(403).json({ error: 'Mot de passe incorrect' });
  }
  if (full.totp_enabled) {
    if (!full.totp_secret) return res.status(503).json(TOTP_UNAVAILABLE);
    if (!(await consumeSecondFactor(full, code))) {
      return res.status(400).json({ error: 'Code de double authentification invalide' });
    }
  }
  await deleteAccount(user.uid);
  clearSessionCookies(req, res);
  res.json({ ok: true });
});

export default router;
