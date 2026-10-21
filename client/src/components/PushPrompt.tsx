import { Bell, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isElectron, usePush } from '../hooks/usePush';
import { primaryBtn } from './formStyles';

/* Invitation à activer les notifications push : une petite carte qui monte du bas de l'écran (feuille
   en bas sur téléphone, carte en bas à droite sur grand écran). Affichée uniquement si l'appareil n'est pas
   déjà abonné et peut l'être ; « Plus tard » la masque 7 jours, puis 14, puis elle ne revient plus. */

const STORAGE_KEY = 'wouaff-push-prompt';
const DAY = 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 3;
const SHOW_DELAY_MS = 3500;

interface PromptState {
  count: number;
  until: number;
}

function readState(): PromptState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<PromptState> | null;
    return { count: Number(raw?.count) || 0, until: Number(raw?.until) || 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}

function writeState(state: PromptState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible : l'invitation pourra réapparaître, sans gravité */
  }
}

function Prompt() {
  const { status, busy, error, enable } = usePush();
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);

  /* L'invitation n'a de sens que si l'appareil peut s'abonner et ne l'est pas encore. */
  const eligible = status === 'off' && !isElectron();

  useEffect(() => {
    if (!eligible) return;
    const state = readState();
    if (state.count >= MAX_DISMISSALS || Date.now() < state.until) return;
    const timer = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  /* Jamais par-dessus la zone de saisie d'une conversation ni les pages de connexion. */
  const hiddenHere = /^\/messages\/\d+/.test(pathname) || pathname === '/auth';
  if (!eligible || !ready || closed || hiddenHere) return null;

  const later = () => {
    const { count } = readState();
    const next = count + 1;
    writeState({ count: next, until: Date.now() + 7 * DAY * next });
    setClosed(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Activer les notifications"
      className="sheet-up fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px] md:px-0 md:pb-0"
    >
      <div className="relative rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 shadow-2xl">
        <button
          type="button"
          onClick={later}
          aria-label="Fermer"
          className="absolute right-2 top-2 rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-[var(--text-primary)]">Ne rate plus rien</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Reçois une notification à chaque nouveau post, réponse ou message, même quand l'appli est fermée. Tu peux
              tout couper à tout moment dans les paramètres.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={enable} disabled={busy} className={`${primaryBtn} flex-1 !py-2.5`}>
            {busy ? 'Activation…' : 'Activer'}
          </button>
          <button
            type="button"
            onClick={later}
            className="rounded-full px-4 py-2.5 font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PushPrompt() {
  const { user } = useAuth();
  /* Monté seulement une fois connecté : l'état des notifications dépend du compte (clés, abonnement). */
  return user ? <Prompt key={user.uid} /> : null;
}
