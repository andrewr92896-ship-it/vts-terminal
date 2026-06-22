import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { KiaDashboard as Dash } from '../../api/types';

const RED = '#BB162B';
const RED2 = '#8d0f20';
const CARD = '#15171b';
const BORDER = '#2a2d33';
const GREEN = '#35c47b';
const AMBER = '#e0a23a';

const usd = (n: number) => '$' + n.toLocaleString('en-US');

function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

export function KiaDashboard() {
  const { isPhone } = useResponsive();
  const [dash, setDash] = useState<Dash | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideComm, setHideComm] = useState(false);

  // Manual deal entry form
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [dtype, setDtype] = useState<'New' | 'Used'>('New');
  const [profit, setProfit] = useState('');
  const [date, setDate] = useState(etToday());

  useEffect(() => {
    let alive = true;
    api
      .kiaDashboard()
      .then((d) => alive && setDash(d))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load dashboard'));
    return () => {
      alive = false;
    };
  }, []);

  async function run(action: Promise<Dash>) {
    setBusy(true);
    try {
      setDash(await action);
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
      try {
        setDash(await api.kiaDashboard());
      } catch {
        /* keep current view */
      }
    } finally {
      setBusy(false);
    }
  }

  async function addDeal() {
    const p = Number(profit);
    if (!model.trim() || !Number.isFinite(p) || p < 0) return;
    await run(
      api.kiaAddDeal({
        customer: customer.trim() || undefined,
        model: model.trim(),
        type: dtype,
        profit: p,
        soldAt: date || undefined,
      }),
    );
    setCustomer('');
    setModel('');
    setProfit('');
    setDtype('New');
    setDate(etToday());
  }

  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!dash) return <div style={{ color: '#8b9098', padding: 20, fontSize: 13 }}>Loading dashboard...</div>;

  const m = dash.metrics;
  const showComm = !hideComm;
  const money = (n: number) => (showComm ? usd(n) : '•••••');
  const reviewColor = m.reviewOk ? GREEN : AMBER;

  const kpis: { label: string; val: string; sub: string }[] = [
    { label: 'Units MTD', val: String(m.units), sub: `goal ${m.goalUnits}` },
    { label: 'Pace', val: `${m.paceUnits} units`, sub: 'projected by month-end' },
    { label: 'Days Left', val: String(m.daysLeft), sub: `of ${m.daysInMonth}-day month` },
    ...(showComm
      ? [
          { label: 'Total Profit', val: usd(m.totalProfit), sub: 'front + back' },
          { label: 'Commission (13.5%)', val: usd(m.commission), sub: 'est. payout' },
          {
            label: 'Unit Bonus',
            val: usd(m.bonusEarned),
            sub: m.reviewOk ? (m.tierHitUnits ? `tier @ ${m.tierHitUnits}` : 'none yet') : 'reviews below 50%',
          },
        ]
      : []),
    { label: 'Google Reviews', val: `${m.reviewPct}%`, sub: `${m.reviewCount} of ${m.units} · need 50%` },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', color: '#eceef0', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Sales Dashboard</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#9aa0a8' }}>Andrew · Kia of Streetsboro · month to date</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setHideComm((v) => !v)} style={ghostBtn}>
            {hideComm ? 'Show $ details' : 'Hide $ details'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa0a8' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: RED }} />
            Manual entry
          </div>
        </div>
      </div>

      {actionError && (
        <div onClick={() => setActionError(null)} style={bannerStyle}>
          {actionError} — refreshed. Click to dismiss.
        </div>
      )}

      {/* Claude command bar — placeholder for Stage 4 */}
      <div style={{ ...panel, marginBottom: 14 }}>
        <div style={panelLabel}>
          <span style={sparkle}>✦</span>Ask Claude to change details
        </div>
        <input
          disabled
          placeholder="Command bar arrives in Stage 4 (add deal Sportage LX 1850 for Reyes · set goal 12 · set reviews 60% · summary)"
          style={{ ...inputBase, color: '#6b7079', fontFamily: "'IBM Plex Mono', monospace" }}
        />
      </div>

      {/* Manual deal entry */}
      <div style={{ ...panel, marginBottom: 16 }}>
        <div style={panelLabel}>Log a deal</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer (optional)" style={{ ...inputBase, flex: '1 1 150px' }} />
          <input value={model} onChange={(e) => setModel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDeal()} placeholder="Model" style={{ ...inputBase, flex: '1 1 160px' }} />
          <select value={dtype} onChange={(e) => setDtype(e.target.value as 'New' | 'Used')} style={{ ...inputBase, flex: '0 0 90px' }}>
            <option value="New">New</option>
            <option value="Used">Used</option>
          </select>
          <input value={profit} onChange={(e) => setProfit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDeal()} type="number" min="0" placeholder="Profit $" style={{ ...inputBase, flex: '0 0 110px' }} />
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={{ ...inputBase, flex: '0 0 150px' }} />
          <button onClick={addDeal} disabled={busy || !model.trim() || profit === ''} style={{ ...redBtn, opacity: busy || !model.trim() || profit === '' ? 0.6 : 1 }}>
            Add deal
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 13, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#8b9098' }}>{k.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 23, fontWeight: 600, color: '#fff', marginTop: 6 }}>{k.val}</div>
            <div style={{ fontSize: 10.5, color: '#7d828a', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Recent deals */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '15px 18px', borderBottom: '1px solid #25282e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Recent Deals</span>
            <span style={{ fontSize: 11, color: '#8b9098', fontFamily: "'IBM Plex Mono', monospace" }}>{m.units} this period</span>
          </div>
          <div style={{ padding: '6px 0' }}>
            {dash.deals.length === 0 && (
              <div style={{ padding: '16px 18px', fontSize: 12, color: '#6b7079', fontStyle: 'italic' }}>No deals yet. Log one above.</div>
            )}
            {dash.deals.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid #1f2227' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#eceef0' }}>{d.model}</div>
                  <div style={{ fontSize: 10.5, color: '#8b9098', fontFamily: "'IBM Plex Mono', monospace", marginTop: 3 }}>
                    {d.customer} · <span style={{ color: d.type === 'New' ? '#c9cdd4' : '#9aa0a8' }}>{d.type}</span> · {d.dateLabel}
                  </div>
                </div>
                {showComm && (
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#eceef0' }}>{usd(d.profit)}</div>
                    <div style={{ fontSize: 9.5, color: '#7d828a', letterSpacing: '0.4px', textTransform: 'uppercase', marginTop: 2 }}>profit</div>
                  </div>
                )}
                <button onClick={() => !busy && run(api.kiaRemoveDeal(d.id))} title="Remove deal" style={{ flex: 'none', background: 'none', border: 'none', color: '#4a4f57', fontSize: 16, lineHeight: 1, cursor: busy ? 'default' : 'pointer' }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Monthly Unit Goal */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Monthly Unit Goal</div>
              <Stepper value={m.goalUnits} busy={busy} onChange={(v) => run(api.kiaUpdateSettings({ goalUnits: v }))} min={1} />
            </div>
            <div style={{ fontSize: 11, color: '#8b9098', marginBottom: 12 }}>{m.units} of {m.goalUnits} units</div>
            <div style={{ height: 10, background: '#26282e', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${m.unitPct}%`, background: `linear-gradient(90deg,${RED2},${RED})` }} />
            </div>
            <div style={{ fontSize: 11, color: '#8b9098', marginTop: 8 }}>{m.unitPct}% to goal · {m.toGoal} to go</div>
          </div>

          {/* Monthly Pace */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Monthly Pace</div>
            <div style={{ fontSize: 11, color: '#8b9098', marginBottom: 10 }}>{m.daysLeft} days left this month</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600, color: m.onPace ? GREEN : AMBER }}>{m.paceUnits}</span>
              <span style={{ fontSize: 12, color: '#8b9098' }}>units projected vs goal of {m.goalUnits}</span>
            </div>
            {showComm && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #25282e', fontSize: 11.5, color: '#9aa0a8' }}>
                On pace for <span style={{ color: '#e07a86' }}>{usd(m.paceProfit)}</span> profit · <span style={{ color: '#e07a86' }}>{usd(m.paceComm)}</span> commission
              </div>
            )}
          </div>

          {/* Commission */}
          {showComm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10 }}>Commission — 13.5% of Profit</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 600, color: '#e07a86' }}>{money(m.commission)}</div>
              <div style={{ fontSize: 11, color: '#8b9098', marginTop: 6, lineHeight: 1.5 }}>
                13.5% of {usd(m.totalProfit)} total profit on {m.units} units this month.
              </div>
            </div>
          )}

          {/* Unit Bonus */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Unit Bonus</div>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: reviewColor }}>reviews {m.reviewPct}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa0a8', marginBottom: 7 }}>
              {m.bonusTiers.map((t) => (
                <span key={t.units} style={{ flex: 'none', color: m.tierHitUnits === t.units ? reviewColor : '#9aa0a8' }}>
                  {t.units} → {usd(t.amount)}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: '#7d828a', lineHeight: 1.5 }}>
              Bonuses don't stack — you earn the highest tier reached. Requires 50%+ Google reviews to qualify.
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #25282e', fontSize: 11.5, color: AMBER }}>
              {m.nextBonus ? `${usd(m.nextBonus.amount)} bonus at ${m.nextBonus.units} units · ${m.nextBonus.toGo} to go` : 'Top bonus tier reached'}
            </div>
          </div>

          {/* Google Reviews */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Google Reviews</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: reviewColor }}>{m.reviewPct}%</span>
                <Stepper value={m.reviewCount} busy={busy} onChange={(v) => run(api.kiaUpdateSettings({ reviewCount: v }))} min={0} />
              </div>
            </div>
            <div style={{ height: 8, background: '#26282e', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: '50%', width: 2, height: '100%', background: '#5a5f67' }} />
              <div style={{ height: '100%', width: `${Math.min(100, m.reviewPct)}%`, background: reviewColor }} />
            </div>
            <div style={{ fontSize: 10.5, color: '#8b9098', marginTop: 8 }}>
              {m.reviewCount} of {m.units} customers · need 50% to unlock the unit bonus. Marker shows the threshold.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, busy, min }: { value: number; onChange: (v: number) => void; busy: boolean; min: number }) {
  const btn: CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 5,
    border: `1px solid ${BORDER}`,
    background: 'rgba(255,255,255,.05)',
    color: '#c9cdd4',
    cursor: busy ? 'default' : 'pointer',
    fontSize: 14,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <button style={btn} disabled={busy || value <= min} onClick={() => onChange(value - 1)} title="Decrease">−</button>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#eceef0', minWidth: 18, textAlign: 'center' }}>{value}</span>
      <button style={btn} disabled={busy} onClick={() => onChange(value + 1)} title="Increase">+</button>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18 };
const panel: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#8b9098',
  marginBottom: 9,
  display: 'flex',
  alignItems: 'center',
};
const inputBase: CSSProperties = {
  background: '#0e0f12',
  border: `1px solid ${BORDER}`,
  borderRadius: 7,
  color: '#eceef0',
  fontSize: 12.5,
  padding: '10px 12px',
  outline: 'none',
};
const redBtn: CSSProperties = {
  border: 'none',
  background: `linear-gradient(180deg,${RED},${RED2})`,
  color: '#fff',
  fontWeight: 600,
  fontSize: 12.5,
  padding: '0 16px',
  borderRadius: 7,
  cursor: 'pointer',
};
const ghostBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 11.5,
  fontWeight: 600,
  color: '#c9cdd4',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER}`,
  padding: '7px 12px',
  borderRadius: 7,
  cursor: 'pointer',
};
const bannerStyle: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
  cursor: 'pointer',
};
const sparkle: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 5,
  background: `linear-gradient(135deg,${RED},${RED2})`,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontWeight: 700,
  fontSize: 10,
  marginRight: 7,
};
