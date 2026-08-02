import { useState } from 'react';
import { C } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import type { InvestmentBucket } from '../../api/types';
import { usePortfolio } from './usePortfolio';
import {
  Bar,
  Card,
  Disclaimer,
  Empty,
  Money,
  ScreenHeader,
  UnpricedNote,
  bucketColor,
  ghostBtn,
  panel,
  pct,
} from './ui';

// Investments ▸ Allocation — how the portfolio is spread out, by asset class,
// sector and region.
//
// The regulatory line for this whole workspace lives on this screen more than
// any other, because "you are 70% in one thing" is one short step from "so sell
// some". It does not take that step. Everything here is a description of what is
// already true; there is no target allocation, no drift measure against a model
// portfolio, and no rebalancing suggestion — those are advice, and this is a
// tracker. See concentrationFlags() in the API for the same rule server-side.

type Dimension = 'class' | 'sector' | 'region';

export function InvestmentAllocation({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { portfolio, loading, error } = usePortfolio();
  const [dimension, setDimension] = useState<Dimension>('class');

  if (error) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <ScreenHeader title="Allocation" blurb="" />
        <div style={{ ...panel, padding: 16, color: C.red, fontSize: 12.5 }}>{error}</div>
      </div>
    );
  }
  if (loading && !portfolio) return <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>;

  const alloc = portfolio?.allocation;
  const buckets: InvestmentBucket[] =
    dimension === 'class' ? alloc?.byClass ?? [] : dimension === 'sector' ? alloc?.bySector ?? [] : alloc?.byRegion ?? [];

  const nothingPriced = (portfolio?.holdings ?? []).every((h) => h.value == null);
  const unsetOnly = buckets.length === 1 && buckets[0]!.key === '__unset';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Allocation"
        blurb="How your money is spread out — by what kind of asset it is, and by the sector and region you assigned each holding."
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                ['class', 'Asset class'],
                ['sector', 'Sector'],
                ['region', 'Region'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDimension(key)}
                style={{
                  ...ghostBtn,
                  padding: '6px 11px',
                  fontSize: 11.5,
                  color: dimension === key ? '#04231f' : C.muted,
                  background: dimension === key ? '#2DD4BF' : 'rgba(255,255,255,.05)',
                  borderColor: dimension === key ? '#2DD4BF' : C.line2,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {!portfolio || portfolio.holdings.length === 0 ? (
        <Empty icon="gauge" title="Nothing to break down yet">
          Add some holdings and this shows how your money is divided up.
        </Empty>
      ) : nothingPriced ? (
        <Empty icon="gauge" title="Nothing is priced yet">
          Allocation is worked out from what each holding is worth, so it needs a price on at least one of them.
          Add a price per share on the Holdings screen.
        </Empty>
      ) : (
        <>
          <UnpricedNote count={portfolio.totals.unpricedCount} onFix={() => onNavigate?.('inv_holdings')} />

          {unsetOnly && dimension !== 'class' && (
            <div
              style={{
                ...panel,
                padding: '11px 14px',
                marginBottom: 12,
                fontSize: 12,
                color: C.muted,
                lineHeight: 1.6,
              }}
            >
              None of your holdings have a {dimension} set yet. {dimension === 'sector' ? 'Sector' : 'Region'} is
              something you fill in per holding — nothing here looks it up, so it stays blank until you do.
            </div>
          )}

          <Card title={dimension === 'class' ? 'By asset class' : dimension === 'sector' ? 'By sector' : 'By region'}>
            <div style={{ display: 'grid', gap: 13 }}>
              {buckets.map((b, i) => (
                <div key={b.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6, alignItems: 'baseline' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: bucketColor(b.key, i), flex: 'none' }} />
                      <span style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.label}
                      </span>
                    </span>
                    <span style={{ flex: 'none', display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>
                        <Money value={b.value} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.mono, minWidth: 46, textAlign: 'right' }}>
                        {pct(b.pct)}
                      </span>
                    </span>
                  </div>
                  <Bar pct={b.pct} color={bucketColor(b.key, i)} />
                </div>
              ))}
            </div>
          </Card>

          {alloc && alloc.flags.length > 0 && (
            <Card title="What that looks like" style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                {alloc.flags.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Icon
                      name={f.severity === 'watch' ? 'alert-triangle' : 'info'}
                      size={14}
                      color={f.severity === 'watch' ? C.amber : C.muted}
                    />
                    <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

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
            These are observations about how your portfolio is shaped today — nothing here is a target to hit or a
            suggestion to move anything. There is deliberately no model allocation to measure yourself against:
            what mix is right for you depends on things this terminal does not know.
          </div>
        </>
      )}

      <Disclaimer />
    </div>
  );
}
