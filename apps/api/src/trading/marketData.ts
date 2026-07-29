// The Market Data catalog — every rate, print and price the desk watches, as a
// flat list of series grouped into ten sections, plus the FOMC meeting schedule
// the screen's Fed decision bar counts down to.
//
// SAMPLE VALUES. The portal has no macro-data provider wired yet (OANDA and
// Kraken cover live FX/crypto/metals prices; nothing covers CPI, payrolls, the
// Treasury curve, Fed balance sheet, …). Every `value` / `changes` entry below
// is a fixture lifted from the design prototype so the screen is complete and
// judgeable, and the payload carries `sampleValues: true` so the UI can say so
// out loud. Per the design's copy conventions a figure that is not real must be
// marked as sample data — do not drop that flag without wiring real values.
//
// When a provider does land, keep this module's shape: replace `value`,
// `changes`, `asOf` and `source` per series from the feed and flip
// `sampleValues` (or move to a per-series `sample` flag) so partially-real
// boards stay honest. `review` and `session` are structural and stay here.

// Group order is the board's section order. Kept as a tuple so it doubles as the
// Zod enum for a saved custom metric's group.
export const MARKET_GROUP_KEYS = [
  'policy',
  'inflation',
  'labor',
  'yields',
  'fx',
  'commod',
  'crypto',
  'equity',
  'macro',
  'session',
] as const;

export type MarketGroupKey = (typeof MARKET_GROUP_KEYS)[number];

const GROUP_LABELS: Record<MarketGroupKey, string> = {
  policy: 'Policy & rates',
  inflation: 'Inflation',
  labor: 'Labor & growth',
  yields: 'Yields & curve',
  fx: 'FX & dollar',
  commod: 'Commodities',
  crypto: 'Crypto',
  equity: 'Indices & volatility',
  macro: 'Macro & liquidity',
  session: 'Sessions',
};

export const MARKET_DATA_GROUPS: { key: MarketGroupKey; label: string }[] = MARKET_GROUP_KEYS.map(
  (key) => ({ key, label: GROUP_LABELS[key] }),
);

// Freshness, rendered as the coloured dot on a tile / row.
export type MarketFreshness = 'live' | 'manual' | 'stale';

// Who publishes a series and when it is next revised. `last` is either an ISO
// date or a cadence phrase ('continuous', 'daily · 3:30 PM'); a cadence renders
// verbatim with no arrow. `next` is an ISO date, the literal 'fomc' (resolve to
// the next Fed meeting), or '' for "to be confirmed".
export interface MarketReview {
  body: string;
  last: string;
  next: string;
}

export interface MarketSeries {
  id: string;
  group: MarketGroupKey;
  label: string;
  value: string; // display-ready; empty for a session (computed from the clock)
  unit: string;
  asOf: string;
  source: MarketFreshness;
  money: boolean; // masked in privacy mode
  // ET minutes-of-day [open, close] for a trading-session row. Set only on the
  // `session` group; the client computes Open/Closed against the live ET clock
  // so it never goes stale between polls.
  session: [number, number] | null;
  changes: [string, string, string, string, string]; // 1D, 1W, 1M, YTD, 1Y
  review: MarketReview;
}

// The five change periods, in column order.
export const MARKET_PERIODS = ['1D', '1W', '1M', 'YTD', '1Y'] as const;

// FOMC statement dates as MM-DD, composed onto 2:00 PM Eastern. Real dates, not
// arithmetic — the Fed publishes them a year ahead. Update this list each year.
export const FOMC_MEETINGS_2026 = [
  '01-28',
  '03-18',
  '04-29',
  '06-17',
  '07-29',
  '09-16',
  '10-28',
  '12-09',
];
export const FOMC_MEETING_YEAR = 2026;

// The trader's board before they customize it.
export const DEFAULT_PINNED_SERIES = [
  'ffr',
  'cut9',
  'cpi',
  'cpiytd',
  'cpce',
  'unrate',
  'y2',
  'y10',
  's2s10',
  'real10',
  'dxy',
  'gold',
  'btc',
  'us500',
  'vix',
];

// Per-group review fallback for series whose publisher is the venue itself.
const REVIEW_BY_GROUP: Partial<Record<MarketGroupKey, MarketReview>> = {
  yields: { body: 'US Treasury', last: 'daily · 3:30 PM', next: '' },
  fx: { body: 'Interbank', last: 'continuous', next: '' },
  commod: { body: 'Exchange', last: 'continuous', next: '' },
  crypto: { body: 'Exchange', last: 'continuous', next: '' },
  equity: { body: 'Exchange', last: 'continuous', next: '' },
  session: { body: 'Exchange hours', last: 'daily', next: '' },
};

