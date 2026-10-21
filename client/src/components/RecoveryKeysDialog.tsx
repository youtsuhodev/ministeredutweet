import { Copy, Download, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api, errorMessage } from '../services/api';
import { inputClass, outlineBtn, primaryBtn } from './formStyles';

/* Clés de récupération du compte : seul moyen de réinitialiser un mot de passe oublié (il n'y a pas d'e-mail). */

function downloadKeys(pseudo: string, keys: string[]) {
  const text = [
    'Clés de récupération — Ministère du vide',
    `Compte : @${pseudo}`,
    `Générées le ${new Date().toLocaleDateString('fr-FR')}`,
    '',
    'Chaque clé ne fonctionne qu’une seule fois. Elle permet de choisir un nouveau mot de passe depuis',
    'la page « Mot de passe oublié ». Garde ce fichier dans un endroit sûr et ne le partage avec personne.',
    '',
    ...keys,
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ministere-du-vide-cles-de-recuperation-${pseudo}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Liste des clés (affichées une seule fois) avec copie et téléchargement. */
export function RecoveryKeysList({ pseudo, keys }: { pseudo: string; keys: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(keys.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[var(--text-primary)] list-none p-0 m-0">
        {keys.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${outlineBtn} inline-flex items-center gap-2`} onClick={copy}>
          <Copy className="w-4 h-4" /> {copied ? 'Copié' : 'Copier'}
        </button>
        <button
          type="button"
          className={`${outlineBtn} inline-flex items-center gap-2`}
          onClick={() => downloadKeys(pseudo, keys)}
        >
          <Download className="w-4 h-4" /> Télécharger (.txt)
        </button>
      </div>
    </div>
  );
}

/** Pop-up bloquante : nouveaux comptes (enregistrer ses clés) et anciens comptes (explication du changement). */
export default function RecoveryNoticeDialog() {
  const { user, refresh, logout } = useAuth();
  const [keys, setKeys] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user?.recoveryNoticePending) return null;

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ recoveryKeys: string[] }>('/auth/recovery-keys');
      setKeys(r.recoveryKeys);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/recovery-keys/ack');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        className="w-full max-w-[520px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl p-6 space-y-4 my-auto"
      >
        <div className="flex items-center gap-3">
          <KeyRound className="w-6 h-6 text-[var(--accent)]" aria-hidden="true" />
          <h2 id="recovery-title" className="text-xl font-extrabold text-[var(--text-primary)]">
            {user.legacyNotice ? 'Ton compte a changé' : 'Enregistre tes clés de récupération'}
          </h2>
        </div>

        {!keys ? (
          <>
            {user.legacyNotice ? (
              <div className="space-y-3 text-sm text-[var(--text-primary)]">
                <p>
                  Le Ministère du vide <strong>n’utilise plus d’adresse e-mail</strong>. La tienne a été{' '}
                  <strong>supprimée de notre base de données</strong>.
                </p>
                <p>
                  Tu te connectes désormais avec ton pseudo (<strong>@{user.pseudo}</strong>) et ton mot de passe.
                </p>
                <p>
                  Sans e-mail, nous ne pouvons plus t’envoyer de lien si tu oublies ton mot de passe. La seule façon de
                  récupérer ton compte est une <strong>clé de récupération</strong>. Génère-les et télécharge-les
                  maintenant.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-[var(--text-primary)]">
                <p>Ton compte n’a pas d’adresse e-mail : personne ne pourra t’envoyer de lien de réinitialisation.</p>
                <p>
                  Si tu oublies ton mot de passe, la seule façon de récupérer ton compte est une{' '}
                  <strong>clé de récupération</strong>. Génère-les et télécharge-les maintenant.
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
            <button type="button" className={`${primaryBtn} w-full`} disabled={busy} onClick={generate}>
              {busy ? '…' : 'Générer mes clés de récupération'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Chaque clé ne sert qu’une seule fois. Elles ne seront <strong>plus jamais affichées</strong> : télécharge
              le fichier et garde-le dans un endroit sûr.
            </p>
            <RecoveryKeysList pseudo={user.pseudo} keys={keys} />
            <label className="flex items-start gap-3 text-sm text-[var(--text-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>J’ai enregistré mes clés dans un endroit sûr.</span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
            <button type="button" className={`${primaryBtn} w-full`} disabled={!saved || busy} onClick={confirm}>
              {busy ? '…' : 'Continuer'}
            </button>
          </>
        )}

        <p className="text-center">
          <button type="button" className="text-xs text-[var(--text-secondary)] hover:underline" onClick={logout}>
            Se déconnecter
          </button>
        </p>
      </div>
    </div>
  );
}

/** Réglages : voir combien de clés restent et en générer un nouveau lot (mot de passe exigé). */
export function RecoveryKeysSettings({
  pseudo,
  keysLeft,
  totpEnabled,
  refresh,
}: {
  pseudo: string;
  keysLeft: number;
  totpEnabled: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [keys, setKeys] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setOpen(false);
    setPassword('');
    setCode('');
    setKeys(null);
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ recoveryKeys: string[] }>('/auth/recovery-keys', {
        password,
        code: totpEnabled ? code : undefined,
      });
      setKeys(r.recoveryKeys);
      setPassword('');
      setCode('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-[var(--text-secondary)]">CLÉS DE RÉCUPÉRATION</div>
          <div className="font-bold text-[var(--text-primary)] mt-1">
            {keysLeft > 0 ? `${keysLeft} clé${keysLeft > 1 ? 's' : ''} restante${keysLeft > 1 ? 's' : ''}` : 'Aucune clé'}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Elles permettent de réinitialiser ton mot de passe si tu l’oublies.
          </p>
        </div>
        {!open && (
          <button type="button" className={outlineBtn} onClick={() => setOpen(true)}>
            Régénérer
          </button>
        )}
      </div>
      {open && !keys && (
        <form className="mt-3 space-y-3" onSubmit={submit}>
          <input
            type="password"
            aria-label="Mot de passe actuel"
            placeholder="Mot de passe actuel"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {totpEnabled && (
            <input
              type="text"
              aria-label="Code de double authentification ou code de secours"
              placeholder="Code 2FA ou code de secours"
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 11))}
              autoComplete="one-time-code"
              required
            />
          )}
          <p className="text-xs text-[var(--text-secondary)]">Les anciennes clés cesseront de fonctionner.</p>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? '…' : 'Générer de nouvelles clés'}
            </button>
            <button type="button" className={outlineBtn} onClick={close}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {open && keys && (
        <div className="mt-3 space-y-3 border border-[var(--accent)] rounded-xl p-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Tes nouvelles clés (à usage unique). Elles ne seront plus affichées : télécharge-les maintenant.
          </p>
          <RecoveryKeysList pseudo={pseudo} keys={keys} />
          <button type="button" className={primaryBtn} onClick={close}>
            J’ai enregistré mes clés
          </button>
        </div>
      )}
    </div>
  );
}
