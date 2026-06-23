import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import type { Plan, PlanInput, PlansData, WealthClient } from '../../api/types';

const GREEN = '#34b87a';
const CARD = '#0e1a15';
const PANEL = '#0a201a';
const BORDER = '#1d4a38';
const INPUT_BG = '#081410';
const TEXT = '#eaf3ee';
const MUTED = '#8fb3a3';
const FAINT = '#5f7d6f';
const RED = '#ef5468';
const AMBER = '#e0a23a';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const usdC = (n: number) => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
};
const pctStr = (bp: number) => (bp / 100).toFixed(2).replace(/\.00$/, '') + '%';

export function WealthPlanning() {
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const [data, setData] = useState<PlansData | null>(null);
  const [clients, setClients] = useState<WealthClient[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);

  async function load() {
    try { setData(await api.wealthPlans()); setErr(null); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
  }
  useEffect(() => {
    void load();
    api.wealthClients().then((d) => setClients(d.clients)).catch(() => { /* optional */ });
  }, []);

  async function run(p: Promise<PlansData>): Promise<boolean> {
    setBusy(true);
    try { setData(await p); setErr(null); return true; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }

  if (err && !data) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading scenarios…</div>;

  const showMoney = !hideMoney && !privacy;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Planning</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>Retirement projections. Each scenario grows savings and contributions to retirement, then shows the inflation-adjusted income it can sustain versus the goal.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
          <button onClick={() => setAdding((v) => !v)} style={greenBtn}>{adding ? 'Close' : '+ New scenario'}</button>
        </div>
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {adding && (
        <PlanForm busy={busy} clients={clients} submitLabel="Create scenario" onSubmit={async (input) => { if (await run(api.wealthAddPlan(input))) setAdding(false); }} onCancel={() => setAdding(false)} />
      )}

      {data.plans.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 22px', color: MUTED, fontSize: 13 }}>
          No scenarios yet. Create one (e.g. “Smith retirement”) with current age, savings, and a yearly contribution to see the projection.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill,minmax(480px,1fr))', gap: 16, alignItems: 'start' }}>
          {data.plans.map((p) => (
            <PlanCard key={p.id} p={p} clients={clients} busy={busy} showMoney={showMoney}
              onSave={(patch) => run(api.wealthUpdatePlan(p.id, patch))}
              onRemove={() => run(api.wealthRemovePlan(p.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ p, clients, busy, showMoney, onSave, onRemove }: {
  p: Plan; clients: WealthClient[]; busy: boolean; showMoney: boolean;
  onSave: (patch: PlanInput) => void; onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <div style={card}><PlanForm busy={busy} clients={clients} initial={p} submitLabel="Save" onSubmit={(patch) => { onSave(patch); setEditing(false); }} onCancel={() => setEditing(false)} /></div>;
  }
  const pr = p.projection;
  const client = p.clientId ? clients.find((c) => c.id === p.clientId) : undefined;
  const m = (n: number) => (showMoney ? usd(n) : '•••••');
  const mc = (n: number) => (showMoney ? usdC(n) : '•••');

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>
            {client ? `${client.name} · ` : ''}age {p.currentAge} → retire {p.retirementAge} · to {p.endAge}
          </div>
        </div>
        <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: pr.onTrack ? GREEN : AMBER, border: `1px solid ${pr.onTrack ? GREEN : AMBER}`, borderRadius: 5, padding: '2px 8px' }}>
          {pr.onTrack ? 'On track' : 'Shortfall'}
        </span>
      </div>

      <Chart series={pr.series} showMoney={showMoney} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: BORDER, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <Stat label={`Balance at ${p.retirementAge}`} value={mc(pr.balanceAtRetirement)} sub={`${mc(pr.realBalanceAtRetirement)} in today's $`} />
        <Stat label="Sustainable income" value={showMoney ? usd(pr.sustainableIncome) + '/yr' : '•••••'} sub={`goal ${m(pr.incomeGoal)}/yr`} accent={pr.onTrack ? GREEN : AMBER} />
      </div>

      <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11.5, color: MUTED }}>
        <span>{pr.onTrack ? 'Surplus' : 'Gap'}: <b style={{ color: pr.onTrack ? GREEN : RED, fontFamily: "'IBM Plex Mono', monospace" }}>{showMoney ? (pr.gap >= 0 ? '+' : '−') + usd(Math.abs(pr.gap)) + '/yr' : '•••'}</b></span>
        <span>4% rule: <b style={{ color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{showMoney ? usd(pr.fourPctIncome) + '/yr' : '•••'}</b></span>
        <span>Return {pctStr(p.returnBp)} · Inflation {pctStr(p.inflationBp)}</span>
        <span>Saving {showMoney ? usd(p.annualContribution) : '•••'}/yr on {showMoney ? usd(p.currentSavings) : '•••'}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '9px 16px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
        <button onClick={() => setEditing(true)} style={smallBtn}>Edit inputs</button>
        <button onClick={() => !busy && onRemove()} title="Delete scenario" style={{ ...smallBtn, marginLeft: 'auto', color: '#ff9a9a', borderColor: 'transparent' }}>Delete</button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: CARD, padding: '11px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.4px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ?? '#fff', marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Chart({ series, showMoney }: { series: { age: number; balance: number }[]; showMoney: boolean }) {
  const W = 460, H = 90, pad = 6;
  if (series.length < 2) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT, fontSize: 11.5 }}>Add a retirement age beyond the current age to project growth.</div>;
  }
  const max = Math.max(...series.map((s) => s.balance), 1);
  const x = (i: number) => pad + (i / (series.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const last = series[series.length - 1];
  return (
    <div style={{ position: 'relative', padding: '6px 6px 0' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="planFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.35" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#planFill)" />
        <path d={line} fill="none" stroke={GREEN} strokeWidth="1.5" />
        <circle cx={x(series.length - 1)} cy={y(last.balance)} r="2.5" fill={GREEN} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace", padding: '0 2px 4px' }}>
        <span>age {series[0].age}</span>
        <span>{showMoney ? usdC(last.balance) : '•••'} @ {last.age}</span>
      </div>
    </div>
  );
}

function PlanForm({ initial, clients, busy, submitLabel, onSubmit, onCancel }: {
  initial?: Plan; clients: WealthClient[]; busy: boolean; submitLabel: string;
  onSubmit: (input: PlanInput) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [currentAge, setCurrentAge] = useState(String(initial?.currentAge ?? 35));
  const [retirementAge, setRetirementAge] = useState(String(initial?.retirementAge ?? 65));
  const [endAge, setEndAge] = useState(String(initial?.endAge ?? 90));
  const [currentSavings, setCurrentSavings] = useState(String(initial?.currentSavings ?? 0));
  const [annualContribution, setAnnualContribution] = useState(String(initial?.annualContribution ?? 0));
  const [ret, setRet] = useState(String((initial?.returnBp ?? 600) / 100));
  const [inf, setInf] = useState(String((initial?.inflationBp ?? 250) / 100));
  const [incomeGoal, setIncomeGoal] = useState(String(initial?.incomeGoal ?? 60000));

  function submit() {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      clientId: clientId || null,
      currentAge: Number(currentAge), retirementAge: Number(retirementAge), endAge: Number(endAge),
      currentSavings: Number(currentSavings), annualContribution: Number(annualContribution),
      returnBp: Math.round(Number(ret) * 100), inflationBp: Math.round(Number(inf) * 100),
      incomeGoal: Number(incomeGoal),
    });
  }

  return (
    <div style={{ ...(initial ? {} : panel), marginBottom: initial ? 0 : 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{initial ? 'Edit scenario' : 'New scenario'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" style={{ ...input, flex: '1 1 200px' }} />
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...input, flex: '1 1 180px' }}>
          <option value="">No client linked</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
        <Field label="Current age" value={currentAge} onChange={setCurrentAge} />
        <Field label="Retire age" value={retirementAge} onChange={setRetirementAge} />
        <Field label="Plan to age" value={endAge} onChange={setEndAge} />
        <Field label="Current savings $" value={currentSavings} onChange={setCurrentSavings} />
        <Field label="Yearly saving $" value={annualContribution} onChange={setAnnualContribution} />
        <Field label="Income goal $/yr" value={incomeGoal} onChange={setIncomeGoal} />
        <Field label="Return %" value={ret} onChange={setRet} />
        <Field label="Inflation %" value={inf} onChange={setInf} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !name.trim()} style={{ ...greenBtn, opacity: busy || !name.trim() ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10.5, color: MUTED }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" style={{ ...input, width: '100%' }} />
    </label>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const greenBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GREEN},#239160)`, color: '#05231a', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#cfe6da', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const smallBtn: CSSProperties = { background: 'none', border: `1px solid ${BORDER}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
