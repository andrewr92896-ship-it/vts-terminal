import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { BreakEvenMode, BrokerConnection, DeskMember, DeskSettings } from '../../api/types';

// The "count trades since" cutoff maps to UTC midnight of the chosen day, so it
// means the same instant regardless of timezone. Blank clears it.
function dateToStartMs(v: string): number | null {
  if (!v) return null;
  const ms = Date.parse(v + 'T00:00:00.000Z');
  return Number.isNaN(ms) ? null : ms;
}
function startMsToDate(ms: number | null): string {
  return ms == null ? '' : new Date(ms).toISOString().slice(0, 10);
}

// The three ways the desk can measure its break-even buffer.
const MODES: { key: BreakEvenMode; label: string }[] = [
  { key: 'percent', label: 'Percent' },
  { key: 'dollars', label: 'Dollars' },
  { key: 'pips', label: 'Pips' },
];

// An in-progress per-instrument override row in the editor. `value` is the raw
// field text; it maps to the band's pct (percent mode) or amount (dollars/pips).
interface OverrideRow {
  instrument: string;
  mode: BreakEvenMode;
  value: string;
}

// A row with neither an instrument nor a value is ignored on save.
function rowBlank(r: OverrideRow): boolean {
  return r.instrument.trim() === '' && r.value.trim() === '';
}
// A row is savable when it names an instrument and holds a valid number for its
// mode (percent 0–100, dollars/pips ≥ 0).
function rowValid(r: OverrideRow): boolean {
  if (r.instrument.trim() === '') return false;
  const n = Number(r.value);
  if (r.value.trim() === '' || !Number.isFinite(n) || n < 0) return false;
  return r.mode !== 'percent' || n <= 100;
}
// The short unit shown after an override's value field.
function unitLabel(mode: BreakEvenMode): string {
  return mode === 'percent' ? '%' : mode === 'pips' ? 'pips' : '$';
}

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
  const { user } = useAuth();
  // Whose settings are being edited, and the roster the caller may switch
  // between. A desk lead (team leader / admin) sees their whole team here;
  // everyone else sees only themselves.
  const [members, setMembers] = useState<DeskMember[]>([]);
  const [targetId, setTargetId] = useState<string>('');
  const [mode, setMode] = useState<BreakEvenMode>('percent');
  const [bePct, setBePct] = useState('');
  const [beAmount, setBeAmount] = useState('');
  // The desk's "test trade" floor in units (blank/0 = keep every trade).
  const [minUnits, setMinUnits] = useState('');
  // Per-instrument overrides, held as edit rows (value is the string in the
  // field; which band number it maps to depends on the row's own mode).
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  // Instruments the desk has traded, offered in the per-instrument picker.
  const [instruments, setInstruments] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The caller's own broker connections, for the per-account "count trades since"
  // cutoff surfaced here (the discoverable home for it).
  const [conns, setConns] = useState<BrokerConnection[]>([]);

  // Populate the whole form from a settings payload (used on open, on switching
  // whose settings, and after a save).
  function applySettings(s: DeskSettings) {
    setMode(s.breakEvenMode);
    setBePct(String(s.breakEvenPct));
    setBeAmount(String(s.breakEvenAmount));
    setMinUnits(String(s.minTradeUnits));
    setOverrides(
      s.breakEvenOverrides.map((o) => ({
        instrument: o.instrument,
        mode: o.mode,
        value: o.mode === 'percent' ? String(o.pct) : String(o.amount),
      })),
    );
    setInstruments(s.instruments);
    if (s.editableMembers) setMembers(s.editableMembers);
    if (s.userId) setTargetId(s.userId);
  }

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
        applySettings(s);
        setLoaded(true);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Failed to load settings'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A desk lead switches whose settings they're editing; reloads that trader's
  // settings into the form.
  async function switchTarget(id: string) {
    if (id === targetId) return;
    setLoaded(false);
    setError(null);
    setSaved(false);
    try {
      applySettings(await api.deskSettings(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load settings');
    } finally {
      setLoaded(true);
    }
  }

  // Whether the form is showing the caller's own settings (vs a teammate's).
  const editingSelf = !targetId || targetId === user?.id;

  // The caller's own connections drive the per-account cutoff below. Only loaded
  // when editing your own settings — the cutoff is a per-connection setting on
  // your accounts, not part of a teammate's desk settings.
  useEffect(() => {
    if (!open || readOnly || !editingSelf) return;
    let alive = true;
    api
      .tradingConnections()
      .then((d) => alive && setConns(d.connections))
      .catch(() => {
        /* ignore — the cutoff section simply stays hidden */
      });
    return () => {
      alive = false;
    };
  }, [open, readOnly, editingSelf]);

  // Set/clear a connection's "count trades since" cutoff. Optimistic so the date
  // field updates instantly; reconciles from the server response.
  async function setCutoff(id: string, ms: number | null) {
    setConns((cs) => cs.map((c) => (c.id === id ? { ...c, historyStartAt: ms } : c)));
    setError(null);
    try {
      const r = await api.updateConnection(id, { historyStartAt: ms });
      setConns(r.connections);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the cutoff');
    }
  }

  if (!open) return null;

  // In 'percent' mode the value is a 0–100 percent; in 'dollars' / 'pips' it's a
  // non-negative amount. Only the field for the active mode has to be valid.
  const parsedPct = Number(bePct);
  const parsedAmount = Number(beAmount);
  const defaultValid =
    mode === 'percent'
      ? bePct.trim() !== '' && Number.isFinite(parsedPct) && parsedPct >= 0 && parsedPct <= 100
      : beAmount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount >= 0;
  // A blank row (no instrument, no value) is ignored on save; any row with
  // content must be fully valid before we allow a save.
  const overridesValid = overrides.every((r) => rowBlank(r) || rowValid(r));
  // The test-trade floor: blank reads as 0 (off); otherwise a non-negative number.
  const parsedMin = minUnits.trim() === '' ? 0 : Number(minUnits);
  const minValid = Number.isFinite(parsedMin) && parsedMin >= 0;
  const valid = defaultValid && overridesValid && minValid;

  // Instruments offered in the picker: the desk's traded instruments plus any
  // already sitting on an override row (so a saved one still shows even if it's
  // dropped off recent history), sorted. `availableToAdd` are the ones not yet
  // used by a row — the pool a new row can pick from.
  const knownInstruments = Array.from(
    new Set([...instruments, ...overrides.map((r) => r.instrument.trim().toUpperCase()).filter(Boolean)]),
  ).sort((a, b) => a.localeCompare(b));
  const chosen = new Set(overrides.map((r) => r.instrument.trim().toUpperCase()).filter(Boolean));
  const availableToAdd = knownInstruments.filter((x) => !chosen.has(x));

  function setRow(i: number, patch: Partial<OverrideRow>) {
    setOverrides((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }
  function addRow() {
    setOverrides((rows) => [...rows, { instrument: '', mode: 'pips', value: '' }]);
    setSaved(false);
  }
  function removeRow(i: number) {
    setOverrides((rows) => rows.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      // Send the default mode plus only the field it uses (the other value is
      // left as the desk last set it), and the full override list — which
      // replaces the stored set, so removals persist.
      const base: Partial<DeskSettings> =
        mode === 'percent' ? { breakEvenMode: mode, breakEvenPct: parsedPct } : { breakEvenMode: mode, breakEvenAmount: parsedAmount };
      const breakEvenOverrides = overrides
        .filter((r) => !rowBlank(r))
        .map((r) => {
          const n = Number(r.value);
          return r.mode === 'percent'
            ? { instrument: r.instrument.trim(), mode: r.mode, pct: n, amount: 0 }
            : { instrument: r.instrument.trim(), mode: r.mode, pct: 0, amount: n };
        });
      const s = await api.updateDeskSettings(
        { ...base, minTradeUnits: parsedMin, breakEvenOverrides },
        editingSelf ? undefined : targetId,
      );
      applySettings(s);
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
          top: isPhone ? 0 : 'calc(8 * var(--vh))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isPhone ? '100%' : 'min(520px, calc(94 * var(--vw)))',
          height: isPhone ? '100%' : 'auto',
          maxHeight: isPhone ? '100%' : 'calc(86 * var(--vh))',
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
          {/* Whose settings — a desk lead (team leader / admin) can pick a
              teammate and edit theirs. Hidden for everyone else, who only ever
              see their own. */}
          {members.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="desk-whose" style={{ ...sectionLabel, marginTop: 0, display: 'block', marginBottom: 6 }}>
                {"Whose settings"}
              </label>
              <select
                id="desk-whose"
                value={targetId}
                onChange={(e) => switchTarget(e.target.value)}
                disabled={busy}
                style={{ ...input, fontSize: 13, width: '100%', cursor: busy ? 'default' : 'pointer' }}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === user?.id ? `${m.name} (you)` : m.name}
                  </option>
                ))}
              </select>
              {!editingSelf && (
                <div style={{ fontSize: 11.5, color: GOLD, marginTop: 6 }}>
                  Editing {members.find((m) => m.id === targetId)?.name ?? 'a teammate'}'s desk settings.
                </div>
              )}
            </div>
          )}
          {!loaded && !error ? (
            <div style={{ color: MUTED, fontSize: 13 }}>{"Loading settings…"}</div>
          ) : (
            <div style={panel}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Break-even buffer</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.55 }}>
                A closed trade whose result stays inside this buffer — in either direction — counts as a{' '}
                <b style={{ color: GOLD }}>break-even</b> trade instead of a win or a loss. It applies to the Trade Log,
                and the Live Wall. The <b>default</b> below governs every instrument, and you
                can override it for a <b>specific instrument</b> underneath. Set <b>0</b> to turn a buffer off.
              </div>

              <div style={sectionLabel}>Default — every instrument without its own buffer</div>

              {/* Mode: percent of price move, a flat dollar amount, or pips. */}
              <div style={{ ...seg, marginTop: 10 }} role="tablist" aria-label="Break-even buffer unit">
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

              {/* Per-instrument overrides. Each row sets its own unit + size for
                  one instrument, overriding the default for that instrument only. */}
              <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 14 }}>
                <div style={sectionLabel}>Per-instrument buffers</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                  Override the default for a specific instrument. The instrument list is filled in
                  automatically from what your team has traded — just pick one, no typing.
                </div>

                {overrides.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {overrides.map((r, i) => {
                      const bad = !rowBlank(r) && !rowValid(r);
                      // Offer every known instrument except those chosen on other
                      // rows, so the same instrument can't be set twice.
                      const own = r.instrument.trim().toUpperCase();
                      const usedByOthers = new Set(
                        overrides.filter((_, idx) => idx !== i).map((x) => x.instrument.trim().toUpperCase()).filter(Boolean),
                      );
                      const opts = knownInstruments.filter((x) => x === own || !usedByOthers.has(x));
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <select
                            value={own}
                            onChange={(e) => setRow(i, { instrument: e.target.value })}
                            disabled={readOnly || busy}
                            aria-label="Override instrument"
                            style={{ ...input, fontSize: 13, flex: '1 1 120px', minWidth: 110, cursor: 'pointer', padding: '9px 8px', borderColor: bad ? '#8a4a52' : BORDER2 }}
                          >
                            <option value="">Instrument…</option>
                            {opts.map((x) => (
                              <option key={x} value={x}>{x}</option>
                            ))}
                          </select>
                          <select
                            value={r.mode}
                            onChange={(e) => setRow(i, { mode: e.target.value as BreakEvenMode })}
                            disabled={readOnly || busy}
                            aria-label="Override unit"
                            style={{ ...input, fontSize: 13, flex: '0 0 auto', cursor: 'pointer', padding: '9px 8px' }}
                          >
                            {MODES.map((m) => (
                              <option key={m.key} value={m.key}>{m.label}</option>
                            ))}
                          </select>
                          <input
                            value={r.value}
                            onChange={(e) => setRow(i, { value: e.target.value })}
                            disabled={readOnly || busy}
                            type="number"
                            step={r.mode === 'percent' ? '0.01' : r.mode === 'pips' ? '0.1' : '0.01'}
                            min="0"
                            max={r.mode === 'percent' ? '100' : undefined}
                            inputMode="decimal"
                            aria-label="Override value"
                            placeholder="0"
                            style={{ ...input, fontSize: 13, width: 72, borderColor: bad ? '#8a4a52' : BORDER2 }}
                          />
                          <span style={{ fontSize: 12, color: MUTED, fontFamily: "'IBM Plex Mono', monospace", width: 34 }}>{unitLabel(r.mode)}</span>
                          {!readOnly && (
                            <button onClick={() => removeRow(i)} disabled={busy} title="Remove override" aria-label="Remove override" style={removeBtn}>×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {knownInstruments.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: FAINT, marginTop: 12, lineHeight: 1.5 }}>
                    No instruments in your team's trade history yet — once a trade is logged, its instrument
                    appears here automatically.
                  </div>
                ) : (
                  !readOnly && (
                    <button
                      onClick={addRow}
                      disabled={busy || availableToAdd.length === 0}
                      title={availableToAdd.length === 0 ? 'Every traded instrument already has a buffer' : undefined}
                      style={{ ...addBtn, marginTop: overrides.length > 0 ? 10 : 12, opacity: availableToAdd.length === 0 ? 0.5 : 1 }}
                    >
                      + Add instrument
                    </button>
                  )
                )}
              </div>

              {/* Test-trade floor: broker fills under N units drop out of the
                  Trade Log entirely (stats and list). */}
              <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 14 }}>
                <div style={sectionLabel}>{"Ignore test trades"}</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                  Broker fills smaller than this many <b>units</b> are treated as test trades and left out of the
                  Trade Log — stats <i>and</i> the list. Handy for the 1-unit orders you place to check a
                  broker connection. Set <b>0</b> to keep every trade.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <input
                    value={minUnits}
                    onChange={(e) => {
                      setMinUnits(e.target.value);
                      setSaved(false);
                    }}
                    disabled={readOnly || busy}
                    type="number"
                    step="1"
                    min="0"
                    inputMode="numeric"
                    aria-label="Minimum trade size in units"
                    style={{ ...input, width: 130, opacity: readOnly ? 0.6 : 1 }}
                  />
                  <span style={{ fontSize: 15, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>units minimum</span>
                </div>
                <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>
                  e.g. <b>100</b> hides 1-unit connection tests while keeping real positions. Only broker-imported
                  fills are affected; trades you log by hand always count.
                </div>
              </div>

              {/* Per-account "count trades since" cutoff — the discoverable home
                  for it, right where a trader looks for metric settings. */}
              {!readOnly && editingSelf && conns.filter((c) => c.broker !== 'manual').length > 0 && (
                <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 14 }}>
                  <div style={sectionLabel}>{"Count trades since (per account)"}</div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                    Pick the date your real trading on each broker account began. Trades opened before it are left
                    out of your Trade Log — and never re-imported. Blank counts everything.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {conns.filter((c) => c.broker !== 'manual').map((c) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, color: TEXT, flex: '1 1 120px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.label} <span style={{ color: FAINT, fontSize: 10.5 }}>· {c.broker}</span>
                        </span>
                        <input
                          type="date"
                          value={startMsToDate(c.historyStartAt)}
                          onChange={(e) => setCutoff(c.id, dateToStartMs(e.target.value))}
                          disabled={busy}
                          aria-label={`Count trades since, ${c.label}`}
                          style={{ ...input, fontSize: 13, width: 150 }}
                        />
                        {c.historyStartAt != null && (
                          <button onClick={() => setCutoff(c.id, null)} disabled={busy} style={addBtn}>Clear</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
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
const sectionLabel: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED, marginTop: 16 };
const addBtn: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const removeBtn: CSSProperties = { flex: '0 0 auto', background: 'none', border: `1px solid ${BORDER2}`, color: '#8fa0c8', fontSize: 16, lineHeight: 1, padding: '3px 9px', borderRadius: 6, cursor: 'pointer' };
