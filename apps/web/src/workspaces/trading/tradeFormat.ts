// How the desk writes a number: money, pips, a position size, a price.
//
// These lived in `TradeCard.tsx` and moved here when the position editor became
// shared. The card imports the editor and the editor needs these formatters — so
// left where they were, the two files would import each other. `TradeCard`
// re-exports every one of them, so `import { fmtMoney } from './TradeCard'`
// keeps working exactly as before (the same thing it already does for the
// open/close stamps in `tradeTime`).

export const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US');

// Money in the account currency. USD shows as "$"; other currencies append the
// code so the number is never mistaken for dollars.
export function fmtMoney(n: number, ccy: string): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : '';
  return ccy === 'USD' ? `${sign}$${abs}` : `${sign}${abs} ${ccy}`;
}

// Pips with one decimal and an optional sign (for signed open-P/L distances).
export function fmtPips(n: number, signed = false): string {
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${signed && n > 0 ? '+' : ''}${s} pip${Math.abs(n) === 1 ? '' : 's'}`;
}

// A position size, at whatever precision it actually needs. Sizes span
// 100,000 units of EUR/USD down to 0.00042 of a bitcoin, and the default
// three-decimal locale format prints that second one as "0" — so the smaller
// the size, the more decimals it keeps.
export function fmtUnits(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
  return Number(n.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

// Prices span forex (1.08425), indices (38,958), and crypto (64,255). Show
// thousands with separators and few decimals; sub-1000 prices keep precision.
export function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}
