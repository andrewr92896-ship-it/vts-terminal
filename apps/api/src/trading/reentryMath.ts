import { forexPair } from './forex.js';
import type { TradeSide } from '../db/schema.js';

// The re-entry arithmetic. Pure, like `forex.ts` beside it, so it can be checked
// against figures worked out by hand with no quote and no database — which
// matters here because every input is a live two-sided price that cannot be
// reproduced on demand.

// A standard lot, and the unit prop firms quote commission against.
export const STANDARD_LOT = 100_000;

// The price cost of getting back into a position you just closed, decomposed
// into the market having moved and the cost of crossing back.
//
// **Drift is measured against the SAME SIDE the trade exited at**, and that is
// the whole design rather than a detail: a long exits at the bid, so it is
// compared with the current bid; a short exits at the ask. Done that way,
// drift + spread comes to exactly the distance from the exit fill to the
// re-entry fill. Measured against the mid instead, half a spread lands in both
// terms and every figure on the panel is quietly overstated.
//
// Sign convention: POSITIVE IS WORSE. A negative drift is the market having come
// back to you while you were flat, which makes re-entry cheaper than the exit —
// exactly as useful to know, and it must not be reported as a cost.
export function decomposeReentry(
  side: TradeSide,
  exitPrice: number,
  bid: number,
  ask: number,
): { driftPrice: number; spreadPrice: number; reentryPrice: number } {
  const spreadPrice = ask - bid;
  if (side === 'long') {
    // Exited by selling at the bid; re-enters by buying at the ask.
    return { driftPrice: bid - exitPrice, spreadPrice, reentryPrice: ask };
  }
  // Exited by buying at the ask; re-enters by selling at the bid.
  return { driftPrice: exitPrice - ask, spreadPrice, reentryPrice: bid };
}

// Commission for re-entering `size` units, from the firm's round-turn rate per
// standard lot.
//
// Restricted to genuine currency pairs on purpose: a standard lot is 100,000
// units for a pair and something else entirely for gold, an index or a coin, so
// applying the rate there would be wrong by orders of magnitude while looking
// perfectly plausible. Null is always "not stated" and never zero — a free
// re-entry is a different claim from an unpriced one, and it is the flattering
// direction to get wrong.
export function commissionFor(
  instrument: string,
  size: number,
  perLot: number | null,
): { money: number | null; note: string | null } {
  if (perLot == null) return { money: null, note: 'No commission rate set on this account' };
  if (!forexPair(instrument)) {
    return { money: null, note: 'Rate is per standard lot — not applied to this instrument' };
  }
  if (!(size > 0)) return { money: null, note: 'No size recorded on the closed trade' };
  return { money: (Math.abs(size) / STANDARD_LOT) * perLot, note: null };
}
