import { X } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../services/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function MobilisationCreateModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [practicalInfo, setPracticalInfo] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !eventDate || !location.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/mobilisations', {
        title: title.trim(),
        description: description.trim(),
        practicalInfo: practicalInfo.trim() || undefined,
        eventDate,
        location: location.trim(),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-color)] shadow-xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <h2 className="font-bold text-lg text-[var(--text-primary)]">Nouvelle mobilisation</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-[var(--bg-tertiary)]">
            <X className="w-5 h-5 text-[var(--text-primary)]" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1" htmlFor="mob-title">Titre</label>
            <input
              id="mob-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm border border-[var(--border-color)] focus:border-[var(--accent)] outline-none"
              placeholder="Nom de la mobilisation"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1" htmlFor="mob-date">Date</label>
              <input
                id="mob-date"
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm border border-[var(--border-color)] focus:border-[var(--accent)] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1" htmlFor="mob-location">Lieu</label>
              <input
                id="mob-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={300}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm border border-[var(--border-color)] focus:border-[var(--accent)] outline-none"
                placeholder="Ville, place…"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1" htmlFor="mob-desc">Description</label>
            <textarea
              id="mob-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              required
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm border border-[var(--border-color)] focus:border-[var(--accent)] outline-none resize-y"
              placeholder="Motif, revendications, déroulé…"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1" htmlFor="mob-practical">Infos pratiques</label>
            <textarea
              id="mob-practical"
              value={practicalInfo}
              onChange={(e) => setPracticalInfo(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm border border-[var(--border-color)] focus:border-[var(--accent)] outline-none resize-y"
              placeholder="Point de rendez-vous, transports, à emporter…"
            />
          </div>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !title.trim() || !description.trim() || !eventDate || !location.trim()}
            className="w-full py-3 rounded-full bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {submitting ? 'Création…' : 'Créer la mobilisation'}
          </button>
        </form>
      </div>
    </div>
  );
}
