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

// A per-instrument break-even buffer: the same band, tagged with the instrument
// it applies to. Desk-wide, like the default — the same override governs every
// trader's view of that instrument.
export interface BreakEvenOverride extends BreakEvenBand {
  instrument: string;
}

// The full desk break-even configuration: one default band that applies to any
// instrument without its own setting, plus per-instrument overrides keyed by a
// normalized symbol so "EUR/USD", "eur_usd" and "EURUSD" all resolve the same.
export interface BreakEvenConfig {
  base: BreakEvenBand;
  overrides: Record<string, BreakEvenBand>;
}

// Collapse an instrument symbol to a match key: uppercase, alphanumerics only,
// so notation differences ("EUR/USD" vs "EURUSD") never split one instrument's
// buffer in two.
export function normInstr(instrument: string): string {
  return instrument.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// The band that governs a given instrument: its own override if one is set,
// otherwise the desk default.
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

// Build a resolver config from a default band and a list of per-instrument
// overrides (shared by the server and the client).
export function buildBreakEvenConfig(base: BreakEvenBand, overrides: BreakEvenOverride[]): BreakEvenConfig {
  const map: Record<string, BreakEvenBand> = {};
  for (const o of overrides) {
    map[normInstr(o.instrument)] = { mode: o.mode, pct: o.pct, amount: o.amount };
  }
  return { base, overrides: map };
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
// break-even buffer. The instrument picks the band — its own per-instrument
// override if one is set, otherwise the desk default — and the band is measured
// one of three ways (see BreakEvenMode):
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
