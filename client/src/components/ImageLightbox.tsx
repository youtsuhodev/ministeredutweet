import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface LightboxItem {
  src: string;
  alt?: string;
}

interface ImageLightboxProps {
  images: LightboxItem[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [opacity, setOpacity] = useState(0);
  const [scale, setScale] = useState(1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeDelta = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const multi = images.length > 1;

  const goNext = useCallback(() => {
    if (index < images.length - 1) setIndex(index + 1);
  }, [index, images.length]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  useEffect(() => {
    requestAnimationFrame(() => setOpacity(1));
    return () => setOpacity(0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    swipeDelta.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (multi && Math.abs(dx) > Math.abs(dy)) {
      swipeDelta.current = dx;
      setSwipeOffset(dx);
    }
  };

  const handleTouchEnd = () => {
    if (multi && Math.abs(swipeDelta.current) > 60) {
      if (swipeDelta.current < 0) goNext();
      else goPrev();
    }
    touchStart.current = null;
    swipeDelta.current = 0;
    setSwipeOffset(0);
  };

  const handleTap = () => {
    if (Math.abs(swipeDelta.current) > 10) return;
    onClose();
  };

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={images[index].alt || 'Image agrandie'}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 touch-none"
      style={{ opacity, transition: 'opacity 200ms ease' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
    >
      <div
        className="relative max-w-full max-h-full flex items-center justify-center w-full h-full px-2"
        style={{
          transform: `translateX(${swipeOffset}px) scale(${scale})`,
          transition: swipeOffset ? 'none' : 'transform 250ms ease',
        }}
      >
        <img
          src={images[index].src}
          alt={images[index].alt || ''}
          className="max-w-full max-h-[90vh] object-contain select-none"
          draggable={false}
        />
      </div>

      {multi && index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          aria-label="Image précédente"
          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {multi && index < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          aria-label="Image suivante"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Fermer"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      {multi && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2" aria-hidden="true">
          {images.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
