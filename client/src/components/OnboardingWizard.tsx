import { Check, Feather, Loader2, MonitorSmartphone, Moon, SkipForward, Sun, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { type ThemePreference, useTheme } from '../hooks/useTheme';
import { api, errorMessage } from '../services/api';
import { completeOnboarding } from '../services/auth';
import Avatar from './Avatar';

/* Assistant de bienvenue (nouveaux comptes uniquement, signalé par /auth/me) :
   1. accueil · 2. suivre des comptes · 3. premier post · 4. thème. Chaque étape est passable. */

interface Suggestion {
  uid: string;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
  verified: boolean;
}

const THEME_OPTIONS: { id: ThemePreference; label: string; hint: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Clair', hint: 'Pour les endroits lumineux', icon: Sun },
  { id: 'dark', label: 'Sombre', hint: 'Douillet pour les yeux le soir', icon: Moon },
  { id: 'system', label: 'Automatique', hint: "Suit ton système d'exploitation", icon: MonitorSmartphone },
];

export default function OnboardingWizard() {
  const { user, refresh } = useAuth();
  const { preference, setPreference } = useTheme();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /* expect : suivre des comptes suggérés */
  const [suggestions, setSuggestions] = useState<Suggestion[]>();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* étape 3 : premier post */
  const [text, setText] = useState('');

  const finish = async () => {
    setBusy(true);
    try {
      await completeOnboarding();
      await refresh(); // /auth/me renverra à nouveau onboardingDone : le wizard se referme tout seul
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const loadSuggestions = async () => {
    setStep(1);
    try {
      const rows = await api.get<Suggestion[]>('/social/suggestions');
      setSuggestions(rows);
    } catch {
      setSuggestions([]);
    }
  };

  const followSelected = async () => {
    if (selected.size === 0) return finish();
    setBusy(true);
    try {
      for (const uid of selected) {
        const s = suggestions?.find((x) => x.uid === uid);
        if (s) await api.post(`/follows/${s.pseudo}`);
      }
      await finish();
    } catch (err) {
      // message de l'échec, l'étape peut être redoutée
      setError(errorMessage(err, "Impossible de s'abonner, réessaie ou passe"));
      setBusy(false);
    }
  };

  const publishFirstPost = async () => {
    const clean = text.trim();
    if (!clean) return finish();
    setBusy(true);
    setError('');
    try {
      await api.post('/posts', { text: clean });
      await finish();
    } catch (err) {
      setError(errorMessage(err, 'Publication impossible, réessaie'));
      setBusy(false);
    }
  };

  const pickTheme = async (id: ThemePreference) => {
    setPreference(id);
    await finish();
  };

  const next = async () => {
    setError('');
    switch (step) {
      case 0:
        await loadSuggestions();
        break;
      case 1:
        await followSelected();
        break;
      case 2:
        await publishFirstPost();
        break;
      default:
        await finish();
    }
  };

  const follow = (uid: string) =>
    setSelected((prev) => {
      const copy = new Set(prev);
      if (copy.has(uid)) copy.delete(uid);
      else copy.add(uid);
      return copy;
    });

  const busyIcon = busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null;

  const steps = [
    /* 0. Bienvenue */
    <div key="s0" className="space-y-4 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
        <Feather className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-black">Bienvenue @{user?.pseudo} !</h2>
      <p className="text-[var(--text-secondary)]">
        Le réseau souverain : tes données restent en France, pas de pub, pas de traçage.
        <br />
        On te montre l'essentiel en 3 étapes ?
      </p>
    </div>,

    /* 1. Suivre des comptes */
    <div key="s1" className="space-y-4">
      <h2 className="text-xl font-black">Suis quelques comptes</h2>
      <p className="text-sm text-[var(--text-secondary)]">
        Comptes les plus populaires que tu ne suis pas encore. Tu pourras toujours en suivre d'autres plus tard depuis
        l'Explorer.
      </p>
      {suggestions === undefined ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--text-secondary)]" />
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] text-center py-4">
          Aucune suggestion pour l'instant. Tu pourras découvrir des comptes dans l'Explorer.
        </p>
      ) : (
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {suggestions.map((s) => {
            const picked = selected.has(s.uid);
            return (
              <button
                key={s.uid}
                type="button"
                onClick={() => follow(s.uid)}
                aria-pressed={picked}
                className="flex items-center gap-3 p-2 rounded-xl text-left hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <Avatar src={s.avatar} name={s.pseudo} />
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-bold block truncate">{s.displayName || s.pseudo}</span>
                  <span className="text-sm text-[var(--text-secondary)] truncate">@{s.pseudo}</span>
                </span>
                <span
                  className={`flex items-center gap-1 text-sm font-bold rounded-full px-3 py-1 border ${
                    picked
                      ? 'bg-[var(--accent)] text-white border-transparent'
                      : 'text-[var(--text-primary)] border-[var(--border-color)]'
                  }`}
                >
                  {picked ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {picked ? 'Suivi' : 'Suivre'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>,

    /* 2. Premier post */
    <div key="s2" className="space-y-4">
      <h2 className="text-xl font-black">Publie ton premier post</h2>
      <p className="text-sm text-[var(--text-secondary)]">280 caractères maximum, pour démarrer tout en douceur.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 280))}
        rows={4}
        maxLength={280}
        placeholder="Quoi de neuf au Ministère ?"
        className="w-full bg-transparent border border-[var(--border-color)] rounded-xl px-3 py-2 resize-none text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
      />
      <p className="text-xs text-[var(--text-secondary)] text-right">{text.length} / 280</p>
    </div>,

    /* 3. Thème */
    <div key="s3" className="space-y-4">
      <h2 className="text-xl font-black">Choisis ton thème</h2>
      <p className="text-sm text-[var(--text-secondary)]">Tu pourras le changer à tout moment dans Paramètres.</p>
      <div className="flex flex-col gap-2">
        {THEME_OPTIONS.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => pickTheme(id)}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
              preference === id
                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <Icon className="w-5 h-5 text-[var(--accent)]" />
            <span className="flex-1">
              <span className="font-bold block">{label}</span>
              <span className="text-xs text-[var(--text-secondary)]">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>,
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Assistant de bienvenue"
    >
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6">
        {/* pastilles de progression */}
        <div aria-hidden="true" className="flex gap-1.5 mb-5">
          {steps.map((_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: index voulu (étape fixe, liste statique)
              key={i}
              className={`h-1.5 rounded-full flex-1 transition-colors ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'}`}
            />
          ))}
        </div>

        {steps[step]}

        {error && (
          <p role="alert" className="text-sm text-[var(--danger)] mt-3">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 mt-6">
          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:underline"
          >
            <SkipForward className="w-4 h-4" /> Passer
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={next}
              disabled={busy}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-full px-6 py-2 text-sm transition-colors flex items-center gap-2"
            >
              {step === 0 ? 'Commencer' : step === 3 ? 'C’est tout !' : 'Suivant'} {busyIcon}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
