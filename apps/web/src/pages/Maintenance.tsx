import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api/client';
import { maintenanceNotice, subscribeMaintenance, type MaintenanceNotice } from '../lib/maintenance';

// The maintenance notice, drawn INSIDE the app.
//
// The server serves its own copy of this to anything that fetches a page, and
// that is the one a fresh browser gets. This is for the case that page can
// never reach: an installed PWA, whose shell comes out of the device's own
// precache. See `lib/maintenance.ts` for the whole reasoning; the words and the
// link are the server's, sent on the 503, so the two cannot disagree.

// It polls, because this screen replaces everything else — nothing else is left
// running to notice the terminal reopening, and somebody sitting in front of a
// card that says "try again later" should not have to guess when.
const POLL_MS = 30_000;

export function useMaintenance(): MaintenanceNotice | null {
  return useSyncExternalStore(subscribeMaintenance, maintenanceNotice, maintenanceNotice);
}

export function Maintenance({ notice }: { notice: MaintenanceNotice }) {
  useEffect(() => {
    let stop = false;
    // `me` on purpose: any answer at all — including the 401 of a signed-out
    // session — is the server working, and `noteResponse` lifts the notice on
    // it. The health check would be the wrong thing to poll: it is exempt from
    // the gate, so it answers 200 throughout and could never say the terminal
    // had reopened.
    const poll = () => { api.me().catch(() => {}); };
    const timer = window.setInterval(() => { if (!stop) poll(); }, POLL_MS);
    return () => { stop = true; window.clearInterval(timer); };
  }, []);

  return (
    <div
      style={{
        minHeight: 'var(--app-h)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#050b18',
        color: '#eef3ff',
        fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <main
        style={{
          width: 'min(520px, 100%)',
          background: '#0a1426',
          border: '1px solid #1e2e52',
          borderRadius: 14,
          padding: 32,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            marginBottom: 18,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid #2a3d68',
            color: '#7f90b6',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          }}
        >
          Under maintenance
        </span>
        <h1 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700 }}>{notice.title}</h1>
        <p style={{ margin: 0, color: '#9fb0d6', fontSize: 13.5, lineHeight: 1.6 }}>{notice.message}</p>
        <a
          href={notice.demoUrl}
          style={{
            display: 'inline-block',
            marginTop: 22,
            padding: '11px 20px',
            borderRadius: 9,
            background: '#5AC8FA',
            color: '#04101f',
            fontSize: 13.5,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Try the public demo
        </a>
        <p style={{ marginTop: 10, color: '#7f90b6', fontSize: 12, lineHeight: 1.6 }}>{notice.demoNote}</p>
      </main>
    </div>
  );
}
