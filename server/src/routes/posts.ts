import { Router } from 'express';
import { patchRouter } from '../middleware/asyncHandler.js';
import { authMiddleware, currentUser } from '../middleware/auth.js';
import { byUser, rateLimit } from '../middleware/rateLimit.js';
import { notifyIndexNow, publicPostPath } from '../services/indexnow.js';
import { fetchPosts, filters } from '../services/postQuery.js';
import { getPostStats, recordViews, viewerHash } from '../services/postViews.js';
import { setPostPublic } from '../services/publicPosts.js';
import { pushNewPost } from '../services/pushBroadcast.js';
import {
  type CommentRow,
  createComment,
  createNotification,
  createPost,
  createReport,
  deleteComment,
  deletePost,
  extractMentions,
  findComment,
  findPostById,
  getComments,
  getReplies,
  isBlockedEitherWay,
  notifyMentions,
  REPORT_CATEGORIES,
  type ReportCategory,
  toggleBookmark,
  toggleLike,
  toggleRepost,
  updatePostText,
} from '../services/rtdb.js';
import { uploadExists } from '../services/uploads.js';
import { isSafeUploadPath, parseId, toInt } from '../utils/validation.js';

const router = patchRouter(Router());

/* Un limiteur par action et par utilisateur : avant, un seul compteur partagé (par IP) mélangeait
   publications, likes, reposts et commentaires, et bloquait tout un foyer derrière la même IP. */
const minute = 60 * 1000;
const postLimiter = rateLimit({
  windowMs: minute,
  max: 20,
  message: 'Tu publies trop vite, patiente un peu',
  key: byUser,
});
const likeLimiter = rateLimit({
  windowMs: minute,
  max: 120,
  message: 'Trop de likes d’affilée, ralentis un peu',
  key: byUser,
});
const repostLimiter = rateLimit({
  windowMs: minute,
  max: 40,
  message: 'Trop de reposts d’affilée, ralentis un peu',
  key: byUser,
});
const commentLimiter = rateLimit({
  windowMs: minute,
  max: 30,
  message: 'Tu commentes trop vite, patiente un peu',
  key: byUser,
});
const editLimiter = rateLimit({
  windowMs: minute,
  max: 20,
  message: 'Tu modifies trop vite, patiente un peu',
  key: byUser,
});
const viewLimiter = rateLimit({
  windowMs: minute,
  max: 60,
  message: 'Trop de requêtes, ralentis un peu',
  key: byUser,
});
const bookmarkLimiter = rateLimit({
  windowMs: minute,
  max: 60,
  message: 'Trop de mises en favoris, ralentis un peu',
  key: byUser,
});
const reportLimiter = rateLimit({
  windowMs: 60 * minute,
  max: 20,
  message: 'Trop de signalements, réessaie plus tard',
  key: byUser,
});

/* Résout l'id reçu vers le post d'origine : on ne like/commente jamais une ligne de repost. */
async function resolveSourcePost(rawId: unknown) {
  const id = parseId(rawId);
  if (!id) return null;
  const post = await findPostById(id);
  if (!post) return null;
  return post.repost_of ? findPostById(post.repost_of) : post;
}

