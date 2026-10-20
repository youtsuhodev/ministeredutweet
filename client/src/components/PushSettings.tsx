import { Bell, BellOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { type PushStatus, usePush } from '../hooks/usePush';
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

/** Réglage des notifications push pour l'appareil courant. */
export default function PushSettings() {
  const { status, busy, error, enable, disable, sendTest } = usePush();
  const hint = HINTS[status];

  return (
    <div className="mt-10">
      <h2 className="font-extrabold text-xl mb-2">Notifications</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Reçois une alerte sur cet appareil quand quelqu'un t'aime, te répond, te mentionne ou s'abonne — même quand
        l'appli est fermée. Le réglage est propre à chaque appareil.
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

      {error && (
        <p role="alert" className="text-sm text-[var(--danger)] mt-3">
          {error}
        </p>
      )}
    </div>
  );
}
