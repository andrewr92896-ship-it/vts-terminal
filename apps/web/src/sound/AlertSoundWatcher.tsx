import { useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useAlertSound } from './alertSound';

// Polls the desk-wide trading signal and plays the user's chosen alert sound
// when a new TradingView alert arrives. Render this only for users who can
// access the Trading workspace (full traders and viewers) so nobody else hears
// it. It renders nothing.
//
// This watcher runs on every screen, so it shares the Live Wall's 30s cadence
// rather than polling twice as often: alerts arrive by webhook and a sound a few
// seconds later is fine, and it halves the request load on the broker fan-out.
const POLL_MS = 30_000;

export function AlertSoundWatcher() {
  const { play } = useAlertSound();
  // The newest alert time we have already accounted for. We seed it on the first
  // poll so logging in does not immediately replay the most recent alert.
  const lastSeen = useRef<number | null>(null);
  const primed = useRef(false);
  // Keep the latest play() without restarting the interval when it changes.
  const playRef = useRef(play);
  playRef.current = play;

  useEffect(() => {
    let alive = true;

    async function check() {
      try {
        const sig = await api.tradingSignals();
        if (!alive) return;
        const latest = sig.lastAlertAt;
        if (!primed.current) {
          // First successful poll: record the baseline, do not chime.
          lastSeen.current = latest;
          primed.current = true;
          return;
        }
        if (latest != null && (lastSeen.current == null || latest > lastSeen.current)) {
          lastSeen.current = latest;
          playRef.current();
        }
      } catch {
        // Network hiccup or no trading access: stay quiet and try again next tick.
      }
    }

    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return null;
}
