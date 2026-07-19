import type { TradeRecord } from '../../api/types';
import { classifyOutcome, type BreakEvenConfig } from './outcome';
import { tradePips } from './pips';

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
