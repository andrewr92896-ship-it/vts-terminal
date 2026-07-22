import type { TradeRecord, TradeSummary } from '../../api/types';
import { classifyOutcome, type BreakEvenConfig } from './outcome';
import { tradePips } from './pips';

// Recompute the KPI summary for a subset of trades (e.g. one trader's, or a
// board tile's), mirroring the backend's desk-wide summarize() so every view
// reads the same way — including totals for realized and open (unrealized) P/L.
export function summarizeTrades(trades: TradeRecord[], config: BreakEvenConfig): TradeSummary {
  let open = 0, closed = 0, wins = 0, losses = 0, breakeven = 0, totalPl = 0, unrealPl = 0, slipSum = 0, slipCount = 0;
  for (const t of trades) {
    if (t.status === 'open') open += 1;
    else closed += 1;
    if (t.realizedPl != null) {
      totalPl += t.realizedPl;
      if (t.status === 'closed') {
        const outcome = classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config);
        if (outcome === 'win') wins += 1;
        else if (outcome === 'loss') losses += 1;
        else breakeven += 1;
      }
    }
    if (t.unrealizedPl != null) unrealPl += t.unrealizedPl;
    if (t.slippage != null) {
      slipSum += t.slippage;
      slipCount += 1;
    }
  }
  const decided = wins + losses;
  return {
    total: trades.length,
    open,
    closed,
    wins,
    losses,
    breakeven,
    winRate: decided > 0 ? wins / decided : 0,
    totalRealizedPl: totalPl,
    totalUnrealizedPl: Number(unrealPl.toFixed(2)),
    avgSlippage: slipCount > 0 ? Number((slipSum / slipCount).toFixed(8)) : null,
  };
}

// Profit-factor math shared by the Trade Log KPI cards and the Live Wall metrics
// tile, so both read the same way. Kept out of TradeLog.tsx so the (lazy-loaded)
// Live Wall tile can reuse it without pulling in the whole Trade Log screen.

// Gross profit, gross loss and profit factor for a set of trades. Uses the same
// win/loss classification as the Trade Log KPIs (break-even trades count toward
// neither). The pip figures are the forex pip equivalents of the gross money.
export type ProfitFactor = {
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  grossProfitPips: number;
  grossLossPips: number;
  // "Scaled" gross P/L: every trade normalized to the same lot size by taking its
  // per-unit P/L (realized P/L ÷ size), so a 1-unit test and a 20k-unit position
  // weigh equally. Because profit factor is a ratio, the common lot size cancels
  // out — scaled PF is just the profit factor of per-unit P/L. Trades with no
  // size can't be scaled and are skipped from these two sums only.
  scaledProfit: number;
  scaledLoss: number;
};

export function profitFactorStats(trades: TradeRecord[], config: BreakEvenConfig): ProfitFactor {
  let grossProfit = 0;
  let grossLoss = 0;
  let grossProfitPips = 0;
  let grossLossPips = 0;
  let scaledProfit = 0;
  let scaledLoss = 0;
  for (const t of trades) {
    if (t.status !== 'closed' || t.realizedPl == null) continue;
    const outcome = classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config);
    const pips = tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument);
    // Per-unit P/L normalizes trade size; null when there's no size to divide by.
    const perUnit = t.units ? t.realizedPl / Math.abs(t.units) : null;
    if (outcome === 'win') {
      grossProfit += Math.max(0, t.realizedPl);
      if (pips != null) grossProfitPips += Math.max(0, pips);
      if (perUnit != null) scaledProfit += Math.max(0, perUnit);
    } else if (outcome === 'loss') {
      grossLoss += Math.abs(t.realizedPl);
      if (pips != null) grossLossPips += Math.max(0, -pips);
      if (perUnit != null) scaledLoss += Math.max(0, -perUnit);
    }
  }
  // null = undefined: no losing trades to divide by (or nothing decided at all).
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
  return {
    grossProfit,
    grossLoss,
    profitFactor,
    grossProfitPips: Number(grossProfitPips.toFixed(1)),
    grossLossPips: Number(grossLossPips.toFixed(1)),
    scaledProfit,
    scaledLoss,
  };
}

// Human-readable profit factor: "—" when nothing's decided, "∞" when there are
// no losses to divide by, otherwise two decimals.
export function profitFactorText(pf: ProfitFactor): string {
  if (pf.grossProfit === 0 && pf.grossLoss === 0) return '—';
  if (pf.grossLoss === 0) return '∞';
  return (pf.grossProfit / pf.grossLoss).toFixed(2);
}

// The same reading, but with every trade scaled to one common lot size — so
// outsized positions don't dominate and each trade's quality counts equally.
export function scaledProfitFactorText(pf: ProfitFactor): string {
  if (pf.scaledProfit === 0 && pf.scaledLoss === 0) return '—';
  if (pf.scaledLoss === 0) return '∞';
  return (pf.scaledProfit / pf.scaledLoss).toFixed(2);
}

// The "unrealized" profit factor: the same ratio, but over the live P/L of
// currently-open positions (winners' open gains ÷ losers' open losses) rather
// than closed trades. Returns a ProfitFactor so it reuses the text helpers
// above — including the per-unit "scaled" version. Pip fields are unused here.
export function unrealizedProfitFactorStats(trades: TradeRecord[]): ProfitFactor {
  let grossProfit = 0;
  let grossLoss = 0;
  let scaledProfit = 0;
  let scaledLoss = 0;
  for (const t of trades) {
    if (t.status !== 'open' || t.unrealizedPl == null) continue;
    const perUnit = t.units ? t.unrealizedPl / Math.abs(t.units) : null;
    if (t.unrealizedPl > 0) {
      grossProfit += t.unrealizedPl;
      if (perUnit != null) scaledProfit += Math.max(0, perUnit);
    } else if (t.unrealizedPl < 0) {
      grossLoss += Math.abs(t.unrealizedPl);
      if (perUnit != null) scaledLoss += Math.max(0, -perUnit);
    }
  }
  return {
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    grossProfitPips: 0,
    grossLossPips: 0,
    scaledProfit,
    scaledLoss,
  };
}

// The "projected" profit factor: what the profit factor would be if every open
// position closed right now at its current mark. It folds each open trade's live
// unrealized P/L into the realized closed-trade totals — so open winners add to
// gross profit and open losers to gross loss — then takes the ratio. Unlike the
// open-book-only unrealized factor (undefined the moment no position is red),
// this stays a real number as long as the closed history has any loss, so it's
// the useful "if I flattened everything now, where would my PF land?" reading.
// Reuses the two builders above (each already looks at only its own trade kind —
// closed vs. open) and sums them, so it matches the realized/unrealized cards
// exactly. Pip fields carry the closed-trade pips (open positions have none).
export function projectedProfitFactorStats(trades: TradeRecord[], config: BreakEvenConfig): ProfitFactor {
  const closed = profitFactorStats(trades, config);
  const open = unrealizedProfitFactorStats(trades);
  const grossProfit = closed.grossProfit + open.grossProfit;
  const grossLoss = closed.grossLoss + open.grossLoss;
  return {
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    grossProfitPips: closed.grossProfitPips,
    grossLossPips: closed.grossLossPips,
    scaledProfit: closed.scaledProfit + open.scaledProfit,
    scaledLoss: closed.scaledLoss + open.scaledLoss,
  };
}
