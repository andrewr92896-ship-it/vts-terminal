import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { BreakEvenMode, DeskSettings } from '../../api/types';

// The three ways the desk can measure its break-even buffer.
const MODES: { key: BreakEvenMode; label: string }[] = [
  { key: 'percent', label: 'Percent' },
  { key: 'dollars', label: 'Dollars' },
  { key: 'pips', label: 'Pips' },
];

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
  const [mode, setMode] = useState<BreakEvenMode>('percent');
  const [bePct, setBePct] = useState('');
  const [beAmount, setBeAmount] = useState('');
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
        setMode(s.breakEvenMode);
        setBePct(String(s.breakEvenPct));
        setBeAmount(String(s.breakEvenAmount));
        setLoaded(true);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Failed to load settings'));
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  // In 'percent' mode the value is a 0–100 percent; in 'dollars' / 'pips' it's a
  // non-negative amount. Only the field for the active mode has to be valid.
  const parsedPct = Number(bePct);
  const parsedAmount = Number(beAmount);
  const valid =
    mode === 'percent'
      ? bePct.trim() !== '' && Number.isFinite(parsedPct) && parsedPct >= 0 && parsedPct <= 100
      : beAmount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount >= 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      // Send the mode plus only the field it uses, so the other value is left as
      // the desk last set it (and can be switched back to without re-typing).
      const patch: Partial<DeskSettings> =
        mode === 'percent' ? { breakEvenMode: mode, breakEvenPct: parsedPct } : { breakEvenMode: mode, breakEvenAmount: parsedAmount };
      const s = await api.updateDeskSettings(patch);
      setMode(s.breakEvenMode);
      setBePct(String(s.breakEvenPct));
      setBeAmount(String(s.breakEvenAmount));
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
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Break-even buffer</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.55 }}>
                A closed trade whose result stays inside this buffer — in either direction — counts as a{' '}
                <b style={{ color: GOLD }}>break-even</b> trade instead of a win or a loss. It applies across the whole
                desk: the Trade Log, History, and the Live Wall. Pick how the buffer is measured, then set the size.
                Set <b>0</b> to turn it off.
              </div>

              {/* Mode: percent of price move, a flat dollar amount, or pips. */}
              <div style={{ ...seg, marginTop: 14 }} role="tablist" aria-label="Break-even buffer unit">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    role="tab"
                    aria-selected={mode === m.key}
                    disabled={readOnly || busy}
                    onClick={() => {
                      setMode(m.key);
                      setSaved(false);
                    }}
                    style={{ ...segBtn, ...(mode === m.key ? segActive : {}), opacity: readOnly ? 0.6 : 1 }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === 'percent' ? (
                <>
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
                    e.g. <b>0.05</b> treats any trade that moved under ±0.05% (entry → exit) as break-even.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                    {mode === 'dollars' && <span style={{ fontSize: 15, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>$</span>}
                    <input
                      value={beAmount}
                      onChange={(e) => {
                        setBeAmount(e.target.value);
                        setSaved(false);
                      }}
                      disabled={readOnly || busy}
                      type="number"
                      step={mode === 'pips' ? '0.1' : '0.01'}
                      min="0"
                      inputMode="decimal"
                      aria-label={mode === 'dollars' ? 'Break-even dollars' : 'Break-even pips'}
                      style={{ ...input, width: 130, opacity: readOnly ? 0.6 : 1 }}
                    />
                    <span style={{ fontSize: 15, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {mode === 'dollars' ? 'either way' : 'pips either way'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>
                    {mode === 'dollars' ? (
                      <>e.g. <b>5</b> treats any trade that made or lost under ±$5 as break-even.</>
                    ) : (
                      <>e.g. <b>3</b> treats any forex trade that moved under ±3 pips as break-even. Non-forex trades fall back to their realized P/L.</>
                    )}
                  </div>
                </>
              )}

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
const seg: CSSProperties = { display: 'inline-flex', background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, overflow: 'hidden' };
const segBtn: CSSProperties = { background: 'none', border: 'none', color: MUTED, fontSize: 12.5, fontWeight: 600, padding: '8px 16px', cursor: 'pointer' };
const segActive: CSSProperties = { background: 'rgba(235,203,116,.14)', color: GOLD };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 15, padding: '9px 11px', outline: 'none', fontFamily: "'IBM Plex Mono', monospace" };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12.5, padding: '9px 18px', borderRadius: 7, cursor: 'pointer' };
