import { Search, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { openDirect } from '../lib/messages';
import { api, errorMessage } from '../services/api';
import Avatar from './Avatar';
import { inputClass, primaryBtn } from './formStyles';
import type { UserSummary } from './UserRow';
import VerifiedBadge from './VerifiedBadge';

interface Props {
  onClose: () => void;
}

/** Nouvelle conversation : un message à une personne, ou un groupe (nom + plusieurs personnes). */
export default function NewConversationModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<UserSummary[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Recherche avec un léger délai pour ne pas interroger le serveur à chaque frappe. */
  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .get<UserSummary[]>(`/search?q=${encodeURIComponent(q)}`)
        .then((r) => !cancelled && setResults(r.filter((u) => !u.isOwn)))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const startDirect = async (user: UserSummary) => {
    setBusy(true);
    setError('');
    try {
      const id = await openDirect(user.pseudo);
      onClose();
      navigate(`/messages/${id}`);
    } catch (err) {
      setError(errorMessage(err, "Impossible d'ouvrir la conversation"));
      setBusy(false);
    }
  };

  const toggle = (user: UserSummary) =>
    setSelected((cur) =>
      cur.some((u) => u.uid === user.uid) ? cur.filter((u) => u.uid !== user.uid) : [...cur, user],
    );

  const createGroup = async () => {
    if (!title.trim()) return setError('Donne un nom au groupe');
    if (selected.length === 0) return setError('Ajoute au moins une personne');
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ id: number }>('/messages/conversations/group', {
        title: title.trim(),
        pseudos: selected.map((u) => u.pseudo),
      });
      onClose();
      navigate(`/messages/${r.id}`);
    } catch (err) {
      setError(errorMessage(err, 'Création du groupe impossible'));
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-[8dvh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[var(--bg-modal)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nouvelle conversation"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[var(--bg-secondary)] rounded-2xl w-full max-w-[480px] mx-4 shadow-xl border border-[var(--border-color)] max-h-[84dvh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <h2 className="font-extrabold text-lg">Nouvelle conversation</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-primary)]" />
          </button>
        </div>

        <div role="tablist" className="flex border-b border-[var(--border-color)]">
          {(
            [
              ['direct', 'Message'],
              ['group', 'Groupe'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => {
                setMode(id);
                setError('');
              }}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${
                mode === id
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {mode === 'group' && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 60))}
              placeholder="Nom du groupe"
              aria-label="Nom du groupe"
              className={inputClass}
            />
          )}

          {mode === 'group' && selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((u) => (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => toggle(u)}
                  className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-[var(--accent)]/10 text-sm text-[var(--text-primary)] hover:bg-[var(--accent)]/20"
                  aria-label={`Retirer @${u.pseudo}`}
                >
                  <Avatar src={u.avatar} name={u.pseudo} className="w-5 h-5 text-[10px]" />@{u.pseudo}
                  <X className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              // biome-ignore lint/a11y/noAutofocus: la fenêtre vient de s'ouvrir pour chercher quelqu'un
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === 'direct' ? 'Chercher une personne' : 'Ajouter des personnes'}
              aria-label="Rechercher une personne"
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
            {query.trim() && results.length === 0 && (
              <p className="px-4 py-4 text-sm text-[var(--text-secondary)]">Aucun résultat.</p>
            )}
            {!query.trim() && (
              <p className="px-4 py-4 text-sm text-[var(--text-secondary)]">
                Tape un pseudo ou un nom pour trouver quelqu'un.
              </p>
            )}
            {results.map((u) => {
              const picked = selected.some((s) => s.uid === u.uid);
              return (
                <button
                  key={u.uid}
                  type="button"
                  disabled={busy}
                  onClick={() => (mode === 'direct' ? startDirect(u) : toggle(u))}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] text-left disabled:opacity-60"
                >
                  <Avatar src={u.avatar} name={u.pseudo} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate flex items-center gap-1 text-[var(--text-primary)]">
                      {u.displayName || u.pseudo}
                      {u.verified && <VerifiedBadge />}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)] truncate">@{u.pseudo}</div>
                  </div>
                  {mode === 'group' && (
                    <span
                      className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                        picked
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                          : 'border-[var(--border-color)] text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          {mode === 'group' && (
            <button
              type="button"
              onClick={createGroup}
              disabled={busy}
              className={`${primaryBtn} w-full inline-flex items-center justify-center gap-2`}
            >
              <Users className="w-4 h-4" /> {busy ? 'Création…' : `Créer le groupe (${selected.length + 1})`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
