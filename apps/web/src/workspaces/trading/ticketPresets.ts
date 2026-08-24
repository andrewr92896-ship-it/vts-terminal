import { api } from '../../api/client';
import {
  DEFAULT_PIP_ROUNDING_INCREMENT,
  costOfUnits,
  sizeForAccountPct,
  type AccountPctSize,
  type PipRounding,
  type SizingInputs,
} from './sizing';
import type { DeskInstrument, MarginBasis, TicketPresetMode, TicketPresets } from '../../api/types';

// The order ticket's quick-size buttons: what the built-in ones are, which
// ladder a given instrument uses, and what a button is worth once it is pressed.
//
// **The default ladders live HERE, not on the server.** The ticket renders them
// before the trader's stored row has loaded — and on an account that has never
// customised anything, they are all it ever renders — so a second copy on the
// server could only ever drift out of step with what is on screen. The server
// stores what somebody chose and nothing else; a null ladder means "the built-in
// one", which is why improving a default in this file still reaches everyone who
// has not overridden it.

// Which ladder applies depends on how the instrument is actually sized: FX and
// the whole-unit CFDs trade in thousands (a micro lot is 1,000 units), while
// anything the broker allows a fractional size on — crypto, most notably —
// trades in fractions of one. A "1k" chip beside a bitcoin ticket is not a
// shortcut, it is a trap.
export const WHOLE_UNIT_CHIPS = [1000, 5000, 10_000, 25_000, 100_000];
export const FRACTIONAL_CHIPS = [0.01, 0.05, 0.1, 0.5, 1];

// On a spot account the chips are amounts of money instead, because that is how
// a coin is actually bought: "$500 of bitcoin", never "0.005 of it". The size
// they set is worked out from the live price at the moment they are pressed.
export const SPOT_COST_CHIPS = [100, 250, 500, 1000, 5000];

// Money per pip (per point on anything that is not a currency pair) — how most
// traders actually size a trade. The size is worked out from what one unit of
// price movement is worth at the moment the chip is pressed.
export const PER_STEP_CHIPS = [1, 2, 5, 10, 20];

// A share of the account's own value, which is the one ladder that means the
// same thing on every instrument and every account size — 10% of a $2,000
// account and 10% of a $200,000 one are both "a tenth of what I have". Spread
// wide on purpose: the useful figure is somebody's own, and these are only where
// they start from.
export const ACCOUNT_PCT_CHIPS = [5, 10, 20, 30, 50];

/** Which stored ladder a set of chips is drawn from. */
export type PresetKind = 'units' | 'fractional' | 'step' | 'cost' | 'pct';

export const DEFAULT_LADDER: Record<PresetKind, number[]> = {
  units: WHOLE_UNIT_CHIPS,
  fractional: FRACTIONAL_CHIPS,
  step: PER_STEP_CHIPS,
  cost: SPOT_COST_CHIPS,
  pct: ACCOUNT_PCT_CHIPS,
};

// Mirrors the server's own cap (trading/ticketPresets.ts). A runaway-input
// guard rather than a view about how many shortcuts a ladder should carry — the
// chip row wraps, and the editor scrolls, so a long ladder is the trader's call.
export const MAX_PRESETS = 15;

export const DEFAULT_PRESETS: TicketPresets = {
  mode: null,
  units: null,
  fractional: null,
  step: null,
  cost: null,
  pct: null,
  pctRound: false,
  pctRoundIncrement: DEFAULT_PIP_ROUNDING_INCREMENT,
  showMargin: true,
  marginBasis: null,
  marginWarnPct: 100,
  valueWarnPct: 100,
};

/** Which reading colours a preset. Null is 'free', as it was before the second. */
export function resolveBasis(presets: TicketPresets): MarginBasis {
  return presets.marginBasis === 'value' ? 'value' : 'free';
}

/** The threshold that applies to the basis in force — one per basis, never shared. */
export function warnPctFor(presets: TicketPresets, basis: MarginBasis): number {
  return basis === 'value' ? presets.valueWarnPct : presets.marginWarnPct;
}

/** The patch that writes the threshold for one basis. */
export function warnPatch(basis: MarginBasis, pct: number): Partial<TicketPresets> {
  return basis === 'value' ? { valueWarnPct: pct } : { marginWarnPct: pct };
}

// What one size reads as on both bases at once. Either can be null — an account
// that will not report its value, or a quote that has not landed — and a null is
// simply not shown rather than filled in with the other one.
export interface Usage {
  free: number | null;
  value: number | null;
}

export function usageFor(
  cost: number | null,
  available: number | null,
  accountValue: number | null,
): Usage {
  return { free: usagePct(cost, available), value: usagePct(cost, accountValue) };
}

export function primaryPct(usage: Usage, basis: MarginBasis): number | null {
  return basis === 'value' ? usage.value : usage.free;
}

export function secondaryPct(usage: Usage, basis: MarginBasis): number | null {
  return basis === 'value' ? usage.free : usage.value;
}

// What the buttons mean on THIS account. A stored 'cost' is ignored on a margin
// account — buying "$500 of EUR/USD" is not how a margin position is sized — so
// a trader who sets it on their crypto account and switches to forex gets sizes
// back rather than a mode that cannot apply.
export function resolveMode(presets: TicketPresets, spot: boolean): TicketPresetMode {
  if (presets.mode === 'cost') return spot ? 'cost' : 'units';
  if (presets.mode === 'per_step' || presets.mode === 'units' || presets.mode === 'account_pct') {
    return presets.mode;
  }
  return spot ? 'cost' : 'units';
}

