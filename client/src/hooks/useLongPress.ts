import { useCallback, useRef } from 'react';

const DELAY = 500;

export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);

  const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    fired.current = false;
    timer.current = window.setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, DELAY);
  }, [onLongPress]);

  const end = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  const move = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: end,
    onTouchMove: move,
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: end,
    wasLongPress: () => fired.current,
  };
}
