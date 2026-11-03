import { CalendarDays, Check, ImagePlus, MapPin, Megaphone, Send, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import PageHeader from '../components/PageHeader';
import { api, errorMessage } from '../services/api';

interface MobilisationDto {
  id: number;
  slug: string;
  title: string;
  description: string;
  practicalInfo: string | null;
  eventDate: string;
  location: string;
  image: string | null;
  status: string;
  createdBy: { uid: string; pseudo: string; displayName: string | null; avatar: string | null };
  createdAt: string;
  updatedAt: string;
  participantsCount: number;
  isParticipant: boolean;
  mediaCount: number;
  commentsCount: number;
}

interface CommentDto {
  id: number;
  mobilisationId: number;
  body: string;
  createdAt: string;
  sender: { uid: string; pseudo: string; displayName: string | null; avatar: string | null };
}

interface MediaDto {
  id: number;
  url: string;
  type: 'image' | 'video';
  createdAt: string;
  sender: { uid: string; pseudo: string; displayName: string | null; avatar: string | null };
}

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'À venir',
  ongoing: 'En cours',
  past: 'Passée',
  cancelled: 'Annulée',
};

const TABS = ['discussion', 'medias'] as const;

export default function MobilisationDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [mob, setMob] = useState<MobilisationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('discussion');
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [media, setMedia] = useState<MediaDto[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMob = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await api.get<MobilisationDto>(`/mobilisations/slug/${slug}`);
      setMob(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const loadComments = useCallback(async () => {
    if (!mob) return;
    setCommentsLoading(true);
    try {
      const data = await api.get<CommentDto[]>(`/mobilisations/${mob.id}/comments`);
      setComments(data);
    } catch {
      /* ignore */
    } finally {
      setCommentsLoading(false);
    }
  }, [mob]);

  const loadMedia = useCallback(async () => {
    if (!mob) return;
    setMediaLoading(true);
    try {
      const data = await api.get<MediaDto[]>(`/mobilisations/${mob.id}/media`);
      setMedia(data);
    } catch {
      /* ignore */
    } finally {
      setMediaLoading(false);
    }
  }, [mob]);

  useEffect(() => {
    loadMob();
  }, [loadMob]);

  useEffect(() => {
    if (mob) {
      loadComments();
      loadMedia();
    }
  }, [mob, loadComments, loadMedia]);

  const toggleJoin = async () => {
    if (!mob) return;
    const action = mob.isParticipant ? 'leave' : 'join';
    try {
      await api.post(`/mobilisations/${mob.id}/${action}`);
      setMob((prev) =>
        prev
          ? {
              ...prev,
              isParticipant: !prev.isParticipant,
              participantsCount: prev.participantsCount + (mob.isParticipant ? -1 : 1),
            }
          : prev,
      );
    } catch {
      /* ignore */
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mob || !commentText.trim()) return;
    try {
      const comment = await api.post<CommentDto>(`/mobilisations/${mob.id}/comments`, { body: commentText.trim() });
      setComments((prev) => [comment, ...prev]);
      setCommentText('');
    } catch {
      /* ignore */
    }
  };

  const deleteComment = async (id: number) => {
    if (!mob) return;
    try {
      await api.del(`/mobilisations/${mob.id}/comments/${id}`);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* ignore */
    }
  };

  const uploadMedia = async (file: File) => {
    if (!mob) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { url, type } = await api.upload<{ url: string; type: string }>('/upload?kind=post', formData);
      const media = await api.post<MediaDto>(`/mobilisations/${mob.id}/media`, {
        url,
        type: type === 'video' ? 'video' : 'image',
      });
      setMedia((prev) => [media, ...prev]);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Mobilisation" />
        <p className="text-center py-12 text-[var(--text-secondary)]">Chargement…</p>
      </AppShell>
    );
  }

  if (error || !mob) {
    return (
      <AppShell>
        <PageHeader title="Mobilisation" />
        <p className="text-center py-12 text-[var(--danger)]">{error ?? 'Mobilisation introuvable'}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title={mob.title} subtitle={STATUS_LABELS[mob.status]} back="/mobilisations" />

      {mob.image && (
        <div className="h-48 overflow-hidden">
          <img src={mob.image} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-4 h-4" />
            {new Date(mob.eventDate).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {mob.location}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {mob.participantsCount} participant{mob.participantsCount > 1 ? 's' : ''}
          </span>
        </div>

        <p className="text-[var(--text-primary)] whitespace-pre-wrap">{mob.description}</p>

        {mob.practicalInfo && (
          <div className="rounded-xl bg-[var(--bg-tertiary)] p-4">
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">Infos pratiques</h3>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{mob.practicalInfo}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleJoin}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-semibold text-sm transition-colors ${
              mob.isParticipant
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--accent)]/20'
            }`}
          >
            <Check className="w-4 h-4" />
            {mob.isParticipant ? 'Je participe ✓' : 'Je participe'}
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--border-color)]">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-secondary)]'
              }`}
            >
              {t === 'discussion' ? 'Discussion' : 'Médias'}
            </button>
          ))}
        </div>

        {tab === 'discussion' && (
          <div className="space-y-3">
            <form onSubmit={submitComment} className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Discuter…"
                maxLength={2000}
                className="flex-1 px-4 py-2.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="p-2.5 rounded-full bg-[var(--accent)] text-white disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {commentsLoading && <p className="text-center text-[var(--text-secondary)] py-4">Chargement…</p>}

            {comments.map((c) => (
              <div key={c.id} className="flex gap-3 py-2 border-b border-[var(--border-color)]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {c.sender.displayName || c.sender.pseudo}
                    </span>
                    <span className="text-[var(--text-secondary)] text-xs">
                      {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)] mt-1 whitespace-pre-wrap">{c.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteComment(c.id)}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--danger)] self-start"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'medias' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent)]/20 transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                Ajouter
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMedia(f);
                  e.target.value = '';
                }}
              />
            </div>

            {mediaLoading && <p className="text-center text-[var(--text-secondary)] py-4">Chargement…</p>}

            {media.length === 0 && !mediaLoading && (
              <div className="text-center py-8">
                <Megaphone className="w-10 h-10 mx-auto text-[var(--text-secondary)] mb-2" />
                <p className="text-sm text-[var(--text-secondary)]">Aucun média partagé.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {media.map((m) => (
                <div key={m.id} className="rounded-xl overflow-hidden border border-[var(--border-color)]">
                  {m.type === 'image' ? (
                    <img src={m.url} alt="" className="w-full h-36 object-cover" />
                  ) : (
                    <video src={m.url} className="w-full h-36 object-cover" controls>
                      <track kind="captions" label="Sous-titres" />
                    </video>
                  )}
                  <div className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                    {m.sender.displayName || m.sender.pseudo}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
