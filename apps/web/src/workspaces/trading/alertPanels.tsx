import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { SYMBOL_SUGGESTIONS, symbolLabel } from './tvChart';
import { zoneFmt } from '../../lib/timezone';
import { LevelPicker } from '../../components/NotificationSettings';
import {
  OPEN_KINDS,
  OPEN_KIND_LABELS,
} from '../../api/types';
import type {
  PriceAlert,
  PriceAlertCondition,
  PriceAlertRepeat,
  RolloverEvent,
  RolloverEventPlan,
  RolloverPlan,
  SessionAlertPrefs,
  SessionAlertRecipient,
} from '../../api/types';

// The two alert SETTINGS panels. They lived on the Trading Alerts screen, which
// was removed outright (owner instruction, 2026-08) — but neither of them is a
// TradingView alert, and each was the only way to reach a real feature. They
// spent a while apart afterwards (sessions on Strategy Sessions, price alerts in
// My Terminal ▸ Settings) and now sit together again on **Advanced Trading ▸
// Alert Settings**, which is the one home for every alert control.
//
//  - `SessionAlertSettings` is the only control for the session open / close /
//    pre-open notifications the server fires. Behind `alertSettings` (Premium)
//    on that screen, matching Strategy Sessions itself.
//  - `PriceAlertSettings` is price alerts, which are INCLUDED WITH EVERY
//    ACCOUNT and are deliberately rendered OUTSIDE the paid block — an alert
//    nobody can be told about is not an alert.
//
// Each draws its own collapsible header, so the host screen adds no label above
// them. They stay in their own module rather than in the screen because they are
// self-contained panels with their own fetches.

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
  const [people, setPeople] = useState<SessionAlertRecipient[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.sessionAlertPrefs()
      .then((r) => { if (!alive) return; setPrefs(r.prefs); setPeople(r.recipients); })
      .catch(() => { if (alive) setPrefs({ notifyOpen: false, notifyClose: false, notifyPreOpen: false, preOpenLeadMin: 30 }); });
    return () => { alive = false; };
  }, []);

  // `recipientIds` is sent only when the picker is what changed. Absent leaves
  // the stored list alone, which is what stops a toggle save quietly un-copying
  // everybody — and an empty ARRAY is the explicit "just me".
  async function persist(next: SessionAlertPrefs, recipientIds?: string[]) {
    setPrefs(next);
    setStatus('saving');
    try {
      const r = await api.saveSessionAlertPrefs(next, recipientIds);
      setPrefs(r.prefs);
      setPeople(r.recipients);
      setStatus('saved');
      window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch {
      setStatus('error');
    }
  }

  function toggleRecipient(id: string) {
    if (!prefs) return;
    const next = people.map((p) => (p.id === id ? { ...p, on: !p.on } : p));
    setPeople(next);
    void persist(prefs, next.filter((p) => p.on).map((p) => p.id));
  }

  if (!prefs) return null;

  const anyOn = prefs.notifyOpen || prefs.notifyClose || prefs.notifyPreOpen;
  const lead = prefs.preOpenLeadMin;

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
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

          {/* WHO GETS THEM. Your own sessions always alert you — you are the
              baseline rather than an entry — so this list is only ever "who
              else", which is what stops unticking everybody meaning "silence my
              own sessions". */}
          {people.length > 0 && (
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 12.5, color: TEXT, fontWeight: 600, marginBottom: 2 }}>
                Also send these to
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>
                You always get your own. Everyone in your group is listed here.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {people.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleRecipient(p.id)}
                    // Somebody who has switched group notifications off is shown
                    // and still selectable — it is their own setting to undo,
                    // and hiding them would make "why does Dale never get these"
                    // unanswerable from this screen.
                    title={p.optedOut ? 'They have group notifications switched off, so this will not reach them.' : undefined}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: p.on ? GREEN : MUTED,
                      background: p.on ? 'rgba(53,196,123,.12)' : 'rgba(0,0,0,.18)',
                      border: `1px solid ${p.on ? 'rgba(53,196,123,.4)' : BORDER}`,
                      padding: '7px 11px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      opacity: p.optedOut ? 0.6 : 1,
                    }}
                  >
                    {p.on ? '✓ ' : ''}
                    {p.name}
                    {p.optedOut ? ' · off' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

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

// ---------------------------------------------------------------------------
// Rollover close
// ---------------------------------------------------------------------------

// The three timed alerts around the 5pm ET rollover, for a trader who cannot
// hold a funded position through it.
//
// **Rendered in TWO places from this one component** — here on Alert Settings,
// where every alert opt-in reads in one list, and on Strategy Sessions, which is
// where a plan for the trading day belongs and where the owner asked for it.
// The same arrangement GroupAlertSender already uses, and for the same reason:
// two copies of a control with one route behind it drift within a month, and
// whichever one somebody happens to open is the one that looks broken.
//
// Nothing here picks weekdays, deliberately. An alert set to need a trade open
// is silent on a flat day — or a weekend — on its own, so a day picker would be
// a second switch for a job that gate already does.
//
// **The gate is two questions and they are asked separately**: which kinds of
// open trade count (once, for the whole plan) and whether each event needs one
// (per event). The defaults are exactly what was hard-coded before either was a
// setting — funded trades only, evaluate and close gated, the recheck not — so
// a plan that predates this reads and behaves identically.
const ROLLOVER_ROWS: { key: RolloverEvent; label: string; note: string }[] = [
  { key: 'evaluate', label: 'Evaluate', note: 'Decide what comes off' },
  { key: 'close', label: 'Close', note: 'Close it before rollover' },
  { key: 'recheck', label: 'Back in?', note: 'Rollover has passed' },
];

export function RolloverAlertSettings() {
  const [plan, setPlan] = useState<RolloverPlan | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const [openLevel, setOpenLevel] = useState<RolloverEvent | null>(null);

  useEffect(() => {
    let alive = true;
    api.rolloverPlan()
      .then((r) => { if (alive) setPlan(r.plan); })
      .catch(() => { if (alive) setPlan(null); });
    return () => { alive = false; };
  }, []);

  // Saves send only the part that changed. The server merges onto what is
  // stored, so a stale cached bundle can never blank an event it does not know
  // about — and the panel shows the change at once rather than after the round
  // trip, because a toggle that lags reads as one that did not register.
  async function persist(next: RolloverPlan, patch: Parameters<typeof api.saveRolloverPlan>[0]) {
    setPlan(next);
    setStatus('saving');
    try {
      const r = await api.saveRolloverPlan(patch);
      setPlan(r.plan);
      setStatus('saved');
      window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch {
      setStatus('error');
    }
  }

  function patchEvent(key: RolloverEvent, change: Partial<RolloverEventPlan>) {
    if (!plan) return;
    const next = { ...plan, [key]: { ...plan[key], ...change } };
    void persist(next, { [key]: change });
  }

  if (!plan) return null;

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', color: TEXT, cursor: 'pointer', padding: '13px 16px', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{'\u{1F504}'} Rollover close</span>
          {plan.enabled && <span style={{ ...badge, color: GREEN, border: `1px solid ${GREEN}` }}>ON</span>}
        </div>
        <span style={{ fontSize: 12, color: FAINT }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <ToggleRow
            label={'Alert me around rollover'}
            on={plan.enabled}
            onChange={(v) => void persist({ ...plan, enabled: v }, { enabled: v })}
          />
          <p style={{ fontSize: 11.5, color: MUTED, margin: '8px 0 4px', lineHeight: 1.5 }}>
            {'An alert marked “only while open” stays quiet on a day you are flat. Back in? also fires when a funded trade closed today.'}
          </p>

          {/* WHICH TRADES COUNT. One answer for the whole plan rather than one
              per event: "what am I asking about" is a single question, and
              three copies of it would be three things to keep in step.

              The last kind cannot be unticked — an empty list would mean no
              trade could ever satisfy the gate, which is a routine that reads as
              switched on and never fires. The server refuses it too. */}
          {plan.enabled && (
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, marginTop: 6 }}>
              <div style={{ fontSize: 12.5, color: TEXT, fontWeight: 600, marginBottom: 6 }}>
                Which open trades count
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {OPEN_KINDS.map((k) => {
                  const on = plan.openKinds.includes(k);
                  const last = on && plan.openKinds.length === 1;
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        if (last) return;
                        const next = on ? plan.openKinds.filter((x) => x !== k) : [...plan.openKinds, k];
                        void persist({ ...plan, openKinds: next }, { openKinds: next });
                      }}
                      title={last ? 'Keep at least one — otherwise nothing could ever set these alerts off.' : undefined}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: on ? GOLD : MUTED,
                        background: on ? 'rgba(235,203,116,.1)' : 'rgba(0,0,0,.18)',
                        border: `1px solid ${on ? 'rgba(235,203,116,.35)' : BORDER}`,
                        padding: '7px 11px',
                        borderRadius: 999,
                        cursor: last ? 'default' : 'pointer',
                        opacity: last ? 0.8 : 1,
                      }}
                    >
                      {on ? '✓ ' : ''}
                      {OPEN_KIND_LABELS[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {plan.enabled &&
            ROLLOVER_ROWS.map((row) => {
              const ev = plan[row.key];
              return (
                <div key={row.key} style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 0 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <MiniSwitch on={ev.on} onChange={(v) => patchEvent(row.key, { on: v })} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{row.label}</div>
                        <div style={{ fontSize: 10.5, color: FAINT }}>{row.note}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="time"
                        value={ev.at}
                        disabled={!ev.on}
                        onChange={(e) => e.target.value && patchEvent(row.key, { at: e.target.value })}
                        style={{ ...fieldInput, padding: '6px 8px', fontSize: 12.5, opacity: ev.on ? 1 : 0.45, colorScheme: 'dark' }}
                      />
                      <span style={{ fontSize: 10.5, color: FAINT }}>ET</span>
                      <button
                        onClick={() => setOpenLevel((k) => (k === row.key ? null : row.key))}
                        disabled={!ev.on}
                        style={{ ...ghostBtn, padding: '6px 10px', opacity: ev.on ? 1 : 0.45, textTransform: 'capitalize' }}
                      >
                        {ev.level}
                      </button>
                    </div>
                  </div>
                  {/* WHETHER THIS EVENT NEEDS A TRADE OPEN. Off makes it a
                      plain reminder at its time — the ask this switch exists
                      for — and on is what keeps a flat day silent. */}
                  {ev.on && (
                    <button
                      onClick={() => patchEvent(row.key, { requireOpen: !ev.requireOpen })}
                      style={{
                        marginTop: 6,
                        marginLeft: 46,
                        fontSize: 11,
                        fontWeight: 600,
                        color: ev.requireOpen ? GREEN : FAINT,
                        background: ev.requireOpen ? 'rgba(53,196,123,.1)' : 'rgba(0,0,0,.18)',
                        border: `1px solid ${ev.requireOpen ? 'rgba(53,196,123,.3)' : BORDER}`,
                        padding: '5px 9px',
                        borderRadius: 999,
                        cursor: 'pointer',
                      }}
                    >
                      {ev.requireOpen ? '✓ Only while a trade is open' : 'Fires whether or not anything is open'}
                    </button>
                  )}
                  {openLevel === row.key && ev.on && (
                    <LevelPicker value={ev.level} onChange={(v) => patchEvent(row.key, { level: v })} />
                  )}
                </div>
              );
            })}

          <div style={{ fontSize: 11, color: status === 'error' ? '#ffb4ab' : FAINT, marginTop: 8, minHeight: 14 }}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save — try again.' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// The compact form of the switch ToggleRow draws, for a row that already
// carries a time and a level beside it.
function MiniSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        border: `1px solid ${on ? GREEN : BORDER2}`,
        background: on ? 'rgba(53,196,123,.25)' : INPUT_BG,
        position: 'relative',
        cursor: 'pointer',
        flex: '0 0 auto',
      }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: on ? GREEN : FAINT, transition: 'left .15s ease' }} />
    </button>
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
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
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
