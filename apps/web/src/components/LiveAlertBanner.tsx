import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type LiveAlert } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Repeating alerts that are still sounding on the user's phone, and the one-tap
// way to stop them from here instead of from the Pushover app.
//
// **Opening the terminal silences them.** That is the whole design (owner
// decision, 2026-08): a repeating alert exists to get you to the desk, so
// arriving IS the acknowledgement. There is deliberately no "do you want to
// acknowledge?" prompt — the phone is still making noise while somebody reads a
// dialog, and a question at 3am is the worst possible moment to ask one.
//
// What replaces the prompt is this card. It does not ask, it TELLS: what fired,
// and when. It stays until dismissed, so an alert can never be silenced without
// leaving a trace of what it was — which is the thing a prompt was protecting.
//
// Pushover's own acknowledge button still works and is untouched. If the
// terminal is unreachable, that is the path that still stops the noise, so
// nothing here may become the only way out.

const POLL_MS = 20_000;

export function LiveAlertBanner() {
  const { user } = useAuth();
  // What we silenced on arrival, held so the card can say what it was after the
  // alert itself is gone from the server's live list.
  const [silenced, setSilenced] = useState<LiveAlert[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);

  // Pushover is the only channel that can produce one of these, and the demo
  // never holds a key — so there is nothing to poll for either.
  const enabled = !!user && !user.isDemo;

  // Read what is still repeating and silence it, because being here means the
  // alert reached its target. Guarded by a ref rather than state so a poll
  // landing mid-acknowledge cannot fire a second one.
  const claim = useCallback(async () => {
    if (!enabled || busy.current) return;
    busy.current = true;
    try {
      const { alerts: live } = await api.liveAlerts();
      if (live.length === 0) return;
      await api.acknowledgeAlerts();
      // Only now is it safe to say these were silenced — if the acknowledge
      // throws, the card must not claim a phone stopped when it did not.
      setSilenced((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...live.filter((a) => !seen.has(a.id)), ...prev].slice(0, 4);
      });
      setDismissed(false);
    } catch {
      /* leave whatever is on screen; the next poll tries again */
    } finally {
      busy.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void claim();
    const id = window.setInterval(() => void claim(), POLL_MS);
    // Coming back to the tab counts as arriving: if the terminal was already
    // open in the background when the alert fired, there is no mount to catch
    // it, and looking at it is the same act as opening it.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void claim();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled, claim]);

  if (!enabled || dismissed || silenced.length === 0) return null;

  const one = silenced[0];
  const more = silenced.length - 1;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        margin: '0 0 12px',
        borderRadius: 10,
        background: 'rgba(235,203,116,.10)',
        border: '1px solid rgba(235,203,116,.45)',
        color: '#eef3ff',
        fontSize: 13,
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1, flex: 'none' }} aria-hidden>
        🔕
      </span>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ fontWeight: 700, color: '#EBCB74' }}>
          Repeating alert silenced{more > 0 ? ` (+${more} more)` : ''}
        </div>
        <div style={{ color: '#9fb0d6', fontSize: 12.5, marginTop: 2 }}>
          {one.title.replace(/^TEST · /, 'Test · ')} — {one.body}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          flex: 'none',
          background: 'rgba(255,255,255,.06)',
          border: '1px solid #1d3560',
          color: '#dfe7fa',
          fontSize: 12,
          fontWeight: 600,
          padding: '7px 12px',
          borderRadius: 7,
          cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
