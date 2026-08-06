import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { SYMBOL_SUGGESTIONS, symbolLabel } from './tvChart';
import { zoneFmt } from '../../lib/timezone';
import type {
  PriceAlert,
  PriceAlertCondition,
  PriceAlertRepeat,
  SessionAlertPrefs,
} from '../../api/types';

// The two alert SETTINGS panels. They lived on the Trading Alerts screen, which
// was removed outright (owner instruction, 2026-08) — but neither of them is a
// TradingView alert, and each was the only way to reach a real feature:
//
//  - `SessionAlertSettings` is the only control for the session open / close /
//    pre-open notifications the server fires, so it moved to the screen those
//    sessions are built on (Strategy Sessions).
//  - `PriceAlertSettings` is price alerts, which are INCLUDED WITH EVERY
//    ACCOUNT and deliberately not behind the Advanced Trading opt-in — so it
//    moved to My Terminal ▸ Settings, beside the other notification controls,
//    where an account without the desk can actually reach it. That is a better
//    home than the desk-gated screen it was on.
//
// They are in their own module rather than in either host screen because they
// are self-contained panels with their own fetches, and neither host has
// anything to do with the other's.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

// When an alert last fired, on the reader's chosen clock (Eastern by default).
function firedAt(ms: number): string {
  return zoneFmt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
}

// Per-user opt-in for Strategy Session notifications, stored server-side, which
// fires them on each session's own schedule (needs phone alerts on for a device
// to actually buzz). Independent of the per-trade notification prefs in
// Settings.
export function SessionAlertSettings() {
  const [prefs, setPrefs] = useState<SessionAlertPrefs | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.sessionAlertPrefs()
      .then((r) => { if (alive) setPrefs(r.prefs); })
      .catch(() => { if (alive) setPrefs({ notifyOpen: false, notifyClose: false, notifyPreOpen: false, preOpenLeadMin: 30 }); });
    return () => { alive = false; };
  }, []);

  async function persist(next: SessionAlertPrefs) {
    setPrefs(next);
    setStatus('saving');
    try {
      const r = await api.saveSessionAlertPrefs(next);
      setPrefs(r.prefs);
      setStatus('saved');
      window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch {
      setStatus('error');
    }
  }

  if (!prefs) return null;

  const anyOn = prefs.notifyOpen || prefs.notifyClose || prefs.notifyPreOpen;
  const lead = prefs.preOpenLeadMin;

  return (
    <div style={{ ...card, marginBottom: 14, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', color: TEXT, cursor: 'pointer', padding: '13px 16px', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>🔔 {"Strategy session alerts"}</span>
          {anyOn && <span style={{ ...badge, color: GREEN, border: `1px solid ${GREEN}` }}>ON</span>}
        </div>
        <span style={{ fontSize: 12, color: FAINT }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          {/* Where phone alerts are switched on is not discoverable from this
              screen, so it is named. */}
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
            {"Phone alerts are turned on in My Terminal ▸ Settings."}
          </div>
          <ToggleRow
            label={"Before a session opens"}
            on={prefs.notifyPreOpen}
            onChange={(v) => persist({ ...prefs, notifyPreOpen: v })}
          />
          {prefs.notifyPreOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 12px', paddingLeft: 4, fontSize: 12, color: MUTED }}>
              {"Notify me"}
              <input
                type="number"
                min={1}
                max={240}
                value={lead}
                onChange={(e) => setPrefs({ ...prefs, preOpenLeadMin: Math.max(1, Math.min(240, Number(e.target.value) || 0)) })}
                onBlur={() => persist({ ...prefs, preOpenLeadMin: Math.max(1, Math.min(240, lead || 30)) })}
                style={{ ...numInput }}
              />
              {"minutes before it opens"}
            </div>
          )}
          <ToggleRow
            label={"When a session opens"}
            on={prefs.notifyOpen}
            onChange={(v) => persist({ ...prefs, notifyOpen: v })}
          />
          <ToggleRow
            label={"When a session closes"}
            on={prefs.notifyClose}
            onChange={(v) => persist({ ...prefs, notifyClose: v })}
          />
          <div style={{ fontSize: 11, color: status === 'error' ? '#ffb4ab' : FAINT, marginTop: 6, minHeight: 14 }}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save — try again.' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, on, onChange }: { label: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 13, color: TEXT }}>{label}</span>
      <button
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          border: `1px solid ${on ? GREEN : BORDER2}`,
          background: on ? 'rgba(53,196,123,.25)' : INPUT_BG,
          position: 'relative',
          cursor: 'pointer',
          flex: '0 0 auto',
          transition: 'background .15s ease, border-color .15s ease',
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: on ? GREEN : FAINT, transition: 'left .15s ease' }} />
      </button>
    </div>
  );
}

