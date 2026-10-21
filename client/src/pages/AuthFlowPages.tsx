import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import Captcha, { useCaptchaEnabled } from '../components/Captcha';
import { api, errorMessage } from '../services/api';

const inputClass =
  'w-full bg-transparent border border-[var(--border-color)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors';
const buttonClass =
  'w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-full py-3 transition-colors';

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--bg-primary)] px-4 py-8">
      <div className="w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <img src="/assets/logo/logo.png" alt="Logo Ministère du vide" className="w-14 h-14 rounded-2xl mb-3" />
          <h1 className="text-3xl font-black text-[var(--text-primary)]">{title}</h1>
        </div>
        {children}
        <p className="mt-8 text-center text-sm">
          <Link to="/">Retour au Ministère du vide</Link>
        </p>
      </div>
    </div>
  );
}

/* Mot de passe oublié : pseudo + une clé de récupération + nouveau mot de passe (il n'y a pas d'e-mail). */
export function ForgotPasswordPage() {
  const [pseudo, setPseudo] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [password, setPassword] = useState('');
  const [keysLeft, setKeysLeft] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const captchaEnabled = useCaptchaEnabled();
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (captchaEnabled && !captchaToken) {
      setError('Valide le captcha avant de continuer');
      return;
    }
    setLoading(true);
    try {
      const r = await api.post<{ keysLeft: number }>('/auth/recover', {
        pseudo,
        key: recoveryKey,
        password,
        captchaToken: captchaToken || undefined,
      });
      setKeysLeft(r.keysLeft);
    } catch (err) {
      setError(errorMessage(err));
      setCaptchaToken('');
      setCaptchaKey((k) => k + 1);
    }
    setLoading(false);
  };

  return (
    <Frame title="Mot de passe oublié">
      {keysLeft !== null ? (
        <div className="space-y-3 text-center text-[var(--text-primary)]">
          <p>
            Mot de passe mis à jour. Tu peux maintenant <Link to="/auth">te connecter</Link>.
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {keysLeft > 0
              ? `Il te reste ${keysLeft} clé${keysLeft > 1 ? 's' : ''} de récupération. Tu pourras en générer de nouvelles dans les paramètres.`
              : 'Tu n’as plus de clé de récupération : génères-en de nouvelles dans les paramètres dès ta connexion.'}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Saisis ton pseudo et l’une de tes clés de récupération (chacune ne sert qu’une fois), puis choisis un nouveau
            mot de passe. Sans clé, le compte ne peut pas être récupéré automatiquement.
          </p>
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] text-sm">
              {error}
            </div>
          )}
          <input
            type="text"
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            className={inputClass}
            placeholder="ton_pseudo"
            aria-label="Pseudo"
            autoComplete="username"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_]+"
            required
          />
          <input
            type="text"
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 14))}
            className={`${inputClass} font-mono`}
            placeholder="ABCD-EFGH-JKMN"
            aria-label="Clé de récupération"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Nouveau mot de passe (8 caractères min.)"
            aria-label="Nouveau mot de passe"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
          <Captcha key={captchaKey} onToken={setCaptchaToken} onError={setError} />
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? '…' : 'Changer le mot de passe'}
          </button>
        </form>
      )}
    </Frame>
  );
}
