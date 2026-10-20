import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { isElectron } from './usePush';

interface ApiNotification {
  id: number;
  type: string;
  read: boolean;
  actor: { pseudo: string; displayName: string | null } | null;
  post: { id: number; text: string | null } | null;
  message: string | null;
}

const ACTIONS: Record<string, string> = {
  follow: "s'est abonné à ton compte",
  like: 'a aimé ton post',
  repost: 'a reposté ton post',
  comment: 'a répondu à ton post',
  mention: "t'a mentionné",
};

/* Notifications locales pour l'appli de bureau Electron, qui n'a pas de service Web Push : tant que l'appli est
   ouverte (même réduite), on interroge l'API et on affiche une notification système pour chaque nouveauté.
   Dans un navigateur ou une PWA, c'est le push serveur qui s'en charge (ce hook ne fait rien). */
export function useNotificationAlerts(enabled: boolean) {
  const navigate = useNavigate();
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !isElectron() || !('Notification' in window)) return;
    let cancelled = false;

    const poll = async () => {
      if (Notification.permission !== 'granted') return;
      try {
        const rows = await api.get<ApiNotification[]>('/notifications?limit=10');
        if (cancelled) return;
        const maxId = rows.reduce((m, n) => Math.max(m, n.id), 0);
        /* Premier passage : on mémorise sans notifier l'historique. */
        if (lastId.current === null) {
          lastId.current = maxId;
          return;
        }
        const fresh = rows.filter((n) => n.id > (lastId.current ?? 0) && !n.read).reverse();
        lastId.current = Math.max(lastId.current, maxId);
        /* Fenêtre au premier plan : le badge de l'appli suffit, pas de notification système. */
        if (document.hasFocus()) return;
        for (const n of fresh.slice(-3)) {
          const name = n.actor ? n.actor.displayName || n.actor.pseudo : 'Ministère du vide';
          const title = n.actor ? `${name} ${ACTIONS[n.type] ?? 'a interagi avec toi'}` : name;
          const body = n.message || n.post?.text?.slice(0, 120) || (n.actor ? `@${n.actor.pseudo}` : '');
          const notif = new Notification(title, { body, icon: '/assets/pwa/icon-192.png', tag: `n-${n.id}` });
          notif.onclick = () => {
            window.focus();
            navigate(
              n.type === 'follow' && n.actor ? `/${n.actor.pseudo}` : n.post ? `/post/${n.post.id}` : '/notifications',
            );
          };
        }
      } catch {
        /* réseau indisponible : on réessaiera */
      }
    };

    void poll();
    const timer = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, navigate]);
}
