// Position sizing — the one place the desk turns a size into money and money
// back into a size.
//
// **PURE, AND DELIBERATELY IMPORT-FREE.** Nothing here reads a database, a
// broker or a clock, so it can be fed known numbers and checked offline
// (`npm run verify:sizing`) — and so the web can carry a byte-identical mirror
// at `apps/web/src/workspaces/trading/sizing.ts`. The order ticket sizes in the
// browser on every quote tick, and a Founder join sizes on the server at the
// moment the order goes out; those are genuinely two places, and the repo's
// answer to that (the same one `pips.ts` and `forex.ts` already use) is one
// mirrored pure module plus a verify script that runs BOTH against the same
// fixtures. **Change one of the two files and you must change the other** — the
// verify script fails loudly if they ever disagree.
//
// The inputs are structural rather than the desk's own `DeskInstrumentSpec`, so
// an OANDA margin instrument and a Kraken spot pair both satisfy them and this
// file needs to know about neither.

/** As much of an instrument's spec as sizing depends on. */
export interface SizingSpec {
  /** Decimals a size may carry. 0 on FX (whole units), >0 where fractions are allowed. */
  tradeUnitsPrecision: number;
  minimumTradeSize: number;
  maximumOrderUnits: number | null;
  /** The share of notional the venue holds as margin. Null = not stated. */
  marginRate: number | null;
}

export interface SizingInputs {
  spec: SizingSpec | null;
  /** The price the order transacts at — the ask for a buy, the bid for a sell. */
  price: number | null;
  /** Quote currency → account currency, from the live quote. */
  factor: number | null;
  /** One unit of price movement: a pip on a currency pair, 1.0 on everything else. */
  step: number;
  /** The account's own value (NAV) — the figure Live Trades prints as ACCOUNT VALUE. */
  accountValue: number | null;
  /** Spot commits the whole cost outright; a margin account posts a fraction. */
  spot: boolean;
}

/** Optionally clean the money-per-pip a percentage works out to. */
export interface PipRounding {
  enabled: boolean;
  /** The increment, in account currency per pip/point. */
  increment: number;
}

// $0.50 — "$3.00 / $3.50 / $4.00" is how a trader reads a size out loud.
export const DEFAULT_PIP_ROUNDING_INCREMENT = 0.5;
export const MIN_PIP_ROUNDING_INCREMENT = 0.01;
export const MAX_PIP_ROUNDING_INCREMENT = 1000;

export const DEFAULT_PIP_ROUNDING: PipRounding = {
  enabled: false,
  increment: DEFAULT_PIP_ROUNDING_INCREMENT,
};

// Why a size could not be worked out. Each is a state to SHOW, never a figure to
// invent: the whole point of the union is that a size nobody could compute must
// not be replaced by one somebody guessed.
export type SizingProblem =
  | 'invalid-pct'
  | 'no-instrument'
  | 'no-account-value'
  | 'no-quote'
  | 'no-margin-rate'
  | 'rounding-zero'
  | 'below-minimum';

export interface AccountPctSize {
  /** What was asked for. This, never the units, is the stored intent. */
  targetPct: number;
  /** The money that percentage of the account comes to. */
  targetCost: number | null;
  /** The size to send, after rounding and the venue's own precision. */
  units: number | null;
  /** What one pip/point is worth at that size. */
  perStep: number | null;
  /** What that size actually ties up: margin, or the whole cost on spot. */
  cost: number | null;
  /** That cost as a share of the account value — the ACTUAL one, after rounding. */
  actualPct: number | null;
  /** Whether the $/pip was floored to an increment (so actualPct sits under the target). */
  rounded: boolean;
  /** Whether the venue's maximum order size, not the percentage, decided the size. */
  capped: boolean;
  problem: SizingProblem | null;
}

// Floating point: 4.0 / 0.5 lands on 7.999999999999999 as readily as on 8, and a
// bare floor there quietly loses a whole increment. A relative nudge before the
// floor costs nothing and removes the class of bug.
const FLOOR_EPS = 1e-9;

