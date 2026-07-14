import type { TradeSide } from '../../api/types';

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
