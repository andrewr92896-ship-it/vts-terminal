import type { ForexMetrics, TradeSide } from '../../api/types';

// Pip math for the trade desk, mirroring apps/api/src/trading/forex.ts so the
// client can label profit/loss in pips the same way the server scores it. A
// "pip" is the standard price increment for a currency pair: 0.0001 for most
// pairs, 0.01 for JPY-quoted pairs. Only genuine currency pairs get pip math;
// metals, indices and crypto have no pip size, so they show money only.

// ISO-4217 codes we treat as currencies (matches the server's CURRENCIES set).
const CURRENCIES = new Set([
  'AUD', 'CAD', 'CHF', 'CNH', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF',
  'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);

// Parse "EUR/USD" into ["EUR", "USD"] when both sides are real currencies.
export function forexPair(instrument: string): [string, string] | null {
  const m = /^([A-Z]{3})\/([A-Z]{3})$/.exec(instrument.trim().toUpperCase());
  if (!m) return null;
  const [, base, quote] = m;
  if (!CURRENCIES.has(base) || !CURRENCIES.has(quote)) return null;
  return [base, quote];
}

export function pipSizeFor(quote: string): number {
  return quote === 'JPY' ? 0.01 : 0.0001;
}

// The realized (or marked) move of a trade in pips, sign-adjusted for side: a
// long that exits above entry is positive, a short that exits below entry is
// positive. Null when the instrument isn't a currency pair or a price is missing
// — the caller then shows money only. This is a trade's profit/loss expressed in
// pips, the desk's preferred unit.
export function tradePips(
  side: TradeSide,
  entryPrice: number | null,
  exitPrice: number | null,
  instrument: string,
): number | null {
  if (entryPrice == null || exitPrice == null) return null;
  const pair = forexPair(instrument);
  if (!pair) return null;
  const pipSize = pipSizeFor(pair[1]);
  const sign = side === 'short' ? -1 : 1;
  return ((exitPrice - entryPrice) * sign) / pipSize;
}

// Format a pip count the desk's way, e.g. "13 pips", "13.4 pips", "1 pip". With
// `signed`, a positive value keeps its leading "+" (matching the Live Wall).
export function fmtPips(n: number, signed = false): string {
  const rounded = Number(n.toFixed(1));
  const s = rounded.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${signed && rounded > 0 ? '+' : ''}${s} pip${Math.abs(rounded) === 1 ? '' : 's'}`;
}

// The pips of a trade as a parenthetical to sit beside a money figure, e.g.
// "(+13 pips)". Empty string for a non-forex or unpriced trade, so callers can
// append it unconditionally without leaving a stray "()".
export function pipsParenthetical(
  side: TradeSide,
  entryPrice: number | null,
  exitPrice: number | null,
  instrument: string,
  signed = false,
): string {
  const pips = tradePips(side, entryPrice, exitPrice, instrument);
  if (pips == null) return '';
  return `(${fmtPips(pips, signed)})`;
}

// A minimal trade shape for aggregating pips over a list.
interface PipTrade {
  side: TradeSide;
  entryPrice: number | null;
  exitPrice: number | null;
  instrument: string;
}

// Net signed pips across a set of trades (forex trades with an exit only). Non-
// forex/unpriced trades contribute nothing. Rounded to one decimal.
export function netPips(trades: PipTrade[]): number {
  let sum = 0;
  for (const t of trades) {
    const p = tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument);
    if (p != null) sum += p;
  }
  return Number(sum.toFixed(1));
}

// Whether any trade in the set carries pip math — used to decide whether to show
// a pip figure at all (an all-non-forex desk shows none).
export function hasAnyPips(trades: PipTrade[]): boolean {
  return trades.some((t) => tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument) != null);
}

// ---- what a unit of price movement is worth on an open position ----

// Every instrument states its movement in the unit it is actually read in — the
// figure a trader sizes by. A genuine currency pair speaks pips; everything else
// (indices, shares, metals, crypto) speaks points, where a point is one whole
// unit of price. Same switch the order ticket uses, so a position reads in the
// unit the order that opened it was sized in.
export interface Movement {
  unit: string; // "pip" / "point" — "$4.00 / pip"
  plural: string; // "pips" / "pts" — "15.1 pips"
  step: number; // one unit of movement, in price
  perStep: number | null; // what one unit is worth at this position's size
  currency: string;
}

// A distance from the entry to a protective level, in movement units and money.
export interface MovementLeg {
  steps: number;
  money: number | null;
}

// The open position shape this math needs — a structural subset of LiveTrade, so
// any surface holding one can ask.
interface MovementTrade {
  instrument: string;
  units: number;
  forex?: ForexMetrics | null;
}

// What one unit of movement is worth on this position.
//
// A currency pair's value comes from the server (trading/forex.ts), which knows
// the account currency and handles the cross-pair conversions. For everything
// else a point is one whole unit of price, and where the instrument is quoted in
// the account's own currency — an index, metal or coin against USD on a USD
// account — that is exactly the position's size in money: 0.5 BTC moves $0.50
// for every dollar bitcoin moves. Quoted in some other currency it would need a
// rate the wall does not carry, so it reports null and the caller shows nothing
// rather than a figure that is confidently wrong.
//
// Deliberately not derived from the broker's open P/L: that figure carries fees
// and financing on a crypto margin position, which would quietly inflate the
// per-point value on exactly the instruments this branch exists for.
export function movementFor(t: MovementTrade, accountCurrency: string): Movement {
  const pair = forexPair(t.instrument);
  if (pair) {
    return {
      unit: 'pip',
      plural: 'pips',
      step: t.forex?.pipSize ?? pipSizeFor(pair[1]),
      perStep: t.forex?.moneyPerPip ?? null,
      currency: t.forex?.accountCurrency ?? accountCurrency,
    };
  }
  const quote = t.instrument.trim().toUpperCase().split('/')[1] ?? '';
  const sized = Number.isFinite(t.units) && t.units > 0;
  return {
    unit: 'point',
    plural: 'pts',
    step: 1,
    perStep: sized && quote === accountCurrency.toUpperCase() ? t.units : null,
    currency: accountCurrency,
  };
}

// How far a stop or target sits from the entry, and what that is worth. Null when
// the level is not set, so a caller can render "none" instead.
export function movementLeg(entryPrice: number, level: number | null, m: Movement): MovementLeg | null {
  if (level == null || m.step <= 0) return null;
  const steps = Math.abs(level - entryPrice) / m.step;
  return { steps, money: m.perStep == null ? null : steps * m.perStep };
}

// A count of movement units. Thousands are separated (a 1,355-point stop on
// bitcoin is unreadable as "1355") and a whole number drops its decimal so it
// does not read as falsely precise.
export function fmtSteps(n: number, m: Movement): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${m.plural}`;
}

// ---- how big the position is, in the unit the instrument is sized in ----

// One standard forex lot, in units of the base currency. The same constant the
// server scales an FTP screenshot's lot count by (trading/service.ts), so a
// funded position read as "0.50" is shown back as 0.50 lots rather than as the
// 50,000 units it was stored as.
export const LOT_UNITS = 100_000;

// A position's size the way a trader reads it. A genuine currency pair is sized
// in LOTS — the figure the order was placed at and the one a prop firm reports —
// while everything else keeps its units, because there is no lot convention for
// a coin, an index or an ounce and inventing one would misstate the size.
//
// Same `forexPair` switch as the pip/point split above, so a position's size and
// what its movement is worth are always described in one another's terms:
// "1.00 lots · $10.00 / pip", never lots beside a per-point figure.
export function fmtSize(instrument: string, units: number): string {
  if (!Number.isFinite(units)) return '—';
  if (!forexPair(instrument)) return `${fmtUnitCount(units)} units`;
  const lots = units / LOT_UNITS;
  // A standard lot reads "1.00"; a connection-test size of a few units would
  // round to "0.00" at two decimals, so a tiny position keeps enough decimals to
  // read as tiny rather than as nothing.
  const digits = Math.abs(lots) >= 0.01 ? 2 : 5;
  const n = lots.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // Always plural. The count is written to two decimals, so a standard lot is
  // "1.00", and "1.00 lot" beside it reads as a typo rather than as grammar.
  return `${n} lots`;
}

// The raw size behind a lot count, for the hover on a size that was converted.
// Nothing to add on an instrument already shown in its own units.
export function sizeTitle(instrument: string, units: number): string | undefined {
  if (!forexPair(instrument) || !Number.isFinite(units)) return undefined;
  return `${fmtUnitCount(units)} units`;
}

// The size in units, formatted — the figure the order was actually placed in,
// which is what the Trade Log reads sizes in.
export function fmtUnitSize(units: number): string {
  return Number.isFinite(units) ? `${fmtUnitCount(units)} units` : '—';
}

// The lot count behind a size in units, for the hover — the mirror of
// `sizeTitle`, for a surface reading in units rather than in lots.
export function lotsTitle(instrument: string, units: number): string | undefined {
  if (!forexPair(instrument) || !Number.isFinite(units)) return undefined;
  return fmtSize(instrument, units);
}

// What one pip is worth at this size, in the QUOTE currency — 90,000 units of
// EUR/USD is $9.00 a pip. Derived from the size alone, deliberately not from the
// trade's realized P/L: that figure carries commission and financing, which
// would quietly inflate the per-pip value on exactly the trades a trader is
// checking it against.
//
// **Null unless the pair is quoted in `currency`.** 90,000 units of USD/JPY is
// ¥900 a pip, not $900, and the closed-trade log carries no rate to convert one
// into the other — so it says nothing there rather than printing a figure that
// is wrong by two orders of magnitude. The Live Wall's per-pip figure comes from
// the server (trading/forex.ts), which does have the rates; this is the reading
// available to a screen that only has the trade.
export function perPipForSize(instrument: string, units: number, currency = 'USD'): number | null {
  const pair = forexPair(instrument);
  if (!pair || !Number.isFinite(units) || units <= 0) return null;
  if (pair[1] !== currency.trim().toUpperCase()) return null;
  return units * pipSizeFor(pair[1]);
}

// Sizes span 100,000 units of EUR/USD down to 0.00042 of a bitcoin, and the
// default locale format prints that second one as "0" — so the smaller the size,
// the more decimals it keeps. Mirrors `fmtUnits` in tradeFormat.ts, kept here so
// this module stays free of that import cycle.
export function fmtUnitCount(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
  return Number(n.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

// Money per unit of movement spans a much wider range than the desk's other
// figures: a standard lot is $10.00 a pip while a 1-unit connection test is
// $0.0001, which the shared two-decimal formatter renders as "$0.00". Small
// values keep four decimals so a tiny size reads as tiny rather than as free.
export function fmtPerStep(v: number, currency: string): string {
  const digits = Math.abs(v) < 0.01 ? 4 : 2;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency === 'USD' ? `$${abs}` : `${abs} ${currency}`;
}