function floorTo(value: number, increment: number): number {
  return Math.floor(value / increment + FLOOR_EPS) * increment;
}

/** Round a size DOWN to the decimals the venue accepts — never up, past the allocation. */
export function floorToUnitPrecision(units: number, precision: number): number {
  const p = Math.pow(10, Math.max(0, Math.min(10, Math.round(precision))));
  return Math.floor(units * p + FLOOR_EPS) / p;
}

/**
 * What committing this size ties up: margin on a margin account, the whole cost
 * on a spot one (a spot buy commits the cash outright — calling that "margin"
 * would be wrong in both directions). Null when the quote or the instrument's
 * margin rate is missing, so nothing is ever guessed.
 */
export function costOfUnits(units: number, inputs: SizingInputs): number | null {
  const { spec, price, factor, spot } = inputs;
  if (!spec || price == null || factor == null || !Number.isFinite(units) || units <= 0) return null;
  const notional = units * price * factor;
  const rate = marginRateOf(spec, spot);
  if (rate == null) return null;
  return notional * rate;
}

/** The exact inverse of `costOfUnits`: the size that ties up this much money. */
export function unitsForCost(cost: number, inputs: SizingInputs): number | null {
  const { spec, price, factor, spot } = inputs;
  if (!spec || price == null || factor == null) return null;
  if (!Number.isFinite(cost) || cost <= 0) return null;
  const rate = marginRateOf(spec, spot);
  if (rate == null) return null;
  const perUnit = price * factor * rate;
  if (!(perUnit > 0)) return null;
  return cost / perUnit;
}

/** What one pip (point) of movement is worth at this size, in account currency. */
export function perStepValue(units: number, inputs: SizingInputs): number | null {
  const { factor, step } = inputs;
  if (factor == null || !Number.isFinite(units) || units <= 0) return null;
  const per = units * step * factor;
  return Number.isFinite(per) ? per : null;
}

/** The inverse: the size at which one pip is worth this much. */
export function unitsForPerStep(perStep: number, inputs: SizingInputs): number | null {
  const { factor, step } = inputs;
  if (factor == null || !Number.isFinite(perStep) || perStep <= 0) return null;
  const perUnit = step * factor;
  if (!(perUnit > 0)) return null;
  return perStep / perUnit;
}

// A spot account posts nothing: the whole cost leaves the balance, so the "rate"
// is 1 by definition and no venue figure is needed. A margin account's rate is
// the venue's own and is never assumed — an absent one is a refusal, not a 2%
// guess.
function marginRateOf(spec: SizingSpec, spot: boolean): number | null {
  if (spot) return 1;
  if (spec.marginRate == null || !(spec.marginRate > 0)) return null;
  return spec.marginRate;
}

function empty(pct: number, problem: SizingProblem, targetCost: number | null = null): AccountPctSize {
  return {
    targetPct: pct,
    targetCost,
    units: null,
    perStep: null,
    cost: null,
    actualPct: null,
    rounded: false,
    capped: false,
    problem,
  };
}

/**
 * Size a trade so its estimated margin takes about `pct` of the account's
 * current value.
 *
 * **THIS IS NOT A RISK CALCULATION AND MUST NEVER READ THE STOP.** "Account %"
 * here means the share of account value the position's required margin
 * consumes; it says nothing about what the trade could lose. The stop still
 * prices the Risk (USD) reading beside it — it just does not decide the size.
 *
 * Everything is derived from the SAME margin path the ticket already shows
 * (`costOfUnits`), so the percentage on a preset and the Margin (est.) cell can
 * never disagree.
 *
 * Rounding is FLOOR, always: a cleaner $/pip may leave the trade under the
 * requested percentage, and `actualPct` reports what it actually came to rather
 * than repeating the target. Rounding up would spend more of the account than
 * was asked for, which is the one direction this must never fail in.
 */
