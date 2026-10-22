import { ArrowDown, ArrowLeft, Flag, Send, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import Avatar from '../components/Avatar';
import ReportDialog from '../components/ReportDialog';
import RichText from '../components/RichText';
import VerifiedBadge from '../components/VerifiedBadge';
import { useAuth } from '../hooks/useAuth';
import { useRealtime, useRealtimeEvents } from '../hooks/useRealtime';
import { api, errorMessage } from '../services/api';

/* Salon public : un seul grand fil ouvert à tous, en temps réel (WebSocket « chat_* »). */

interface ChatAuthor {
  uid: string;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
  verified: boolean;
  role: string;
}

interface PublicMessage {
  id: number;
  createdAt: number;
  body: string;
  deleted: boolean;
  author: ChatAuthor;
}

interface ListResponse {
  messages: PublicMessage[];
  hasMore: boolean;
  online: number;
  maxLength: number;
  retentionDays: number;
}

const PAGE = 50;
/* Au-delà, les plus anciens messages quittent la mémoire quand on est en bas (la page reste fluide). */
const MAX_IN_MEMORY = 400;
const GROUP_GAP_MS = 5 * 60_000;

const timeLabel = (ts: number) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;

export default function PublicChatPage() {
  const { user } = useAuth();
  const { send, connected } = useRealtime();
  const me = user?.uid ?? '';
  const canModerate = user?.role === 'moderator' || user?.role === 'admin';
  const suspended = user?.status === 'suspended';

  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [online, setOnline] = useState(0);
  const [maxLength, setMaxLength] = useState(500);
  const [retentionDays, setRetentionDays] = useState(30);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [unseen, setUnseen] = useState(0);
  const [reporting, setReporting] = useState<PublicMessage | null>(null);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  /* Position de défilement à restaurer après l'ajout de messages plus anciens en haut de la liste. */
  const anchor = useRef<{ height: number; y: number } | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  /* Présence dans le salon : seuls les onglets qui l'ont ouvert reçoivent ses messages. */
  useEffect(() => {
    if (!connected) return;
    sendRef.current({ type: 'chat_join' });
    return () => sendRef.current({ type: 'chat_leave' });
  }, [connected]);

  const loadLatest = useCallback(async (merge: boolean) => {
    try {
      const r = await api.get<ListResponse>(`/chat?limit=${PAGE}`);
      setMaxLength(r.maxLength);
      setRetentionDays(r.retentionDays);
      setOnline(r.online);
      setMessages((prev) => {
        if (!merge) {
          setHasMore(r.hasMore);
          return r.messages;
        }
        /* Resynchronisation après une coupure : on garde l'historique déjà affiché et on ajoute ce qui manque. */
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of r.messages) byId.set(m.id, m);
        return [...byId.values()].sort((a, b) => a.id - b.id);
      });
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Impossible de charger le salon'));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void loadLatest(false);
  }, [loadLatest]);

  /* Premier affichage : on arrive en bas du fil. */
  const firstScroll = useRef(true);
  useLayoutEffect(() => {
    if (!loaded || messages.length === 0) return;
    if (anchor.current) {
      const { height, y } = anchor.current;
      anchor.current = null;
      window.scrollTo(0, y + (document.documentElement.scrollHeight - height));
    } else if (firstScroll.current || stickToBottom.current) {
      firstScroll.current = false;
      window.scrollTo(0, document.documentElement.scrollHeight);
    }
  }, [messages, loaded]);

  useEffect(() => {
    const onScroll = () => {
      const bottom = nearBottom();
      stickToBottom.current = bottom;
      if (bottom) setUnseen(0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await api.get<ListResponse>(`/chat?before=${first.id}&limit=${PAGE}`);
      anchor.current = { height: document.documentElement.scrollHeight, y: window.scrollY };
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...r.messages.filter((m) => !known.has(m.id)), ...prev];
      });
      setHasMore(r.hasMore);
    } catch (err) {
      setError(errorMessage(err));
    }
    setLoadingOlder(false);
  };

  const append = useCallback((msg: PublicMessage, mine: boolean) => {
    if (mine) stickToBottom.current = true;
    else if (!stickToBottom.current) setUnseen((n) => n + 1);
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const next = [...prev, msg];
      return stickToBottom.current && next.length > MAX_IN_MEMORY ? next.slice(-MAX_IN_MEMORY) : next;
    });
  }, []);

  useRealtimeEvents((event) => {
    const e = event as { type: string; message?: PublicMessage; messageId?: number; count?: number };
    if (e.type === 'open') {
      if (loaded) void loadLatest(true);
    } else if (e.type === 'chat_message' && e.message) {
      append(e.message, e.message.author.uid === me);
    } else if (e.type === 'chat_deleted' && e.messageId) {
      setMessages((prev) => prev.map((m) => (m.id === e.messageId ? { ...m, body: '', deleted: true } : m)));
    } else if (e.type === 'chat_online' && typeof e.count === 'number') {
      setOnline(e.count);
    }
  });

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || suspended) return;
    setSending(true);
    setError('');
    try {
      const msg = await api.post<PublicMessage>('/chat', { body });
      setText('');
      append(msg, true);
    } catch (err) {
      setError(errorMessage(err, "Impossible d'envoyer le message"));
    }
    setSending(false);
    textarea.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const remove = async (m: PublicMessage) => {
    try {
      await api.del(`/chat/${m.id}`);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, body: '', deleted: true } : x)));
    } catch (err) {
      setError(errorMessage(err, 'Suppression impossible'));
    }
  };

  const scrollDown = () => {
    stickToBottom.current = true;
    setUnseen(0);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  return (
    <AppShell chat>
      <div className="flex flex-col min-h-[100dvh]">
        <header className="sticky top-0 z-40 bg-[var(--bg-secondary)]/90 backdrop-blur-md border-b border-[var(--border-color)] flex items-center gap-2 px-2 py-2">
          <Link
            to="/"
            aria-label="Retour à l'accueil"
            className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--text-primary)]" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-lg leading-tight text-[var(--text-primary)]">Salon public</h1>
            <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              {connected ? `${online} en ligne` : 'Reconnexion…'}
            </p>
          </div>
        </header>

        <div className="flex-1 px-3 py-4 space-y-0.5">
          <p className="text-center text-xs text-[var(--text-secondary)] pb-3">
            Tout le monde peut lire et écrire ici. Sois respectueux : les messages sont conservés {retentionDays} jours
            puis supprimés.
          </p>

          {hasMore && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="text-sm font-bold text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                {loadingOlder ? '…' : 'Voir les messages précédents'}
              </button>
            </div>
          )}
          {!loaded && (
            <div className="flex justify-center py-12">
              <div className="spinner" />
            </div>
          )}
          {loaded && messages.length === 0 && !error && (
            <p className="text-center text-sm text-[var(--text-secondary)] py-12">
              Personne n'a encore écrit. Lance la discussion 👋
            </p>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const grouped = !newDay && prev.author.uid === m.author.uid && m.createdAt - prev.createdAt < GROUP_GAP_MS;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="text-center text-xs text-[var(--text-secondary)] py-3 capitalize">
                    {dayLabel(m.createdAt)}
                  </div>
                )}
                <MessageRow
                  m={m}
                  mine={m.author.uid === me}
                  grouped={grouped}
                  canDelete={m.author.uid === me || canModerate}
                  onDelete={() => remove(m)}
                  onReport={() => setReporting(m)}
                />
              </div>
            );
          })}
        </div>

        {unseen > 0 && (
          <button
            type="button"
            onClick={scrollDown}
            className="fixed left-1/2 -translate-x-1/2 bottom-24 z-30 flex items-center gap-2 bg-[var(--accent)] text-white font-bold text-sm rounded-full px-4 py-2 shadow-lg"
          >
            <ArrowDown className="w-4 h-4" aria-hidden="true" />
            {unseen} nouveau{unseen > 1 ? 'x' : ''} message{unseen > 1 ? 's' : ''}
          </button>
        )}

        <div className="sticky bottom-0 z-30 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {(error || notice) && (
            <p
              role={error ? 'alert' : 'status'}
              className={`text-sm mb-2 ${error ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}
            >
              {error || notice}
            </p>
          )}
          {suspended ? (
            <p className="text-sm text-[var(--text-secondary)] py-2">
              Ton compte est suspendu : tu peux lire le salon mais pas y écrire.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                ref={textarea}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, maxLength))}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={maxLength}
                placeholder="Écris au salon"
                aria-label="Message au salon public"
                className="flex-1 min-w-0 resize-none max-h-32 bg-[var(--bg-tertiary)] rounded-2xl px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!text.trim() || sending}
                aria-label="Envoyer"
                className="p-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white flex-shrink-0 transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          )}
          {text.length > maxLength - 100 && (
            <p className="text-xs text-right text-[var(--text-secondary)] mt-1 tabular-nums">
              {text.length}/{maxLength}
            </p>
          )}
        </div>
      </div>

      {reporting && (
        <ReportDialog
          endpoint={`/chat/${reporting.id}/report`}
          subject="ce message"
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            setNotice('Signalement envoyé, merci.');
            window.setTimeout(() => setNotice(''), 4000);
          }}
        />
      )}
    </AppShell>
  );
}

function MessageRow({
  m,
  mine,
  grouped,
  canDelete,
  onDelete,
  onReport,
}: {
  m: PublicMessage;
  mine: boolean;
  grouped: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onReport: () => void;
}) {
  const a = m.author;
  const name = a.displayName || a.pseudo;
  const staff = a.role === 'admin' ? 'Admin' : a.role === 'moderator' ? 'Modo' : null;
  const actions = !m.deleted && (canDelete || !mine);

  return (
    <div className={`group flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-3'}`}>
      {!mine && (
        <div className="w-8 flex-shrink-0">
          {!grouped && (
            <Link to={`/${a.pseudo}`} aria-label={`Profil de ${name}`}>
              <Avatar src={a.avatar} name={name} className="w-8 h-8 text-xs" />
            </Link>
          )}
        </div>
      )}
      <div className={`max-w-[82%] min-w-0 flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && !grouped && (
          <div className="flex items-center gap-1.5 mb-0.5 ml-3 min-w-0">
            <Link
              to={`/${a.pseudo}`}
              className="text-xs font-semibold text-[var(--text-secondary)] hover:underline truncate"
            >
              {name}
            </Link>
            {a.verified && <VerifiedBadge className="w-3.5 h-3.5" />}
            {staff && (
              <span className="text-[10px] font-bold uppercase px-1.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]">
                {staff}
              </span>
            )}
          </div>
        )}
        <div className={`flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <div
            className={`rounded-2xl px-3.5 py-2 min-w-0 ${
              mine
                ? 'bg-[var(--accent)] text-white rounded-br-md [&_a]:text-white [&_a]:underline'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md'
            }`}
          >
            {m.deleted ? (
              <p className="text-sm italic opacity-70">Message supprimé</p>
            ) : (
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                <RichText text={m.body} />
              </p>
            )}
            <span
              className={`block text-[10px] mt-0.5 tabular-nums ${mine ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}
            >
              {timeLabel(m.createdAt)}
            </span>
          </div>
          {actions && (
            <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity">
              {!mine && (
                <button
                  type="button"
                  onClick={onReport}
                  aria-label="Signaler ce message"
                  title="Signaler"
                  className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="Supprimer ce message"
                  title="Supprimer"
                  className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
