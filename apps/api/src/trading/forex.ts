import type { LiveTrade } from './types.js';

// Forex pip math for the Live Wall. Everything here is pure so it can be unit
// tested against fixed numbers with no network. A "pip" is the standard price
// increment for a currency pair: 0.0001 for most pairs, 0.01 for JPY-quoted
// pairs. Money values are in the account's currency.

export interface ForexLeg {
  pips: number; // distance from entry to the target, in pips (always positive)
  money: number | null; // that distance in account currency (gated like P/L)
}

export interface ForexMetrics {
  pipSize: number;
  accountCurrency: string;
  // Open P/L distance in pips (signed: positive = in profit). Needs a mark.
  pipsOpen: number | null;
  // Account-currency value of a one pip move for this position size. Gated.
  moneyPerPip: number | null;
  risk: ForexLeg | null; // entry -> stop loss
  reward: ForexLeg | null; // entry -> take profit
  // Reward-to-risk as a single number (e.g. 2 means 1:2). Price-only, never gated.
  rr: number | null;
}

// ISO-4217 codes OANDA quotes as currencies. Used so that only genuine currency
// pairs (not metals like XAU/USD, indices like US30, or crypto like BTC/USD) are
// treated as forex and given pip math.
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

// The currency an instrument is QUOTED in, when that is a real currency —
// "EUR/USD" and "XAU/USD" both answer USD, "US30" answers null. Deliberately
// looser than `forexPair`, which additionally requires the BASE to be a
// currency: gold is not a currency pair (so it speaks points, not pips) and is
// still priced in dollars, so a dollar move on it is still money. Reads the one
// currency list in this file, so there is no second copy to drift.
export function quoteCurrencyOf(instrument: string): string | null {
  const m = /^[A-Z0-9]{2,10}\/([A-Z]{3})$/.exec(instrument.trim().toUpperCase());
  if (!m) return null;
  return CURRENCIES.has(m[1]) ? m[1] : null;
}

export function pipSizeFor(quote: string): number {
  // JPY pairs are quoted to 2-3 decimals, so one pip is 0.01.
  return quote === 'JPY' ? 0.01 : 0.0001;
}

// The realized move of a closed (or marked) trade in pips, sign-adjusted for
// side: a long that exits above entry is positive, a short that exits below
// entry is positive. Null when the instrument isn't a currency pair, or a price
// is missing — non-forex trades (metals, indices, crypto) have no pip size, so
// callers show money only there. This is the profit/loss of a trade expressed in
// pips, the desk's preferred unit.
export function tradePips(
  side: 'long' | 'short',
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

// Account-currency value of one pip for `units` of the pair. Exact for the
// common case where the account currency is the pair's quote (then a pip is
// worth units * pipSize directly) or its base (divide by the current price). For
// a cross pair where the account currency is neither side, we cannot convert
// without an extra rate, so we derive the pip value from the broker's own
// unrealized P/L once the trade has moved at least a pip; otherwise we return
// null and the UI shows pips only.
export function moneyPerPip(args: {
  base: string;
  quote: string;
  units: number;
  pipSize: number;
  accountCurrency: string;
  currentPrice: number | null;
  unrealizedPl: number | null;
  pipsOpen: number | null;
}): number | null {
  const { base, quote, units, pipSize, accountCurrency: acct, currentPrice, unrealizedPl, pipsOpen } = args;
  if (units <= 0) return null;
  const inQuote = units * pipSize; // pip value in the quote currency
  if (quote === acct) return inQuote;
  if (base === acct && currentPrice && currentPrice > 0) return inQuote / currentPrice;
  if (unrealizedPl != null && pipsOpen != null && Math.abs(pipsOpen) >= 1) {
    return Math.abs(unrealizedPl / pipsOpen);
  }
  return null;
}

const round = (n: number, dp: number) => Number(n.toFixed(dp));

// Compute the full forex metric set for one open trade. Returns null when the
// instrument is not a currency pair, so callers can leave non-forex trades
// untouched. Money fields are populated here (ungated); the service nulls them
// for users who may not see balances, exactly as it does for unrealized P/L.
export function computeForex(t: LiveTrade, accountCurrency: string): ForexMetrics | null {
  const pair = forexPair(t.instrument);
  if (!pair) return null;
  const [base, quote] = pair;
  const pipSize = pipSizeFor(quote);
  const sign = t.side === 'long' ? 1 : -1;

  const pipsOpen =
    t.currentPrice != null ? round(((t.currentPrice - t.entryPrice) * sign) / pipSize, 1) : null;

  const perPip = moneyPerPip({
    base,
    quote,
    units: t.units,
    pipSize,
    accountCurrency,
    currentPrice: t.currentPrice,
    unrealizedPl: t.unrealizedPl,
    pipsOpen,
  });

  const leg = (target: number | null): ForexLeg | null => {
    if (target == null) return null;
    const pips = round(Math.abs(target - t.entryPrice) / pipSize, 1);
    const money = perPip != null ? round(pips * perPip, 2) : null;
    return { pips, money };
  };

  const risk = leg(t.stopLoss);
  const reward = leg(t.takeProfit);
  const rr = risk && reward && risk.pips > 0 ? round(reward.pips / risk.pips, 2) : null;

  return {
    pipSize,
    accountCurrency,
    pipsOpen,
    moneyPerPip: perPip != null ? round(perPip, 4) : null,
    risk,
    reward,
    rr,
  };
}
