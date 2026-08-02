import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { C, tint } from '../../theme/tokens';
import type { CombinedHoldingRow, MyHoldings } from '../../api/types';
import {
  Card,
  Delta,
  Disclaimer,
  Empty,
  Money,
  ScreenHeader,
  TEAL,
  UnpricedNote,
  ghostBtn,
  panel,
} from '../investments/ui';

// My Terminal ▸ Investment Holdings — the trading desk and the long-term
// portfolio on one screen.
//
// The thing this screen has to get right is what it means to add the two
// together. A trading position's notional is not money anyone owns — 100,000
// units of EUR/USD is a leveraged exposure, not $100k of savings — so the
// combined total adds the portfolio's value to the trading ACCOUNT's equity and
// the coins held outright on a spot account, and nothing else. Open positions
// appear as exposure with their P/L, never as a value in the total. The server
// enforces the same split; see api/src/myportal/holdings.ts.
//
// Anything deliberately left out of the total says so on screen: a hand-kept
// book has no balance to read, and a funded challenge account's balance is the
// firm's capital rather than the trader's.

const GOLD = '#EBCB74';
/** Below this share of the portfolio, a day figure is not that portfolio's day. */
const DAY_COVERAGE_FLOOR = 0.6;

export function InvestmentHoldingsScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const [data, setData] = useState<MyHoldings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    api
      .myHoldings()
      .then((d) => alive && setData(d))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  if (error) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <ScreenHeader title="Investment Holdings" blurb="" />
        <div style={{ ...panel, padding: 16, color: C.red, fontSize: 12.5 }}>{error}</div>
      </div>
    );
  }
  if (loading && !data) return <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>;
  if (!data) return null;

  const { investments: inv, trading: tr } = data;
  const nothingAnywhere = inv.accountsCount === 0 && !tr.brokerConfigured && tr.openPositionCount === 0;
  const dayTrustworthy = inv.dayChangeCoverage >= DAY_COVERAGE_FLOOR && inv.dayChange !== 0;
  const tradingSide = (tr.accountValue ?? 0) + tr.spotValue;

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Investment Holdings"
        blurb="Everything you hold, in one place — your long-term investment portfolio beside what is live on the trading desk."
        right={
          <button onClick={() => onNavigate?.('inv_overview')} style={ghostBtn}>
            Open Investments
          </button>
        }
      />

      {nothingAnywhere ? (
        <Empty icon="gem" title="Nothing to show yet">
          Add an investment account, or connect a broker on the trading desk, and both halves appear here together.
          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => onNavigate?.('inv_accounts')}
              style={{ ...ghostBtn, color: TEAL, borderColor: `${TEAL}55` }}
            >
              Add an investment account
            </button>
          </div>
        </Empty>
      ) : (
        <>
          <UnpricedNote count={inv.unpricedCount} onFix={() => onNavigate?.('inv_holdings')} />

          {/* The combined figure, or an honest reason there isn't one. */}
          {data.combinedValue != null ? (
            <div style={{ ...panel, padding: '18px 20px', marginBottom: 12, borderLeft: `3px solid ${TEAL}` }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  color: C.faint,
                  fontFamily: C.mono,
                  marginBottom: 8,
                }}
              >
                Everything together
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: C.mono, lineHeight: 1.1 }}>
                <Money value={data.combinedValue} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 9, lineHeight: 1.6 }}>
                Your investment portfolio (<Money value={inv.value} />)
                {tr.enabled && (
                  <>
                    {' '}
                    plus the money in your trading {tr.spotValue > 0 ? 'accounts' : 'account'} (
                    <Money value={tradingSide} />)
                  </>
                )}
                .
              </div>
            </div>
          ) : (
            data.combinedNote && (
              <div
                style={{
                  ...panel,
                  padding: '13px 15px',
                  marginBottom: 12,
                  fontSize: 12.5,
                  color: C.amber,
                  lineHeight: 1.6,
                  borderLeft: `3px solid ${C.amber}`,
                }}
              >
                {data.combinedNote} The two halves are shown separately below.
              </div>
            )
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}>
            {/* ---- Long-term ---- */}
            <Card
              title="Long-term investments"
              right={
                <button
                  onClick={() => onNavigate?.('inv_overview')}
                  style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}
                >
                  Details
                </button>
              }
            >
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: C.mono, color: C.text }}>
                <Money value={inv.value} />
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 13 }}>
                <Line label="All-time gain">
                  <Delta value={inv.costBasis > 0 ? inv.gain : null} percent={inv.gainPct} size={12.5} />
                </Line>
                <Line label="Today">
                  {dayTrustworthy ? (
                    <Delta value={inv.dayChange} size={12.5} />
                  ) : (
                    <span style={{ color: C.faint, fontSize: 12 }}>needs live prices</span>
                  )}
                </Line>
                <Line label="Accounts">
                  <span style={{ fontSize: 12.5, fontFamily: C.mono, color: C.muted }}>
                    {inv.accountsCount} · {inv.holdingsCount} holdings
                  </span>
                </Line>
              </div>
            </Card>

            {/* ---- Trading desk ---- */}
            <Card
              title="Trading desk"
              right={
                tr.enabled && (
                  <button
                    onClick={() => onNavigate?.('live')}
                    style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}
                  >
                    Live Wall
                  </button>
                )
              }
            >
              {!tr.enabled ? (
                <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
                  Advanced Trading is not turned on for your account, so there is nothing to show here. Turning it on
                  adds your open positions and account balance to this summary.
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => onNavigate?.('my_access')}
                      style={{ ...ghostBtn, color: GOLD, borderColor: `${GOLD}55`, fontSize: 11.5, padding: '5px 10px' }}
                    >
                      Feature Access
                    </button>
                  </div>
                </div>
              ) : !tr.brokerConfigured && tr.openPositionCount === 0 && tr.spotValue === 0 ? (
                <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
                  No broker is connected yet, so there is no account balance or open position to show.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: C.mono, color: C.text }}>
                    <Money value={tradingSide} />
                  </div>
                  <div style={{ display: 'grid', gap: 8, marginTop: 13 }}>
                    {tr.accountValue != null && (
                      <Line label="Account value">
                        <span style={{ fontSize: 12.5, fontFamily: C.mono, color: C.muted }}>
                          <Money value={tr.accountValue} />
                          {tr.currency && tr.currency !== 'USD' && (
                            <span style={{ color: C.amber }}> {tr.currency}</span>
                          )}
                        </span>
                      </Line>
                    )}
                    {tr.spotValue > 0 && (
                      <Line label="Coins held">
                        <span style={{ fontSize: 12.5, fontFamily: C.mono, color: C.muted }}>
                          <Money value={tr.spotValue} />
                        </span>
                      </Line>
                    )}
                    <Line label="Open positions">
                      <span style={{ fontSize: 12.5, fontFamily: C.mono, color: C.muted }}>
                        {tr.openPositionCount}
                        {tr.unrealizedPl != null && tr.openPositionCount > 0 && (
                          <>
                            {' · '}
                            <Delta value={tr.unrealizedPl} size={12.5} />
                          </>
                        )}
                      </span>
                    </Line>
                    {tr.realizedToday != null && (
                      <Line label="Closed today">
                        <Delta value={tr.realizedToday} size={12.5} />
                      </Line>
                    )}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* What is not in the total, said plainly. */}
          {tr.excluded.length > 0 && (
            <div
              style={{
                ...panel,
                padding: '12px 15px',
                marginTop: 12,
                fontSize: 12,
                color: C.muted,
                lineHeight: 1.65,
              }}
            >
              <strong style={{ color: C.text }}>Not counted in the total above:</strong>{' '}
              {tr.excluded.join('; ')}.
            </div>
          )}

          {data.top.length > 0 && (
            <Card title="Your biggest holdings" style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 9 }}>
                {data.top.map((row) => (
                  <HoldingLine key={row.key} row={row} />
                ))}
              </div>
              {data.top.some((r) => r.side === 'position') && (
                <div style={{ fontSize: 11, color: C.faint, marginTop: 12, fontFamily: C.mono, lineHeight: 1.55 }}>
                  An open trading position shows its profit or loss rather than a value — the size of a leveraged
                  position is not money you hold, so adding it to a portfolio total would be meaningless.
                </div>
              )}
            </Card>
          )}
        </>
      )}

      <Disclaimer />
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 11.5, color: C.faint }}>{label}</span>
      {children}
    </div>
  );
}

const SIDE_STYLE: Record<CombinedHoldingRow['side'], { color: string; label: string }> = {
  investment: { color: TEAL, label: 'Investment' },
  position: { color: GOLD, label: 'Open trade' },
  spot: { color: '#B69CFF', label: 'Held coin' },
};

function HoldingLine({ row }: { row: CombinedHoldingRow }) {
  const s = SIDE_STYLE[row.side];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: C.text }}>{row.name}</span>
        <span
          style={{
            fontSize: 10.5,
            color: C.faint,
            marginLeft: 8,
            fontFamily: C.mono,
          }}
        >
          {row.detail}
        </span>
      </span>
      <span
        style={{
          fontSize: 9.5,
          fontFamily: C.mono,
          color: s.color,
          border: `1px solid ${tint(s.color, 0.35)}`,
          borderRadius: 4,
          padding: '1px 5px',
          flex: 'none',
        }}
      >
        {s.label}
      </span>
      <span style={{ fontSize: 12.5, fontFamily: C.mono, minWidth: 84, textAlign: 'right', flex: 'none' }}>
        {row.value != null ? (
          <Money value={row.value} />
        ) : (
          <Delta value={row.gain} size={12.5} />
        )}
      </span>
    </div>
  );
}
