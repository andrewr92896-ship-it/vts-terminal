import { C, tint } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import type { InvestmentHolding } from '../../api/types';
import { usePortfolio } from './usePortfolio';
import {
  ASSET_CLASS_LABEL,
  Bar,
  Card,
  Delta,
  Disclaimer,
  Empty,
  Money,
  ScreenHeader,
  StatTile,
  TEAL,
  TileGrid,
  UnpricedNote,
  bucketColor,
  ghostBtn,
  panel,
  pct,
  usd,
} from './ui';

// Investments ▸ Portfolio Overview — the one dashboard across every account.
//
// The honesty rules that shape this screen, in order of how easy they are to get
// wrong:
//
//   1. A day move is only shown when it covers enough of the portfolio to mean
//      something. Most holdings here will be mutual funds with no live quote, so
//      a naive "today" figure would be a real number computed over 4% of the
//      book and presented as the portfolio's day.
//   2. Unpriced holdings are announced, never absorbed.
//   3. The movers list is drawn only from holdings that actually have a day
//      move — it is not padded out with rows whose price has not changed because
//      nobody has updated it.

/** Below this share of the book, a day figure is not that portfolio's day. */
const DAY_COVERAGE_FLOOR = 0.6;

export function InvestmentOverview({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { portfolio, loading, error } = usePortfolio();

  if (error) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <ScreenHeader title="Portfolio Overview" blurb="" />
        <div style={{ ...panel, padding: 16, color: C.red, fontSize: 12.5 }}>{error}</div>
      </div>
    );
  }

  if (loading && !portfolio) {
    return <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>;
  }

  const empty = !portfolio || portfolio.accounts.length === 0;
  const t = portfolio?.totals;
  const dayTrustworthy = !!t && t.dayChangeCoverage >= DAY_COVERAGE_FLOOR && t.dayChange !== 0;

  const movers = (portfolio?.holdings ?? [])
    .filter((h) => h.dayChange != null && h.dayChange !== 0)
    .sort((a, b) => Math.abs(b.dayChange!) - Math.abs(a.dayChange!))
    .slice(0, 5);

  const byClass = portfolio?.allocation.byClass ?? [];

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Portfolio Overview"
        blurb="Everything you track, in one place — what it is worth, what it cost you, and how it is spread out."
        right={
          <button onClick={() => onNavigate?.('inv_accounts')} style={ghostBtn}>
            Manage accounts
          </button>
        }
      />

      {empty ? (
        <Empty icon="landmark" title="Nothing tracked yet">
          Add an account and the holdings inside it, and this dashboard fills in: total value, what the market did,
          how you are allocated, and what your accounts are worth individually.
          <div style={{ marginTop: 14 }}>
            <button onClick={() => onNavigate?.('inv_accounts')} style={{ ...ghostBtn, color: TEAL, borderColor: `${TEAL}55` }}>
              Add your first account
            </button>
          </div>
        </Empty>
      ) : (
        <>
          <UnpricedNote count={t?.unpricedCount ?? 0} onFix={() => onNavigate?.('inv_holdings')} />

          <TileGrid>
            <StatTile
              label="Total value"
              sub={
                t && t.cash > 0 ? (
                  <>
                    including <Money value={t.cash} /> cash
                  </>
                ) : undefined
              }
            >
              <Money value={t?.value ?? 0} />
            </StatTile>

            <StatTile
              label="All-time gain"
              sub={t && t.costBasis > 0 ? `on ${usd(t.costBasis)} invested` : 'add cost basis to see this'}
            >
              <Delta value={t && t.costBasis > 0 ? t.gain : null} percent={t?.gainPct} size={21} />
            </StatTile>

            <StatTile
              label="Today"
              sub={
                dayTrustworthy
                  ? `across ${Math.round((t?.dayChangeCoverage ?? 0) * 100)}% of your holdings`
                  : 'needs live prices on most of the portfolio'
              }
            >
              {dayTrustworthy ? (
                <Delta value={t!.dayChange} size={21} />
              ) : (
                <span style={{ color: C.faint }}>—</span>
              )}
            </StatTile>

            <StatTile label="Accounts" sub={`${portfolio!.holdings.length} holdings`}>
              {portfolio!.accounts.filter((a) => a.active).length}
            </StatTile>
          </TileGrid>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))',
              gap: 12,
              marginTop: 12,
            }}
          >
            <Card title="Your accounts">
              <div style={{ display: 'grid', gap: 10 }}>
                {portfolio!.accounts
                  .filter((a) => a.active)
                  .sort((a, b) => b.value - a.value)
                  .map((a) => {
                    const share = t && t.value > 0 ? (a.value / t.value) * 100 : 0;
                    return (
                      <div key={a.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.label}
                          </span>
                          <span style={{ fontSize: 12.5, fontFamily: C.mono, color: C.muted, flex: 'none' }}>
                            <Money value={a.value} />
                          </span>
                        </div>
                        <Bar pct={share} height={5} />
                      </div>
                    );
                  })}
              </div>
            </Card>

            <Card
              title="How you're allocated"
              right={
                <button
                  onClick={() => onNavigate?.('inv_allocation')}
                  style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}
                >
                  Details
                </button>
              }
            >
              {byClass.length === 0 ? (
                <div style={{ fontSize: 12.5, color: C.muted }}>
                  Nothing priced yet, so there is nothing to break down.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 9 }}>
                  {byClass.slice(0, 6).map((b, i) => (
                    <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: bucketColor(b.key, i), flex: 'none' }} />
                      <span style={{ fontSize: 12.5, color: C.muted, flex: 1, minWidth: 0 }}>{b.label}</span>
                      <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text }}>{pct(b.pct, 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {movers.length > 0 && (
            <Card title="Today's movers" style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 9 }}>
                {movers.map((h) => (
                  <MoverRow key={h.id} holding={h} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 11, fontFamily: C.mono }}>
                Only holdings with a live quote can move here — a fund priced by hand does not change until you
                change it.
              </div>
            </Card>
          )}

          {portfolio!.allocation.flags.length > 0 && (
            <Card title="Worth knowing" style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 9 }}>
                {portfolio!.allocation.flags.map((f, i) => (
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
              {/* These are observations, not recommendations — see math.ts. */}
              <div style={{ fontSize: 11, color: C.faint, marginTop: 11, fontFamily: C.mono, lineHeight: 1.55 }}>
                These describe how your portfolio is shaped. They are not suggestions to buy or sell anything.
              </div>
            </Card>
          )}

          {portfolio && !portfolio.livePricesConfigured && (
            <div
              style={{
                ...panel,
                padding: '11px 14px',
                marginTop: 12,
                fontSize: 11.5,
                color: C.muted,
                lineHeight: 1.6,
                borderLeft: `3px solid ${tint(C.amber, 0.6)}`,
              }}
            >
              No market-data provider is configured on this terminal, so shares and ETFs are priced from the figures
              you enter. Crypto still prices itself.
            </div>
          )}
        </>
      )}

      <Disclaimer />
    </div>
  );
}

function MoverRow({ holding: h }: { holding: InvestmentHolding }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text, minWidth: 52 }}>{h.symbol ?? '—'}</span>
      <span
        style={{
          fontSize: 12.5,
          color: C.muted,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {h.name}
        <span style={{ color: C.faint, fontSize: 11 }}> · {ASSET_CLASS_LABEL[h.assetClass]}</span>
      </span>
      <Delta value={h.dayChange} percent={h.dayChangePct} size={12.5} />
    </div>
  );
}
