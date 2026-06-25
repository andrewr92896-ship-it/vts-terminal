import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { SessionBias, SessionInput, SessionStatus, StrategyScheduleItem, StrategySession } from '../../api/types';

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

const STATUS: Record<SessionStatus, { label: string; color: string }> = {
  active: { label: 'Active now', color: GREEN },
  opening: { label: 'Opening soon', color: AMBER },
  idle: { label: 'Idle', color: FAINT },
};
const BIAS: Record<SessionBias, { label: string; color: string }> = {
  bull: { label: 'Bull', color: GREEN },
  bear: { label: 'Bear', color: RED },
  both: { label: 'Two-way', color: GOLD },
  neutral: { label: 'Neutral', color: MUTED },
};

function fmtMins(m: number | null): string {
  if (m == null) return '';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function StrategySessions() {
  const { isPhone } = useResponsive();
  const [sessions, setSessions] = useState<StrategySession[] | null>(null);
  const [schedule, setSchedule] = useState<StrategyScheduleItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const [s, sched] = await Promise.all([api.tradingSessions(), api.strategySchedule()]);
      setSessions(s.sessions);
      setSchedule(sched.strategies);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load');
    }
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
  if (!sessions) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading sessions…</div>;

  const groups: SessionStatus[] = ['active', 'opening', 'idle'];

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Strategy Sessions</h2>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
          When each strategy can fire — fill hours in Eastern Time, derived from your Pine scripts. Times are when a trade actually opens.
        </div>
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {/* Strategy schedule — derived from the Pine (read-only) */}
      <ScheduleSection schedule={schedule ?? []} isPhone={isPhone} />

      {/* Custom sessions — your own editable windows */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>Custom sessions</h3>
        <button onClick={() => setAdding((v) => !v)} style={goldBtn}>{adding ? 'Close' : '+ New session'}</button>
      </div>

      {adding && (
        <SessionForm busy={busy} submitLabel="Add session" onSubmit={async (input) => { if (await run(api.addSession(input))) setAdding(false); }} onCancel={() => setAdding(false)} />
      )}

      {sessions.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          No sessions yet. Add one (e.g. “London Open”, 03:00–05:00) with your bull and bear plans.
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
                  <SessionCard key={s.id} s={s} busy={busy}
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

function ScheduleSection({ schedule, isPhone }: { schedule: StrategyScheduleItem[]; isPhone: boolean }) {
  if (schedule.length === 0) return null;
  const groups: SessionStatus[] = ['active', 'opening', 'idle'];
  return (
    <>
      {groups.map((g) => {
        const list = schedule.filter((s) => s.status === g);
        if (list.length === 0) return null;
        return (
          <div key={g} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 10px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[g].color }} />
              <span style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>{STATUS[g].label}</span>
              <span style={{ fontSize: 11, color: FAINT }}>· {list.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill,minmax(340px,1fr))', gap: 13 }}>
              {list.map((s) => <ScheduleCard key={s.name} s={s} />)}
            </div>
          </div>
        );
      })}
    </>
  );
}

function ScheduleCard({ s }: { s: StrategyScheduleItem }) {
  const st = STATUS[s.status];
  const b = BIAS[s.bias];
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', borderTop: `2px solid ${st.color}` }}>
      <div style={{ padding: '12px 15px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{s.name}</span>
          <span style={tag}>{s.instrument}</span>
          <span style={metaChip}>{s.timeframe}</span>
          <span style={{ ...metaChip, color: b.color, borderColor: b.color }}>{b.label}</span>
        </div>
        <span style={{ ...pill, color: st.color, border: `1px solid ${st.color}` }}>
          {st.label}{s.status !== 'active' && s.nextOpenMins != null ? ` · ${fmtMins(s.nextOpenMins)}` : ''}
        </span>
      </div>
      {s.status !== 'active' && s.nextOpenLabel && (
        <div style={{ padding: '0 15px 8px', fontSize: 11.5, color: MUTED }}>
          Next open <b style={{ color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{s.nextOpenLabel}</b>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 15px 12px' }}>
        {s.windows.map((w, i) => (
          <span key={i} style={{ ...winChip, borderColor: w.active ? GREEN : BORDER2, color: w.active ? '#fff' : MUTED }}>
            <span style={{ color: w.bias === 'bull' ? GREEN : RED, fontWeight: 700 }}>{w.bias === 'bull' ? '▲' : '▼'}</span>{' '}
            {w.days.join('/')} {w.time}
            {w.signal ? <span style={{ color: FAINT }}> · {w.signal}</span> : null}
          </span>
        ))}
      </div>
      <div style={{ padding: '8px 15px', fontSize: 11, color: '#8fa3cc', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
        <span style={{ color: FAINT, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.5px', marginRight: 6 }}>Blocked</span>{s.blocked}
      </div>
    </div>
  );
}

function SessionCard({ s, busy, onSave, onRemove }: { s: StrategySession; busy: boolean; onSave: (p: SessionInput) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <div style={{ gridColumn: '1 / -1' }}><SessionForm busy={busy} initial={s} submitLabel="Save" onSubmit={(p) => { onSave(p); setEditing(false); }} onCancel={() => setEditing(false)} /></div>;
  }
  const st = STATUS[s.status];
  const b = BIAS[s.bias];
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
      <div style={{ display: 'flex', gap: 12, padding: '0 15px 10px', flexWrap: 'wrap', fontSize: 11.5, color: MUTED }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: TEXT }}>{s.openTime}–{s.closeTime} ET</span>
        {s.timeframe && <span style={metaChip}>{s.timeframe}</span>}
        <span style={{ ...metaChip, color: b.color, borderColor: b.color }}>{b.label}</span>
        {!s.active && <span style={{ ...metaChip, color: FAINT }}>paused</span>}
      </div>

      {(s.bullPlan || s.bearPlan) && (
        <div style={{ display: 'flex', gap: 1, borderTop: `1px solid ${BORDER}` }}>
          <Plan label="Bull" color={GREEN} text={s.bullPlan} />
          <Plan label="Bear" color={RED} text={s.bearPlan} />
        </div>
      )}
      {s.notes && <div style={{ padding: '8px 15px', fontSize: 11, color: '#8fa3cc', borderTop: `1px solid ${BORDER}` }}>{s.notes}</div>}

      <div style={{ display: 'flex', gap: 6, padding: '9px 15px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
        <button onClick={() => !busy && onSave({ active: !s.active })} style={smallBtn}>{s.active ? 'Pause' : 'Resume'}</button>
        <button onClick={() => setEditing(true)} style={smallBtn}>Edit</button>
        <button onClick={() => !busy && onRemove()} title="Remove" style={{ ...smallBtn, marginLeft: 'auto', color: '#ff9a9a', borderColor: 'transparent' }}>×</button>
      </div>
    </div>
  );
}

function Plan({ label, color, text }: { label: string; color: string; text: string | null }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '10px 14px' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color, marginBottom: 4 }}>{label} plan</div>
      <div style={{ fontSize: 12, color: text ? TEXT : FAINT, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text || '—'}</div>
    </div>
  );
}

function SessionForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial?: StrategySession; busy: boolean; submitLabel: string; onSubmit: (input: SessionInput) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [instrument, setInstrument] = useState(initial?.instrument ?? '');
  const [openTime, setOpenTime] = useState(initial?.openTime ?? '09:30');
  const [closeTime, setCloseTime] = useState(initial?.closeTime ?? '11:00');
  const [timeframe, setTimeframe] = useState(initial?.timeframe ?? '');
  const [bias, setBias] = useState<SessionBias>(initial?.bias ?? 'neutral');
  const [bullPlan, setBullPlan] = useState(initial?.bullPlan ?? '');
  const [bearPlan, setBearPlan] = useState(initial?.bearPlan ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  function submit() {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), instrument: instrument.trim() || null, openTime, closeTime, timeframe: timeframe.trim() || null, bias, bullPlan: bullPlan.trim() || null, bearPlan: bearPlan.trim() || null, notes: notes.trim() || null });
  }

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{initial ? 'Edit session' : 'New session'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. London Open)" style={{ ...input, flex: '1 1 180px' }} />
        <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument (e.g. GBP/USD)" style={{ ...input, flex: '1 1 150px' }} />
        <label style={timeLbl}>Open<input value={openTime} onChange={(e) => setOpenTime(e.target.value)} type="time" style={{ ...input, width: 120 }} /></label>
        <label style={timeLbl}>Close<input value={closeTime} onChange={(e) => setCloseTime(e.target.value)} type="time" style={{ ...input, width: 120 }} /></label>
        <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="TF (M15)" style={{ ...input, flex: '0 0 100px' }} />
        <select value={bias} onChange={(e) => setBias(e.target.value as SessionBias)} style={{ ...input, flex: '0 0 130px' }}>
          <option value="neutral">Neutral</option>
          <option value="bull">Bull</option>
          <option value="bear">Bear</option>
          <option value="both">Two-way</option>
        </select>
        <textarea value={bullPlan} onChange={(e) => setBullPlan(e.target.value)} placeholder="Bull playbook" rows={2} style={{ ...input, flex: '1 1 47%', resize: 'vertical', fontFamily: 'inherit' }} />
        <textarea value={bearPlan} onChange={(e) => setBearPlan(e.target.value)} placeholder="Bear playbook" rows={2} style={{ ...input, flex: '1 1 47%', resize: 'vertical', fontFamily: 'inherit' }} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...input, flex: '1 1 100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !name.trim()} style={{ ...goldBtn, opacity: busy || !name.trim() ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const timeLbl: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED };
const tag: CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 7px' };
const metaChip: CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 8px' };
const winChip: CSSProperties = { fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", border: `1px solid ${BORDER2}`, borderRadius: 6, padding: '4px 8px', background: 'rgba(255,255,255,.03)' };
const pill: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', borderRadius: 5, padding: '2px 7px', fontFamily: "'IBM Plex Mono', monospace" };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const smallBtn: CSSProperties = { background: 'none', border: `1px solid ${BORDER2}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
