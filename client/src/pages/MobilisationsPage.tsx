import { CalendarDays, MapPin, Megaphone, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import PageHeader from '../components/PageHeader';
import { usePaged } from '../hooks/usePaged';
import { api } from '../services/api';
import MobilisationCreateModal from '../components/MobilisationCreateModal';

interface MobilisationListItem {
  id: number;
  slug: string;
  title: string;
  eventDate: string;
  location: string;
  image: string | null;
  status: string;
  participantsCount: number;
  isParticipant: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'À venir',
  ongoing: 'En cours',
  past: 'Passée',
  cancelled: 'Annulée',
};

const STATUS_STYLES: Record<string, string> = {
  upcoming: 'bg-[var(--accent)]/15 text-[var(--accent)]',
  ongoing: 'bg-green-500/15 text-green-600',
  past: 'bg-[var(--text-secondary)]/15 text-[var(--text-secondary)]',
  cancelled: 'bg-[var(--danger)]/15 text-[var(--danger)]',
};

export default function MobilisationsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { items, loading, loadingMore, hasMore, error, reload, loadMore } = usePaged<MobilisationListItem>(
    () => api.get<MobilisationListItem[]>('/mobilisations'),
    'mobilisations',
  );

  return (
    <AppShell>
      <PageHeader title="Mobilisations" subtitle="Manifestations et événements collectifs">
        <div className="flex items-center justify-end px-4 pb-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Créer
          </button>
        </div>
      </PageHeader>

      <div className="px-4 py-3 space-y-3">
        {loading && <p className="text-center text-[var(--text-secondary)] py-8">Chargement…</p>}
        {error && <p className="text-center text-[var(--danger)] py-4">{error}</p>}

        {!loading && items.length === 0 && (
          <div className="text-center py-12">
            <Megaphone className="w-12 h-12 mx-auto text-[var(--text-secondary)] mb-3" />
            <p className="text-[var(--text-secondary)]">Aucune mobilisation pour le moment.</p>
          </div>
        )}

        {items.map((mob) => (
          <Link
            key={mob.id}
            to={`/mobilisation/${mob.slug}`}
            className="block rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] overflow-hidden hover:border-[var(--accent)]/40 transition-colors no-underline"
          >
            {mob.image && (
              <div className="h-32 overflow-hidden">
                <img src={mob.image} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[mob.status] ?? ''}`}>
                  {STATUS_LABELS[mob.status] ?? mob.status}
                </span>
              </div>
              <h2 className="font-bold text-[var(--text-primary)] text-lg leading-tight mb-2">{mob.title}</h2>
              <div className="flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-4 h-4" />
                  {new Date(mob.eventDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {mob.location}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-4 h-4" />
                  {mob.participantsCount} participant{mob.participantsCount > 1 ? 's' : ''}
                </span>
              </div>
              {mob.isParticipant && (
                <p className="mt-2 text-sm text-[var(--accent)] font-semibold">Tu participes</p>
              )}
            </div>
          </Link>
        ))}

        {hasMore && (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="w-full py-3 text-center text-[var(--accent)] font-semibold hover:bg-[var(--bg-tertiary)] rounded-xl transition-colors">
            {loadingMore ? 'Chargement…' : 'Voir plus'}
          </button>
        )}
      </div>

      {showCreate && <MobilisationCreateModal onClose={() => setShowCreate(false)} onCreated={reload} />}
    </AppShell>
  );
}
