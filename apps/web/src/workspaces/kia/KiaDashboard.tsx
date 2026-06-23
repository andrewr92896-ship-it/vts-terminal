import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useUndo } from '../../hooks/useUndo';
import { UndoBar } from '../../components/UndoBar';
import { usePrivacy, maskName } from '../../privacy/privacy';
import { PayPlanEditor } from './PayPlanEditor';
import { useDealership } from './dealership';
import type { KiaDashboard as Dash, RemovedKiaDeal } from '../../api/types';

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
  const { privacy } = usePrivacy();
  const dealership = useDealership();
  const undo = useUndo<RemovedKiaDeal>();
  const [dash, setDash] = useState<Dash | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideComm, setHideComm] = useState(false);
  const [payPlanOpen, setPayPlanOpen] = useState(false);

  // Manual deal entry form
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [dtype, setDtype] = useState<'New' | 'Used'>('New');
  const [profit, setProfit] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [date, setDate] = useState(etToday());

  // Claude quick-log (plain-English deal note)
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteReply, setNoteReply] = useState<string | null>(null);

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
        setDash(await api.kiaDashboard(dash?.month));
      } catch {
        /* keep current view */
      }
    } finally {
      setBusy(false);
    }
  }

  async function quickLog() {
    const text = note.trim();
    if (!text || noteBusy) return;
    setNoteBusy(true);
    setActionError(null);
    try {
      const r = await api.kiaParseDeal(text);
      if (r.dashboard) setDash(r.dashboard);
      setNoteReply(r.reply);
      if (r.logged) setNote('');
    } catch (e) {
      setActionError(
        e instanceof ApiError
          ? e.status === 503
            ? 'Claude isn’t configured yet — an API key needs to be set on the server.'
            : e.message
          : 'Could not log the deal',
      );
    } finally {
      setNoteBusy(false);
    }
  }

  async function addDeal() {
    if (!model.trim()) return;
    const split = dash?.payPlan.commissionMode === 'split';
    // Build the profit payload depending on the pay-plan mode.
    let profitFields: { profit?: number; frontProfit?: number; backProfit?: number };
    if (split) {
      const f = Number(front || 0);
      const b = Number(back || 0);
      if (!Number.isFinite(f) || !Number.isFinite(b) || f < 0 || b < 0 || f + b <= 0) return;
      profitFields = { frontProfit: f, backProfit: b };
    } else {
      const p = Number(profit);
      if (!Number.isFinite(p) || p < 0) return;
      profitFields = { profit: p };
    }
    // Show the month the deal was logged into (which may differ from the one
    // currently on screen).
    const dealMonth = (date || etToday()).slice(0, 7);
    await run(
      api.kiaAddDeal(
        {
          customer: customer.trim() || undefined,
          model: model.trim(),
          type: dtype,
          ...profitFields,
          soldAt: date || undefined,
        },
        dealMonth,
      ),
    );
    setCustomer('');
    setModel('');
    setProfit('');
    setFront('');
    setBack('');
    setDtype('New');
    setDate(etToday());
  }

  // Remove a deal, then offer to undo it.
  async function removeDealWithUndo(id: string) {
    const month = dash?.month;
    setBusy(true);
    try {
      const r = await api.kiaRemoveDeal(id, month);
      setDash(r);
      setActionError(null);
      if (r.removed) undo.flag(r.removed);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
      try {
        setDash(await api.kiaDashboard(month));
      } catch {
        /* keep current view */
      }
    } finally {
      setBusy(false);
    }
  }

  function restoreRemovedDeal() {
    const deal = undo.pending;
    if (!deal) return;
    undo.clear();
    void run(api.kiaRestoreDeal(deal, dash?.month));
  }

  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!dash) return <div style={{ color: '#8b9098', padding: 20, fontSize: 13 }}>Loading dashboard...</div>;

  const m = dash.metrics;
  // Privacy mode also hides every dollar figure, on top of the manual toggle.
  const showComm = !hideComm && !privacy;
  const money = (n: number) => (showComm ? usd(n) : '•••••');
  const reviewColor = m.reviewOk ? GREEN : AMBER;
  const isCurrentMonth = dash.month === etToday().slice(0, 7);
  const monthKey = dash.month;
  // Show the configured pay-plan rate (e.g. 13.5%) plus the mini, not the
  // blended effective rate — minis on thin deals would otherwise inflate it.
  const pp = dash.payPlan;
  const planRateLabel =
    pp.commissionMode === 'split'
      ? `${+(pp.frontRate * 100).toFixed(2)}/${+(pp.backRate * 100).toFixed(2)}%`
      : `${+(pp.commissionRate * 100).toFixed(2)}%`;
  const miniText = pp.miniAmount > 0 ? `$${pp.miniAmount.toLocaleString('en-US')} min` : '';
  const splitMode = dash.payPlan.commissionMode === 'split';
  const addDisabled = busy || !model.trim() || (splitMode ? front === '' && back === '' : profit === '');

  const kpis: { label: string; val: string; sub: string }[] = [
    { label: isCurrentMonth ? 'Units MTD' : 'Units', val: String(m.units), sub: `goal ${m.goalUnits}` },
    {
      label: 'Pace',
      val: `${m.paceUnits} units`,
      sub: isCurrentMonth ? 'projected by month-end' : 'final for the month',
    },
    {
      label: 'Days Left',
      val: isCurrentMonth ? String(m.daysLeft) : '—',
      sub: isCurrentMonth ? `of ${m.daysInMonth}-day month` : 'month complete',
    },
    ...(showComm
      ? [
          { label: 'Total Profit', val: usd(m.totalProfit), sub: 'front + back' },
          { label: `Commission (${planRateLabel})`, val: usd(m.commission), sub: miniText ? `est. payout · ${miniText}` : 'est. payout' },
          {
            label: 'Unit Bonus',
            val: usd(m.bonusEarned),
            sub: m.reviewOk ? (m.tierHitUnits ? `tier @ ${m.tierHitUnits}` : 'none yet') : `reviews below ${m.reviewReq}%`,
          },
        ]
      : []),
    {
      label: 'Google Reviews',
      val: `${m.reviewPct}%`,
      sub: m.reviewRequired ? `${m.reviewCount} of ${m.units} · need ${m.reviewReq}%` : `${m.reviewCount} of ${m.units} · not required`,
    },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', color: '#eceef0', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Sales Dashboard</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7, flexWrap: 'wrap' }}>
            <select
              value={dash.month}
              onChange={(e) => run(api.kiaDashboard(e.target.value))}
              disabled={busy}
              style={{ ...inputBase, padding: '7px 10px', fontSize: 12.5, minHeight: 36, width: 'auto' }}
            >
              {dash.months.map((mo) => (
                <option key={mo.key} value={mo.key}>
                  {mo.label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12.5, color: '#9aa0a8' }}>{dealership.name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={dealership.toggle}
            style={ghostBtn}
            title="Switch between the Kia dealership name and a generic label"
          >
            {dealership.generic ? 'Use Kia name' : 'Use generic name'}
          </button>
          <button onClick={() => setPayPlanOpen(true)} style={ghostBtn}>
            Pay plan
          </button>
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

      {/* Claude quick-log */}
      <div style={{ ...panel, marginBottom: 12 }}>
        <div style={{ ...panelLabel, display: 'flex', alignItems: 'center' }}>
          Quick log
          <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#7d828a' }}>Sonnet</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickLog()}
            placeholder='Describe the deal, e.g. "Sold a used Sportage to the Garcias, $1,800 front, $700 back"'
            style={{ ...inputBase, flex: 1 }}
          />
          <button onClick={quickLog} disabled={noteBusy || !note.trim()} style={{ ...redBtn, opacity: noteBusy || !note.trim() ? 0.6 : 1 }}>
            {noteBusy ? '…' : 'Log'}
          </button>
        </div>
        {noteReply && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#a7d8bf', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: GREEN }}>✓</span> {noteReply}
            <button onClick={() => setNoteReply(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7079', fontSize: 10.5, cursor: 'pointer' }}>dismiss</button>
          </div>
        )}
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
          {splitMode ? (
            <>
              <input value={front} onChange={(e) => setFront(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDeal()} type="number" min="0" placeholder="Front $" style={{ ...inputBase, flex: '0 0 100px' }} />
              <input value={back} onChange={(e) => setBack(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDeal()} type="number" min="0" placeholder="Back $" style={{ ...inputBase, flex: '0 0 100px' }} />
            </>
          ) : (
            <input value={profit} onChange={(e) => setProfit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDeal()} type="number" min="0" placeholder="Profit $" style={{ ...inputBase, flex: '0 0 110px' }} />
          )}
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={{ ...inputBase, flex: '0 0 150px' }} />
          <button onClick={addDeal} disabled={addDisabled} style={{ ...redBtn, opacity: addDisabled ? 0.6 : 1 }}>
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
              <DealRow
                key={d.id}
                deal={d}
                showComm={showComm}
                busy={busy}
                split={splitMode}
                onRemove={() => removeDealWithUndo(d.id)}
                onSave={(patch) =>
                  run(api.kiaUpdateDeal(d.id, patch, patch.soldAt ? patch.soldAt.slice(0, 7) : monthKey))
                }
              />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Monthly Unit Goal */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Monthly Unit Goal</div>
              <Stepper value={m.goalUnits} busy={busy} onChange={(v) => run(api.kiaUpdateSettings({ goalUnits: v }, monthKey))} min={1} />
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
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10 }}>
                Commission — {planRateLabel}{miniText ? ` or ${miniText}` : ''}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 600, color: '#e07a86' }}>{money(m.commission)}</div>
              <div style={{ fontSize: 11, color: '#8b9098', marginTop: 6, lineHeight: 1.5 }}>
                {planRateLabel} of profit per deal{miniText ? `, or the ${miniText} — whichever is higher` : ''}. {m.units} units · {usd(m.totalProfit)} total profit this month.
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
              Bonuses don't stack — you earn the highest tier reached.{' '}
              {m.reviewRequired ? `Requires ${m.reviewReq}%+ Google reviews to qualify.` : 'No review requirement on this plan.'}
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
                <Stepper value={m.reviewCount} busy={busy} onChange={(v) => run(api.kiaUpdateSettings({ reviewCount: v }, monthKey))} min={0} />
              </div>
            </div>
            <div style={{ height: 8, background: '#26282e', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
              {m.reviewRequired && (
                <div style={{ position: 'absolute', top: 0, left: `${Math.min(100, m.reviewReq)}%`, width: 2, height: '100%', background: '#5a5f67' }} />
              )}
              <div style={{ height: '100%', width: `${Math.min(100, m.reviewPct)}%`, background: reviewColor }} />
            </div>
            <div style={{ fontSize: 10.5, color: '#8b9098', marginTop: 8 }}>
              {m.reviewCount} of {m.units} customers
              {m.reviewRequired
                ? ` · need ${m.reviewReq}% to unlock the unit bonus. Marker shows the threshold.`
                : ' · reviews not required for the bonus on this plan.'}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly history */}
      {dash.history.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div style={{ padding: '15px 18px', borderBottom: '1px solid #25282e', fontSize: 14, fontWeight: 600, color: '#fff' }}>
            Monthly History
          </div>
          <div style={{ padding: '6px 0' }}>
            {dash.history.map((h) => {
              const selected = h.month === monthKey;
              return (
                <button
                  key={h.month}
                  onClick={() => !busy && h.month !== monthKey && run(api.kiaDashboard(h.month))}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    padding: '12px 18px',
                    borderBottom: '1px solid #1f2227',
                    background: selected ? 'rgba(187,22,43,.10)' : 'transparent',
                    border: 'none',
                    borderLeft: `3px solid ${selected ? RED : 'transparent'}`,
                    cursor: busy || selected ? 'default' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#eceef0' }}>{h.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 11.5, color: '#9aa0a8', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {h.units} {h.units === 1 ? 'unit' : 'units'}
                    </span>
                    {showComm && (
                      <span style={{ fontSize: 11.5, color: '#9aa0a8', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {usd(h.totalProfit)} · {usd(h.commission)} comm
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {undo.pending && (
        <UndoBar message="Deal removed." onUndo={restoreRemovedDeal} onDismiss={undo.clear} />
      )}

      <PayPlanEditor
        open={payPlanOpen}
        plan={dash.payPlan}
        goalUnits={m.goalUnits}
        busy={busy}
        onClose={() => setPayPlanOpen(false)}
        onSave={({ goalUnits, ...planPatch }) => {
          setPayPlanOpen(false);
          // Save the pay plan, then apply the monthly goal so the returned
          // dashboard reflects both changes.
          void run(
            api
              .kiaUpdatePayPlan(planPatch, monthKey)
              .then(() =>
                goalUnits !== m.goalUnits
                  ? api.kiaUpdateSettings({ goalUnits }, monthKey)
                  : api.kiaDashboard(monthKey),
              ),
          );
        }}
      />
    </div>
  );
}

// One deal in the Recent Deals list, with inline editing.
function DealRow({
  deal,
  showComm,
  busy,
  split,
  onRemove,
  onSave,
}: {
  deal: Dash['deals'][number];
  showComm: boolean;
  busy: boolean;
  split: boolean;
  onRemove: () => void;
  onSave: (patch: {
    customer?: string;
    model?: string;
    type?: 'New' | 'Used';
    profit?: number;
    frontProfit?: number;
    backProfit?: number;
    soldAt?: string;
  }) => void;
}) {
  const { privacy } = usePrivacy();
  const [editing, setEditing] = useState(false);
  const [customer, setCustomer] = useState(deal.customer);
  const [model, setModel] = useState(deal.model);
  const [dtype, setDtype] = useState<'New' | 'Used'>(deal.type);
  const [profit, setProfit] = useState(String(deal.profit));
  const [front, setFront] = useState(String(deal.frontProfit ?? deal.profit));
  const [back, setBack] = useState(String(deal.backProfit ?? 0));
  const [date, setDate] = useState(isoFromMs(deal.soldAt));

  function start() {
    setCustomer(deal.customer);
    setModel(deal.model);
    setDtype(deal.type);
    setProfit(String(deal.profit));
    setFront(String(deal.frontProfit ?? deal.profit));
    setBack(String(deal.backProfit ?? 0));
    setDate(isoFromMs(deal.soldAt));
    setEditing(true);
  }

  function save() {
    if (!model.trim()) return;
    const base = { customer: customer.trim() || undefined, model: model.trim(), type: dtype, soldAt: date || undefined };
    if (split) {
      const f = Number(front || 0);
      const b = Number(back || 0);
      if (!Number.isFinite(f) || !Number.isFinite(b) || f < 0 || b < 0) return;
      onSave({ ...base, frontProfit: f, backProfit: b });
    } else {
      const p = Number(profit);
      if (!Number.isFinite(p) || p < 0) return;
      onSave({ ...base, profit: p });
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1f2227', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer" style={{ ...inputBase, flex: '1 1 130px' }} />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" style={{ ...inputBase, flex: '1 1 150px' }} />
        <select value={dtype} onChange={(e) => setDtype(e.target.value as 'New' | 'Used')} style={{ ...inputBase, flex: '0 0 86px' }}>
          <option value="New">New</option>
          <option value="Used">Used</option>
        </select>
        {split ? (
          <>
            <input value={front} onChange={(e) => setFront(e.target.value)} type="number" min="0" placeholder="Front $" style={{ ...inputBase, flex: '0 0 92px' }} />
            <input value={back} onChange={(e) => setBack(e.target.value)} type="number" min="0" placeholder="Back $" style={{ ...inputBase, flex: '0 0 92px' }} />
          </>
        ) : (
          <input value={profit} onChange={(e) => setProfit(e.target.value)} type="number" min="0" placeholder="Profit $" style={{ ...inputBase, flex: '0 0 100px' }} />
        )}
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={{ ...inputBase, flex: '0 0 150px' }} />
        <button onClick={save} disabled={busy || !model.trim()} style={{ ...redBtn, opacity: busy || !model.trim() ? 0.6 : 1 }}>
          Save
        </button>
        <button onClick={() => setEditing(false)} style={ghostBtn}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid #1f2227' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#eceef0' }}>{deal.model}</div>
        <div style={{ fontSize: 10.5, color: '#8b9098', fontFamily: "'IBM Plex Mono', monospace", marginTop: 3 }}>
          {maskName(deal.customer, privacy)} · <span style={{ color: deal.type === 'New' ? '#c9cdd4' : '#9aa0a8' }}>{deal.type}</span> · {deal.dateLabel}
        </div>
      </div>
      {showComm && (
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#eceef0' }}>{usd(deal.profit)}</div>
          <div style={{ fontSize: 9.5, color: '#7d828a', letterSpacing: '0.4px', textTransform: 'uppercase', marginTop: 2 }}>profit</div>
        </div>
      )}
      <button onClick={() => !busy && start()} title="Edit deal" style={{ flex: 'none', background: 'none', border: '1px solid #2a2d33', color: '#9aa0a8', fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: busy ? 'default' : 'pointer' }}>
        Edit
      </button>
      <button onClick={() => !busy && onRemove()} title="Remove deal" style={{ flex: 'none', background: 'none', border: 'none', color: '#4a4f57', fontSize: 16, lineHeight: 1, cursor: busy ? 'default' : 'pointer' }}>
        ×
      </button>
    </div>
  );
}

// Convert a stored timestamp to the YYYY-MM-DD it represents in Eastern Time.
function isoFromMs(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
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
