import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { playUpdateChime } from '../sound/updateChime';

// A global "Update available" popup. When a new build is deployed, the service
// worker for it is fetched and waits; this surfaces that as a prompt on whatever
// screen the user is on (not just the Studies tab, where a failed lazy-chunk
// fetch used to be the only hint). Clicking Relaunch activates the waiting
// worker and reloads into the fresh build.
//
// Mounted once, at the App root, so it shows regardless of workspace or login
// state. Renders nothing until an update is actually ready.

// How often to ask the browser to check for a new deploy while the app is open,
// so the prompt appears on its own without the user reloading first.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Poll for a fresh build so the prompt can appear mid-session.
      setInterval(() => {
        registration.update().catch(() => {
          /* offline or transient — try again next tick */
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  // Chime when the prompt appears — the card can arrive on a screen nobody is
  // looking at. Keyed on the flag turning true, so it sounds once per prompt
  // rather than on every re-render; dismissing and a later update chimes again,
  // which is a second prompt. Off from My Terminal ▸ Settings.
  useEffect(() => {
    if (needRefresh) playUpdateChime();
  }, [needRefresh]);

  if (!needRefresh) return null;

  return (
    <div style={wrap} role="dialog" aria-modal="false" aria-labelledby="vts-update-title">
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>✨</span>
          <div>
            <div id="vts-update-title" style={title}>Update available</div>
            <div style={body}>A new version of the terminal is ready.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => void updateServiceWorker(true)} style={relaunchBtn}>
            Relaunch to update
          </button>
          <button onClick={() => setNeedRefresh(false)} style={laterBtn}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: '0 16px calc(16px + env(safe-area-inset-bottom))',
  zIndex: 200,
  pointerEvents: 'none',
  animation: 'fadeIn .25s ease',
};
const card: CSSProperties = {
  pointerEvents: 'auto',
  width: 'min(420px, 100%)',
  background: 'linear-gradient(180deg,#12235a,#0c1a40)',
  border: '1px solid #2a4488',
  borderLeft: '3px solid #EBCB74',
  borderRadius: 14,
  padding: '16px 18px',
  boxShadow: '0 18px 48px rgba(0,0,0,.5)',
  color: '#eef3ff',
};
const title: CSSProperties = { fontSize: 15, fontWeight: 700, color: '#fff' };
const body: CSSProperties = { fontSize: 12.5, color: '#b9c8ee', marginTop: 3, lineHeight: 1.5 };
const relaunchBtn: CSSProperties = {
  flex: '1 1 auto',
  border: 'none',
  background: 'linear-gradient(180deg,#EBCB74,#C9A24B)',
  color: '#0c2768',
  fontSize: 13,
  fontWeight: 700,
  padding: '11px 16px',
  borderRadius: 9,
  cursor: 'pointer',
  minHeight: 44,
};
const laterBtn: CSSProperties = {
  flex: '0 0 auto',
  border: '1px solid #2a4488',
  background: 'rgba(255,255,255,.05)',
  color: '#cfe0ff',
  fontSize: 13,
  fontWeight: 600,
  padding: '11px 16px',
  borderRadius: 9,
  cursor: 'pointer',
  minHeight: 44,
};
