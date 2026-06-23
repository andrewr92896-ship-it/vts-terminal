import { useState, type CSSProperties } from 'react';
import type { KiaPayPlan } from '../../api/types';
import { useResponsive } from '../../hooks/useMediaQuery';

const RED = '#BB162B';
const RED2 = '#8d0f20';
const CARD = '#15171b';
const BORDER = '#2a2d33';

// Editor for the per-user Kia pay plan: the monthly unit goal, the commission
// structure (a single rate on total profit, or separate front/back rates), the
// optional review requirement, and the bonus tiers. Current values are
// pre-filled.
export function PayPlanEditor({
  open,
  plan,
  goalUnits,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  plan: KiaPayPlan;
  goalUnits: number;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: {
    commissionMode: 'total' | 'split';
    commissionPct: number;
    commissionFrontPct: number;
    commissionBackPct: number;
    miniAmount: number;
    reviewRequired: boolean;
    reviewReqPct: number;
    bonusTiers: { units: number; amount: number }[];
    goalUnits: number;
  }) => void;
}) {
  const { isPhone } = useResponsive();
  const [mode, setMode] = useState<'total' | 'split'>(plan.commissionMode);
  const [commission, setCommission] = useState(String(+(plan.commissionRate * 100).toFixed(2)));
  const [frontPct, setFrontPct] = useState(String(+(plan.frontRate * 100).toFixed(2)));
  const [backPct, setBackPct] = useState(String(+(plan.backRate * 100).toFixed(2)));
  const [mini, setMini] = useState(String(plan.miniAmount ?? 200));
  const [goal, setGoal] = useState(String(goalUnits));
  const [reviewRequired, setReviewRequired] = useState(plan.reviewRequired);
  const [reviewReqPct, setReviewReqPct] = useState(String(plan.reviewReqPct));
  const [tiers, setTiers] = useState<{ units: string; amount: string }[]>(
    plan.bonusTiers
      .slice()
      .sort((a, b) => a.units - b.units)
      .map((t) => ({ units: String(t.units), amount: String(t.amount) })),
  );

  if (!open) return null;

  function setTier(i: number, field: 'units' | 'amount', value: string) {
    setTiers((cur) => cur.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  }
  function addTier() {
    setTiers((cur) => [...cur, { units: '', amount: '' }]);
  }
  function removeTier(i: number) {
    setTiers((cur) => cur.filter((_, idx) => idx !== i));
  }

  function save() {
    const c = Number(commission);
    const f = Number(frontPct);
    const b = Number(backPct);
    const g = Number(goal);
    // Validate only the fields that matter for the chosen mode.
    if (mode === 'split') {
      if (!Number.isFinite(f) || f < 0 || !Number.isFinite(b) || b < 0) return;
    } else if (!Number.isFinite(c) || c < 0) {
      return;
    }
    if (!Number.isFinite(g) || g < 1) return;
    const cleanTiers = tiers
      .map((t) => ({ units: Number(t.units), amount: Number(t.amount) }))
      .filter((t) => Number.isFinite(t.units) && t.units > 0 && Number.isFinite(t.amount) && t.amount >= 0);
    onSave({
      commissionMode: mode,
      commissionPct: Number.isFinite(c) && c >= 0 ? c : 0,
      commissionFrontPct: Number.isFinite(f) && f >= 0 ? f : 0,
      commissionBackPct: Number.isFinite(b) && b >= 0 ? b : 0,
      miniAmount: Math.max(0, Math.round(Number(mini)) || 0),
      reviewRequired,
      reviewReqPct: Number(reviewReqPct) || 0,
      bonusTiers: cleanTiers,
      goalUnits: Math.round(g),
    });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: isPhone ? 0 : '50%',
          left: '50%',
          transform: isPhone ? 'translateX(-50%)' : 'translate(-50%,-50%)',
          width: isPhone ? '100%' : 'min(520px, 94vw)',
          height: isPhone ? '100%' : undefined,
          maxHeight: isPhone ? '100%' : '90vh',
          overflowY: 'auto',
          background: '#0e0f12',
          border: `1px solid ${BORDER}`,
          borderRadius: isPhone ? 0 : 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 61,
          animation: 'popIn .25s ease',
          color: '#eceef0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: '#0e0f12' }}>
          <strong style={{ fontSize: 15, color: '#fff' }}>Pay plan</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#9aa0a8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Monthly unit goal */}
          <div>
            <label style={label}>Monthly unit goal</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input value={goal} onChange={(e) => setGoal(e.target.value)} type="number" min="1" step="1" style={{ ...input, width: 120 }} />
              <span style={{ color: '#9aa0a8', fontSize: 13 }}>units / month</span>
            </div>
          </div>

          {/* Commission */}
          <div>
            <label style={label}>Commission</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setMode('total')} style={modeBtn(mode === 'total')}>
                % of total profit
              </button>
              <button onClick={() => setMode('split')} style={modeBtn(mode === 'split')}>
                Front / back split
              </button>
            </div>
            {mode === 'total' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input value={commission} onChange={(e) => setCommission(e.target.value)} type="number" min="0" max="100" step="0.1" style={{ ...input, width: 120 }} />
                <span style={{ color: '#9aa0a8', fontSize: 13 }}>% of profit</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={frontPct} onChange={(e) => setFrontPct(e.target.value)} type="number" min="0" max="100" step="0.1" style={{ ...input, width: 120 }} />
                  <span style={{ color: '#9aa0a8', fontSize: 13 }}>% of front-end profit</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={backPct} onChange={(e) => setBackPct(e.target.value)} type="number" min="0" max="100" step="0.1" style={{ ...input, width: 120 }} />
                  <span style={{ color: '#9aa0a8', fontSize: 13 }}>% of back-end profit</span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7d828a' }}>
                  In split mode, log each deal's front and back profit separately. A deal entered
                  as a single profit counts entirely as front-end.
                </p>
              </div>
            )}
          </div>

          {/* Mini (minimum commission per deal) */}
          <div>
            <label style={label}>Mini (minimum per deal)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#9aa0a8', fontSize: 13 }}>$</span>
              <input value={mini} onChange={(e) => setMini(e.target.value)} type="number" min="0" step="25" style={{ ...input, width: 120 }} />
              <span style={{ color: '#9aa0a8', fontSize: 13 }}>per deal</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#7d828a' }}>
              Every deal pays at least this much. When the commission on a thin deal comes out lower, you still earn the mini.
            </p>
          </div>

          {/* Review requirement */}
          <div>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={reviewRequired} onChange={(e) => setReviewRequired(e.target.checked)} style={{ width: 16, height: 16, accentColor: RED, cursor: 'pointer' }} />
              Require Google reviews to unlock the bonus
            </label>
            {reviewRequired && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ color: '#9aa0a8', fontSize: 13 }}>Minimum</span>
                <input value={reviewReqPct} onChange={(e) => setReviewReqPct(e.target.value)} type="number" min="0" max="100" style={{ ...input, width: 90 }} />
                <span style={{ color: '#9aa0a8', fontSize: 13 }}>% of units reviewed</span>
              </div>
            )}
            {!reviewRequired && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#7d828a' }}>
                Bonus tiers will pay out on units alone, with no review requirement.
              </p>
            )}
          </div>

          {/* Bonus tiers */}
          <div>
            <label style={label}>Bonus tiers (highest reached is paid)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tiers.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={t.units} onChange={(e) => setTier(i, 'units', e.target.value)} type="number" min="1" placeholder="units" style={{ ...input, width: 90 }} />
                  <span style={{ color: '#7d828a' }}>units →</span>
                  <span style={{ color: '#9aa0a8' }}>$</span>
                  <input value={t.amount} onChange={(e) => setTier(i, 'amount', e.target.value)} type="number" min="0" placeholder="amount" style={{ ...input, flex: 1, minWidth: 90 }} />
                  <button onClick={() => removeTier(i)} title="Remove tier" style={{ flex: 'none', background: 'none', border: 'none', color: '#7d828a', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
              ))}
              <button onClick={addTier} style={{ alignSelf: 'flex-start', border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,.05)', color: '#c9cdd4', fontSize: 12.5, fontWeight: 600, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' }}>
                + Add tier
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: `1px solid ${BORDER}`, position: 'sticky', bottom: 0, background: '#0e0f12' }}>
          <button onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,.05)', color: '#c9cdd4', fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ border: 'none', background: `linear-gradient(180deg,${RED},${RED2})`, color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save pay plan'}
          </button>
        </div>
      </div>
    </>
  );
}

function modeBtn(active: boolean): CSSProperties {
  return {
    flex: 1,
    border: `1px solid ${active ? RED : BORDER}`,
    background: active ? 'rgba(187,22,43,.15)' : 'rgba(255,255,255,.04)',
    color: active ? '#fff' : '#9aa0a8',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '9px 10px',
    borderRadius: 7,
    cursor: 'pointer',
  };
}

const label: CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: '#8b9098',
  marginBottom: 8,
  fontWeight: 600,
};

const input: CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 7,
  color: '#eceef0',
  fontSize: 13,
  padding: '9px 11px',
  outline: 'none',
  minHeight: 38,
};
