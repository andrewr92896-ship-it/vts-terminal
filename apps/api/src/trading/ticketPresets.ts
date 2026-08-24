import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { ticketPresets, type TicketPresetRow } from '../db/schema.js';
import {
  DEFAULT_PIP_ROUNDING_INCREMENT,
  MAX_PIP_ROUNDING_INCREMENT,
  MIN_PIP_ROUNDING_INCREMENT,
} from './sizing.js';

// The order ticket's quick-size buttons, as the trader has set them up.
//
// Three things are stored: what the buttons ARE (a ladder per kind of
// instrument, because 1,000 is an ordinary FX size and a ruinous bitcoin one),
// what they MEAN (a size in units, an amount of money per pip/point, or an
// amount of money spent on a spot account), and when the margin reading on one
// turns red.
//
// **A null ladder means "the built-in one", never "no buttons".** The default
// ladders live in the web (`workspaces/trading/ticketPresets.ts`), which is
// where they are rendered from before this row is even fetched — so the server
// deliberately holds no copy of them to drift out of step. It stores what the
// trader chose and nothing else.
//
// Always and only the caller's own: every function here takes a user id from the
// session and there is no parameter that could widen it. Unlike the desk
// settings a lead can edit for a teammate, a ticket belongs to the person
// sending the order.

export type TicketPresetMode = 'units' | 'per_step' | 'cost' | 'account_pct';

// Which of the two readings on a preset carries its colour. They answer
// different questions and the chips show both: 'free' is what is left to commit
// right now — the figure the broker refuses against — and 'value' is the share
// of the whole account, regardless of what is already open, which is the one
// that still means something on a desk carrying positions.
export type MarginBasis = 'free' | 'value';

export interface TicketPresets {
  /** Null = whatever suits the account: money spent on a spot account, units elsewhere. */
  mode: TicketPresetMode | null;
  units: number[] | null; // whole-unit instruments — FX, indices, metals
  fractional: number[] | null; // instruments the broker allows a fractional size on
  step: number[] | null; // money per pip / per point
  cost: number[] | null; // money spent, on a spot account
  // Shares of ACCOUNT VALUE the position's estimated margin should consume.
  // **The percentage is what is stored, never the units it worked out to** — an
  // account that grows has to place a larger trade from the same button, which
  // is only true if the intent rather than a snapshot of the size is saved.
  pct: number[] | null;
  /** Floor the money-per-pip an Account % preset works out to. */
  pctRound: boolean;
  /** The increment it is floored to, in account currency per pip/point. */
  pctRoundIncrement: number;
  showMargin: boolean;
  /** Which reading colours a preset. Null = 'free', as it always was. */
  marginBasis: MarginBasis | null;
  /** At or above this share of free margin (cash, on spot) a preset reads red. */
  marginWarnPct: number;
  /** The same, measured against the whole account value. Kept separate: one
   *  number cannot mean the right thing on both bases. */
  valueWarnPct: number;
}

export const DEFAULT_TICKET_PRESETS: TicketPresets = {
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

// A runaway-input guard, not a view about how many shortcuts a trader should
// have: fifteen is plenty of room for a full ladder and still a bounded list to
// store, validate and draw. Mirrored in the web's own MAX_PRESETS.
const MAX_PRESETS = 15;

function isMode(v: unknown): v is TicketPresetMode {
  return v === 'units' || v === 'per_step' || v === 'cost' || v === 'account_pct';
}

function isBasis(v: unknown): v is MarginBasis {
  return v === 'free' || v === 'value';
}

// A stored ladder, read back. Anything unusable is dropped rather than refused —
// a row that will not parse must not take the ticket's shortcuts away with it,
// and an empty result falls back to the built-in ladder like a null does.
function parseLadder(text: string | null): number[] | null {
  return normalizeLadder(parseLadderRaw(text));
}

/** The stored JSON, before any ladder's own rules are applied to it. */
function parseLadderRaw(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Numbers only, positive only, capped in count and magnitude. Null when nothing
// usable is left, which is what makes "clear the list" mean "give me the
// built-in one back" rather than "leave me with no buttons".
export function normalizeLadder(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000_000) continue;
    // Sizes carry fractions (0.01 of a bitcoin); nothing here needs more than
    // eight decimals, and rounding stops a float artifact being stored forever.
    const clean = Number(n.toFixed(8));
    if (!out.includes(clean)) out.push(clean);
    if (out.length >= MAX_PRESETS) break;
  }
  return out.length > 0 ? out : null;
}

