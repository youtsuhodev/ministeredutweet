import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../services/api';

/* Notifications push (Web Push) : PWA Android / iOS 16.4+ (installée), navigateurs de bureau et PWA de bureau.
   L'appli de bureau Electron n'a pas de service push : elle utilise des notifications locales (useNotificationAlerts). */

export const isElectron = () => typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent);

const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

const supportsPush = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  !isElectron();

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  /* Le service worker n'est enregistré qu'en production (voir main.tsx) : en dev on le fait à la demande. */
  const existing = await navigator.serviceWorker.getRegistration();
  const reg = existing ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  return reg;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supportsPush()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/* Rattache l'abonnement existant du navigateur au compte connecté (changement de compte, clé renouvelée…). */
let lastSyncedFor = '';
export async function syncPushSubscription(uid: string): Promise<void> {
  if (!supportsPush() || Notification.permission !== 'granted' || lastSyncedFor === uid) return;
  const sub = await currentSubscription();
  if (!sub) return;
  lastSyncedFor = uid;
  try {
    await api.post('/push/subscribe', sub.toJSON());
  } catch {
    lastSyncedFor = '';
  }
}

/* À la déconnexion : l'appareil ne doit plus recevoir les notifications de ce compte. */
export async function detachPushOnLogout(): Promise<void> {
  lastSyncedFor = '';
  const sub = await currentSubscription();
  if (sub) await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
}

export type PushStatus =
  | 'loading'
  | 'unsupported' // navigateur sans Web Push
  | 'ios-install' // iPhone/iPad : il faut d'abord installer l'appli sur l'écran d'accueil
  | 'electron' // appli de bureau : notifications locales
  | 'server-off' // clés VAPID absentes côté serveur
  | 'denied' // permission refusée dans le navigateur
  | 'off'
  | 'on';

export function usePush() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (isElectron()) {
      setStatus(Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off');
      return;
    }
    if (isIos() && !isStandalone()) return setStatus('ios-install');
    if (!supportsPush()) return setStatus('unsupported');
    if (Notification.permission === 'denied') return setStatus('denied');
    try {
      const cfg = await api.get<{ enabled: boolean }>('/push/config');
      if (!cfg.enabled) return setStatus('server-off');
    } catch {
      /* hors-ligne : on affiche quand même l'état local */
    }
    const sub = await currentSubscription();
    setStatus(sub && Notification.permission === 'granted' ? 'on' : 'off');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      /* Doit être appelé depuis un clic : iOS et Safari refusent la demande de permission sinon. */
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      if (isElectron()) {
        setStatus('on');
        return;
      }
      const cfg = await api.get<{ enabled: boolean; publicKey: string | null }>('/push/config');
      if (!cfg.enabled || !cfg.publicKey) return setStatus('server-off');
      const reg = await getRegistration();
      if (!reg) return setStatus('unsupported');
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) as BufferSource,
        }));
      await api.post('/push/subscribe', sub.toJSON());
      setStatus('on');
    } catch (err) {
      setError(errorMessage(err, "Impossible d'activer les notifications sur cet appareil."));
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const sub = await currentSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      lastSyncedFor = '';
      setStatus('off');
    } catch (err) {
      setError(errorMessage(err, 'Impossible de désactiver les notifications.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setError('');
    try {
      if (isElectron()) {
        new Notification('Ministère du vide', { body: 'Les notifications fonctionnent sur cet appareil ✅' });
        return;
      }
      const r = await api.post<{ sent: number }>('/push/test');
      if (r.sent === 0) setError("Aucun appareil n'a reçu le test. Réactive les notifications puis réessaie.");
    } catch (err) {
      setError(errorMessage(err, "Échec de l'envoi du test."));
    }
  }, []);

  return { status, busy, error, enable, disable, sendTest };
}
