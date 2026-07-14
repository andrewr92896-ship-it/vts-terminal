import type { TradeSide } from '../db/schema.js';
import { tradePips } from './forex.js';

// How a scored (closed, known-P/L) trade is counted on the desk. Break-even is
// the new third category: a trade whose price barely moved, so it should not
// drag the win rate down as a loss (nor pad it as a win).
export type Outcome = 'win' | 'loss' | 'breakeven';

// How the desk's break-even buffer is measured. 'percent' is the original band
// (a percent of the entry→exit price move); 'dollars' and 'pips' let the desk
// set the buffer as a flat realized-$ amount or a pip distance instead — the
// two units a forex desk actually thinks in.
export type BreakEvenMode = 'percent' | 'dollars' | 'pips';

// The desk-wide break-even buffer. `pct` is used in 'percent' mode; `amount` is
// the dollar or pip value used in 'dollars' / 'pips' mode. A zero buffer (in the
// active mode) disables break-even, so every scored trade is a win or a loss.
export interface BreakEvenBand {
  mode: BreakEvenMode;
  pct: number;
  amount: number;
}

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

// Classify a scored trade as win / loss / break-even against the desk's chosen
// break-even buffer. The buffer is measured one of three ways (see BreakEvenMode):
//   • percent — ±band of the entry→exit price move (the original measure)
//   • dollars — realized P/L within ±$band reads as flat
//   • pips    — an entry→exit move within ±band pips reads as flat (forex only)
// When the chosen measure can't be computed for a trade (e.g. a pips buffer on a
// non-forex trade, or a price-based band with no exit price), fall back to the
// sign of realized P/L so the trade is still scored the old way; only an
// exactly-flat P/L reads as break-even there.
export function classifyOutcome(
  side: TradeSide,
  entryPrice: number | null,
  exitPrice: number | null,
  realizedPl: number | null,
  instrument: string,
  band: BreakEvenBand,
): Outcome {
  if (band.mode === 'dollars') {
    if (realizedPl != null) {
      if (Math.abs(realizedPl) <= band.amount) return 'breakeven';
      return realizedPl > 0 ? 'win' : 'loss';
    }
  } else if (band.mode === 'pips') {
    const pips = tradePips(side, entryPrice, exitPrice, instrument);
    if (pips != null) {
      if (Math.abs(pips) <= band.amount) return 'breakeven';
      return pips > 0 ? 'win' : 'loss';
    }
  } else {
    const pct = tradeReturnPct(side, entryPrice, exitPrice);
    if (pct != null) {
      if (Math.abs(pct) <= band.pct) return 'breakeven';
      return pct > 0 ? 'win' : 'loss';
    }
  }
  const pl = realizedPl ?? 0;
  if (pl === 0) return 'breakeven';
  return pl > 0 ? 'win' : 'loss';
}
