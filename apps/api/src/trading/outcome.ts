import type { TradeSide } from '../db/schema.js';

// How a scored (closed, known-P/L) trade is counted on the desk. Break-even is
// the new third category: a trade whose price barely moved, so it should not
// drag the win rate down as a loss (nor pad it as a win).
export type Outcome = 'win' | 'loss' | 'breakeven';

// The trade's return as a percent of the entry price, sign-adjusted for side: a
// long that exits above its entry is positive; a short that exits below its
// entry is positive. Null when the move can't be measured — no exit price, or a
// missing/zero entry price to divide by.
export function tradeReturnPct(
  side: TradeSide,
  entryPrice: number | null,
  exitPrice: number | null,
): number | null {
  if (entryPrice == null || exitPrice == null || entryPrice === 0) return null;
  const raw = ((exitPrice - entryPrice) / Math.abs(entryPrice)) * 100;
  return side === 'short' ? -raw : raw;
}

// Classify a scored trade as win / loss / break-even. The break-even band is
// ±breakEvenPct of price move (entry → exit) — the desk's chosen measure. When
// the move can't be computed (a trade logged with a realized P/L but no exit
// price), fall back to the sign of realized P/L so the trade is still scored the
// old way; only an exactly-flat P/L reads as break-even there.
export function classifyOutcome(
  side: TradeSide,
  entryPrice: number | null,
  exitPrice: number | null,
  realizedPl: number | null,
  breakEvenPct: number,
): Outcome {
  const pct = tradeReturnPct(side, entryPrice, exitPrice);
  if (pct != null) {
    if (Math.abs(pct) <= breakEvenPct) return 'breakeven';
    return pct > 0 ? 'win' : 'loss';
  }
  const pl = realizedPl ?? 0;
  if (pl === 0) return 'breakeven';
  return pl > 0 ? 'win' : 'loss';
}
