import { useEffect, useRef, useState } from 'react';

// Tracks the most recently removed item so a list can offer a brief "undo".
// Auto-clears after `timeoutMs`.
export function useUndo<T>(timeoutMs = 8000) {
  const [pending, setPending] = useState<T | null>(null);
  const timer = useRef<number | undefined>(undefined);

  function flag(item: T) {
    setPending(item);
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPending(null), timeoutMs);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setPending(null);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { pending, flag, clear };
}
