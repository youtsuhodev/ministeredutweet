import { Bell, BellOff, Crown, LogOut, Pencil, Search, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { type Conversation, personName } from '../lib/messages';
import { api, errorMessage } from '../services/api';
import Avatar from './Avatar';
import { inputClass, outlineBtn, primaryBtn } from './formStyles';
import type { UserSummary } from './UserRow';

interface Props {
  conversation: Conversation;
  meUid: string;
  onClose: () => void;
  /* l'appelant recharge la conversation après chaque modification */
  onChanged: () => void;
}

/** Infos d'un groupe : renommer, membres (ajout / retrait pour le créateur), sourdine, quitter. */
export default function ConversationInfoModal({ conversation, meUid, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const isOwner = conversation.role === 'owner';
  const [title, setTitle] = useState(conversation.title ?? '');
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (!isOwner || !q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .get<UserSummary[]>(`/search?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (cancelled) return;
          const inGroup = new Set(conversation.members.map((m) => m.uid));
          setResults(r.filter((u) => !inGroup.has(u.uid)));
        })
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, isOwner, conversation.members]);

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await action();
      after?.();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const rename = () =>
    run(
      () => api.put(`/messages/conversations/${conversation.id}`, { title: title.trim() }),
      () => setEditing(false),
    );

  const add = (u: UserSummary) =>
    run(
      () => api.post(`/messages/conversations/${conversation.id}/members`, { pseudos: [u.pseudo] }),
      () => {
        setQuery('');
        setResults([]);
      },
    );

  const remove = (pseudo: string) =>
    run(() => api.del(`/messages/conversations/${conversation.id}/members/${encodeURIComponent(pseudo)}`));

  const toggleMute = () =>
    run(() => api.put(`/messages/conversations/${conversation.id}/mute`, { muted: !conversation.muted }));

  const leave = async () => {
    setBusy(true);
    setError('');
    try {
      await api.del(`/messages/conversations/${conversation.id}`);
      onClose();
      navigate('/messages');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-[var(--bg-modal)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Infos du groupe"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[var(--bg-secondary)] rounded-2xl w-full max-w-[480px] mx-4 shadow-xl border border-[var(--border-color)] max-h-[88vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <h2 className="font-extrabold text-lg">Infos du groupe</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-primary)]" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">
          <div>
            {editing ? (
              <div className="flex gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                  aria-label="Nom du groupe"
                  className={inputClass}
                />
                <button type="button" onClick={rename} disabled={busy || !title.trim()} className={primaryBtn}>
                  OK
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-xl flex-1 min-w-0 truncate">{conversation.title}</h3>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    aria-label="Renommer le groupe"
                    className="p-2 rounded-full hover:bg-[var(--bg-tertiary)]"
                  >
                    <Pencil className="w-4 h-4 text-[var(--text-secondary)]" />
                  </button>
                )}
              </div>
            )}
            <p className="text-sm text-[var(--text-secondary)]">{conversation.members.length} membres</p>
          </div>

          {isOwner && (
            <div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ajouter quelqu'un"
                  aria-label="Ajouter quelqu'un au groupe"
                  className={`${inputClass} pl-9`}
                />
              </div>
              {results.length > 0 && (
                <div className="mt-2 border border-[var(--border-color)] rounded-xl overflow-hidden">
                  {results.map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      disabled={busy}
                      onClick={() => add(u)}
                      className="w-full flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] text-left disabled:opacity-60"
                    >
                      <Avatar src={u.avatar} name={u.pseudo} className="w-8 h-8 text-xs" />
                      <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-primary)]">
                        {u.displayName || u.pseudo} <span className="text-[var(--text-secondary)]">@{u.pseudo}</span>
                      </span>
                      <UserPlus className="w-4 h-4 text-[var(--accent)]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <ul className="border border-[var(--border-color)] rounded-xl overflow-hidden">
            {conversation.members.map((m) => (
              <li
                key={m.uid}
                className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 border-[var(--border-color)]"
              >
                <Avatar src={m.avatar} name={m.pseudo} className="w-9 h-9 text-sm" />
                <Link to={`/${m.pseudo}`} onClick={onClose} className="flex-1 min-w-0 hover:no-underline">
                  <div className="text-sm font-bold truncate text-[var(--text-primary)] flex items-center gap-1">
                    {personName(m)}
                    {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-[var(--accent)]" aria-label="Créateur" />}
                    {m.uid === meUid && <span className="text-xs font-normal text-[var(--text-secondary)]">(toi)</span>}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] truncate">@{m.pseudo}</div>
                </Link>
                {isOwner && m.uid !== meUid && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(m.pseudo)}
                    aria-label={`Retirer @${m.pseudo}`}
                    className="p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--bg-tertiary)]"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleMute}
              disabled={busy}
              className={`${outlineBtn} inline-flex items-center gap-2`}
            >
              {conversation.muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              {conversation.muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
            </button>
            {confirmLeave ? (
              <button
                type="button"
                onClick={leave}
                disabled={busy}
                className="px-4 py-1.5 rounded-full bg-[var(--danger)] text-white font-bold text-sm disabled:opacity-50"
              >
                Confirmer : quitter
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="px-4 py-1.5 rounded-full border border-[var(--danger)] text-[var(--danger)] font-bold text-sm hover:bg-[var(--danger)]/10 inline-flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Quitter le groupe
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