export function sizeForAccountPct(
  pct: number,
  inputs: SizingInputs,
  rounding: PipRounding = DEFAULT_PIP_ROUNDING,
): AccountPctSize {
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return empty(pct, 'invalid-pct');
  const { spec, price, factor, accountValue, spot } = inputs;
  if (!spec) return empty(pct, 'no-instrument');
  if (accountValue == null || !(accountValue > 0)) return empty(pct, 'no-account-value');
  if (price == null || !(price > 0) || factor == null || !(factor > 0)) return empty(pct, 'no-quote');
  if (marginRateOf(spec, spot) == null) return empty(pct, 'no-margin-rate');

  const targetCost = accountValue * (pct / 100);
  const rawUnits = unitsForCost(targetCost, inputs);
  if (rawUnits == null || !(rawUnits > 0)) return empty(pct, 'no-quote', targetCost);

  // Optionally clean the money-per-pip first, then derive the size from THAT —
  // the order the owner asked for, and the only one where the trader gets the
  // round number they set the increment for.
  let units = rawUnits;
  let rounded = false;
  if (rounding.enabled && rounding.increment > 0) {
    const rawPerStep = perStepValue(rawUnits, inputs);
    if (rawPerStep == null || !(rawPerStep > 0)) return empty(pct, 'no-quote', targetCost);
    const cleanPerStep = floorTo(rawPerStep, rounding.increment);
    // Flooring below one whole increment leaves nothing to trade. Say so rather
    // than sending a zero — or, worse, rounding up past the allocation.
    if (!(cleanPerStep > 0)) return empty(pct, 'rounding-zero', targetCost);
    const fromPerStep = unitsForPerStep(cleanPerStep, inputs);
    if (fromPerStep == null || !(fromPerStep > 0)) return empty(pct, 'no-quote', targetCost);
    units = fromPerStep;
    rounded = true;
  }

  // The venue's own ceiling decides before its precision does, and it clamps
  // DOWN like everything else here — the resulting percentage is reported, so
  // the trader can see the cap took effect.
  let capped = false;
  if (spec.maximumOrderUnits != null && units > spec.maximumOrderUnits) {
    units = spec.maximumOrderUnits;
    capped = true;
  }

  units = floorToUnitPrecision(units, spec.tradeUnitsPrecision);
  if (!(units > 0) || units < spec.minimumTradeSize) {
    // Deliberately NOT raised to the minimum. Doing that spends more of the
    // account than was asked for, silently, which is exactly what this mode
    // exists to stop.
    return empty(pct, 'below-minimum', targetCost);
  }

  // Recomputed from the size that will actually be sent, never carried over from
  // the target — the whole point of reporting an ACTUAL percentage.
  const cost = costOfUnits(units, inputs);
  return {
    targetPct: pct,
    targetCost,
    units,
    perStep: perStepValue(units, inputs),
    cost,
    actualPct: cost == null || accountValue == null || !(accountValue > 0) ? null : (cost / accountValue) * 100,
    rounded,
    capped,
    problem: null,
  };
}

/** One sentence a trader can act on, for each way sizing can fail. */
export function sizingProblemText(
  problem: SizingProblem,
  opts: {
    spot?: boolean;
    minimumTradeSize?: number | null;
    /** The rounding increment as the CALLER formats it ("$0.50") — this module
     *  knows no currency and must not invent one. */
    increment?: string;
  } = {},
): string {
  switch (problem) {
    case 'invalid-pct':
      return 'Set a percentage between 0 and 100';
    case 'no-instrument':
      return 'Pick an instrument';
    case 'no-account-value':
      return 'This account is not reporting a value right now, so a percentage of it cannot be worked out';
    case 'no-quote':
      return 'Waiting for a price to size this from';
    case 'no-margin-rate':
      return 'This instrument is not reporting a margin requirement, so a percentage of the account cannot be sized';
    case 'rounding-zero':
      return `That percentage works out to less than ${
        opts.increment == null ? 'one rounding increment' : `${opts.increment} per pip`
      }. Lower the increment, turn rounding off, or raise the percentage.`;
    case 'below-minimum':
      return opts.minimumTradeSize == null
        ? 'That percentage is smaller than the smallest order this account takes'
        : `That percentage works out below the ${opts.minimumTradeSize} minimum this account takes${
            opts.spot ? '' : ' — raise it'
          }`;
  }
}
