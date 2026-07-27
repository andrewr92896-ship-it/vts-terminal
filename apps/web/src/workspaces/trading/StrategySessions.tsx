import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { ScreenTitle } from './ScreenTitle';
import type {
  DayWindow,
  SessionBias,
  SessionInput,
  SessionStatus,
  StrategySession,
  Weekday,
  WeekSchedule,
} from '../../api/types';

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

const REFRESH_MS = 60_000;

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DEFAULT_WINDOW: DayWindow = { open: '09:30', close: '11:00' };

// A day's hours as a compact label: "24h" for a full day, else "HH:MM–HH:MM".
function windowLabel(w: DayWindow): string {
  return w.allDay ? '24h' : `${w.open}–${w.close}`;
}
function hoursWithEt(hours: string): string {
  return hours === '24h' ? '24h' : `${hours} ET`;
}

const STATUS: Record<SessionStatus, { label: string; color: string }> = {
  active: { label: 'Active now', color: GREEN },
  opening: { label: 'Opening soon', color: AMBER },
  idle: { label: 'Idle', color: FAINT },
};
const BIAS: Record<SessionBias, { label: string; color: string }> = {
  bull: { label: 'Bull', color: GREEN },
  bear: { label: 'Bear', color: RED },
  both: { label: 'Two-way', color: GOLD },
};

function fmtMins(m: number | null): string {
  if (m == null) return '';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Render an enabled-day list as a compact label, collapsing a contiguous run
// into a range (e.g. Mon–Fri) and otherwise listing them (Mon, Wed, Fri).
function daysLabel(days: Weekday[]): string {
  if (days.length === 0) return '';
  const idx = days.map((d) => WEEKDAYS.indexOf(d)).sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && idx.length > 2) return `${DAY_LABEL[WEEKDAYS[idx[0]]]}–${DAY_LABEL[WEEKDAYS[idx[idx.length - 1]]]}`;
  return idx.map((i) => DAY_LABEL[WEEKDAYS[i]]).join(', ');
}

// Summarize a week schedule: one line if every enabled day shares a window, else
// a per-day breakdown.
function describeSchedule(days: WeekSchedule):
  | { uniform: true; label: string; hours: string }
  | { uniform: false; items: { day: Weekday; hours: string }[] }
  | null {
  const enabled = WEEKDAYS.filter((d) => days[d]) as Weekday[];
  if (enabled.length === 0) return null;
  const firstHours = windowLabel(days[enabled[0]]!);
  const allSame = enabled.every((d) => windowLabel(days[d]!) === firstHours);
  if (allSame) return { uniform: true, label: daysLabel(enabled), hours: firstHours };
  return { uniform: false, items: enabled.map((d) => ({ day: d, hours: windowLabel(days[d]!) })) };
}

