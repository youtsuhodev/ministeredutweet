import { useSyncExternalStore } from 'react';

/* PWA : l'événement `beforeinstallprompt` n'est émis qu'une fois, très tôt. Ce module est donc importé
   dès main.tsx pour l'intercepter, puis les composants s'y abonnent via useInstallPrompt(). */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  canInstall: boolean;
  installed: boolean;
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canInstall: false, installed: isStandalone() };
const listeners = new Set<() => void>();

function setState(next: InstallState) {
  state = next;
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    setState({ ...state, canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    setState({ canInstall: false, installed: true });
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

/* iOS / iPadOS : pas de `beforeinstallprompt`, l'installation passe par Safari → Partager. */
export const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function useInstallPrompt() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const install = async () => {
    if (!deferred) return;
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    setState({ ...state, canInstall: false, installed: outcome === 'accepted' || state.installed });
  };
  return { ...s, install, ios: isIos() };
}
