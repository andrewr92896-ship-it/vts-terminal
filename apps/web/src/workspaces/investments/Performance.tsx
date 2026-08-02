import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { C } from '../../theme/tokens';
import type { InvestmentPerformance } from '../../api/types';
import { usePortfolio } from './usePortfolio';
import {
  Card,
  Delta,
  Disclaimer,
  Empty,
  Money,
  ScreenHeader,
  StatTile,
  TEAL,
  TileGrid,
  ghostBtn,
  panel,
  pct,
} from './ui';

// Investments ▸ Performance — what the portfolio has actually done, split into
// the money you added and the part the market moved.
//
// That split is the whole point of this screen. A portfolio that went from
// $10,000 to $12,000 has not "made 20%" if $1,500 of it was payroll
// contributions — it made $500. Showing the raw rise is the most common way a
// tracker flatters its owner, and it is the reason every snapshot row carries a
// running contributed-to-date figure.
//
// The history is built forward from the day the workspace was first opened: one
// reading per day, recorded when the portfolio is loaded. It is deliberately not
// back-filled. No source available to this terminal can price a 401(k)
// collective trust as of last March, so any "history" before today would be a
// curve that never happened.

const RANGES: { days: number; label: string }[] = [
  { days: 30, label: '1M' },
  { days: 90, label: '3M' },
  { days: 365, label: '1Y' },
  { days: 3650, label: 'All' },
];

export function InvestmentPerformanceScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { portfolio } = usePortfolio();
  const [days, setDays] = useState(365);
  const [data, setData] = useState<InvestmentPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api
      .investmentPerformance(days)
      .then((d) => alive && setData(d))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  useEffect(() => load(), [load]);

  const hasAccounts = (portfolio?.accounts.length ?? 0) > 0;
  const s = data?.summary;

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Performance"
        blurb="How your portfolio has moved over time, separated into what you paid in and what the market did."
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                style={{
                  ...ghostBtn,
                  padding: '6px 11px',
                  fontSize: 11.5,
                  color: days === r.days ? '#04231f' : C.muted,
                  background: days === r.days ? TEAL : 'rgba(255,255,255,.05)',
                  borderColor: days === r.days ? TEAL : C.line2,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {error && <div style={{ ...panel, padding: 14, marginBottom: 14, color: C.red, fontSize: 12.5 }}>{error}</div>}

      {!hasAccounts ? (
        <Empty icon="trending-up" title="Nothing to measure yet">
          Add an account and its holdings, and this starts recording your portfolio's value once a day.
        </Empty>
      ) : loading && !data ? (
        <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : !data || data.points.length < 2 ? (
        <Empty icon="trending-up" title="Building your history">
          Your portfolio's value is recorded once a day, starting from the first time you opened this workspace.
          {data && data.totalDays === 1
            ? ' There is one day so far — come back tomorrow and there will be a line to draw.'
            : ` There ${data?.totalDays === 1 ? 'is' : 'are'} ${data?.totalDays ?? 0} day${
                data?.totalDays === 1 ? '' : 's'
              } recorded so far.`}
          <div style={{ marginTop: 12, fontSize: 11.5, color: C.faint, lineHeight: 1.6 }}>
            History is not back-filled. Nothing available to this terminal can price a 401(k) fund as of last
            March, so a chart stretching back before today would be a curve that never happened.
          </div>
        </Empty>
      ) : (
        <>
          <TileGrid min={200}>
            <StatTile label="Value now" sub={`over ${s?.days ?? 0} days`}>
              <Money value={s?.endValue ?? 0} />
            </StatTile>
            <StatTile label="You paid in" sub="contributions less withdrawals">
              <Money value={s?.contributed ?? 0} />
            </StatTile>
            <StatTile label="The market did" sub={s?.marketGainPct != null ? pct(s.marketGainPct) : undefined}>
              <Delta value={s?.marketGain ?? null} size={21} />
            </StatTile>
          </TileGrid>

          <Card title="Portfolio value" style={{ marginTop: 12 }}>
            <PerformanceChart data={data} />
          </Card>

          <div
            style={{
              ...panel,
              padding: '13px 15px',
              marginTop: 12,
              fontSize: 12,
              color: C.muted,
              lineHeight: 1.65,
            }}
          >
            <strong style={{ color: C.text }}>How the split works.</strong> The dashed line is the running total of
            what you have paid in. The gap between it and the solid line is what the market added or took away — so
            a portfolio that only rose because money went into it shows a flat gap, not a gain.
            {' '}The percentage is measured against the money that was actually at work over the period; it is not a
            time-weighted return, which would need the timing of every cash flow.
          </div>

          {portfolio && portfolio.totals.unpricedCount > 0 && (
            <div style={{ ...panel, padding: '11px 14px', marginTop: 12, fontSize: 12, color: C.amber }}>
              {portfolio.totals.unpricedCount} holding{portfolio.totals.unpricedCount === 1 ? '' : 's'} had no price
              when today's reading was taken, so today's point understates the portfolio.{' '}
              <button
                onClick={() => onNavigate?.('inv_holdings')}
                style={{ ...ghostBtn, padding: '3px 8px', fontSize: 11, color: C.amber }}
              >
                Fix that
              </button>
            </div>
          )}
        </>
      )}

      <Disclaimer />
    </div>
  );
}

function PerformanceChart({ data }: { data: InvestmentPerformance }) {
  const pts = data.points;
  if (pts.length < 2) return null;

  const W = 640;
  const H = 200;
  const PAD = { l: 8, r: 8, t: 12, b: 22 };

  const values = pts.map((p) => p.value);
  const contributed = pts.map((p) => p.contributedToDate ?? 0);
  const maxV = Math.max(...values, ...contributed);
  const minV = Math.min(...values, ...contributed, 0);
  const span = maxV - minV || 1;

  const x = (i: number) => PAD.l + (i / (pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - minV) / span) * (H - PAD.t - PAD.b);

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
  const contribLine = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.contributedToDate ?? 0).toFixed(1)}`)
    .join(' ');

  const up = (pts[pts.length - 1]?.value ?? 0) >= (pts[0]?.value ?? 0);
  const stroke = up ? TEAL : C.red;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 320, display: 'block' }} role="img" aria-label="Portfolio value over time">
        <defs>
          <linearGradient id="invPerfFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#invPerfFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
        <path d={contribLine} fill="none" stroke={C.faint} strokeWidth="1.5" strokeDasharray="4 4" />
        <text x={PAD.l} y={H - 6} fill={C.faint} fontSize="10" fontFamily="monospace" textAnchor="start">
          {pts[0]!.onDate}
        </text>
        <text x={W - PAD.r} y={H - 6} fill={C.faint} fontSize="10" fontFamily="monospace" textAnchor="end">
          {pts[pts.length - 1]!.onDate}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.muted }}>
          <span style={{ width: 16, borderTop: `2px solid ${stroke}` }} /> Portfolio value
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.muted }}>
          <span style={{ width: 16, borderTop: `2px dashed ${C.faint}` }} /> What you paid in
        </span>
      </div>
    </div>
  );
}
