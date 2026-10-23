import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

const THRESHOLD = 70;
const MAX_PULL = 120;

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStart = useRef(0);
  const pulling = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    if (window.scrollY <= 0) {
      touchStart.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const delta = e.touches[0].clientY - touchStart.current;
    if (delta > 0) {
      const damped = Math.min(delta * 0.5, MAX_PULL);
      setPull(damped);
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current || refreshing) return;
    pulling.current = false;
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(48);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }, [pull, refreshing, onRefresh]);

  const progress = Math.min(pull / THRESHOLD, 1);
  const showIndicator = pull > 10 || refreshing;

  return (
    <div
      className="touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {showIndicator && (
        <div
          className="flex items-end justify-center transition-[height] duration-200 ease-out overflow-hidden"
          style={{ height: refreshing ? 56 : pull }}
        >
          <div
            className={`mb-2 flex items-center justify-center w-8 h-8 rounded-full bg-[var(--bg-tertiary)] shadow-sm ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 180}deg)` }}
          >
            <ChevronDown className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
