// Links a market-news headline to the instruments on a trader's watchlist that
// it is likely to move, so each headline can show "this affects your EUR/USD".
// Pure and dependency-free: the connection is deliberately conservative — a chip
// only appears when the headline actually names a currency, central bank, or
// asset that the instrument is built from. We never guess.

// A normalized driver a headline can reference and an instrument can depend on
// (a currency, a central bank's currency, or an asset class).
type Factor = string;

// Keyword / phrase -> factor. Matched as whole words against the headline text,
// so multi-word central-bank names and country names resolve to their currency.
const FACTOR_KEYWORDS: Record<Factor, string[]> = {
  USD: ['USD', 'DOLLAR', 'GREENBACK', 'FED', 'FOMC', 'FEDERAL RESERVE', 'POWELL', 'TREASURY', 'NONFARM', 'NFP', 'US', 'U S', 'AMERICA', 'AMERICAN', 'UNITED STATES'],
  EUR: ['EUR', 'EURO', 'EUROZONE', 'ECB', 'LAGARDE', 'GERMANY', 'GERMAN', 'FRANCE', 'FRENCH'],
  GBP: ['GBP', 'POUND', 'STERLING', 'BOE', 'BANK OF ENGLAND', 'BRITAIN', 'BRITISH', 'UK'],
  JPY: ['JPY', 'YEN', 'BOJ', 'BANK OF JAPAN', 'JAPAN', 'JAPANESE', 'UEDA'],
  AUD: ['AUD', 'AUSSIE', 'RBA', 'AUSTRALIA', 'AUSTRALIAN'],
  NZD: ['NZD', 'KIWI', 'RBNZ', 'NEW ZEALAND'],
  CAD: ['CAD', 'LOONIE', 'BOC', 'BANK OF CANADA', 'CANADA', 'CANADIAN'],
  CHF: ['CHF', 'FRANC', 'SNB', 'SWISS', 'SWITZERLAND'],
  GOLD: ['GOLD', 'XAU', 'BULLION'],
  SILVER: ['SILVER', 'XAG'],
  OIL: ['OIL', 'CRUDE', 'WTI', 'BRENT', 'OPEC'],
  BTC: ['BTC', 'BITCOIN'],
  ETH: ['ETH', 'ETHER', 'ETHEREUM'],
  CRYPTO: ['CRYPTO', 'CRYPTOCURRENCY', 'DIGITAL ASSET', 'DIGITAL ASSETS'],
  NASDAQ: ['NASDAQ', 'NAS100', 'US100'],
  DOW: ['DOW', 'DJIA', 'US30'],
  SP500: ['S&P', 'SP500', 'US500', 'SP 500', 'S P 500'],
  EQUITIES: ['STOCKS', 'EQUITIES', 'EQUITY', 'WALL STREET', 'SHARES'],
};

// The drivers a single instrument depends on. A forex pair depends on both of
// its currencies; metals/crypto/indices map to their asset (plus their quote
// currency); anything else is treated as a US-listed equity.
function instrumentFactors(instrument: string): Factor[] {
  const sym = instrument.trim().toUpperCase();
  const fx = /^([A-Z]{3})\/([A-Z]{3})$/.exec(sym);
  if (fx) {
    const factors = new Set<Factor>();
    for (const code of [fx[1], fx[2]]) {
      if (code === 'XAU') factors.add('GOLD');
      else if (code === 'XAG') factors.add('SILVER');
      else if (code === 'BTC') { factors.add('BTC'); factors.add('CRYPTO'); }
      else if (code === 'ETH') { factors.add('ETH'); factors.add('CRYPTO'); }
      else factors.add(code); // a real currency
    }
    return [...factors];
  }
  if (sym === 'US100' || sym === 'NAS100') return ['NASDAQ', 'EQUITIES', 'USD'];
  if (sym === 'US30') return ['DOW', 'EQUITIES', 'USD'];
  if (sym === 'US500' || sym === 'SPX500' || sym === 'SPX') return ['SP500', 'EQUITIES', 'USD'];
  if (sym.startsWith('BTC')) return ['BTC', 'CRYPTO', ...(sym.includes('USD') ? ['USD'] : [])];
  if (sym.startsWith('ETH')) return ['ETH', 'CRYPTO', ...(sym.includes('USD') ? ['USD'] : [])];
  // Fall back to a US equity ticker.
  return ['EQUITIES', 'USD'];
}

// Detect which drivers a headline references. Whole-word matching on a
// normalized copy of the text avoids 3-letter codes matching inside other words.
function detectFactors(text: string, category?: string): Set<Factor> {
  const hay = ' ' + text.toUpperCase().replace(/[^A-Z0-9&]+/g, ' ') + ' ';
  const detected = new Set<Factor>();
  for (const [factor, kws] of Object.entries(FACTOR_KEYWORDS)) {
    if (kws.some((kw) => hay.includes(` ${kw} `))) detected.add(factor);
  }
  if (category === 'crypto') detected.add('CRYPTO');
  return detected;
}

export interface NewsLike {
  title: string;
  body?: string | null;
  source?: string | null;
  category?: string;
}

// The subset of `watchlist` a headline is likely to move, most-relevant first
// (an instrument matched on more drivers — e.g. both legs of a pair — ranks
// higher). Empty when the headline names nothing on the watchlist.
export function affectedInstruments(item: NewsLike, watchlist: string[]): string[] {
  const detected = detectFactors([item.title, item.body, item.source].filter(Boolean).join(' '), item.category);
  if (detected.size === 0) return [];
  const scored: { sym: string; score: number }[] = [];
  for (const sym of watchlist) {
    const overlap = instrumentFactors(sym).filter((f) => detected.has(f)).length;
    if (overlap > 0) scored.push({ sym, score: overlap });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.sym);
}

// A sensible default desk watchlist used until the trader's own instruments
// load — and so EUR/USD-style links work out of the box. Led by this desk's core
// book (EUR/USD, Bitcoin, gold, Nasdaq, S&P 500), with a few majors for context.
export const DEFAULT_WATCHLIST = [
  'EUR/USD', 'BTC/USD', 'XAU/USD', 'US100', 'US500', 'US30',
  'GBP/USD', 'USD/JPY',
];

// Build the trader's watchlist from the instruments they actually trade, falling
// back to the default set when there are none yet. Deduped, original casing kept.
export function deriveWatchlist(traded: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of traded) {
    const sym = (raw ?? '').trim();
    if (!sym) continue;
    const key = sym.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sym);
  }
  return out.length > 0 ? out : DEFAULT_WATCHLIST;
}
