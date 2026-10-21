import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCount } from '../lib/views';
import { api, errorMessage } from '../services/api';

interface Stats {
  views: number;
  likes: number;
  reposts: number;
  replies: number;
  engagements: number;
  engagementRate: number;
  daily: { date: string; views: number }[];
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');

/** Statistiques d'un post, réservées à son auteur (le serveur refuse tout autre demandeur). */
export default function StatsDialog({ postId, onClose }: { postId: number; onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    api
      .get<Stats>(`/posts/${postId}/stats`)
      .then(setStats)
      .catch((err) => setError(errorMessage(err, 'Statistiques indisponibles')));
  }, [postId]);

  const max = Math.max(1, ...(stats?.daily.map((d) => d.views) ?? [1]));
  const cells: [string, number][] = stats
    ? [
        ['Vues', stats.views],
        ['J’aime', stats.likes],
        ['Reposts', stats.reposts],
        ['Réponses', stats.replies],
      ]
    : [];

  /* Portail + stopPropagation : un clic dans la fenêtre ne doit pas ouvrir le post situé derrière. */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-[8dvh]"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="absolute inset-0 bg-[var(--bg-modal)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Statistiques du post"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[460px] mx-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-2xl text-[var(--text-primary)]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <h2 className="font-extrabold text-lg">Statistiques du post</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-5">
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          {!stats && !error && <p className="text-sm text-[var(--text-secondary)]">Chargement…</p>}
          {stats && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {cells.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[var(--border-color)] px-4 py-3">
                    <div className="text-2xl font-black tabular-nums">{formatCount(value)}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{label}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-[var(--accent)]/10 px-4 py-3 text-sm">
                <strong className="text-[var(--accent)]">{stats.engagementRate.toLocaleString('fr-FR')} %</strong> de
                taux d’interaction ({formatCount(stats.engagements)} interaction{stats.engagements > 1 ? 's' : ''} pour{' '}
                {formatCount(stats.views)} vue{stats.views > 1 ? 's' : ''}).
              </div>
              <div>
                <h3 className="text-sm font-bold mb-2">Nouvelles vues uniques, 7 derniers jours</h3>
                <div className="flex items-end gap-2 h-24" role="img" aria-label="Nouvelles vues uniques par jour">
                  {stats.daily.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                      <span className="text-xs tabular-nums text-[var(--text-secondary)]">{d.views || ''}</span>
                      <div
                        className="w-full rounded-t bg-[var(--accent)]"
                        style={{
                          height: `${Math.max((d.views / max) * 100, d.views ? 6 : 2)}%`,
                          opacity: d.views ? 1 : 0.25,
                        }}
                      />
                      <span className="text-xs text-[var(--text-secondary)]">{dayLabel(d.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Une vue = une personne (une adresse IP), comptée une seule fois par post. Tes propres vues ne comptent
                pas. Seul toi vois ces statistiques détaillées.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
