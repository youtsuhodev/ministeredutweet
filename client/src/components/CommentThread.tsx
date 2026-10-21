import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { timeAgo } from '../lib/time';
import { api, errorMessage } from '../services/api';
import Avatar from './Avatar';
import MentionTextarea from './MentionTextarea';
import type { PostUser } from './PostCard';
import RichText from './RichText';
import VerifiedBadge from './VerifiedBadge';

export interface CommentData {
  id: number;
  /* null = commentaire de premier niveau ; sinon id du commentaire auquel il répond (un seul niveau d'imbrication) */
  parentId: number | null;
  text: string;
  createdAt: string;
  replyCount: number;
  user: PostUser;
}

interface CommentThreadProps {
  comment: CommentData;
  postId: number | string;
  postAuthorUid: string;
  /* variation du nombre total de commentaires du post (+1 réponse ajoutée, −n suppression) */
  onCountChange: (delta: number) => void;
  /* le commentaire de premier niveau (et ses réponses) a été supprimé */
  onRemoved: (id: number) => void;
}

interface RowProps {
  c: CommentData;
  small?: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onReply: () => void;
}

function CommentRow({ c, small, canDelete, onDelete, onReply }: RowProps) {
  return (
    <div className={`flex gap-3 px-4 ${small ? 'py-2' : 'pt-3 pb-1'}`}>
      <Link to={`/${c.user.pseudo}`} className="flex-shrink-0">
        <Avatar src={c.user.avatar} name={c.user.pseudo} className={small ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link to={`/${c.user.pseudo}`} className="font-bold text-[var(--text-primary)] truncate hover:underline">
            {c.user.displayName || c.user.pseudo}
          </Link>
          {c.user.verified && <VerifiedBadge />}
          <span className="text-sm text-[var(--text-secondary)] truncate">@{c.user.pseudo}</span>
          <span className="text-sm text-[var(--text-secondary)] flex-shrink-0">· {timeAgo(c.createdAt)}</span>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Supprimer le commentaire"
              className="ml-auto p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-[15px] text-[var(--text-primary)] whitespace-pre-wrap break-words mt-0.5">
          <RichText text={c.text} />
        </p>
        <button
          type="button"
          onClick={onReply}
          className="mt-1 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
        >
          Répondre
        </button>
      </div>
    </div>
  );
}

/* Un commentaire de premier niveau avec ses réponses (repliables) et la zone pour y répondre. */
export default function CommentThread({
  comment,
  postId,
  postAuthorUid,
  onCountChange,
  onRemoved,
}: CommentThreadProps) {
  const { user: me } = useAuth();
  const [replies, setReplies] = useState<CommentData[] | null>(null);
  const [count, setCount] = useState(comment.replyCount);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /* commentaire auquel on est en train de répondre (la racine ou l'une de ses réponses) */
  const [target, setTarget] = useState<CommentData | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const canDelete = (c: CommentData) => me?.uid === c.user.uid || me?.uid === postAuthorUid;

  const loadReplies = async () => {
    setLoading(true);
    try {
      setReplies(await api.get<CommentData[]>(`/posts/${postId}/comments/${comment.id}/replies`));
    } catch (err) {
      setError(errorMessage(err, 'Impossible de charger les réponses'));
    }
    setLoading(false);
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && replies === null) await loadReplies();
  };

  const startReply = (c: CommentData) => {
    setError('');
    setTarget(c);
    /* « @pseudo » prérempli, sauf si on répond à soi-même */
    setDraft(c.user.uid === me?.uid ? '' : `@${c.user.pseudo} `);
  };

  const cancelReply = () => {
    setTarget(null);
    setDraft('');
    setError('');
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!target || !text || sending) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/posts/${postId}/comment`, { text, parentId: target.id });
      setTarget(null);
      setDraft('');
      setCount((n) => n + 1);
      onCountChange(1);
      setOpen(true);
      await loadReplies();
    } catch (err) {
      setError(errorMessage(err, 'Impossible de répondre, réessaie'));
    }
    setSending(false);
  };

  const remove = async (c: CommentData) => {
    const isRoot = c.id === comment.id;
    if (
      !window.confirm(isRoot && count > 0 ? 'Supprimer ce commentaire et ses réponses ?' : 'Supprimer ce commentaire ?')
    ) {
      return;
    }
    try {
      const res = await api.del<{ deleted?: number }>(`/posts/${postId}/comments/${c.id}`);
      const deleted = res.deleted ?? 1;
      onCountChange(-deleted);
      if (isRoot) {
        onRemoved(comment.id);
      } else {
        setReplies((prev) => (prev ?? []).filter((r) => r.id !== c.id));
        setCount((n) => Math.max(0, n - 1));
      }
    } catch (err) {
      setError(errorMessage(err, 'Suppression impossible'));
    }
  };

  const mentionOnly = target ? draft.trim() === `@${target.user.pseudo}` : false;

  return (
    <div className="border-b border-[var(--border-color)] pb-2">
      <CommentRow
        c={comment}
        canDelete={canDelete(comment)}
        onDelete={() => remove(comment)}
        onReply={() => startReply(comment)}
      />

      {count > 0 && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="ml-[4.25rem] mt-1 text-sm font-bold text-[var(--accent)] hover:underline"
        >
          {open ? 'Masquer les réponses' : `Voir ${count} réponse${count > 1 ? 's' : ''}`}
        </button>
      )}

      {open && (
        <div className="ml-10 mt-1 border-l border-[var(--border-color)]">
          {loading && replies === null && (
            <div className="flex justify-center py-3">
              <div className="spinner" />
            </div>
          )}
          {(replies ?? []).map((r) => (
            <CommentRow
              key={r.id}
              c={r}
              small
              canDelete={canDelete(r)}
              onDelete={() => remove(r)}
              onReply={() => startReply(r)}
            />
          ))}
        </div>
      )}

      {target && (
        <form onSubmit={sendReply} className="ml-10 mt-2 flex gap-3 px-4">
          <Avatar src={me?.avatar} name={me?.pseudo} className="w-8 h-8 text-xs" />
          <div className="flex-1 min-w-0">
            <MentionTextarea
              value={draft}
              onValueChange={setDraft}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelReply();
              }}
              autoFocus
              maxLength={280}
              rows={2}
              aria-label={`Répondre à ${target.user.displayName || target.user.pseudo}`}
              placeholder="Poste ta réponse"
              className="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none resize-none rounded-xl border border-[var(--border-color)] focus:border-[var(--accent)] p-2"
            />
            <div className="flex items-center justify-end gap-3 mt-1">
              <span className="text-sm text-[var(--text-secondary)]">{draft.length} / 280</span>
              <button
                type="button"
                onClick={cancelReply}
                className="text-sm font-bold text-[var(--text-secondary)] hover:underline"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!draft.trim() || mentionOnly || sending}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-full px-5 py-1.5 text-sm transition-colors"
              >
                {sending ? '…' : 'Répondre'}
              </button>
            </div>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="ml-[4.25rem] mt-1 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
