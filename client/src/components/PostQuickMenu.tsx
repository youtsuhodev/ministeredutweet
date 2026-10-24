import { Copy, EyeOff, Flag, Share, X } from 'lucide-react';

interface PostQuickMenuProps {
  onCopyLink: () => void;
  onShare: () => void;
  onReport: () => void;
  onHide: () => void;
  onClose: () => void;
}

export default function PostQuickMenu({ onCopyLink, onShare, onReport, onHide, onClose }: PostQuickMenuProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" role="dialog" aria-label="Actions rapides">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xs rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Actions</span>
          <button onClick={onClose} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-2">
          <button
            type="button"
            onClick={onShare}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Share className="w-5 h-5 text-[var(--text-secondary)]" />
            Partager
          </button>
          <button
            type="button"
            onClick={onCopyLink}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Copy className="w-5 h-5 text-[var(--text-secondary)]" />
            Copier le lien
          </button>
          <button
            type="button"
            onClick={onReport}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Flag className="w-5 h-5 text-[var(--text-secondary)]" />
            Signaler
          </button>
          <button
            type="button"
            onClick={onHide}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <EyeOff className="w-5 h-5 text-[var(--text-secondary)]" />
            Cacher
          </button>
        </div>
      </div>
    </div>
  );
}