// User-authored price alerts: "buzz me when EUR/USD crosses 1.1000." Personal —
// each rule fires only to its creator (push + Pushover). Evaluated server-side
// against live OANDA prices, so it covers forex, metals and indices; crypto is
// keyless and works either way.
export function PriceAlertSettings() {
  const [alerts, setAlerts] = useState<PriceAlert[] | null>(null);
  const [priceSource, setPriceSource] = useState(true);
  const [open, setOpen] = useState(false);

  // New-rule form.
  const [symbol, setSymbol] = useState('OANDA:EURUSD');
  const [condition, setCondition] = useState<PriceAlertCondition>('above');
  const [threshold, setThreshold] = useState('');
  const [repeat, setRepeat] = useState<PriceAlertRepeat>('once');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.priceAlerts()
      .then((r) => { if (alive) { setAlerts(r.alerts); setPriceSource(r.priceSource); } })
      .catch(() => { if (alive) setAlerts([]); });
    return () => { alive = false; };
  }, []);

  async function add() {
    const level = Number(threshold);
    if (!symbol.trim() || !Number.isFinite(level) || level <= 0) {
      setError('Enter a symbol and a price above 0.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.createPriceAlert({
        symbol: symbol.trim(),
        condition,
        threshold: level,
        repeat,
        note: note.trim() || null,
      });
      setAlerts(r.alerts);
      setThreshold('');
      setNote('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create alert');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a: PriceAlert) {
    try {
      const r = await api.updatePriceAlert(a.id, { active: !a.active });
      setAlerts(r.alerts);
    } catch { /* leave as-is on failure */ }
  }

  async function remove(id: string) {
    try {
      const r = await api.deletePriceAlert(id);
      setAlerts(r.alerts);
    } catch { /* leave as-is on failure */ }
  }

  if (!alerts) return null;

  const activeCount = alerts.filter((a) => a.active).length;

  return (
    <div style={{ ...card, marginTop: 14, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', color: TEXT, cursor: 'pointer', padding: '13px 16px', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>🎯 {"Price alerts"}</span>
          {activeCount > 0 && <span style={{ ...badge, color: GOLD, border: `1px solid ${GOLD}` }}>{activeCount}</span>}
        </div>
        <span style={{ fontSize: 12, color: FAINT }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
            {"Get buzzed when a market crosses a price you set. Covers forex, metals, indices and crypto."}
          </div>

          {!priceSource && (
            <div style={{ ...warnBanner, marginBottom: 12 }}>
              {"Crypto alerts are working. Forex, metals and index alerts need a site-wide price feed that isn't switched on right now, so they won't fire until it is. Nothing to do on your end — connecting your own broker doesn't change it."}
            </div>
          )}

          {/* New-rule form */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 4 }}>
            <div style={{ flex: '1 1 150px', minWidth: 130 }}>
              <label style={fieldLbl}>{"Symbol"}</label>
              <input
                value={symbol}
                list="price-alert-symbols"
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="OANDA:EURUSD"
                style={{ ...fieldInput, width: '100%' }}
              />
              <datalist id="price-alert-symbols">
                {SYMBOL_SUGGESTIONS.map((s) => <option key={s.symbol} value={s.symbol}>{s.label}</option>)}
              </datalist>
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <label style={fieldLbl}>{"When it"}</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value as PriceAlertCondition)} style={{ ...fieldInput, cursor: 'pointer' }}>
                <option value="above">crosses above</option>
                <option value="below">crosses below</option>
              </select>
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <label style={fieldLbl}>{"Price"}</label>
              <input
                type="number"
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
                placeholder="1.1000"
                style={{ ...fieldInput, width: 100 }}
              />
            </div>
            <button onClick={() => void add()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Adding…" : "Add alert"}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={120}
              style={{ ...fieldInput, flex: '1 1 160px', minWidth: 140 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, cursor: 'pointer' }}>
              <input type="checkbox" checked={repeat === 'always'} onChange={(e) => setRepeat(e.target.checked ? 'always' : 'once')} />
              {"Keep alerting on every cross"}
            </label>
          </div>

          {error && <div style={{ fontSize: 11.5, color: '#ffb4ab', marginBottom: 8 }}>{error}</div>}

          {/* Existing rules */}
          {alerts.length === 0 ? (
            <div style={{ fontSize: 12, color: FAINT, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
              {"No price alerts yet."}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 0 }}>
              {alerts.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: a.active ? TEXT : FAINT }}>
                      <span style={{ fontWeight: 700 }}>{symbolLabel(a.symbol)}</span>
                      <span style={{ color: MUTED }}> {a.condition === 'above' ? 'crosses above' : 'crosses below'} </span>
                      <span style={{ fontWeight: 700, color: a.active ? GOLD : FAINT }}>{a.threshold}</span>
                      {a.repeat === 'always' && <span style={{ ...badge, color: MUTED, border: `1px solid ${BORDER2}`, marginLeft: 6 }}>REPEAT</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>
                      {a.note ? `${a.note} · ` : ''}
                      {a.lastFiredAt ? `last fired ${firedAt(a.lastFiredAt)}` : a.active ? 'armed' : 'off'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                    <button onClick={() => void toggleActive(a)} style={{ ...ghostBtn, padding: '6px 10px', color: a.active ? GREEN : FAINT, borderColor: a.active ? GREEN : BORDER2 }}>
                      {a.active ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => void remove(a.id)} title="Delete" style={{ ...ghostBtn, padding: '6px 9px', color: '#ff9a9a' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '9px 15px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '9px 12px', borderRadius: 7, cursor: 'pointer' };
const badge: CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '0.6px', borderRadius: 4, padding: '2px 6px' };
const numInput: CSSProperties = { width: 64, background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT, fontSize: 12.5, padding: '5px 8px', outline: 'none', textAlign: 'center' };
const fieldLbl: CSSProperties = { display: 'block', fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, marginBottom: 4 };
const fieldInput: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 13, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' };
const warnBanner: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', marginBottom: 14 };
