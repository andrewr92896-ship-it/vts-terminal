// READING A TRADE OFF A SCREENSHOT — the demo's version.
//
// The real feature is the one people ask about first: paste a photo of your
// broker or prop-firm platform, a model reads the fill, the size and the levels
// off it, and the trade is logged — opened, closed, or a whole history at once.
// It is the thing the terminal does that a spreadsheet cannot, so a showcase
// that cannot show it is showing the wrong product.
//
// NO MODEL RUNS HERE, AND THE ANSWER SAYS SO IN THE PLACE THE SCREEN PRINTS IT.
// Every AI-shaped call in the public terminal fails closed until the provider
// migration, and this is a deliberate, narrow exception to that: three named
// screenshot readers answer out of this file with a STORED result, and every
// other AI method is still refused by name before the demo is consulted.
//
// The distinction that keeps it honest is where the answer lands. `model` is
// what the screens render as provenance — normally the model that did the
// reading — so here it reads as a sample rather than naming a model that never
// ran. A demo may show what a feature produces; it may not imply that the
// feature ran.
//
// THE SAMPLE IS PLAUSIBLE, NOT FLATTERING, like the rest of the seed: the
// history import brings in a loser, skips a duplicate rather than quietly
// double-counting it, and ignores a row that was never a trade. A reader that
// only ever returned clean wins would be demonstrating a different product.
export const SAMPLE_MODEL = 'Sample read — no AI ran in the demo';

// USD/CAD deliberately: nothing else in the seed trades it, so a test asserting
// the read landed is asserting THIS read rather than finding a row that was
// already there. A sample that collides with the seed proves nothing.
export const SAMPLE_OPEN = {
  instrument: 'USD/CAD',
  side: 'long' as const,
  units: 1,
  entryPrice: 1.3642,
  currentPrice: 1.3668,
  takeProfit: 1.3735,
  stopLoss: 1.3598,
  summary: 'Read one open position: 1.00 lot USD/CAD long at 1.3642, stop 1.3598, target 1.3735.',
};

// Three rows out of a history screenshot, and only two of them are new. The
// third is already on the account, which is what the skip count is for — an
// importer that silently re-added it would inflate every figure downstream.
export const SAMPLE_HISTORY = [
  { instrument: 'EUR/USD', side: 'long' as const, units: 2, entryPrice: 1.0842, exitPrice: 1.0871, realizedPl: 580 },
  { instrument: 'US30', side: 'short' as const, units: 1, entryPrice: 39120, exitPrice: 39268, realizedPl: -148 },
];

export const SAMPLE_CLOSE = { exitPrice: 1.3671, realizedPl: 290 };
