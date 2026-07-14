import type { BreakEvenMode, TradeSide } from '../../api/types';
import { tradePips } from './pips';

// Mirror of apps/api/src/trading/outcome.ts so the client can classify trades the
// same way the server does — for per-trader recomputes on the Trade Log and for
// the break-even badge on the Live Wall.
export type Outcome = 'win' | 'loss' | 'breakeven';

// The desk-wide break-even buffer, in whichever unit the desk chose. Mirror of
// the server's BreakEvenBand. `pct` is used in 'percent' mode; `amount` is the
// dollar or pip value used in 'dollars' / 'pips' mode.
export interface BreakEvenBand {
  mode: BreakEvenMode;
  pct: number;
  amount: number;
}

// Build the band from a response object carrying the three desk fields. Keeps
// every call site from re-plucking the same trio.
export function bandFrom(d: { breakEvenMode: BreakEvenMode; breakEvenPct: number; breakEvenAmount: number }): BreakEvenBand {
  return { mode: d.breakEvenMode, pct: d.breakEvenPct, amount: d.breakEvenAmount };
}

// The trade's return as a percent of entry, sign-adjusted for side. Null when
// the move can't be measured (no exit/current price, or a missing/zero entry).
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
// break-even buffer (percent of price move, a flat dollar amount, or a pip
// distance). Falls back to the sign of realized P/L when the chosen measure
// can't be computed for the trade.
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
