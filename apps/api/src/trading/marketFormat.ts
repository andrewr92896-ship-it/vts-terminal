// Formatting rules shared by the Market Data board's two providers
// (`marketQuotes.ts` over OANDA, `marketMacro.ts` over FRED).
//
// This module deliberately imports NOTHING. The indices and energy rows can be
// filled by either provider and must render identically whichever answered, so
// the rule has to live in one place — but `marketQuotes.ts` reaches the database
// through the broker-connection lookup, and importing it for a formatter would
// drag a database open into the offline check script. Keep this file free of
// dependencies.

// How many decimals a percent can afford before it stops fitting its column.
// The change columns are narrow and fixed, so a large move has to spend its
// characters on the digits that carry information: the VIX falling 17.24%
// rendered as "−17.24%" and was clipped on screen to "−17.2…", which is
// strictly worse than showing "−17.2%". A small move keeps its precision.
export function pctDecimals(pct: number, decimals: number): number {
  const m = Math.abs(pct);
  if (m >= 100) return 0;
  if (m >= 10) return Math.min(decimals, 1);
  return decimals;
}
