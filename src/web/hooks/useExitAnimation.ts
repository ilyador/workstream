import { useCallback, useEffect, useRef, useState } from 'react';

export function useExitAnimation(onExit: () => void, durationMs = 150) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onExitRef = useRef(onExit);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const closeWithAnimation = useCallback(() => {
    if (closingRef.current) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || durationMs <= 0) {
      onExitRef.current();
      return;
    }

    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      closingRef.current = false;
      setClosing(false);
      onExitRef.current();
    }, durationMs);
  }, [durationMs]);

  const cancelExitAnimation = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    closingRef.current = false;
    setClosing(false);
  }, []);

  return { closing, closeWithAnimation, cancelExitAnimation };
}