/** The ladder in force: the mode decides, except that units splits by instrument. */
export function ladderKind(mode: TicketPresetMode, spec: DeskInstrument | null): PresetKind {
  if (mode === 'per_step') return 'step';
  if (mode === 'cost') return 'cost';
  if (mode === 'account_pct') return 'pct';
  return spec && spec.tradeUnitsPrecision > 0 ? 'fractional' : 'units';
}

// One switch from a ladder to the field that stores it, so adding a ladder is
// one case here rather than three chains that can disagree about which is which.
function storedLadder(presets: TicketPresets, kind: PresetKind): number[] | null {
  switch (kind) {
    case 'units':
      return presets.units;
    case 'fractional':
      return presets.fractional;
    case 'step':
      return presets.step;
    case 'cost':
      return presets.cost;
    case 'pct':
      return presets.pct;
  }
}

export function ladderFor(presets: TicketPresets, kind: PresetKind): number[] {
  const stored = storedLadder(presets, kind);
  return stored && stored.length > 0 ? stored : DEFAULT_LADDER[kind];
}

export function isCustom(presets: TicketPresets, kind: PresetKind): boolean {
  const stored = storedLadder(presets, kind);
  return !!stored && stored.length > 0;
}

/** The patch that writes one ladder, keyed by which ladder it is. */
export function ladderPatch(kind: PresetKind, values: number[] | null): Partial<TicketPresets> {
  switch (kind) {
    case 'units':
      return { units: values };
    case 'fractional':
      return { fractional: values };
    case 'step':
      return { step: values };
    case 'cost':
      return { cost: values };
    case 'pct':
      return { pct: values };
  }
}

/** The rounding a percentage preset is cleaned with, as the sizing module wants it. */
export function roundingFor(presets: TicketPresets): PipRounding {
  return {
    enabled: presets.pctRound,
    increment:
      Number.isFinite(presets.pctRoundIncrement) && presets.pctRoundIncrement > 0
        ? presets.pctRoundIncrement
        : DEFAULT_PIP_ROUNDING_INCREMENT,
  };
}

// The desk's instrument spec already satisfies the sizing module's structural
// one, so the ticket hands its own type straight through rather than mapping it.
export interface SizeInputs extends Omit<SizingInputs, 'spec'> {
  spec: DeskInstrument | null;
}

// The size a preset asks for, in units. Null when it cannot be worked out yet —
// a money-per-pip, money-spent or percentage chip needs a live quote (and a
// percentage needs a live account value too), and inventing a size from a stale
// one is the one thing a shortcut on an order ticket must not do.
export function unitsForPreset(
  value: number,
  kind: PresetKind,
  inputs: SizeInputs,
  rounding?: PipRounding,
): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (kind === 'units' || kind === 'fractional') return value;
  // A percentage goes through the one canonical path, so a chip's size and the
  // Margin (est.) cell below it are worked out by the same code.
  if (kind === 'pct') return accountPctSize(value, inputs, rounding).units;
  const { spec, price, factor, step } = inputs;
  if (!spec) return null;
  const precision = Math.pow(10, spec.tradeUnitsPrecision);
  if (kind === 'step') {
    // What one pip/point is worth per unit, so the inverse is the size that
    // makes it worth the amount asked for.
    const perUnit = step * (factor ?? 0);
    if (!(perUnit > 0)) return null;
    const raw = value / perUnit;
    return Math.max(spec.minimumTradeSize, Math.round(raw * precision) / precision);
  }
  // cost: the money buys as much as it buys, rounded DOWN so "$500" never spends
  // more than $500.
  if (price == null || price <= 0) return null;
  return Math.max(spec.minimumTradeSize, Math.floor((value / price) * precision) / precision);
}

/** Everything an Account % preset works out to — the size, and what it costs. */
export function accountPctSize(
  pct: number,
  inputs: SizeInputs,
  rounding?: PipRounding,
): AccountPctSize {
  return sizeForAccountPct(pct, inputs, rounding);
}

// What committing this size would tie up: margin on a margin account, the whole
// cost on a spot one (a spot buy commits the cash outright — calling that
// "margin" would be wrong in both directions). Null when the quote or the
// instrument's margin rate is missing, so nothing is ever guessed. One line over
// the canonical `costOfUnits`, kept as a name the ticket already reads.
export function costOfSize(units: number, inputs: SizeInputs): number | null {
  return costOfUnits(units, inputs);
}

/** That cost as a share of what is actually available to commit. */
export function usagePct(cost: number | null, available: number | null): number | null {
  if (cost == null || available == null || !(available > 0)) return null;
  return (cost / available) * 100;
}

// One shared read of the trader's presets. The Trade Desk renders one ticket and
// a Live Wall can carry several, all of them the same row — so they share the
// in-flight request and the answer, the way the wall's tiles share a feed.
let cached: Promise<TicketPresets> | null = null;

export function loadTicketPresets(): Promise<TicketPresets> {
  if (!cached) {
    cached = api.ticketPresets().catch((e) => {
      // A failed read must not leave every later ticket refusing to try again.
      cached = null;
      throw e;
    });
  }
  return cached;
}

/** Save, and make the new row what any ticket opened afterwards reads. */
export async function saveTicketPresets(patch: Partial<TicketPresets>): Promise<TicketPresets> {
  const saved = await api.saveTicketPresets(patch);
  cached = Promise.resolve(saved);
  return saved;
}

/** Drop the shared copy — used when a save fails, so the next read is honest. */
export function forgetTicketPresets(): void {
  cached = null;
}