router.get('/feed', authMiddleware, async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const limit = toInt(req.query.limit, 20, 1, 100);
    const offset = toInt(req.query.offset, 0, 0, 100000);
    const tag = typeof req.query.tag === 'string' ? req.query.tag.replace(/^#/, '') : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    let filter = filters.all();
    if (tag) {
      if (!/^[\p{L}\p{N}_]{1,80}$/u.test(tag)) return res.json([]);
      filter = filters.tag(tag);
    } else if (q) {
      filter = filters.search(q.slice(0, 100));
    } else if (req.query.tab === 'following') {
      filter = filters.following(uid);
    }
    res.json(await fetchPosts(uid, filter, limit, offset));
  } catch (err) {
    console.error('[POSTS] Feed error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, postLimiter, async (req, res) => {
  try {
    const { text, image, video, audio, audioDuration } = req.body ?? {};
    /* Opt-in : un post n'est public (page indexable) que si l'auteur le demande explicitement. */
    const isPublic = req.body?.public === true;
    const uid = currentUser(req).uid;
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText && !image && !video && !audio) {
      return res.status(400).json({ error: 'Le post ne peut pas être vide' });
    }
    if (cleanText.length > 280) {
      return res.status(400).json({ error: 'Le post ne peut pas dépasser 280 caractères' });
    }
    if (
      (image && !isSafeUploadPath(image)) ||
      (video && !isSafeUploadPath(video)) ||
      (audio && !isSafeUploadPath(audio))
    ) {
      return res.status(400).json({ error: 'Média invalide' });
    }
    if ([image, video, audio].filter(Boolean).length > 1) {
      return res.status(400).json({ error: 'Un seul média par post' });
    }
    if ((image && !uploadExists(image)) || (video && !uploadExists(video)) || (audio && !uploadExists(audio))) {
      return res.status(400).json({ error: 'Média introuvable, renvoie le fichier' });
    }
    /* Durée du vocal annoncée par le navigateur (les WebM de MediaRecorder n'ont pas de durée lisible). */
    const duration =
      audio && Number.isFinite(audioDuration) ? Math.min(Math.max(Math.round(audioDuration), 1), 120) : null;
    const postId = await createPost(
      uid,
      cleanText || null,
      image || null,
      video || null,
      audio || null,
      duration,
      isPublic,
    );
    if (cleanText) await notifyMentions(cleanText, uid, postId);
    /* Notification push à tous les abonnés (sans attendre : un échec push ne bloque pas la publication). */
    void pushNewPost(postId, uid);
    if (isPublic) notifyIndexNow([publicPostPath(postId), '/publications']);
    res.json({ id: postId });
  } catch (err) {
    console.error('[POSTS] Create error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Modification du texte d'un de ses posts (le média ne change pas). Les mentions ajoutées sont notifiées. */
router.put('/:id', authMiddleware, editLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Post introuvable' });
    const uid = currentUser(req).uid;
    const cleanText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (cleanText.length > 280) {
      return res.status(400).json({ error: 'Le post ne peut pas dépasser 280 caractères' });
    }
    const result = await updatePostText(id, uid, cleanText || null);
    if (!result) return res.status(404).json({ error: 'Post introuvable' });
    if ('error' in result) {
      return res.status(400).json({ error: 'Le post ne peut pas être vide' });
    }
    if (result.changed && cleanText) {
      await notifyMentions(cleanText, uid, id, [], extractMentions(result.previousText));
    }
    /* Texte modifié d'un post public : les moteurs doivent relire la page. */
    if (result.changed && (await findPostById(id))?.is_public) notifyIndexNow([publicPostPath(id)]);
    const [post] = await fetchPosts(uid, filters.single(id), 1, 0);
    res.json({ text: post?.text ?? (cleanText || null), editedAt: post?.editedAt ?? null });
  } catch (err) {
    console.error('[POSTS] Edit error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Vues vues à l'écran (par lots) : un visiteur, identifié par l'empreinte de son IP, compte une fois par post. */
router.post('/views', authMiddleware, viewLimiter, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? (req.body.ids as unknown[]).map(parseId).filter((n): n is number => n !== null)
      : [];
    const counted = await recordViews(ids, viewerHash(req.ip), currentUser(req).uid);
    res.json({ ok: true, counted });
  } catch (err) {
    console.error('[POSTS] Views error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Statistiques d'un post : visibles uniquement par son auteur. */
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Post introuvable' });
    const stats = await getPostStats(id, currentUser(req).uid);
    if (!stats) return res.status(404).json({ error: 'Post introuvable' });
    res.json(stats);
  } catch (err) {
    console.error('[POSTS] Stats error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Rend un de ses posts public (page indexable, visible sans connexion) ou le repasse en privé. */
router.put('/:id/visibility', authMiddleware, editLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Post introuvable' });
    if (typeof req.body?.public !== 'boolean') return res.status(400).json({ error: 'Valeur invalide' });
    const result = await setPostPublic(id, currentUser(req).uid, req.body.public);
    if (!result) return res.status(404).json({ error: 'Post introuvable' });
    if (result.changed) notifyIndexNow([publicPostPath(id), '/publications']);
    res.json({ public: req.body.public });
  } catch (err) {
    console.error('[POSTS] Visibility error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Ligne du fil (post ou repost) appartenant à l'utilisateur. */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Post introuvable' });
    const ok = await deletePost(id, currentUser(req).uid);
    if (!ok) return res.status(404).json({ error: 'Post introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[POSTS] Delete error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/like', authMiddleware, likeLimiter, async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const post = await resolveSourcePost(req.params.id);
    if (!post || (await isBlockedEitherWay(uid, post.uid))) return res.status(404).json({ error: 'Post introuvable' });
    const liked = await toggleLike(uid, post.id);
    if (liked) await createNotification(post.uid, 'like', uid, post.id);
    res.json({ liked });
  } catch (err) {
    console.error('[POSTS] Like error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/repost', authMiddleware, repostLimiter, async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const post = await resolveSourcePost(req.params.id);
    if (!post || (await isBlockedEitherWay(uid, post.uid))) return res.status(404).json({ error: 'Post introuvable' });
    const reposted = await toggleRepost(uid, post.id);
    if (reposted) await createNotification(post.uid, 'repost', uid, post.id);
    res.json({ reposted });
  } catch (err) {
    console.error('[POSTS] Repost error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/report', authMiddleware, reportLimiter, async (req, res) => {
  try {
    const post = await resolveSourcePost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post introuvable' });
    if (post.uid === currentUser(req).uid)
      return res.status(400).json({ error: 'Tu ne peux pas signaler ton propre post' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;
    const rawCategory = req.body?.category;
    const category: ReportCategory = REPORT_CATEGORIES.includes(rawCategory) ? rawCategory : 'other';
    await createReport(currentUser(req).uid, post.id, post.uid, reason || null, category, post.text);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POSTS] Report error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const toCommentDto = (c: CommentRow) => ({
  id: c.id,
  parentId: c.parent_id,
  text: c.text,
  createdAt: c.created_at,
  replyCount: Number(c.reply_count),
  user: { uid: c.uid, pseudo: c.pseudo, displayName: c.displayName, avatar: c.avatar, verified: !!c.verified },
});

router.post('/:id/comment', authMiddleware, commentLimiter, async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const post = await resolveSourcePost(req.params.id);
    if (!post || (await isBlockedEitherWay(uid, post.uid))) return res.status(404).json({ error: 'Post introuvable' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 280) {
      return res.status(400).json({ error: 'Commentaire invalide (1 à 280 caractères)' });
    }
    /* Réponse à un commentaire : un seul niveau d'imbrication. Répondre à une réponse reste dans le même fil
       (le commentaire racine), l'auteur visé est celui de la réponse. */
    let rootId: number | null = null;
    let replyToUid: string | null = null;
    if (req.body?.parentId !== undefined && req.body?.parentId !== null) {
      const parentId = parseId(req.body.parentId);
      const parent = parentId ? await findComment(parentId) : null;
      if (!parent || parent.post_id !== post.id || (await isBlockedEitherWay(uid, parent.uid))) {
        return res.status(404).json({ error: 'Commentaire introuvable' });
      }
      rootId = parent.parent_id ?? parent.id;
      replyToUid = parent.uid;
    }
    const commentId = await createComment(post.id, uid, text, rootId);
    /* Chacun n'est prévenu qu'une fois : l'auteur du commentaire visé (réponse), sinon l'auteur du post (commentaire),
       et les autres @mentions. */
    if (replyToUid) await createNotification(replyToUid, 'reply', uid, post.id);
    if (post.uid !== replyToUid) await createNotification(post.uid, 'comment', uid, post.id);
    await notifyMentions(text, uid, post.id, [post.uid, ...(replyToUid ? [replyToUid] : [])]);
    res.json({ id: commentId, parentId: rootId });
  } catch (err) {
    console.error('[POSTS] Comment error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const post = await resolveSourcePost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post introuvable' });
    const rows = await getComments(
      post.id,
      currentUser(req).uid,
      toInt(req.query.limit, 50, 1, 100),
      toInt(req.query.offset, 0, 0, 100000),
    );
    res.json(rows.map(toCommentDto));
  } catch (err) {
    console.error('[POSTS] Comments error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Réponses à un commentaire de premier niveau de ce post. */
router.get('/:id/comments/:commentId/replies', authMiddleware, async (req, res) => {
  try {
    const post = await resolveSourcePost(req.params.id);
    const commentId = parseId(req.params.commentId);
    const comment = commentId ? await findComment(commentId) : null;
    if (!post || !comment || comment.post_id !== post.id || comment.parent_id !== null) {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }
    const rows = await getReplies(
      comment.id,
      currentUser(req).uid,
      toInt(req.query.limit, 100, 1, 200),
      toInt(req.query.offset, 0, 0, 100000),
    );
    res.json(rows.map(toCommentDto));
  } catch (err) {
    console.error('[POSTS] Replies error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const commentId = parseId(req.params.commentId);
    const postId = parseId(req.params.id);
    if (!commentId || !postId) return res.status(404).json({ error: 'Commentaire introuvable' });
    /* `deleted` : nombre de commentaires retirés (le commentaire et ses réponses), pour le compteur affiché. */
    const deleted = await deleteComment(commentId, postId, currentUser(req).uid);
    if (deleted === 0) return res.status(404).json({ error: 'Commentaire introuvable' });
    res.json({ ok: true, deleted });
  } catch (err) {
    console.error('[POSTS] Delete comment error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* Marque-pages privés : la liste d'un utilisateur, la même présentation que le fil. */
router.get('/bookmarks', authMiddleware, async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const limit = toInt(req.query.limit, 20, 1, 100);
    const offset = toInt(req.query.offset, 0, 0, 100000);
    res.json(await fetchPosts(uid, filters.bookmarks(uid), limit, offset));
  } catch (err) {
    console.error('[POSTS] Bookmarks error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/bookmark', authMiddleware, bookmarkLimiter, async (req, res) => {
  try {
    const uid = currentUser(req).uid;
    const post = await resolveSourcePost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post introuvable' });
    res.json({ bookmarked: await toggleBookmark(uid, post.id) });
  } catch (err) {
    console.error('[POSTS] Bookmark error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Post introuvable' });
    const [post] = await fetchPosts(currentUser(req).uid, filters.single(id), 1, 0);
    if (!post) return res.status(404).json({ error: 'Post introuvable' });
    res.json(post);
  } catch (err) {
    console.error('[POSTS] Get error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