const MANUAL_REVIEW: MarketReview = {
  body: 'Manual entry',
  last: 'when you update it',
  next: '',
};

// A catalog row before its review is resolved. `rev` overrides the group default.
interface SeriesDef {
  g: MarketGroupKey;
  id: string;
  l: string;
  v?: string;
  u?: string;
  a: string;
  s?: MarketFreshness;
  money?: true;
  sess?: [number, number];
  c?: [string, string, string, string, string];
  rev?: [string, string, string];
}

const NO_CHANGE: [string, string, string, string, string] = ['—', '—', '—', '—', '—'];

const DEFS: SeriesDef[] = [
  // ---- Policy & rates ----
  { g: 'policy', id: 'ffr', l: 'Fed funds target', v: '4.25–4.50', u: '%', a: 'held since Dec 2025', c: ['0.00', '0.00', '0.00', '−0.25', '−0.50'], rev: ['FOMC', '2026-06-17', 'fomc'] },
  { g: 'policy', id: 'effr', l: 'Effective fed funds', v: '4.33', u: '%', a: 'Jul 28 · NY Fed', c: ['0.00', '0.00', '−0.01', '−0.25', '−0.49'], rev: ['NY Fed', 'daily · 9:00 AM', ''] },
  { g: 'policy', id: 'iorb', l: 'Interest on reserves', v: '4.40', u: '%', a: 'Jul 28', c: ['0.00', '0.00', '0.00', '−0.25', '−0.50'], rev: ['Fed Board', 'daily', ''] },
  { g: 'policy', id: 'sofr', l: 'SOFR', v: '4.31', u: '%', a: 'Jul 28', c: ['−0.01', '+0.01', '−0.02', '−0.26', '−0.52'], rev: ['NY Fed', 'daily · 8:00 AM', ''] },
  { g: 'policy', id: 'cut9', l: 'Next meeting cut odds', v: '78', u: '%', a: 'implied · 1-week change', c: ['+2', '+6', '+18', '+41', '+63'], rev: ['CME FedWatch', 'continuous', ''] },
  { g: 'policy', id: 'hold7', l: 'Hold priced · next meeting', v: '96', u: '%', a: 'implied · futures', c: ['−1', '−2', '−7', '−22', '−38'], rev: ['CME FedWatch', 'continuous', ''] },
  { g: 'policy', id: 'dots', l: '2026 dot-plot median', v: '3.875', u: '%', a: 'June SEP', s: 'manual', c: ['0.00', '0.00', '0.00', '−0.13', '−0.38'], rev: ['FOMC · SEP', '2026-06-17', 'fomc'] },
  { g: 'policy', id: 'disc', l: 'Primary credit rate', v: '4.50', u: '%', a: 'Jun 17', c: ['0.00', '0.00', '0.00', '−0.25', '−0.50'], rev: ['Fed Board', '2026-06-17', 'fomc'] },
  { g: 'policy', id: 'ecb', l: 'ECB deposit rate', v: '2.00', u: '%', a: 'held · next Sep 10', c: ['0.00', '0.00', '0.00', '−0.25', '−1.00'], rev: ['ECB Governing Council', '2026-07-23', '2026-09-10'] },
  { g: 'policy', id: 'boe', l: 'BoE bank rate', v: '3.75', u: '%', a: 'cut Jun 19 · next Aug 6', c: ['0.00', '0.00', '−0.25', '−0.50', '−1.25'], rev: ['BoE MPC', '2026-06-19', '2026-08-06'] },
  { g: 'policy', id: 'boj', l: 'BoJ policy rate', v: '0.75', u: '%', a: 'raised Mar 19', c: ['0.00', '0.00', '0.00', '+0.25', '+0.50'], rev: ['BoJ Policy Board', '2026-06-17', '2026-07-31'] },

  // ---- Inflation ----
  { g: 'inflation', id: 'cpi', l: 'CPI y/y · 1-yr inflation', v: '2.6', u: '%', a: 'Jun · rel Jul 14', c: ['0.0', '0.0', '−0.1', '−0.3', '−0.5'], rev: ['BLS', '2026-07-14', '2026-08-12'] },
  { g: 'inflation', id: 'ccpi', l: 'Core CPI y/y', v: '2.9', u: '%', a: 'Jun · rel Jul 14', c: ['0.0', '0.0', '−0.1', '−0.2', '−0.4'], rev: ['BLS', '2026-07-14', '2026-08-12'] },
  { g: 'inflation', id: 'cpiytd', l: 'CPI year to date', v: '1.4', u: '%', a: 'Dec→Jun · ≈2.8% ann.', c: ['0.0', '+0.1', '+0.3', '+1.4', '—'], rev: ['BLS', '2026-07-14', '2026-08-12'] },
  { g: 'inflation', id: 'pce', l: 'PCE y/y', v: '2.4', u: '%', a: 'Jun · released today', c: ['−0.2', '−0.2', '−0.2', '−0.3', '−0.6'], rev: ['BEA', '2026-07-29', '2026-08-28'] },
  { g: 'inflation', id: 'cpce', l: 'Core PCE y/y', v: '2.7', u: '%', a: 'Jun · released today', c: ['−0.1', '−0.1', '−0.2', '−0.3', '−0.5'], rev: ['BEA', '2026-07-29', '2026-08-28'] },
  { g: 'inflation', id: 'cpcemm', l: 'Core PCE m/m', v: '0.2', u: '%', a: 'Jun', c: ['0.0', '0.0', '−0.1', '−0.1', '−0.1'], rev: ['BEA', '2026-07-29', '2026-08-28'] },
  { g: 'inflation', id: 'ppi', l: 'PPI y/y', v: '2.3', u: '%', a: 'Jun', c: ['0.0', '0.0', '+0.1', '−0.2', '−0.4'], rev: ['BLS', '2026-07-16', '2026-08-14'] },
  { g: 'inflation', id: 'be1', l: '1-yr breakeven', v: '2.44', u: '%', a: 'live · 1-day', c: ['−0.03', '−0.06', '−0.11', '−0.24', '−0.38'], rev: ['US Treasury', 'daily · 3:30 PM', ''] },
  { g: 'inflation', id: 'be5', l: '5-yr breakeven', v: '2.31', u: '%', a: 'live · 1-day', c: ['−0.02', '−0.05', '−0.09', '−0.18', '−0.29'], rev: ['US Treasury', 'daily · 3:30 PM', ''] },
  { g: 'inflation', id: 'be10', l: '10-yr breakeven', v: '2.28', u: '%', a: 'live · 1-day', c: ['−0.01', '−0.03', '−0.07', '−0.14', '−0.22'], rev: ['US Treasury', 'daily · 3:30 PM', ''] },
  { g: 'inflation', id: 'umich', l: 'UMich 1-yr expectations', v: '3.1', u: '%', a: 'Jul prelim', c: ['0.0', '−0.2', '−0.4', '−0.7', '−1.2'], rev: ['Univ. of Michigan', '2026-07-17', '2026-07-31'] },
  { g: 'inflation', id: 'nowcast', l: 'Cleveland nowcast · Jul', v: '2.5', u: '%', a: 'model · Jul 28', s: 'manual', c: ['0.0', '−0.1', '−0.2', '−0.4', '—'], rev: ['Cleveland Fed', 'daily', ''] },

  // ---- Labor & growth ----
  { g: 'labor', id: 'unrate', l: 'Unemployment rate', v: '4.3', u: '%', a: 'Jun', c: ['0.0', '0.0', '+0.1', '+0.2', '+0.4'], rev: ['BLS', '2026-07-03', '2026-08-07'] },
  { g: 'labor', id: 'nfp', l: 'Nonfarm payrolls', v: '+112', u: 'K', a: 'Jun · next Aug 7', c: ['0', '0', '−33', '−52', '−78'], rev: ['BLS', '2026-07-03', '2026-08-07'] },
  { g: 'labor', id: 'nfp3', l: 'Payrolls 3-mo average', v: '+134', u: 'K', a: 'Apr–Jun', c: ['0', '0', '−21', '−44', '−69'], rev: ['BLS', '2026-07-03', '2026-08-07'] },
  { g: 'labor', id: 'ahe', l: 'Avg hourly earnings y/y', v: '3.5', u: '%', a: 'Jun', c: ['0.0', '0.0', '0.0', '−0.2', '−0.6'], rev: ['BLS', '2026-07-03', '2026-08-07'] },
  { g: 'labor', id: 'claims', l: 'Initial jobless claims', v: '217', u: 'K', a: 'wk to Jul 25', c: ['−4', '−4', '+9', '+14', '+22'], rev: ['DOL', '2026-07-24', '2026-07-30'] },
  { g: 'labor', id: 'part', l: 'Participation rate', v: '62.4', u: '%', a: 'Jun', c: ['0.0', '0.0', '−0.1', '−0.2', '−0.3'], rev: ['BLS', '2026-07-03', '2026-08-07'] },
  { g: 'labor', id: 'gdp', l: 'Real GDP q/q saar', v: '3.8', u: '%', a: 'Q1 final', c: ['0.0', '0.0', '0.0', '−1.5', '+0.4'], rev: ['BEA', '2026-06-26', '2026-07-30'] },
  { g: 'labor', id: 'gdpq2', l: 'Q2 advance GDP · fcst', v: '2.3', u: '%', a: 'advance due 8:30 AM', s: 'manual', c: ['0.0', '+0.1', '−0.3', '—', '—'], rev: ['BEA', '2026-06-26', '2026-07-30'] },
  { g: 'labor', id: 'ismm', l: 'ISM manufacturing', v: '49.1', a: 'Jun', c: ['0.0', '+0.7', '+1.2', '−0.9', '−1.8'], rev: ['ISM', '2026-07-01', '2026-08-03'] },
  { g: 'labor', id: 'isms', l: 'ISM services', v: '52.4', a: 'Jun', c: ['0.0', '+1.1', '+0.8', '+0.4', '−1.1'], rev: ['ISM', '2026-07-01', '2026-08-03'] },
  { g: 'labor', id: 'retail', l: 'Retail sales m/m', v: '0.4', u: '%', a: 'Jun', c: ['0.0', '+0.2', '+0.1', '−0.3', '−0.5'], rev: ['Census Bureau', '2026-07-16', '2026-08-14'] },

  // ---- Yields & curve ----
  { g: 'yields', id: 'y3m', l: 'UST 3-month', v: '4.28', u: '%', a: 'live', c: ['−0.01', '−0.03', '−0.08', '−0.26', '−0.55'] },
  { g: 'yields', id: 'y2', l: 'UST 2-year', v: '3.68', u: '%', a: 'live', c: ['−0.03', '−0.09', '−0.21', '−0.48', '−0.86'] },
  { g: 'yields', id: 'y10', l: 'UST 10-year', v: '4.02', u: '%', a: 'live', c: ['−0.04', '−0.11', '−0.18', '−0.55', '−0.34'] },
  { g: 'yields', id: 'y30', l: 'UST 30-year', v: '4.61', u: '%', a: 'live', c: ['−0.02', '−0.08', '−0.12', '−0.41', '−0.18'] },
  { g: 'yields', id: 's2s10', l: 'UST 2y–10y spread', v: '+34', u: 'bps', a: '2s10s · live', c: ['+1', '−2', '+3', '−7', '+52'] },
  { g: 'yields', id: 's3m10', l: 'UST 3m–10y spread', v: '−26', u: 'bps', a: '3m10y · live', c: ['+3', '+8', '+10', '+29', '+21'] },
  { g: 'yields', id: 'real10', l: '10-yr real · TIPS', v: '1.74', u: '%', a: 'live', c: ['−0.05', '−0.09', '−0.14', '−0.42', '−0.31'] },
  { g: 'yields', id: 'mtg30', l: '30-yr mortgage', v: '6.42', u: '%', a: 'wk to Jul 24', c: ['−0.06', '−0.14', '−0.22', '−0.61', '−0.88'], rev: ['Freddie Mac', '2026-07-24', '2026-07-30'] },

  // ---- FX & dollar ----
  { g: 'fx', id: 'dxy', l: 'DXY dollar index', v: '96.84', a: '3-week low', c: ['−0.31%', '−0.9%', '−2.1%', '−4.8%', '−6.2%'], rev: ['ICE', 'continuous', ''] },
  { g: 'fx', id: 'eurusd', l: 'EUR/USD', v: '1.0968', a: 'live', c: ['+0.28%', '+0.8%', '+1.9%', '+4.4%', '+5.8%'] },
  { g: 'fx', id: 'gbpusd', l: 'GBP/USD', v: '1.2941', a: 'live', c: ['+0.19%', '+0.6%', '+1.4%', '+3.1%', '+4.2%'] },
  { g: 'fx', id: 'usdjpy', l: 'USD/JPY', v: '145.62', a: 'live', c: ['−0.34%', '−1.1%', '−2.4%', '−5.1%', '−3.9%'] },
  { g: 'fx', id: 'usdcad', l: 'USD/CAD', v: '1.3612', a: 'live', c: ['−0.11%', '−0.3%', '−0.8%', '−1.9%', '−2.4%'] },
  { g: 'fx', id: 'audusd', l: 'AUD/USD', v: '0.6684', a: 'live', c: ['+0.22%', '+0.7%', '+1.6%', '+3.8%', '+2.9%'] },

  // ---- Commodities ----
  { g: 'commod', id: 'gold', l: 'Gold · XAU/USD', v: '3,486.40', a: 'record high', c: ['+0.72%', '+2.4%', '+6.1%', '+34.2%', '+41.8%'], rev: ['LBMA · COMEX', 'continuous', ''] },
  { g: 'commod', id: 'silver', l: 'Silver · XAG/USD', v: '41.18', a: 'high since 2011', c: ['+1.34%', '+3.8%', '+9.4%', '+42.6%', '+55.1%'], rev: ['LBMA · COMEX', 'continuous', ''] },
  { g: 'commod', id: 'wti', l: 'WTI crude', v: '71.05', a: 'live', c: ['−0.18%', '−1.2%', '+2.8%', '−4.1%', '−8.6%'], rev: ['NYMEX', 'continuous', ''] },
  { g: 'commod', id: 'brent', l: 'Brent crude', v: '74.32', a: 'live', c: ['−0.12%', '−1.0%', '+2.4%', '−3.6%', '−7.9%'], rev: ['ICE', 'continuous', ''] },
  { g: 'commod', id: 'copper', l: 'Copper', v: '4.68', a: 'live', c: ['+0.41%', '+1.3%', '+3.9%', '+12.4%', '+15.2%'] },
  { g: 'commod', id: 'natgas', l: 'Nat gas', v: '3.14', a: 'live', c: ['−1.20%', '−3.4%', '+6.2%', '+8.1%', '+21.4%'] },

  // ---- Crypto ----
  { g: 'crypto', id: 'btc', l: 'BTC/USD', v: '118,240', a: 'live', c: ['+1.10%', '+3.2%', '+8.4%', '+26.1%', '+38.9%'] },
  { g: 'crypto', id: 'eth', l: 'ETH/USD', v: '4,062', a: 'live', c: ['+0.84%', '+2.6%', '+6.9%', '+18.4%', '+24.2%'] },
  { g: 'crypto', id: 'btcetf', l: 'BTC spot ETF net flow', v: '+412', u: 'M USD', a: 'Jul 28', money: true, c: ['+412', '+1.9B', '+4.2B', '+18.6B', '+31.4B'], rev: ['Issuer filings', 'daily', ''] },
  { g: 'crypto', id: 'funding', l: 'BTC perp funding · 8h', v: '0.008', u: '%', a: 'live', c: ['0.000', '+0.001', '−0.002', '−0.004', '−0.009'] },
  { g: 'crypto', id: 'dom', l: 'BTC dominance', v: '58.4', u: '%', a: 'live', c: ['−0.2', '−0.4', '+0.8', '+2.1', '+3.4'] },

  // ---- Indices & volatility ----
  { g: 'equity', id: 'us100', l: 'US100 · Nasdaq 100', v: '24,918', a: 'live', c: ['+0.42%', '+1.4%', '+3.8%', '+14.2%', '+21.6%'] },
  { g: 'equity', id: 'us500', l: 'US500 · S&P 500', v: '6,742', a: 'live', c: ['+0.28%', '+1.1%', '+3.1%', '+11.8%', '+17.4%'] },
  { g: 'equity', id: 'us30', l: 'US30 · Dow', v: '45,180', a: 'live', c: ['−0.11%', '+0.6%', '+2.2%', '+7.9%', '+12.1%'] },
  { g: 'equity', id: 'vix', l: 'VIX', v: '14.20', a: 'live', c: ['−2.06%', '−6.4%', '−12.8%', '−18.4%', '−24.1%'], rev: ['Cboe', 'continuous', ''] },
  { g: 'equity', id: 'move', l: 'MOVE index · rate vol', v: '88.4', a: 'live', c: ['−1.30%', '−4.2%', '−8.6%', '−16.2%', '−22.8%'], rev: ['ICE BofA', 'continuous', ''] },
  { g: 'equity', id: 'eps', l: 'S&P Q2 blended EPS y/y', v: '+8.4', u: '%', a: 'FactSet · Jul 25', s: 'manual', c: ['0.0', '+0.4', '+1.1', '+2.6', '+3.8'], rev: ['FactSet', '2026-07-25', '2026-08-01'] },

  // ---- Macro & liquidity ----
  { g: 'macro', id: 'bs', l: 'Fed balance sheet', v: '6.42', u: 'T USD', a: 'H.4.1 · Jul 24', c: ['−12B', '−34B', '−96B', '−284B', '−512B'], rev: ['Fed H.4.1', '2026-07-24', '2026-07-30'] },
  { g: 'macro', id: 'rrp', l: 'Overnight reverse repo', v: '18', u: 'B USD', a: 'Jul 28', c: ['−4B', '−9B', '−22B', '−68B', '−141B'], rev: ['NY Fed', 'daily · 1:15 PM', ''] },
  { g: 'macro', id: 'nfci', l: 'Chicago Fed NFCI', v: '−0.52', a: 'wk to Jul 24', c: ['0.00', '−0.02', '−0.06', '−0.14', '−0.22'], rev: ['Chicago Fed', '2026-07-29', '2026-08-05'] },
  { g: 'macro', id: 'recprob', l: 'NY Fed 12-mo recession prob', v: '28', u: '%', a: 'Jun curve', c: ['0', '−2', '−4', '−9', '−14'], rev: ['NY Fed', '2026-07-01', '2026-08-03'] },
  { g: 'macro', id: 'sahm', l: 'Sahm rule gap', v: '0.13', a: 'Jun', c: ['0.00', '+0.03', '+0.03', '+0.07', '+0.11'], rev: ['BLS · derived', '2026-07-03', '2026-08-07'] },
  { g: 'macro', id: 'citi', l: 'Citi econ surprise · US', v: '+12.4', a: 'Jul 28', s: 'manual', c: ['+0.8', '+3.1', '+6.4', '+11.2', '+9.6'], rev: ['Citi', 'daily', ''] },

  // ---- Sessions ----
  // No value here: Open/Closed is computed client-side from the ET clock, so it
  // is right to the second regardless of when the payload was fetched.
  { g: 'session', id: 'ny', l: 'New York session', a: '09:30–16:00 ET', sess: [570, 960] },
  { g: 'session', id: 'london', l: 'London session', a: '03:00–11:30 ET', sess: [180, 690] },
  { g: 'session', id: 'tokyo', l: 'Tokyo session', a: '19:00–04:00 ET', sess: [1140, 240] },
  { g: 'session', id: 'sydney', l: 'Sydney session', a: '17:00–02:00 ET', sess: [1020, 120] },
];

