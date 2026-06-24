import { useEffect, useState } from 'react';

// Forces a re-render on a fixed interval so that relative time labels (for
// example "5m ago") stay fresh between data refreshes. The returned value is
// the current epoch ms; callers can ignore it and just rely on the re-render.
export function useNowTick(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
