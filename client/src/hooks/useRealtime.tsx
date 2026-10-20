import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ChatMessage, mediaLabel, personName } from '../lib/messages';
import { api } from '../services/api';
import { useAuth } from './useAuth';
import { isElectron } from './usePush';

/* Connexion WebSocket unique (« /ws ») pour toute l'appli : messagerie en temps réel, accusés de lecture,
   « en train d'écrire ». Reconnexion automatique avec attente croissante ; chaque (re)connexion émet
   l'évènement « open » pour que les pages se resynchronisent. */

export type RealtimeEvent =
  | { type: 'open' }
  | { type: 'ready' }
  | { type: 'message'; conversationId: number; message: ChatMessage; muted?: string[] }
  | { type: 'message_deleted'; conversationId: number; messageId: number }
  | { type: 'read'; conversationId: number; uid: string; messageId: number }
  | { type: 'typing'; conversationId: number; uid: string }
  | { type: 'conversation'; conversationId: number };

type Handler = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  subscribe: (handler: Handler) => () => void;
  send: (payload: object) => void;
  connected: boolean;
  /* conversations non muettes ayant des messages non lus (pastille « Messages ») */
  unreadMessages: number;
  refreshUnread: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  subscribe: () => () => {},
  send: () => {},
  connected: false,
  unreadMessages: 0,
  refreshUnread: () => {},
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid;

  const handlers = useRef(new Set<Handler>());
  const socket = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [unreadMessages, setUnread] = useState(0);
  const unreadTimer = useRef<number | undefined>(undefined);

  const refreshUnread = useCallback(() => {
    if (!uid) return;
    window.clearTimeout(unreadTimer.current);
    unreadTimer.current = window.setTimeout(() => {
      api
        .get<{ count: number }>('/messages/unread')
        .then((r) => setUnread(r.count))
        .catch(() => {});
    }, 250);
  }, [uid]);

  /* Notification système locale pour l'appli de bureau (Electron n'a pas de service Web Push). */
  const notifyDesktop = useCallback(
    (event: Extract<RealtimeEvent, { type: 'message' }>) => {
      const m = event.message;
      if (!isElectron() || !('Notification' in window) || Notification.permission !== 'granted') return;
      if (m.kind !== 'text' || m.deleted || !m.sender || m.sender.uid === uid) return;
      if (uid && event.muted?.includes(uid)) return;
      if (document.hasFocus()) return;
      const n = new Notification(personName(m.sender), {
        body: m.body ? m.body.slice(0, 120) : m.media ? mediaLabel(m.media.type) : 'Nouveau message',
        icon: '/assets/pwa/icon-192.png',
        tag: `dm-${m.conversationId}`,
      });
      n.onclick = () => {
        window.focus();
        navigate(`/messages/${m.conversationId}`);
      };
    },
    [uid, navigate],
  );

  const dispatchRef = useRef<Handler>(() => {});
  dispatchRef.current = (event) => {
    for (const h of handlers.current) h(event);
    if (event.type === 'message') notifyDesktop(event);
    if (['message', 'read', 'conversation', 'open', 'message_deleted'].includes(event.type)) refreshUnread();
  };

  useEffect(() => {
    if (!uid) {
      setUnread(0);
      return;
    }
    let stopped = false;
    let retry = 0;
    let timer: number | undefined;

    const sendPresence = () => {
      const ws = socket.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: 'presence', visible: document.visibilityState === 'visible' && document.hasFocus() }),
        );
      }
    };

    const open = () => {
      if (stopped) return;
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${window.location.host}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        sendPresence();
        dispatchRef.current({ type: 'open' });
      };
      ws.onmessage = (ev) => {
        try {
          dispatchRef.current(JSON.parse(String(ev.data)) as RealtimeEvent);
        } catch {
          /* message illisible : ignoré */
        }
      };
      ws.onclose = (ev) => {
        if (socket.current === ws) socket.current = null;
        setConnected(false);
        /* 4001 : session expirée ou révoquée, inutile de réessayer. */
        if (stopped || ev.code === 4001) return;
        const delay = Math.min(30_000, 1000 * 2 ** retry++) + Math.random() * 500;
        timer = window.setTimeout(open, delay);
      };
      ws.onerror = () => ws.close();
    };

    const reconnectNow = () => {
      if (stopped || socket.current) return;
      window.clearTimeout(timer);
      retry = 0;
      open();
    };

    open();
    refreshUnread();
    document.addEventListener('visibilitychange', sendPresence);
    window.addEventListener('focus', sendPresence);
    window.addEventListener('blur', sendPresence);
    window.addEventListener('online', reconnectNow);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(unreadTimer.current);
      document.removeEventListener('visibilitychange', sendPresence);
      window.removeEventListener('focus', sendPresence);
      window.removeEventListener('blur', sendPresence);
      window.removeEventListener('online', reconnectNow);
      socket.current?.close();
      socket.current = null;
      setConnected(false);
    };
  }, [uid, refreshUnread]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      subscribe: (handler) => {
        handlers.current.add(handler);
        return () => {
          handlers.current.delete(handler);
        };
      },
      send: (payload) => {
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
      },
      connected,
      unreadMessages,
      refreshUnread,
    }),
    [connected, unreadMessages, refreshUnread],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

/* Abonnement d'un composant aux évènements temps réel (le handler peut changer à chaque rendu). */
export function useRealtimeEvents(handler: Handler) {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
