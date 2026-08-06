import { useMemo, type CSSProperties } from 'react';
import { fmtPips, hasAnyPips, netPips } from './pips';
import {
  profitFactorStats,
  profitFactorText,
  projectedProfitFactorStats,
  scaledProfitFactorText,
  summarizeTrades,
  type ScoredTrade,
} from './tradeStats';
import { configActive, type BreakEvenConfig } from './outcome';
import type { FundedAccount } from '../../api/types';
import type { LivePrices } from './useLivePrices';

// The funded book's own record: how many trades, how many won, and what they
// made — scored exactly the way the Trade Log scores the desk, from the same
// math (tradeStats.ts) and the viewer's own break-even buffer.
//
// **These figures are the funded book and nothing else.** A funded/prop trade is
// hand-kept: it carries no broker connection, never reconciles into
// trading_positions, and so never reaches the Trade Log, History or Live Brokers
// capital. That separation is the point of the section, which is why this panel
// exists rather than the desk's KPI row growing a filter — the two sets of
// numbers describe two different accounts and must never be added together.
//
// Deliberately no Avg Slippage card, unlike the Trade Log's row: slippage is
// entry-vs-plan, and a funded trade has no planned entry — it is typed in or
// read off a screenshot after the fact. A card that could only ever read "—"
// says nothing.

const GOLD = '#EBCB74';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const BORDER = '#16294f';

// A band that buffers nothing, used until the wall's first read lands. Trades
// then classify on the sign of the move, which is what a desk with no buffer
// set does anyway.
const NO_BAND: BreakEvenConfig = { base: { mode: 'percent', pct: 0, amount: 0 }, overrides: {} };

function money(n: number, ccy: string): string {
  const abs = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : '';
  return ccy === 'USD' ? `${sign}$${abs}` : `${sign}${abs} ${ccy}`;
}

export function FundedStats({
  accounts,
  showMoney,
  live,
}: {
  accounts: FundedAccount[];
  showMoney: boolean;
  live: LivePrices;
}) {
  const { fundedPlFor } = live;
  // Every funded trade on every funded account, in the shape the desk's own
  // stats math takes. An open position's live P/L is the desk's own figure,
  // read back off the Live Wall — see fundedPlFor for why it is not derived
  // here.
  const trades: ScoredTrade[] = useMemo(
    () =>
      accounts.flatMap((a) =>
        a.trades.map((t) => ({
          status: t.status,
          side: t.side,
          instrument: t.instrument,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          realizedPl: t.realizedPl,
          unrealizedPl: t.status === 'open' ? fundedPlFor(t.id) : null,
          units: t.units,
        })),
      ),
    [accounts, fundedPlFor],
  );

  if (trades.length === 0) return null;

  const config = live.breakEven ?? NO_BAND;
  const s = summarizeTrades(trades, config);
  const pf = profitFactorStats(trades, config);
  const ppf = projectedProfitFactorStats(trades, config);
  const showPips = hasAnyPips(trades);
  const netClosedPips = netPips(trades);
  const beActive = configActive(config);

  // Accounts can be kept in different currencies, and a total across two of them
  // would be a number that is simply wrong. Same rule Net Worth follows: an
  // incomplete total is refused rather than approximated. Counts and win rate
  // carry no currency, so those stay.
  const currencies = [...new Set(accounts.filter((a) => a.trades.length > 0).map((a) => a.currency || 'USD'))];
  const mixed = currencies.length > 1;
  const ccy = currencies[0] ?? 'USD';
  const cash = (n: number) => (mixed ? '—' : showMoney ? money(n, ccy) : '•••••');

  // Open positions the desk could not mark — no price source, or an instrument
  // with no pip math. Named rather than silently left out of the total.
  const unmarked = trades.filter((t) => t.status === 'open' && t.unrealizedPl == null).length;

  const wlSub = `${s.wins}W · ${s.losses}L${beActive || s.breakeven > 0 ? ` · ${s.breakeven}BE` : ''}`;
  const kpis: { label: string; val: string; sub: string; pips?: string }[] = [
    { label: 'Trades', val: String(s.total), sub: `${s.open} open · ${s.closed} closed` },
    { label: 'Win Rate', val: s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—', sub: wlSub },
    {
      label: 'Realized P/L',
      val: cash(s.totalRealizedPl ?? 0),
      sub: 'closed trades',
      pips: showPips ? `(${fmtPips(netClosedPips, true)})` : undefined,
    },
    {
      label: 'Unrealized P/L',
      val: mixed || !showMoney
        ? cash(0)
        : `${(s.totalUnrealizedPl ?? 0) > 0 ? '+' : ''}${money(s.totalUnrealizedPl ?? 0, ccy)}`, // signed, so a green book reads as a gain
      sub: unmarked > 0 ? `${s.open} open · ${unmarked} unmarked` : `${s.open} open`,
    },
    { label: 'Gross Profit', val: cash(pf.grossProfit), sub: 'winning trades', pips: showPips ? `(${fmtPips(pf.grossProfitPips)})` : undefined },
    { label: 'Gross Loss', val: cash(-pf.grossLoss), sub: 'losing trades', pips: showPips ? `(${fmtPips(-pf.grossLossPips)})` : undefined },
    {
      label: 'Profit Factor',
      val: mixed ? '—' : profitFactorText(pf),
      sub: 'gross profit ÷ loss',
      pips: mixed ? undefined : `scaled ${scaledProfitFactorText(pf)}`,
    },
    {
      label: 'Projected PF',
      val: mixed ? '—' : profitFactorText(ppf),
      sub: 'if closed now',
      pips: mixed ? undefined : `scaled ${scaledProfitFactorText(ppf)}`,
    },
  ];

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: FAINT, marginBottom: 8, letterSpacing: '0.3px' }}>
        {accounts.some((a) => !a.isMine)
          ? 'The desk’s funded accounts — combined stats'
          : accounts.length > 1
            ? 'Funded accounts — combined stats'
            : 'Funded account — stats'}
      </div>
      <div style={{ fontSize: 10.5, color: FAINT, marginBottom: 8 }}>
        {'Funded trades only. They are kept out of the Trade Log, History and Live Brokers, so these figures never mix with the desk’s.'}
      </div>
      {mixed && (
        <div style={{ fontSize: 10.5, color: GOLD, marginBottom: 8 }}>
          {`Accounts are kept in ${currencies.join(', ')} — money figures are not totalled across currencies.`}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{k.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: TEXT, marginTop: 6 }}>{k.val}</div>
            {k.pips && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: GOLD, marginTop: 3 }}>{k.pips}</div>
            )}
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
