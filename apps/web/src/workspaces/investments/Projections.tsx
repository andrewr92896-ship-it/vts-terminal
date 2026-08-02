import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { C } from '../../theme/tokens';
import type { InvestmentProjection } from '../../api/types';
import { usePortfolio } from './usePortfolio';
import {
  Card,
  Disclaimer,
  Empty,
  Money,
  ScreenHeader,
  StatTile,
  TEAL,
  TileGrid,
  inputStyle,
  labelStyle,
  panel,
  usd,
} from './ui';

// Investments ▸ Projections — where a portfolio could land if it grew at a
// steady rate and you kept adding to it.
//
// This is arithmetic, not a forecast, and the screen has to keep saying so. A
// compound-growth curve is the easiest thing in this whole workspace to mistake
// for a prediction: it is smooth, it is confident, and it ends on a big number.
// So the copy names what it ignores (volatility, sequence of returns, fees,
// taxes, inflation), the rate is bounded server-side, and the number is always
// called an estimate. Do not let this grow into anything that recommends a
// contribution level or a rate — that is advice.

const RATE_PRESETS = [4, 6, 7, 8, 10];

export function InvestmentProjections() {
  const { portfolio } = usePortfolio();
  const [monthly, setMonthly] = useState('500');
  const [rate, setRate] = useState('7');
  const [years, setYears] = useState('20');
  const [data, setData] = useState<InvestmentProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    const m = Number(monthly) || 0;
    const r = Number(rate);
    const y = Number(years);
    if (!Number.isFinite(r) || !Number.isFinite(y) || y < 1) return () => {};
    api
      .investmentProjection({ monthlyContribution: m, annualRatePct: r, years: Math.round(y) })
      .then((d) => alive && setData(d))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not project'));
    return () => {
      alive = false;
    };
  }, [monthly, rate, years]);

  useEffect(() => load(), [load]);

  const hasPortfolio = (portfolio?.totals.value ?? 0) > 0 || (portfolio?.accounts.length ?? 0) > 0;
  const last = data?.points[data.points.length - 1];
  const growth = last ? last.value - (data!.startValue + last.contributed) : null;

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Projections"
        blurb="A rough idea of where your portfolio could get to, if it grew at a steady rate and you kept paying in. An estimate — not a prediction."
      />

      {!hasPortfolio ? (
        <Empty icon="sparkles" title="Add an account to project from">
          Projections start from what you have today, so add an account and its holdings first.
        </Empty>
      ) : (
        <>
          <Card title="Assumptions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Starting from</label>
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: C.muted }}>
                  <Money value={data?.startValue ?? portfolio?.totals.value ?? 0} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Adding each month</label>
                <input value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Annual growth rate</label>
                <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>For how many years</label>
                <input value={years} onChange={(e) => setYears(e.target.value)} inputMode="numeric" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 11, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.faint, fontFamily: C.mono }}>rate</span>
              {RATE_PRESETS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRate(String(r))}
                  style={{
                    background: Number(rate) === r ? TEAL : 'rgba(255,255,255,.05)',
                    color: Number(rate) === r ? '#04231f' : C.muted,
                    border: `1px solid ${Number(rate) === r ? TEAL : C.line2}`,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: C.mono,
                  }}
                >
                  {r}%
                </button>
              ))}
            </div>
          </Card>

          {error && <div style={{ ...panel, padding: 14, marginTop: 12, color: C.red, fontSize: 12.5 }}>{error}</div>}

          {data && last && (
            <>
              <TileGrid min={200}>
                <StatTile label={`Estimated value in ${data.years} years`}>
                  <Money value={last.value} />
                </StatTile>
                <StatTile label="Of which you paid in" sub={`${usd(data.monthlyContribution)}/month`}>
                  <Money value={data.startValue + last.contributed} />
                </StatTile>
                <StatTile label="Of which is growth" sub={`at a steady ${data.annualRatePct}%`}>
                  <Money value={growth} />
                </StatTile>
              </TileGrid>

              <Card title="Year by year" style={{ marginTop: 12 }}>
                <ProjectionChart data={data} />
              </Card>
            </>
          )}

          <div
            style={{
              ...panel,
              padding: '14px 16px',
              marginTop: 12,
              fontSize: 12,
              color: C.muted,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: C.text }}>What this leaves out.</strong> Real markets do not return the same
            percentage every year. This curve ignores volatility and the order returns arrive in — two portfolios
            averaging the same rate can end up far apart if one falls early. It also ignores fees, taxes, and
            inflation, so a figure twenty years out buys less than the same figure today. Treat it as a rough sense
            of scale, not a number to plan around.
          </div>
        </>
      )}

      <Disclaimer />
    </div>
  );
}

// A plain SVG area chart — the app has no charting library, and a projection is
// simple enough that adding one would be the wrong trade.
function ProjectionChart({ data }: { data: InvestmentProjection }) {
  const points = data.points;
  if (points.length < 2) return null;

  const W = 640;
  const H = 190;
  const PAD = { l: 8, r: 8, t: 12, b: 22 };
  const maxV = Math.max(...points.map((p) => p.value));
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (maxV > 0 ? v / maxV : 0)) * (H - PAD.t - PAD.b);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
  const contributedLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(data.startValue + p.contributed).toFixed(1)}`)
    .join(' ');

  const ticks = points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 5) === 0);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 320, display: 'block' }} role="img" aria-label="Projected portfolio value by year">
        <defs>
          <linearGradient id="invProjFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity="0.28" />
            <stop offset="100%" stopColor={TEAL} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#invProjFill)" />
        <path d={line} fill="none" stroke={TEAL} strokeWidth="2" strokeLinejoin="round" />
        {/* What you put in, so the gap to the line above is visibly the growth. */}
        <path d={contributedLine} fill="none" stroke={C.faint} strokeWidth="1.5" strokeDasharray="4 4" />
        {ticks.map((p, i) => (
          <text
            key={i}
            x={x(points.indexOf(p))}
            y={H - 6}
            fill={C.faint}
            fontSize="10"
            fontFamily="monospace"
            textAnchor={points.indexOf(p) === 0 ? 'start' : points.indexOf(p) === points.length - 1 ? 'end' : 'middle'}
          >
            {p.year === 0 ? 'now' : `${p.year}y`}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <LegendItem color={TEAL} label="Estimated value" />
        <LegendItem color={C.faint} label="What you paid in" dashed />
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.muted }}>
      <span
        style={{
          width: 16,
          height: 0,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
