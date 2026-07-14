import type { BreakEvenMode, BreakEvenOverride, TradeSide } from '../../api/types';
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

// The full break-even resolver: a default band plus per-instrument overrides
// keyed by a normalized symbol. Mirror of the server's BreakEvenConfig.
export interface BreakEvenConfig {
  base: BreakEvenBand;
  overrides: Record<string, BreakEvenBand>;
}

// Collapse an instrument symbol to a match key (uppercase, alphanumerics only)
// so "EUR/USD", "eur_usd" and "EURUSD" all resolve to the same buffer.
export function normInstr(instrument: string): string {
  return instrument.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// The band governing an instrument: its own override, else the desk default.
export function bandForInstrument(config: BreakEvenConfig, instrument: string): BreakEvenBand {
  return config.overrides[normInstr(instrument)] ?? config.base;
}

// Whether a band actually buffers anything (a zero band is "off").
export function bandActive(band: BreakEvenBand): boolean {
  return band.mode === 'percent' ? band.pct > 0 : band.amount > 0;
}

// Whether any part of the config buffers anything — the default or any override.
export function configActive(config: BreakEvenConfig): boolean {
  return bandActive(config.base) || Object.values(config.overrides).some(bandActive);
}

// Build the resolver from a response object carrying the desk default trio plus
// the per-instrument overrides. Keeps every call site from re-plucking them.
export function configFrom(d: {
  breakEvenMode: BreakEvenMode;
  breakEvenPct: number;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
}): BreakEvenConfig {
  const overrides: Record<string, BreakEvenBand> = {};
  for (const o of d.breakEvenOverrides) {
    overrides[normInstr(o.instrument)] = { mode: o.mode, pct: o.pct, amount: o.amount };
  }
  return { base: { mode: d.breakEvenMode, pct: d.breakEvenPct, amount: d.breakEvenAmount }, overrides };
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

// Classify a scored trade as win / loss / break-even. The instrument picks the
// band — its per-instrument override if set, else the desk default — measured as
// a percent of price move, a flat dollar amount, or a pip distance. Falls back
// to the sign of realized P/L when the chosen measure can't be computed.
export function classifyOutcome(
  side: TradeSide,
  entryPrice: number | null,
  exitPrice: number | null,
  realizedPl: number | null,
  instrument: string,
  config: BreakEvenConfig,
): Outcome {
  const band = bandForInstrument(config, instrument);
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
