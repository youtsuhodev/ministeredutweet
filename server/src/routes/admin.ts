import { Router } from 'express';
import { patchRouter } from '../middleware/asyncHandler.js';
import { authMiddleware, currentUser, requireRole } from '../middleware/auth.js';
import { byUser, rateLimit } from '../middleware/rateLimit.js';
import {
  countOpenReports,
  deletePostByModerator,
  getAdminStats,
  listAdminPosts,
  listModLog,
  listRecentUsers,
  listReports,
  ModerationError,
  type ReportAction,
  resolveReport,
  sanctionUser,
  searchUsers,
  type UserAction,
} from '../services/moderation.js';
import { parseId, toInt } from '../utils/validation.js';

/* Outils de modération : réservés aux comptes « moderator » et « admin ». */
const router = patchRouter(Router());

router.use(authMiddleware, requireRole('moderator'));
router.use(rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Trop de requêtes, ralentis un peu', key: byUser }));

/* Tableau de bord : des agrégats uniquement, jamais de contenu individuel. */
router.get('/stats', async (_req, res) => {
  res.json(await getAdminStats());
});

/* Vue de l'ensemble du contenu récent, avec suppression directe. */
router.get('/posts', async (req, res) => {
  const rows = await listAdminPosts(toInt(req.query.limit, 30, 1, 100), toInt(req.query.offset, 0, 0, 100000));
  res.json(
    rows.map((p) => ({
      id: p.id,
      text: p.text,
      image: p.image,
      video: p.video,
      audio: p.audio,
      createdAt: p.created_at,
      isRepost: !!p.is_repost,
      author: { uid: p.uid, pseudo: p.pseudo, status: p.status },
      likesCount: Number(p.likes_count),
      commentsCount: Number(p.comments_count),
      openReports: Number(p.open_reports),
    })),
  );
});

router.delete('/posts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Post introuvable' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
  try {
    res.json(await deletePostByModerator(currentUser(req), id, reason));
  } catch (err) {
    fail(res, err);
  }
});

/* Comptes récents : les derniers inscrits avec leur statut, leur activité et leur dernière session. */
router.get('/accounts', async (req, res) => {
  const rows = await listRecentUsers(toInt(req.query.limit, 30, 1, 100), toInt(req.query.offset, 0, 0, 100000));
  res.json(
    rows.map((u) => ({
      uid: u.uid,
      pseudo: u.pseudo,
      role: u.role,
      status: u.status,
      suspendedUntil: u.suspended_until,
      statusReason: u.status_reason,
      createdAt: u.createdAt,
      postsCount: Number(u.posts_count),
      reportsAgainst: Number(u.reports_against),
      lastSession: u.last_session,
    })),
  );
});

router.get('/summary', async (_req, res) => {
  res.json({ openReports: await countOpenReports() });
});

router.get('/reports', async (req, res) => {
  const status = ['open', 'actioned', 'dismissed', 'all'].includes(String(req.query.status))
    ? String(req.query.status)
    : 'open';
  const rows = await listReports(status, toInt(req.query.limit, 30, 1, 100), toInt(req.query.offset, 0, 0, 100000));
  res.json(
    rows.map((r) => ({
      id: r.id,
      category: r.category,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      reporter: r.reporter_pseudo,
      openReportsOnPost: r.open_count,
      post: r.post_id
        ? {
            id: r.post_id,
            exists: !!r.post_exists,
            text: r.post_exists ? r.post_text : r.post_excerpt,
            image: r.post_exists ? r.post_image : null,
            video: r.post_exists ? r.post_video : null,
            audio: r.post_exists ? r.post_audio : null,
          }
        : null,
      target: r.target_uid
        ? { uid: r.target_uid, pseudo: r.target_pseudo, status: r.target_status, role: r.target_role }
        : null,
      resolution: r.resolution,
      handledAt: r.handled_at,
    })),
  );
});

function fail(res: import('express').Response, err: unknown) {
  if (err instanceof ModerationError) return res.status(err.status).json({ error: err.message });
  throw err;
}

router.post('/reports/:id/resolve', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Signalement introuvable' });
  try {
    const { action, reason, days, deleteContent } = req.body ?? {};
    res.json(
      await resolveReport(currentUser(req), id, { action: action as ReportAction, reason, days, deleteContent }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.get('/users', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q.length < 2) return res.json([]);
  const rows = await searchUsers(q);
  res.json(
    rows.map((u) => ({
      uid: u.uid,
      pseudo: u.pseudo,
      role: u.role,
      status: u.status,
      suspendedUntil: u.suspended_until,
      statusReason: u.status_reason,
      createdAt: u.createdAt,
      reportsAgainst: u.reports_against,
    })),
  );
});

router.post('/users/:uid/sanction', async (req, res) => {
  try {
    const { action, reason, days, role } = req.body ?? {};
    res.json(
      await sanctionUser(currentUser(req), String(req.params.uid), {
        action: action as UserAction,
        reason,
        days,
        role,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.get('/log', async (req, res) => {
  const rows = await listModLog(toInt(req.query.limit, 50, 1, 100), toInt(req.query.offset, 0, 0, 100000));
  res.json(
    rows.map((m) => ({
      id: m.id,
      action: m.action,
      reason: m.reason,
      createdAt: m.created_at,
      reportId: m.report_id,
      postId: m.target_post_id,
      actor: m.actor_pseudo,
      target: m.target_pseudo ?? m.target_uid,
    })),
  );
});

export default router;
