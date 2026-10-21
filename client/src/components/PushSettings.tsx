import { Bell, BellOff } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { type PushStatus, usePush } from '../hooks/usePush';
import { api, errorMessage } from '../services/api';
import { outlineBtn, primaryBtn } from './formStyles';

const HINTS: Partial<Record<PushStatus, ReactNode>> = {
  unsupported: 'Ce navigateur ne gère pas les notifications push. Essaie avec Chrome, Edge, Firefox ou Safari à jour.',
  'ios-install': (
    <>
      Sur iPhone et iPad (iOS 16.4 minimum), les notifications ne fonctionnent que si l'appli est installée : dans
      Safari, touche <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong>, ouvre l'appli depuis
      l'icône, puis reviens ici.
    </>
  ),
  'server-off': 'Les notifications push ne sont pas encore configurées sur ce serveur.',
  denied: (
    <>
      Les notifications sont bloquées pour ce site. Autorise-les dans les réglages de ton navigateur (icône de cadenas à
      côté de l'adresse) ou de ton appareil, puis recharge la page.
    </>
  ),
};

interface Prefs {
  newPosts: boolean;
  activity: boolean;
}

const PREF_ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'newPosts', label: 'Nouveaux posts', hint: 'Une notification à chaque post publié sur la plateforme.' },
  {
    key: 'activity',
    label: 'Activité',
    hint: "Quand quelqu'un t'aime, te répond, te reposte, te mentionne ou s'abonne.",
  },
];

/** Interrupteurs ON/OFF : réglages du compte (valables sur tous tes appareils), activés par défaut. */
function PushPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Prefs>('/push/preferences')
      .then(setPrefs)
      .catch(() => setError('Impossible de charger ces réglages.'));
  }, []);

  const toggle = async (key: keyof Prefs) => {
    if (!prefs) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setError('');
    try {
      setPrefs(await api.put<Prefs>('/push/preferences', { [key]: next[key] }));
    } catch (err) {
      setPrefs(previous);
      setError(errorMessage(err));
    }
  };

  return (
    <div className="mt-5">
      <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
        {PREF_ROWS.map(({ key, label, hint }) => {
          const on = prefs?.[key] ?? false;
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0 border-[var(--border-color)]"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm text-[var(--text-primary)]">{label}</div>
                <div className="text-sm text-[var(--text-secondary)]">{hint}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={label}
                disabled={prefs === null}
                onClick={() => toggle(key)}
                className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    on ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)] mt-3">
          {error}
        </p>
      )}
    </div>
  );
}

/** Réglage des notifications push pour l'appareil courant. */
export default function PushSettings() {
  const { status, busy, error, enable, disable, sendTest } = usePush();
  const hint = HINTS[status];

  return (
    <div className="mt-10">
      <h2 className="font-extrabold text-xl mb-2">Notifications</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Reçois une alerte sur cet appareil pour les nouveaux posts et ton activité, même quand l'appli est fermée.
        L'activation est propre à chaque appareil ; les interrupteurs ci-dessous valent pour tout ton compte.
      </p>

      {status === 'loading' && <p className="text-sm text-[var(--text-secondary)]">Vérification…</p>}

      {hint && <p className="text-sm text-[var(--text-secondary)]">{hint}</p>}

      {status === 'off' && (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className={`${primaryBtn} inline-flex items-center gap-2`}
        >
          <Bell className="w-4 h-4" /> {busy ? 'Activation…' : 'Activer les notifications'}
        </button>
      )}

      {status === 'on' && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--text-primary)] inline-flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--accent)]" /> Activées sur cet appareil
          </span>
          <button type="button" onClick={sendTest} className={outlineBtn}>
            Envoyer un test
          </button>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className={`${outlineBtn} inline-flex items-center gap-2`}
          >
            <BellOff className="w-4 h-4" /> Désactiver
          </button>
        </div>
      )}

      {status === 'on' && <PushPreferences />}

      {error && (
        <p role="alert" className="text-sm text-[var(--danger)] mt-3">
          {error}
        </p>
      )}
    </div>
  );
}
