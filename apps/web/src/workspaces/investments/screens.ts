// The section keys the Investments workspace renders.
//
// Deliberately its own module with no component imports: Portal needs this set
// eagerly to decide what to route, and importing it from index.tsx would pull
// the entire workspace into the main bundle and undo the lazy chunk.

export const INVESTMENT_SCREENS = new Set([
  'inv_overview',
  'inv_accounts',
  'inv_holdings',
  'inv_allocation',
  'inv_performance',
  'inv_dividends',
  'inv_contributions',
  'inv_projections',
]);
