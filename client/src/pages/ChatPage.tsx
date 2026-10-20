import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Flag,
  Image as ImageIcon,
  Info,
  Mic,
  MoreVertical,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import ConversationAvatar from '../components/ConversationAvatar';
import ConversationInfoModal from '../components/ConversationInfoModal';
import ReportDialog from '../components/ReportDialog';
import VerifiedBadge from '../components/VerifiedBadge';
import VoicePlayer from '../components/VoicePlayer';
import { useAuth } from '../hooks/useAuth';
import { useRealtime, useRealtimeEvents } from '../hooks/useRealtime';
import { formatDuration, useVoiceRecorder, voiceSupported } from '../hooks/useVoiceRecorder';
import {
  type ChatMessage,
  type Conversation,
  clockTime,
  conversationTitle,
  dayLabel,
  IMAGE_TYPES,
  MAX_BODY,
  MAX_UPLOAD_BYTES,
  otherMember,
  personName,
  VIDEO_TYPES,
} from '../lib/messages';
import { ApiError, api, errorMessage } from '../services/api';

const PAGE_SIZE = 30;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export default function ChatPage() {
  const { id } = useParams();
  /* key : changer de conversation repart d'un état vierge. */
  return <ChatView key={id} id={Number(id)} />;
}

function ChatView({ id }: { id: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { send: wsSend, refreshUnread } = useRealtime();
  const me = user?.uid ?? '';

  const [conv, setConv] = useState<Conversation | null>(null);
  const [missing, setMissing] = useState(!Number.isSafeInteger(id) || id <= 0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ file: File; url: string; kind: 'image' | 'video' } | null>(null);
  const [sending, setSending] = useState(false);
  const voice = useVoiceRecorder();

  const [typers, setTypers] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const firstScroll = useRef(true);
  const prepend = useRef<{ height: number; y: number } | null>(null);
  const readSent = useRef(0);
  const lastTypingSent = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  /* ── Chargement ──────────────────────────────────────────────────────────── */

  const loadConversation = useCallback(async () => {
    try {
      const c = await api.get<Conversation>(`/messages/conversations/${id}`);
      setConv(c);
      const mine = c.members.find((m) => m.uid === me);
      if (mine) readSent.current = Math.max(readSent.current, mine.lastRead);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
    }
  }, [id, me]);

  const loadTail = useCallback(async () => {
    try {
      const r = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/messages/conversations/${id}/messages?limit=${PAGE_SIZE}`,
      );
      setMessages((cur) => mergeMessages(cur, r.messages));
      setHasMore((cur) => (messagesRef.current.length === 0 ? r.hasMore : cur));
      setError('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(errorMessage(err, 'Impossible de charger les messages'));
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    void loadConversation();
    void loadTail();
  }, [loadConversation, loadTail]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/messages/conversations/${id}/messages?limit=${PAGE_SIZE}&before=${oldest.id}`,
      );
      prepend.current = { height: document.documentElement.scrollHeight, y: window.scrollY };
      setMessages((cur) => mergeMessages(cur, r.messages));
      setHasMore(r.hasMore);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  }, [id, loadingOlder]);

  /* Charge automatiquement les messages plus anciens quand on remonte en haut de la liste. */
  useEffect(() => {
    const el = topSentinel.current;
    if (!el || !hasMore || !loaded) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadOlder(), {
      rootMargin: '200px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loaded, loadOlder]);

  /* ── Défilement ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onScroll = () => {
      stickToBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const lastMessage = messages[messages.length - 1];
  useLayoutEffect(() => {
    if (prepend.current) {
      /* Messages plus anciens ajoutés en haut : on garde la même ligne à l'écran. */
      const { height, y } = prepend.current;
      prepend.current = null;
      window.scrollTo(0, y + (document.documentElement.scrollHeight - height));
      return;
    }
    if (!loaded || !lastMessage) return;
    if (firstScroll.current) {
      firstScroll.current = false;
      window.scrollTo(0, document.documentElement.scrollHeight);
    } else if (stickToBottom.current || lastMessage.sender?.uid === me) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  }, [lastMessage?.id, loaded, me, lastMessage]);

  /* ── Accusés de lecture ──────────────────────────────────────────────────── */

  const markRead = useCallback(() => {
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (!last || last.id <= readSent.current) return;
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    readSent.current = last.id;
    api
      .put(`/messages/conversations/${id}/read`, { upTo: last.id })
      .then(() => refreshUnread())
      .catch(() => {
        readSent.current = Math.min(readSent.current, last.id - 1);
      });
  }, [id, refreshUnread]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: on relance à chaque nouveau dernier message
  useEffect(() => {
    markRead();
  }, [lastMessage?.id, conv?.id, markRead]);

  useEffect(() => {
    window.addEventListener('focus', markRead);
    document.addEventListener('visibilitychange', markRead);
    return () => {
      window.removeEventListener('focus', markRead);
      document.removeEventListener('visibilitychange', markRead);
    };
  }, [markRead]);

  /* ── Temps réel ──────────────────────────────────────────────────────────── */

  useRealtimeEvents((e) => {
    if (e.type === 'open') {
      void loadConversation();
      void loadTail();
      return;
    }
    if (e.type === 'ready' || e.conversationId !== id) return;
    if (e.type === 'message') {
      setMessages((cur) => mergeMessages(cur, [e.message]));
      if (e.message.sender) {
        const uid = e.message.sender.uid;
        setTypers((cur) => {
          const { [uid]: _gone, ...rest } = cur;
          return rest;
        });
      }
      if (e.message.kind === 'system') void loadConversation();
    } else if (e.type === 'message_deleted') {
      setMessages((cur) => cur.map((m) => (m.id === e.messageId ? { ...m, deleted: true, body: '', media: null } : m)));
    } else if (e.type === 'read') {
      setConv((cur) =>
        cur
          ? {
              ...cur,
              members: cur.members.map((m) =>
                m.uid === e.uid ? { ...m, lastRead: Math.max(m.lastRead, e.messageId) } : m,
              ),
            }
          : cur,
      );
    } else if (e.type === 'typing') {
      setTypers((cur) => ({ ...cur, [e.uid]: Date.now() + 4000 }));
    } else if (e.type === 'conversation') {
      void loadConversation();
    }
  });

  /* « X écrit… » s'efface seul au bout de 4 s sans nouvelle frappe. */
  useEffect(() => {
    if (Object.keys(typers).length === 0) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setTypers((cur) => Object.fromEntries(Object.entries(cur).filter(([, until]) => until > now)));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [typers]);

  /* Si je ne fais plus partie du groupe, retour à la liste. */
  useEffect(() => {
    if (missing) navigate('/messages', { replace: true });
  }, [missing, navigate]);

  /* ── Envoi ───────────────────────────────────────────────────────────────── */

  const resizeInput = () => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const onTextChange = (value: string) => {
    setText(value.slice(0, MAX_BODY));
    resizeInput();
    if (value && Date.now() - lastTypingSent.current > 3000) {
      lastTypingSent.current = Date.now();
      wsSend({ type: 'typing', conversationId: id });
    }
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) return setError('Fichier trop volumineux (30 Mo max)');
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    if (attachment) URL.revokeObjectURL(attachment.url);
    voice.discard();
    setError('');
    setAttachment({ file, url: URL.createObjectURL(file), kind });
  };

  const clearAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.url);
    setAttachment(null);
  };

  const canSend = !!text.trim() || !!attachment || voice.status === 'recorded';

  const send = async () => {
    if (sending || !canSend) return;
    setSending(true);
    setError('');
    try {
      let media: string | undefined;
      let duration: number | undefined;
      if (attachment) {
        const form = new FormData();
        form.append('file', attachment.file);
        media = (await api.upload<{ file: string }>('/messages/upload', form)).file;
      } else if (voice.recording) {
        const form = new FormData();
        form.append('file', voice.recording.file);
        media = (await api.upload<{ file: string }>('/messages/upload?kind=audio', form)).file;
        duration = voice.recording.duration;
      }
      const msg = await api.post<ChatMessage>(`/messages/conversations/${id}/messages`, {
        body: text.trim() || undefined,
        media,
        duration,
      });
      setMessages((cur) => mergeMessages(cur, [msg]));
      setText('');
      clearAttachment();
      voice.discard();
      requestAnimationFrame(resizeInput);
    } catch (err) {
      setError(errorMessage(err, "Impossible d'envoyer le message"));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    /* Sur téléphone, Entrée = retour à la ligne (le bouton envoie) ; sur ordinateur, Entrée envoie. */
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  /* ── Actions ─────────────────────────────────────────────────────────────── */

  const deleteMessage = async (m: ChatMessage) => {
    setSelectedId(null);
    try {
      await api.del(`/messages/items/${m.id}`);
      setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, body: '', media: null } : x)));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggleMute = async () => {
    if (!conv) return;
    setMenuOpen(false);
    try {
      await api.put(`/messages/conversations/${id}/mute`, { muted: !conv.muted });
      setConv({ ...conv, muted: !conv.muted });
      refreshUnread();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteConversation = async () => {
    try {
      await api.del(`/messages/conversations/${id}`);
      refreshUnread();
      navigate('/messages');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  /* ── Rendu ───────────────────────────────────────────────────────────────── */

  const other = conv && user ? otherMember(conv, me) : undefined;
  const title = conv && user ? conversationTitle(conv, me) : '';
  const typingNames = Object.keys(typers)
    .filter((uid) => uid !== me)
    .map((uid) => conv?.members.find((m) => m.uid === uid))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => personName(m));
  const typingLabel =
    typingNames.length === 0
      ? ''
      : typingNames.length === 1
        ? `${typingNames[0]} écrit…`
        : typingNames.length === 2
          ? `${typingNames[0]} et ${typingNames[1]} écrivent…`
          : 'Plusieurs personnes écrivent…';

  /* Accusé de lecture sous mon dernier message. */
  const lastMine = [...messages].reverse().find((m) => m.sender?.uid === me && m.kind === 'text' && !m.deleted);
  const seenBy = lastMine && conv ? conv.members.filter((m) => m.uid !== me && m.lastRead >= lastMine.id) : [];

  return (
    <AppShell chat>
      <div className="flex flex-col min-h-[100dvh]">
        <header className="sticky top-0 z-40 bg-[var(--bg-secondary)]/90 backdrop-blur-md border-b border-[var(--border-color)] flex items-center gap-2 px-2 py-2">
          <Link
            to="/messages"
            aria-label="Retour aux messages"
            className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--text-primary)]" />
          </Link>
          {conv && user ? (
            <>
              {conv.type === 'group' ? (
                <button
                  type="button"
                  onClick={() => setShowInfo(true)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg hover:bg-[var(--bg-tertiary)] px-1 py-1"
                >
                  <ConversationAvatar conversation={conv} meUid={me} className="w-9 h-9" />
                  <div className="min-w-0">
                    <div className="font-bold truncate text-[var(--text-primary)]">{title}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{conv.members.length} membres</div>
                  </div>
                </button>
              ) : (
                <Link
                  to={`/${other?.pseudo ?? ''}`}
                  className="flex items-center gap-3 flex-1 min-w-0 rounded-lg hover:bg-[var(--bg-tertiary)] px-1 py-1 hover:no-underline"
                >
                  <ConversationAvatar conversation={conv} meUid={me} className="w-9 h-9 text-sm" />
                  <div className="min-w-0">
                    <div className="font-bold truncate text-[var(--text-primary)] flex items-center gap-1">
                      {title}
                      {other?.verified && <VerifiedBadge />}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">@{other?.pseudo}</div>
                  </div>
                </Link>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen((v) => !v);
                    setConfirmDelete(false);
                  }}
                  aria-label="Options de la conversation"
                  aria-expanded={menuOpen}
                  className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <MoreVertical className="w-5 h-5 text-[var(--text-primary)]" />
                </button>
                {menuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Fermer le menu"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 w-60 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
                      {conv.type === 'group' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setShowInfo(true);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--bg-tertiary)] text-left text-[var(--text-primary)]"
                        >
                          <Info className="w-4 h-4" /> Infos du groupe
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--bg-tertiary)] text-left text-[var(--text-primary)]"
                      >
                        {conv.muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        {conv.muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
                      </button>
                      {conv.type === 'direct' && (
                        <button
                          type="button"
                          onClick={() => (confirmDelete ? void deleteConversation() : setConfirmDelete(true))}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--bg-tertiary)] text-left text-[var(--danger)]"
                        >
                          <Trash2 className="w-4 h-4" />
                          {confirmDelete ? 'Confirmer la suppression' : 'Supprimer la conversation'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 h-9" />
          )}
        </header>

        <div className="flex-1 px-3 py-4 space-y-1">
          <div ref={topSentinel} />
          {loadingOlder && (
            <div className="flex justify-center py-2">
              <div className="spinner" />
            </div>
          )}
          {!loaded && (
            <div className="flex justify-center py-12">
              <div className="spinner" />
            </div>
          )}
          {loaded && messages.length === 0 && !error && (
            <p className="text-center text-sm text-[var(--text-secondary)] py-12">
              Aucun message pour l'instant. Dis bonjour 👋
            </p>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            const mine = m.sender?.uid === me;
            const startsRun =
              newDay || !prev || prev.kind === 'system' || prev.sender?.uid !== m.sender?.uid || m.kind === 'system';
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="flex justify-center my-3">
                    <span className="text-xs px-3 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] capitalize">
                      {dayLabel(m.createdAt)}
                    </span>
                  </div>
                )}
                {m.kind === 'system' ? (
                  <p className="text-center text-xs text-[var(--text-secondary)] py-1.5">
                    <strong className="font-semibold">{m.sender ? personName(m.sender) : 'Quelqu’un'}</strong> {m.body}
                  </p>
                ) : (
                  <Bubble
                    message={m}
                    mine={mine}
                    showSender={conv?.type === 'group' && !mine && startsRun}
                    tight={!startsRun}
                    selected={selectedId === m.id}
                    onSelect={() => setSelectedId((cur) => (cur === m.id ? null : m.id))}
                    onZoom={setZoom}
                    onDelete={() => deleteMessage(m)}
                    onReport={() => {
                      setSelectedId(null);
                      setReporting(m);
                    }}
                  />
                )}
                {lastMine?.id === m.id && (
                  <p
                    className="flex items-center justify-end gap-1 text-[11px] text-[var(--text-secondary)] pr-1 mt-0.5"
                    aria-live="polite"
                  >
                    {seenBy.length > 0 ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
                        {conv?.type === 'group' ? `Vu par ${seenBy.length}` : 'Vu'}
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" /> Envoyé
                      </>
                    )}
                  </p>
                )}
              </div>
            );
          })}

          {typingLabel && (
            <p className="text-xs text-[var(--text-secondary)] italic px-1 pt-1" aria-live="polite">
              {typingLabel}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 z-30 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {(error || voice.error || notice) && (
            <p
              role={error || voice.error ? 'alert' : 'status'}
              className={`text-sm mb-2 ${error || voice.error ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}
            >
              {error || voice.error || notice}
            </p>
          )}

          {attachment && (
            <div className="relative inline-block mb-2">
              {attachment.kind === 'image' ? (
                <img
                  src={attachment.url}
                  alt="Aperçu"
                  className="max-h-32 rounded-xl border border-[var(--border-color)]"
                />
              ) : (
                <video src={attachment.url} className="max-h-32 rounded-xl border border-[var(--border-color)]" muted />
              )}
              <button
                type="button"
                onClick={clearAttachment}
                aria-label="Retirer la pièce jointe"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--bg-primary)] border border-[var(--border-color)] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5 text-[var(--text-primary)]" />
              </button>
            </div>
          )}

          {voice.status === 'recording' ? (
            <div className="flex items-center gap-3 py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--danger)] animate-pulse" />
              <span className="flex-1 text-sm tabular-nums text-[var(--text-primary)]">
                Enregistrement… {formatDuration(voice.elapsed)}
              </span>
              <button
                type="button"
                onClick={voice.cancel}
                aria-label="Annuler l'enregistrement"
                className="p-2 rounded-full hover:bg-[var(--bg-tertiary)]"
              >
                <Trash2 className="w-5 h-5 text-[var(--text-secondary)]" />
              </button>
              <button
                type="button"
                onClick={voice.stop}
                aria-label="Terminer l'enregistrement"
                className="p-2.5 rounded-full bg-[var(--danger)] text-white"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              {voice.status === 'recorded' && voice.recording ? (
                <div className="flex-1 min-w-0 flex items-center gap-2 py-1">
                  <div className="flex-1 min-w-0">
                    <VoicePlayer src={voice.recording.url} duration={voice.recording.duration} />
                  </div>
                  <button
                    type="button"
                    onClick={voice.discard}
                    aria-label="Supprimer l'enregistrement"
                    className="p-2 rounded-full hover:bg-[var(--bg-tertiary)]"
                  >
                    <Trash2 className="w-5 h-5 text-[var(--text-secondary)]" />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={`${IMAGE_TYPES},${VIDEO_TYPES}`}
                    className="hidden"
                    onChange={pickFile}
                  />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    aria-label="Joindre une image ou une vidéo"
                    className="p-2.5 rounded-full text-[var(--accent)] hover:bg-[var(--accent)]/10 flex-shrink-0"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <textarea
                    ref={textarea}
                    value={text}
                    onChange={(e) => onTextChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Écris un message"
                    aria-label="Message"
                    className="flex-1 min-w-0 resize-none bg-[var(--bg-tertiary)] rounded-2xl px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </>
              )}
              {!canSend && voiceSupported() && voice.status === 'idle' ? (
                <button
                  type="button"
                  onClick={voice.start}
                  aria-label="Enregistrer un message vocal"
                  className="p-2.5 rounded-full text-[var(--accent)] hover:bg-[var(--accent)]/10 flex-shrink-0"
                >
                  <Mic className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={send}
                  disabled={!canSend || sending}
                  aria-label="Envoyer"
                  className="p-2.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white flex-shrink-0 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showInfo && conv && conv.type === 'group' && (
        <ConversationInfoModal
          conversation={conv}
          meUid={me}
          onClose={() => setShowInfo(false)}
          onChanged={() => void loadConversation()}
        />
      )}
      {reporting && (
        <ReportDialog
          endpoint={`/messages/items/${reporting.id}/report`}
          subject="ce message"
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            setNotice('Signalement envoyé, merci.');
            window.setTimeout(() => setNotice(''), 4000);
          }}
        />
      )}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </AppShell>
  );
}

interface BubbleProps {
  message: ChatMessage;
  mine: boolean;
  showSender: boolean;
  tight: boolean;
  selected: boolean;
  onSelect: () => void;
  onZoom: (url: string) => void;
  onDelete: () => void;
  onReport: () => void;
}

function Bubble({ message: m, mine, showSender, tight, selected, onSelect, onZoom, onDelete, onReport }: BubbleProps) {
  const media = m.media;
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${tight ? 'mt-0.5' : 'mt-2'}`}>
      {showSender && m.sender && (
        <Link
          to={`/${m.sender.pseudo}`}
          className="text-xs font-semibold text-[var(--text-secondary)] mb-0.5 ml-3 hover:underline"
        >
          {personName(m.sender)}
        </Link>
      )}
      <div
        className={`max-w-[82%] rounded-2xl overflow-hidden ${
          mine
            ? 'bg-[var(--accent)] text-white rounded-br-md'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md'
        }`}
      >
        {m.deleted ? (
          <p className="px-3.5 py-2 text-sm italic opacity-70">Message supprimé</p>
        ) : (
          <>
            {media?.type === 'image' && (
              <button type="button" onClick={() => onZoom(media.url)} className="block" aria-label="Agrandir l'image">
                <img src={media.url} alt="" loading="lazy" className="block max-h-[320px] w-full object-cover" />
              </button>
            )}
            {media?.type === 'video' && (
              // biome-ignore lint/a11y/useMediaCaption: vidéo envoyée par un utilisateur, sans piste de sous-titres
              <video src={media.url} controls preload="metadata" className="block max-h-[320px] w-full bg-black" />
            )}
            {media?.type === 'audio' && (
              <div className="px-2 py-1.5 min-w-[220px] text-[var(--text-primary)] bg-[var(--bg-tertiary)]">
                <VoicePlayer src={media.url} duration={media.duration} />
              </div>
            )}
            {(m.body || !media) && (
              <button
                type="button"
                onClick={onSelect}
                className="block w-full text-left px-3.5 py-2 whitespace-pre-wrap break-words text-[15px]"
              >
                {m.body}
              </button>
            )}
          </>
        )}
        <div
          className={`px-3.5 pb-1.5 -mt-1 text-[10px] ${mine ? 'text-white/70 text-right' : 'text-[var(--text-secondary)]'}`}
        >
          {clockTime(m.createdAt)}
        </div>
      </div>
      {selected && !m.deleted && (
        <div className="flex gap-2 mt-1">
          {mine ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs font-bold text-[var(--danger)] inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[var(--danger)]/10"
            >
              <Trash2 className="w-3.5 h-3.5" /> Supprimer
            </button>
          ) : (
            <button
              type="button"
              onClick={onReport}
              className="text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[var(--bg-tertiary)]"
            >
              <Flag className="w-3.5 h-3.5" /> Signaler
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image agrandie"
      className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img src={src} alt="" className="max-w-full max-h-full object-contain" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="w-6 h-6" />
      </button>
    </div>,
    document.body,
  );
}
