import {
  Ban,
  Bookmark,
  ChartNoAxesColumn,
  Flag,
  Globe,
  Heart,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Repeat2,
  Share,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLongPress } from '../hooks/useLongPress';
import { fullDate, timeAgo } from '../lib/time';
import { formatCount, onViewCounted, trackView } from '../lib/views';
import { api, errorMessage } from '../services/api';
import Avatar from './Avatar';
import ImageLightbox from './ImageLightbox';
import LazyImage from './LazyImage';
import MentionTextarea from './MentionTextarea';
import PostQuickMenu from './PostQuickMenu';
import ReportDialog from './ReportDialog';
import LinkEmbeds from './LinkEmbeds';
import RichText from './RichText';
import StatsDialog from './StatsDialog';
import VerifiedBadge from './VerifiedBadge';
import VoicePlayer from './VoicePlayer';

export interface PostUser {
  uid: string;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
  verified: boolean;
}

export interface Post {
  /* post d'origine : cible des likes, commentaires et reposts */
  id: number;
  /* ligne du fil (celle du repost s'il y en a un) : clé de liste et suppression */
  feedId: number;
  text: string | null;
  image: string | null;
  video: string | null;
  audio: string | null;
  audioDuration: number | null;
  createdAt: string;
  editedAt: string | null;
  /* visible sans connexion (page /p/:id, indexable) : choix de l'auteur */
  isPublic: boolean;
  /* vues uniques */
  viewsCount: number;
  feedAt: string;
  likesCount: number;
  repostsCount: number;
  commentsCount: number;
  userLiked: boolean;
  userReposted: boolean;
  /* marque-page privé de l'utilisateur (personne d'autre ne le voit) */
  userBookmarked: boolean;
  repostOf: number | null;
  repostedBy: { uid: string; pseudo: string; displayName: string | null } | null;
  user: PostUser;
}

interface PostCardProps {
  post: Post;
  /* Clic sur la carte => ouvre la page du post (désactivé sur la page du post elle-même). */
  linkToPost?: boolean;
  onDelete?: (feedId: number) => void;
  onBlocked?: (uid: string) => void;
}

