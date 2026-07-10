import type { TradeSide } from '../../api/types';

// Mirror of apps/api/src/trading/outcome.ts so the client can classify trades the
// same way the server does — for per-trader recomputes on the Trade Log and for
// the break-even badge on the Live Wall.
export type Outcome = 'win' | 'loss' | 'breakeven';

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

// Classify a scored trade as win / loss / break-even against the desk's ±band
// (percent of price move). Falls back to the sign of realized P/L when the move
// can't be computed.
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
