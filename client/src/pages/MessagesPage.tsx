import { BellOff, Mail, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import ConversationAvatar from '../components/ConversationAvatar';
import NewConversationModal from '../components/NewConversationModal';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeEvents } from '../hooks/useRealtime';
import { type Conversation, conversationTitle, listTime } from '../lib/messages';
import { api, errorMessage } from '../services/api';

const PAGE = 30;

export default function MessagesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      /* On recharge au moins ce qui est déjà affiché (la liste peut avoir grandi via « Voir plus »). */
      const size = Math.min(50, Math.max(PAGE, count.current));
      const rows = await api.get<Conversation[]>(`/messages/conversations?limit=${size}`);
      setItems(rows);
      count.current = rows.length;
      setHasMore(rows.length >= size);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Impossible de charger les messages'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Mise à jour en direct : nouveau message, lecture, groupe modifié, reconnexion. */
  const timer = useRef<number | undefined>(undefined);
  useRealtimeEvents((e) => {
    if (!['message', 'message_deleted', 'read', 'conversation', 'open'].includes(e.type)) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void load(), 300);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const loadMore = async () => {
    try {
      const rows = await api.get<Conversation[]>(`/messages/conversations?limit=${PAGE}&offset=${items.length}`);
      setItems((cur) => [...cur, ...rows.filter((r) => !cur.some((c) => c.id === r.id))]);
      count.current += rows.length;
      setHasMore(rows.length >= PAGE);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AppShell>
      <PageHeader title="Messages" back="/">
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-full py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            <SquarePen className="w-4 h-4" /> Nouveau message
          </button>
        </div>
      </PageHeader>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="spinner" />
        </div>
      )}

      {error && (
        <p role="alert" className="px-4 py-6 text-center text-[var(--danger)]">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="px-6 py-16 text-center">
          <Mail className="w-10 h-10 mx-auto mb-3 text-[var(--text-secondary)]" />
          <h2 className="font-extrabold text-xl mb-1">Aucun message</h2>
          <p className="text-[var(--text-secondary)] text-sm">
            Écris à quelqu'un en privé, ou crée un groupe pour discuter à plusieurs.
          </p>
        </div>
      )}

      <ul>
        {user &&
          items.map((c) => (
            <li key={c.id}>
              <Link
                to={`/messages/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors hover:no-underline"
              >
                <ConversationAvatar conversation={c} meUid={user.uid} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`truncate text-[15px] text-[var(--text-primary)] ${c.unread > 0 ? 'font-extrabold' : 'font-bold'}`}
                    >
                      {conversationTitle(c, user.uid)}
                    </span>
                    {c.muted && (
                      <BellOff className="w-3.5 h-3.5 text-[var(--text-secondary)] flex-shrink-0 self-center" />
                    )}
                    {c.lastMessage && (
                      <span className="ml-auto text-xs text-[var(--text-secondary)] flex-shrink-0">
                        {listTime(c.lastMessage.at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p
                      className={`flex-1 truncate text-sm ${
                        c.unread > 0 ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {c.lastMessage
                        ? `${c.lastMessage.senderUid === user.uid ? 'Toi : ' : ''}${c.lastMessage.preview}`
                        : ''}
                    </p>
                    {c.unread > 0 && (
                      <span
                        className={`min-w-[20px] h-5 px-1.5 rounded-full text-white text-xs font-bold flex items-center justify-center ${
                          c.muted ? 'bg-[var(--text-secondary)]' : 'bg-[var(--accent)]'
                        }`}
                      >
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="w-full py-4 text-sm font-bold text-[var(--accent)] hover:bg-[var(--bg-tertiary)]"
        >
          Voir plus
        </button>
      )}

      {composing && <NewConversationModal onClose={() => setComposing(false)} />}
    </AppShell>
  );
}