export function StrategySessions() {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [sessions, setSessions] = useState<StrategySession[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    try { setSessions((await api.tradingSessions()).sessions); setErr(null); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
  }
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(p: Promise<{ sessions: StrategySession[] }>) {
    setBusy(true);
    try { setSessions((await p).sessions); setErr(null); return true; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }

  if (err && !sessions) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!sessions) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>{"Loading sessions…"}</div>;

  const groups: SessionStatus[] = ['active', 'opening', 'idle'];

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <ScreenTitle>Strategy Sessions</ScreenTitle>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>{"Your trading windows (Eastern Time) per instrument — pick the days and hours, or fill them from the market's full open hours."}</div>
        </div>
        {!readOnly && <button onClick={() => setAdding((v) => !v)} style={goldBtn}>{adding ? "Close" : "+ New session"}</button>}
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {adding && (
        <SessionForm busy={busy} submitLabel="Add session" onSubmit={async (input) => { if (await run(api.addSession(input))) setAdding(false); }} onCancel={() => setAdding(false)} />
      )}

      {sessions.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          {"No sessions yet. Add one (e.g. “London Open”) — choose the days and hours, or let VTS AI fill the instrument's full market hours."}
        </div>
      ) : (
        groups.map((g) => {
          const list = sessions.filter((s) => s.status === g);
          if (list.length === 0) return null;
          return (
            <div key={g} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 10px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[g].color }} />
                <span style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>{STATUS[g].label}</span>
                <span style={{ fontSize: 11, color: FAINT }}>· {list.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill,minmax(330px,1fr))', gap: 13 }}>
                {list.map((s) => (
                  <SessionCard key={s.id} s={s} busy={busy} readOnly={readOnly}
                    onSave={(patch) => run(api.updateSession(s.id, patch))}
                    onRemove={() => run(api.removeSession(s.id))} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function SessionCard({ s, busy, readOnly, onSave, onRemove }: { s: StrategySession; busy: boolean; readOnly: boolean; onSave: (p: SessionInput) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <div style={{ gridColumn: '1 / -1' }}><SessionForm busy={busy} initial={s} submitLabel="Save" onSubmit={(p) => { onSave(p); setEditing(false); }} onCancel={() => setEditing(false)} /></div>;
  }
  const st = STATUS[s.status];
  const b = BIAS[s.bias];
  const sched = describeSchedule(s.days);
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', borderTop: `2px solid ${st.color}`, opacity: s.active ? 1 : 0.6 }}>
      <div style={{ padding: '12px 15px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{s.name}</span>
          {s.instrument && <span style={tag}>{s.instrument}</span>}
        </div>
        <span style={{ ...pill, color: st.color, border: `1px solid ${st.color}` }}>
          {st.label}{s.status !== 'active' && s.minsToOpen != null ? ` · ${fmtMins(s.minsToOpen)}` : ''}
        </span>
      </div>

      {/* Schedule */}
      <div style={{ padding: '0 15px 10px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, color: MUTED }}>
        {sched == null ? (
          <span style={{ color: FAINT }}>{"No days set"}</span>
        ) : sched.uniform ? (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: TEXT }}>
            {sched.label} · {hoursWithEt(sched.hours)}
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sched.items.map((it) => (
              <span key={it.day} style={{ ...metaChip, fontFamily: "'IBM Plex Mono', monospace", color: TEXT }}>
                {DAY_LABEL[it.day]} {it.hours}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...metaChip, color: b.color, borderColor: b.color }}>{b.label}</span>
          {s.marketHours && <span style={{ ...metaChip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{"Market hours"}</span>}
          {!s.active && <span style={{ ...metaChip, color: FAINT }}>paused</span>}
        </div>
      </div>

      {s.notes && <div style={{ padding: '8px 15px', fontSize: 11, color: '#8fa3cc', borderTop: `1px solid ${BORDER}` }}>{s.notes}</div>}

      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, padding: '9px 15px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
          <button onClick={() => !busy && onSave({ active: !s.active })} style={smallBtn}>{s.active ? 'Pause' : 'Resume'}</button>
          <button onClick={() => setEditing(true)} style={smallBtn}>Edit</button>
          <button onClick={() => !busy && onRemove()} title="Remove" style={{ ...smallBtn, marginLeft: 'auto', color: '#ff9a9a', borderColor: 'transparent' }}>×</button>
        </div>
      )}
    </div>
  );
}

type DaysState = Record<Weekday, DayWindow | null>;

const EMPTY_DAYS: DaysState = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

function initialDays(initial?: StrategySession): DaysState {
  const out: DaysState = { ...EMPTY_DAYS };
  const src = initial?.days;
  if (src && WEEKDAYS.some((d) => src[d])) {
    for (const d of WEEKDAYS) out[d] = src[d] ? { ...src[d]! } : null;
    return out;
  }
  // New session: default the standard Mon–Fri window so the form is ready to go.
  if (!initial) for (const d of WEEKDAYS) out[d] = { ...DEFAULT_WINDOW };
  return out;
}

function SessionForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial?: StrategySession; busy: boolean; submitLabel: string; onSubmit: (input: SessionInput) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [instrument, setInstrument] = useState(initial?.instrument ?? '');
  const [bias, setBias] = useState<SessionBias>(initial?.bias ?? 'both');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [days, setDays] = useState<DaysState>(() => initialDays(initial));
  const [marketHours, setMarketHours] = useState(initial?.marketHours ?? false);
  const [mhBusy, setMhBusy] = useState(false);
  const [mhErr, setMhErr] = useState<string | null>(null);
  const [mhNote, setMhNote] = useState<string | null>(null);

  const enabledDays = WEEKDAYS.filter((d) => days[d]);

  function toggleDay(day: Weekday) {
    setMarketHours(false);
    setMhNote(null);
    setDays((prev) => {
      if (prev[day]) return { ...prev, [day]: null };
      // Enabling: copy the first already-enabled day's window (easy "same as
      // Monday"), else the standard default.
      const seed = WEEKDAYS.map((d) => prev[d]).find(Boolean) ?? DEFAULT_WINDOW;
      return { ...prev, [day]: { ...seed } };
    });
  }

  function setDayTime(day: Weekday, field: 'open' | 'close', value: string) {
    setMarketHours(false);
    setMhNote(null);
    setDays((prev) => (prev[day] ? { ...prev, [day]: { ...prev[day]!, [field]: value } } : prev));
  }

  function setDayAllDay(day: Weekday, allDay: boolean) {
    setMarketHours(false);
    setMhNote(null);
    setDays((prev) => (prev[day] ? { ...prev, [day]: { ...prev[day]!, allDay } } : prev));
  }

  // Enable every day at 24 hours — the "trade it 24/7" shortcut.
  function setAll24_7() {
    setMarketHours(false);
    setMhNote(null);
    const next = { ...EMPTY_DAYS };
    for (const d of WEEKDAYS) next[d] = { open: '00:00', close: '00:00', allDay: true };
    setDays(next);
  }

  async function fillMarketHours() {
    const sym = instrument.trim();
    if (!sym) { setMhErr('Enter an instrument first (e.g. EUR/USD, SPY, BTC).'); return; }
    setMhBusy(true);
    setMhErr(null);
    setMhNote(null);
    try {
      const res = await api.marketHours(sym);
      const next: DaysState = { ...EMPTY_DAYS };
      for (const d of res.days) next[d.day] = { open: d.open, close: d.close };
      setDays(next);
      setMarketHours(true);
      setMhNote(res.note || 'Filled from full market hours.');
    } catch (e) {
      setMhErr(e instanceof ApiError ? e.message : 'Could not fetch market hours.');
    } finally {
      setMhBusy(false);
    }
  }

  function submit() {
    if (!name.trim() || enabledDays.length === 0) return;
    const schedule: WeekSchedule = {};
    for (const d of enabledDays) schedule[d] = days[d]!;
    onSubmit({
      name: name.trim(),
      instrument: instrument.trim() || null,
      days: schedule,
      marketHours,
      bias,
      notes: notes.trim() || null,
    });
  }

  const canSubmit = !!name.trim() && enabledDays.length > 0;

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{initial ? "Edit session" : "New session"}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. London Open)" style={{ ...input, flex: '1 1 180px' }} />
        <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument (e.g. EUR/USD)" style={{ ...input, flex: '1 1 150px' }} />
        <select value={bias} onChange={(e) => setBias(e.target.value as SessionBias)} style={{ ...input, flex: '0 0 130px' }}>
          <option value="bull">Bull</option>
          <option value="bear">Bear</option>
          <option value="both">Two-way</option>
        </select>
      </div>

      {/* Day selector + per-day time windows */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{"Trading days"}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={setAll24_7} style={ghostBtn}>{"24/7"}</button>
            <button type="button" onClick={() => void fillMarketHours()} disabled={mhBusy} style={{ ...ghostBtn, color: GOLD, borderColor: 'rgba(235,203,116,.5)', opacity: mhBusy ? 0.6 : 1 }}>
              {mhBusy ? "Reading market hours…" : "All open market hours"}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {WEEKDAYS.map((d) => {
            const on = !!days[d];
            return (
              <button key={d} type="button" onClick={() => toggleDay(d)} style={{ ...dayBtn, ...(on ? dayBtnOn : {}) }}>
                {DAY_LABEL[d]}
              </button>
            );
          })}
        </div>
        {mhErr && <div style={{ ...miniBanner, marginTop: 8 }}>{mhErr}</div>}
        {mhNote && <div style={{ marginTop: 8, fontSize: 11, color: GOLD }}>{mhNote}</div>}

        {enabledDays.length === 0 ? (
          <div style={{ marginTop: 10, fontSize: 11.5, color: FAINT }}>
            {"Pick one or more days to set their hours, or tap “All open market hours”."}
          </div>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {enabledDays.map((d) => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ width: 36, fontSize: 12, color: TEXT, fontWeight: 600 }}>{DAY_LABEL[d]}</span>
                <label style={{ ...timeLbl, color: days[d]!.allDay ? GOLD : MUTED }}>
                  <input type="checkbox" checked={!!days[d]!.allDay} onChange={(e) => setDayAllDay(d, e.target.checked)} style={{ accentColor: GOLD }} />
                  {"24 hours"}
                </label>
                {!days[d]!.allDay && (
                  <>
                    <label style={timeLbl}>{"Open"}<input value={days[d]!.open} onChange={(e) => setDayTime(d, 'open', e.target.value)} type="time" style={{ ...input, width: 120 }} /></label>
                    <label style={timeLbl}>{"Close"}<input value={days[d]!.close} onChange={(e) => setDayTime(d, 'close', e.target.value)} type="time" style={{ ...input, width: 120 }} /></label>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !canSubmit} style={{ ...goldBtn, opacity: busy || !canSubmit ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>{"Cancel"}</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const timeLbl: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED };
const dayBtn: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, color: MUTED, fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', minWidth: 52 };
const dayBtnOn: CSSProperties = { background: 'rgba(235,203,116,.16)', border: `1px solid ${GOLD}`, color: GOLD };
const tag: CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 7px' };
const metaChip: CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 8px' };
const pill: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', borderRadius: 5, padding: '2px 7px', fontFamily: "'IBM Plex Mono', monospace" };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const smallBtn: CSSProperties = { background: 'none', border: `1px solid ${BORDER2}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
const miniBanner: CSSProperties = { fontSize: 11.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 7, padding: '7px 10px' };