/* Un post public se partage via sa page publique (/p/:id) : aperçu de lien riche, lisible sans compte. */
export function postUrl(id: number, isPublic = false): string {
  return `${window.location.origin}/${isPublic ? 'p' : 'post'}/${id}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function PostCard({ post, linkToPost = true, onDelete, onBlocked }: PostCardProps) {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(post.userLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [reposted, setReposted] = useState(post.userReposted);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount);
  const [bookmarked, setBookmarked] = useState(post.userBookmarked);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [reporting, setReporting] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  /* compteur de vues affiché : monte dès que ce post est compté, sans recharger */
  const [views, setViews] = useState(post.viewsCount);
  /* texte affiché : suit les modifications sans recharger le fil */
  const [text, setText] = useState(post.text);
  const [editedAt, setEditedAt] = useState(post.editedAt);
  const [isPublic, setIsPublic] = useState(post.isPublic);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const longPress = useLongPress(() => setQuickMenuOpen(true));

  useEffect(() => onViewCounted(post.id, () => setViews((v) => v + 1)), [post.id]);

  /* Une vue = le post est affiché à l'écran (sans clic) : au moins la moitié de sa hauteur, ou la moitié de l'écran
     pour un post plus haut que l'écran, pendant une demi-seconde (un défilement rapide ne compte pas). */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        const visible =
          entry.isIntersecting &&
          (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5);
        if (visible) {
          timer ??= window.setTimeout(() => trackView(post.id), 500);
        } else if (timer !== undefined) {
          window.clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [post.id]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  /* La ligne appartient à celui qui a reposté, sinon à l'auteur. */
  const rowOwnerUid = post.repostedBy ? post.repostedBy.uid : post.user.uid;
  const canDelete = me?.uid === rowOwnerUid;
  const isOwnPost = me?.uid === post.user.uid;
  /* seul l'auteur modifie son post, depuis la ligne d'origine (pas celle d'un repost) */
  const canEdit = isOwnPost && !post.repostedBy;
  const hasMedia = !!(post.image || post.video || post.audio);

  const handleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikesCount((c) => c + (next ? 1 : -1));
    try {
      await api.post(`/posts/${post.id}/like`);
    } catch {
      setLiked(!next);
      setLikesCount((c) => c + (next ? -1 : 1));
    }
  };

  /* Marque-page privé : rien n'est notifié, personne ne peut le voir. */
  const handleBookmark = async () => {
    const next = !bookmarked;
    setBookmarked(next);
    try {
      await api.post(`/posts/${post.id}/bookmark`);
    } catch {
      setBookmarked(!next);
    }
  };

  const handleRepost = async () => {
    const next = !reposted;
    setReposted(next);
    setRepostsCount((c) => c + (next ? 1 : -1));
    try {
      await api.post(`/posts/${post.id}/repost`);
    } catch {
      setReposted(!next);
      setRepostsCount((c) => c + (next ? -1 : 1));
    }
  };

  const handleShare = async () => {
    const url = postUrl(post.id, isPublic);
    if (navigator.share) {
      try {
        await navigator.share({ url, text: text || undefined });
        return;
      } catch {
        /* partage annulé : on retombe sur la copie du lien */
      }
    }
    flash((await copyToClipboard(url)) ? 'Lien copié' : 'Copie impossible');
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!window.confirm(post.repostedBy ? 'Annuler ce repost ?' : 'Supprimer ce post ?')) return;
    try {
      await api.del(`/posts/${post.feedId}`);
      onDelete?.(post.feedId);
    } catch {
      flash('Suppression impossible');
    }
  };

  const togglePublic = async () => {
    setMenuOpen(false);
    const next = !isPublic;
    if (
      next &&
      !window.confirm(
        'Rendre ce post public ?\n\nIl sera visible sans connexion et pourra apparaître dans Google et d’autres moteurs de recherche. Réservé aux personnes de 18 ans et plus. Tu pourras le repasser en privé à tout moment, mais les moteurs peuvent mettre du temps à l’oublier.',
      )
    ) {
      return;
    }
    try {
      await api.put(`/posts/${post.id}/visibility`, { public: next });
      setIsPublic(next);
      flash(next ? 'Post public : visible sans connexion' : 'Post repassé en privé');
    } catch (err) {
      flash(errorMessage(err, 'Modification impossible'));
    }
  };

  const startEdit = () => {
    setMenuOpen(false);
    setDraft(text ?? '');
    setEditError('');
    setEditing(true);
  };

  const saveEdit = async () => {
    const next = draft.trim();
    if (saving) return;
    if (!next && !hasMedia) {
      setEditError('Le post ne peut pas être vide');
      return;
    }
    if (next === (text ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      const res = await api.put<{ text: string | null; editedAt: string | null }>(`/posts/${post.id}`, { text: next });
      setText(res.text);
      setEditedAt(res.editedAt);
      setEditing(false);
    } catch (err) {
      setEditError(errorMessage(err, 'Modification impossible, réessaie'));
    }
    setSaving(false);
  };

  const handleReport = () => {
    setMenuOpen(false);
    setReporting(true);
  };

  const handleBlock = async () => {
    setMenuOpen(false);
    if (!window.confirm(`Bloquer @${post.user.pseudo} ? Vous ne verrez plus vos contenus respectifs.`)) return;
    try {
      await api.post(`/blocks/${post.user.pseudo}`);
      onBlocked?.(post.user.uid);
    } catch {
      flash('Blocage impossible');
    }
  };

  const openPost = (e: React.MouseEvent) => {
    if (!linkToPost) return;
    if (longPress.wasLongPress()) return;
    if ((e.target as HTMLElement).closest('a, button, video, audio, input, textarea, [data-no-open]')) return;
    navigate(`/post/${post.id}`);
  };

  return (
    <article
      ref={cardRef}
      onClick={openPost}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchMove={longPress.onTouchMove}
      onMouseDown={longPress.onMouseDown}
      onMouseUp={longPress.onMouseUp}
      onMouseLeave={longPress.onMouseLeave}
      className={`px-4 pt-2 pb-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]/40 transition-colors ${linkToPost ? 'cursor-pointer' : ''}`}
    >
      {post.repostedBy && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] pl-8 mb-0.5">
          <Repeat2 className="w-4 h-4" />
          <Link to={`/${post.repostedBy.pseudo}`} className="hover:underline text-[var(--text-secondary)] font-medium">
            {post.repostedBy.uid === me?.uid
              ? 'Tu as reposté'
              : `${post.repostedBy.displayName || post.repostedBy.pseudo} a reposté`}
          </Link>
        </div>
      )}
      <div className="flex gap-3">
        <Link to={`/${post.user.pseudo}`} className="flex-shrink-0 mt-1">
          <Avatar src={post.user.avatar} name={post.user.pseudo} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link
                to={`/${post.user.pseudo}`}
                className="font-bold text-[var(--text-primary)] hover:underline truncate"
              >
                {post.user.displayName || post.user.pseudo}
              </Link>
              {post.user.verified && <VerifiedBadge className="w-4 h-4" />}
              <Link
                to={`/${post.user.pseudo}`}
                className="text-[var(--text-secondary)] hover:underline truncate text-sm"
              >
                @{post.user.pseudo}
              </Link>
              <span className="text-[var(--text-secondary)] flex-shrink-0 text-sm">·</span>
              <time
                dateTime={new Date(post.createdAt).toISOString()}
                title={fullDate(post.createdAt)}
                className="text-[var(--text-secondary)] flex-shrink-0 text-sm"
              >
                {timeAgo(post.createdAt)}
              </time>
              {isPublic && (
                <span
                  title="Post public : visible sans connexion"
                  role="img"
                  aria-label="Post public"
                  className="text-[var(--text-secondary)] flex-shrink-0"
                >
                  <Globe className="w-3.5 h-3.5" />
                </span>
              )}
              {editedAt && (
                <span
                  title={`Modifié le ${fullDate(editedAt)}`}
                  className="text-[var(--text-secondary)] flex-shrink-0 text-sm"
                >
                  · modifié
                </span>
              )}
            </div>
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Plus d'actions"
                aria-expanded={menuOpen}
                className="p-1.5 rounded-full hover:bg-[var(--accent)]/10 text-[var(--text-secondary)] transition-colors"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {menuOpen && (
                <>
                  <div data-no-open className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 top-8 z-50 min-w-[210px] rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl py-1"
                  >
                    <MenuItem
                      icon={<Link2 className="w-4 h-4" />}
                      label="Copier le lien"
                      onClick={async () => {
                        setMenuOpen(false);
                        flash((await copyToClipboard(postUrl(post.id, isPublic))) ? 'Lien copié' : 'Copie impossible');
                      }}
                    />
                    {canEdit && <MenuItem icon={<Pencil className="w-4 h-4" />} label="Modifier" onClick={startEdit} />}
                    {canEdit && (
                      <MenuItem
                        icon={<Globe className="w-4 h-4" />}
                        label={isPublic ? 'Repasser en privé' : 'Rendre public (Google)'}
                        onClick={togglePublic}
                      />
                    )}
                    {canEdit && (
                      <MenuItem
                        icon={<ChartNoAxesColumn className="w-4 h-4" />}
                        label="Voir les statistiques"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowStats(true);
                        }}
                      />
                    )}
                    {canDelete && (
                      <MenuItem
                        icon={<Trash2 className="w-4 h-4" />}
                        label={post.repostedBy ? 'Annuler le repost' : 'Supprimer'}
                        danger
                        onClick={handleDelete}
                      />
                    )}
                    {!isOwnPost && (
                      <>
                        <MenuItem icon={<Flag className="w-4 h-4" />} label="Signaler" onClick={handleReport} />
                        <MenuItem
                          icon={<Ban className="w-4 h-4" />}
                          label={`Bloquer @${post.user.pseudo}`}
                          danger
                          onClick={handleBlock}
                        />
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <div data-no-open className="mt-1">
              <MentionTextarea
                value={draft}
                onValueChange={setDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    saveEdit();
                  } else if (e.key === 'Escape') {
                    setEditing(false);
                  }
                }}
                autoFocus
                maxLength={280}
                rows={3}
                aria-label="Modifier le post"
                className="w-full bg-transparent text-[var(--text-primary)] text-[15px] leading-relaxed outline-none resize-none rounded-xl border border-[var(--border-color)] focus:border-[var(--accent)] p-3"
              />
              {editError && (
                <p role="alert" className="text-sm text-[var(--danger)] mt-1">
                  {editError}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 mt-1">
                <span className="text-sm text-[var(--text-secondary)]">{draft.length} / 280</span>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-sm font-bold text-[var(--text-secondary)] hover:underline"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving || (!draft.trim() && !hasMedia)}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-full px-5 py-1.5 text-sm transition-colors"
                >
                  {saving ? '…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : (
            text && (
              <p className="text-[var(--text-primary)] text-[15px] leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                <RichText text={text} />
              </p>
            )
          )}

          {!editing && <LinkEmbeds text={text} />}

          {post.image && (
            <div
              data-no-open
              className="mt-3 rounded-2xl overflow-hidden border border-[var(--border-color)] cursor-pointer"
              onClick={() => setLightboxOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxOpen(true); } }}
              aria-label="Agrandir l'image"
            >
              <LazyImage
                src={post.image}
                alt="Pièce jointe du post"
                className="max-h-[500px] object-cover"
              />
            </div>
          )}

          {post.video && (
            <div className="mt-3 rounded-2xl overflow-hidden border border-[var(--border-color)]">
              {/* biome-ignore lint/a11y/useMediaCaption: vidéo envoyée par un utilisateur, pas de sous-titres disponibles */}
              <video
                src={post.video}
                className="w-full max-h-[500px] object-contain bg-black"
                controls
                preload="metadata"
              />
            </div>
          )}

          {post.audio && <VoicePlayer src={post.audio} duration={post.audioDuration} />}

          {notice && (
            <p role="status" className="mt-2 text-sm text-[var(--accent)]">
              {notice}
            </p>
          )}

          <div className="flex items-center justify-between mt-2 max-w-[420px]">
            <Link
              to={`/post/${post.id}`}
              aria-label={`Commentaires : ${post.commentsCount}`}
              className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:no-underline transition-colors group"
            >
              <span className="p-2 rounded-full group-hover:bg-[var(--accent)]/10 transition-colors">
                <MessageCircle className="w-5 h-5" />
              </span>
              <span className="text-sm">{post.commentsCount || ''}</span>
            </Link>

            <button
              type="button"
              onClick={handleRepost}
              aria-pressed={reposted}
              aria-label="Reposter"
              className={`flex items-center gap-1.5 transition-colors group ${reposted ? 'text-[var(--repost-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--repost-color)]'}`}
            >
              <span className="p-2 rounded-full group-hover:bg-[var(--repost-color)]/10 transition-colors">
                <Repeat2 className="w-5 h-5" />
              </span>
              <span className="text-sm">{repostsCount || ''}</span>
            </button>

            <button
              type="button"
              onClick={handleLike}
              aria-pressed={liked}
              aria-label="J'aime"
              className={`flex items-center gap-1.5 transition-colors group ${liked ? 'text-[var(--like-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--like-color)]'}`}
            >
              <span className="p-2 rounded-full group-hover:bg-[var(--like-color)]/10 transition-colors">
                <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
              </span>
              <span className="text-sm">{likesCount || ''}</span>
            </button>

              <button
                type="button"
                onClick={handleBookmark}
                aria-pressed={bookmarked}
                title={bookmarked ? 'Retirer des enregistrements' : 'Enregistrer'}
                aria-label={bookmarked ? 'Retirer des enregistrements' : 'Enregistrer'}
                className={`flex items-center gap-1.5 transition-colors group ${bookmarked ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--accent)]'}`}
              >
                <span className="p-2 rounded-full group-hover:bg-[var(--accent)]/10 transition-colors">
                  <Bookmark className={`w-5 h-5 ${bookmarked ? 'fill-current' : ''}`} />
                </span>
              </button>

            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowStats(true)}
                aria-label={`Vues : ${views}. Voir les statistiques`}
                title="Voir les statistiques"
                className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors group"
              >
                <span className="p-2 rounded-full group-hover:bg-[var(--accent)]/10 transition-colors">
                  <ChartNoAxesColumn className="w-5 h-5" />
                </span>
                <span className="text-sm tabular-nums">{formatCount(views)}</span>
              </button>
            ) : (
              <span
                role="img"
                aria-label={`Vues : ${views}`}
                title="Vues"
                className="flex items-center gap-1.5 text-[var(--text-secondary)]"
              >
                <span className="p-2">
                  <ChartNoAxesColumn className="w-5 h-5" />
                </span>
                <span className="text-sm tabular-nums">{formatCount(views)}</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleShare}
              aria-label="Partager"
              className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors group"
            >
              <span className="p-2 rounded-full group-hover:bg-[var(--accent)]/10 transition-colors">
                <Share className="w-5 h-5" />
              </span>
            </button>
          </div>
        </div>
      </div>
      {showStats && <StatsDialog postId={post.id} onClose={() => setShowStats(false)} />}
      {reporting && (
        <ReportDialog
          postId={post.id}
          onClose={() => setReporting(false)}
          onDone={() => {
            setReporting(false);
            flash('Merci, le post a été signalé');
          }}
        />
      )}
      {quickMenuOpen && (
        <PostQuickMenu
          onCopyLink={async () => {
            setQuickMenuOpen(false);
            flash((await copyToClipboard(postUrl(post.id, isPublic))) ? 'Lien copié' : 'Copie impossible');
          }}
          onShare={() => {
            setQuickMenuOpen(false);
            handleShare();
          }}
          onReport={() => {
            setQuickMenuOpen(false);
            setReporting(true);
          }}
          onHide={() => {
            setQuickMenuOpen(false);
            onDelete?.(post.feedId);
          }}
          onClose={() => setQuickMenuOpen(false)}
        />
      )}
    </article>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left hover:bg-[var(--bg-tertiary)] transition-colors ${danger ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}
    >
      {icon}
      {label}
    </button>
  );
}
