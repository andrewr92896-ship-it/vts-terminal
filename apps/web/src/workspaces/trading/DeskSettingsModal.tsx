import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { DeskSettings } from '../../api/types';

const GOLD = '#EBCB74';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const PAGE = '#081226';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';
const INPUT_BG = '#091633';

// Trade Desk settings, gathered behind one gear button and shown as an in-app
// modal (no new window). Today it holds the desk-wide break-even band; it's the
// home for future desk settings so the toolbar stays uncluttered. `readOnly`
// view-only traders can see the values but not change them.
export function DeskSettingsModal({
  open,
  onClose,
  readOnly,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  readOnly: boolean;
  onSaved?: (s: DeskSettings) => void;
}) {
  const { isPhone } = useResponsive();
  const [bePct, setBePct] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setError(null);
    setSaved(false);
    let alive = true;
    api
      .deskSettings()
      .then((s) => {
        if (!alive) return;
        setBePct(String(s.breakEvenPct));
        setLoaded(true);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Failed to load settings'));
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const parsed = Number(bePct);
  const valid = bePct.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.updateDeskSettings({ breakEvenPct: parsed });
      setBePct(String(s.breakEvenPct));
      setSaved(true);
      onSaved?.(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trade desk settings"
        style={{
          position: 'fixed',
          top: isPhone ? 0 : '8vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isPhone ? '100%' : 'min(520px, 94vw)',
          height: isPhone ? '100%' : 'auto',
          maxHeight: isPhone ? '100%' : '86vh',
          overflowY: 'auto',
          background: PAGE,
          border: isPhone ? 'none' : `1px solid ${BORDER2}`,
          borderRadius: isPhone ? 0 : 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 61,
          animation: 'popIn .25s ease',
          color: TEXT,
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            background: 'linear-gradient(90deg,#0a1f4d,#0c2768)',
            borderBottom: `1px solid ${BORDER2}`,
          }}
        >
          <strong style={{ fontSize: 15, color: '#fff' }}>Trade Desk Settings</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>
            ×
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {!loaded && !error ? (
            <div style={{ color: MUTED, fontSize: 13 }}>Loading settings…</div>
          ) : (
            <div style={panel}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Break-even band</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.55 }}>
                A closed trade whose price moved less than this — from entry to exit, in either direction — counts as a{' '}
                <b style={{ color: GOLD }}>break-even</b> trade instead of a win or a loss. It applies across the whole
                desk: the Trade Log, History, and the Live Wall. Set <b>0</b> to turn it off.
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <input
                  value={bePct}
                  onChange={(e) => {
                    setBePct(e.target.value);
                    setSaved(false);
                  }}
                  disabled={readOnly || busy}
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  aria-label="Break-even percent"
                  style={{ ...input, width: 130, opacity: readOnly ? 0.6 : 1 }}
                />
                <span style={{ fontSize: 15, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>% either way</span>
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>
                e.g. <b>0.05</b> treats any trade that moved under ±0.05% as break-even.
              </div>

              {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginTop: 12 }}>{error}</div>}

              {!readOnly ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                  <button onClick={save} disabled={!valid || busy} style={{ ...goldBtn, opacity: !valid || busy ? 0.6 : 1 }}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  {saved && <span style={{ fontSize: 12, color: '#8fe3b0' }}>Saved ✓</span>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: FAINT, marginTop: 14 }}>View-only — ask a full trader to change desk settings.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 16px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 15, padding: '9px 11px', outline: 'none', fontFamily: "'IBM Plex Mono', monospace" };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12.5, padding: '9px 18px', borderRadius: 7, cursor: 'pointer' };