function resolveReview(def: SeriesDef): MarketReview {
  if (def.rev) return { body: def.rev[0], last: def.rev[1], next: def.rev[2] };
  return REVIEW_BY_GROUP[def.g] ?? MANUAL_REVIEW;
}

export const MARKET_SERIES: MarketSeries[] = DEFS.map((d) => ({
  id: d.id,
  group: d.g,
  label: d.l,
  value: d.v ?? '',
  unit: d.u ?? '',
  asOf: d.a,
  source: d.s ?? 'live',
  money: d.money === true,
  session: d.sess ?? null,
  changes: d.c ?? NO_CHANGE,
  review: resolveReview(d),
}));

export interface MarketDataPayload {
  groups: { key: MarketGroupKey; label: string }[];
  series: MarketSeries[];
  periods: string[];
  defaultPins: string[];
  meetings: string[];
  meetingYear: number;
  // True while the board's figures are design fixtures rather than a live feed.
  // The UI must say so; see the note at the top of this file.
  sampleValues: boolean;
}

export function getMarketData(): MarketDataPayload {
  return {
    groups: MARKET_DATA_GROUPS,
    series: MARKET_SERIES,
    periods: [...MARKET_PERIODS],
    defaultPins: DEFAULT_PINNED_SERIES,
    meetings: FOMC_MEETINGS_2026,
    meetingYear: FOMC_MEETING_YEAR,
    sampleValues: true,
  };
}

export function isKnownSeriesId(id: string): boolean {
  return MARKET_SERIES.some((s) => s.id === id);
}