// A percentage ladder. Same rules as any other ladder plus the one that only
// applies here: a share of an account cannot exceed the whole of it, so anything
// over 100 is dropped rather than stored as a size the desk would refuse.
export function normalizePctLadder(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 100) continue;
    const clean = Number(n.toFixed(4));
    if (!out.includes(clean)) out.push(clean);
    if (out.length >= MAX_PRESETS) break;
  }
  return out.length > 0 ? out : null;
}

// Clamped rather than refused, exactly as the warning threshold is: a save that
// bounced would leave the trader with the previous increment and nothing on
// screen saying why.
function clampIncrement(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PIP_ROUNDING_INCREMENT;
  return Number(
    Math.max(MIN_PIP_ROUNDING_INCREMENT, Math.min(MAX_PIP_ROUNDING_INCREMENT, n)).toFixed(4),
  );
}

function rowToPresets(row: TicketPresetRow): TicketPresets {
  return {
    mode: isMode(row.mode) ? row.mode : null,
    units: parseLadder(row.unitsPresets),
    fractional: parseLadder(row.fractionalPresets),
    step: parseLadder(row.stepPresets),
    cost: parseLadder(row.costPresets),
    pct: normalizePctLadder(parseLadderRaw(row.pctPresets)),
    pctRound: row.pctRound,
    pctRoundIncrement: clampIncrement(row.pctRoundIncrement),
    showMargin: row.showMargin,
    marginBasis: isBasis(row.marginBasis) ? row.marginBasis : null,
    marginWarnPct: clampWarn(row.marginWarnPct),
    valueWarnPct: clampWarn(row.valueWarnPct),
  };
}

// 1–100. Above 100 is not a warning — it is past the point the broker refuses
// the order, so a preset there could never be pressed successfully anyway.
// Clamped rather than refused: a save that fails would leave the trader with the
// previous threshold and nothing on screen to say so.
function clampWarn(v: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(100, n));
}

export async function getTicketPresets(userId: string): Promise<TicketPresets> {
  const row = (
    await db.select().from(ticketPresets).where(eq(ticketPresets.userId, userId)).limit(1)
  )[0];
  return row ? rowToPresets(row) : { ...DEFAULT_TICKET_PRESETS };
}

export async function setTicketPresets(
  userId: string,
  patch: Partial<TicketPresets>,
): Promise<TicketPresets> {
  const current = await getTicketPresets(userId);
  const next: TicketPresets = {
    mode: patch.mode === undefined ? current.mode : isMode(patch.mode) ? patch.mode : null,
    units: patch.units === undefined ? current.units : normalizeLadder(patch.units),
    fractional:
      patch.fractional === undefined ? current.fractional : normalizeLadder(patch.fractional),
    step: patch.step === undefined ? current.step : normalizeLadder(patch.step),
    cost: patch.cost === undefined ? current.cost : normalizeLadder(patch.cost),
    pct: patch.pct === undefined ? current.pct : normalizePctLadder(patch.pct),
    pctRound: patch.pctRound === undefined ? current.pctRound : !!patch.pctRound,
    pctRoundIncrement:
      patch.pctRoundIncrement === undefined
        ? current.pctRoundIncrement
        : clampIncrement(patch.pctRoundIncrement),
    showMargin: patch.showMargin === undefined ? current.showMargin : !!patch.showMargin,
    marginBasis:
      patch.marginBasis === undefined
        ? current.marginBasis
        : isBasis(patch.marginBasis)
          ? patch.marginBasis
          : null,
    marginWarnPct:
      patch.marginWarnPct === undefined ? current.marginWarnPct : clampWarn(patch.marginWarnPct),
    valueWarnPct:
      patch.valueWarnPct === undefined ? current.valueWarnPct : clampWarn(patch.valueWarnPct),
  };
  const json = (v: number[] | null) => (v == null ? null : JSON.stringify(v));
  const now = new Date();
  const values = {
    mode: next.mode,
    unitsPresets: json(next.units),
    fractionalPresets: json(next.fractional),
    stepPresets: json(next.step),
    costPresets: json(next.cost),
    pctPresets: json(next.pct),
    pctRound: next.pctRound,
    pctRoundIncrement: next.pctRoundIncrement,
    showMargin: next.showMargin,
    marginBasis: next.marginBasis,
    marginWarnPct: next.marginWarnPct,
    valueWarnPct: next.valueWarnPct,
    updatedAt: now,
  };
  await db
    .insert(ticketPresets)
    .values({ id: crypto.randomUUID(), userId, createdAt: now, ...values })
    .onConflictDoUpdate({ target: ticketPresets.userId, set: values });
  return next;
}
