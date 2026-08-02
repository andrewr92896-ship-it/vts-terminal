// Keyless public crypto spot prices, for user price alerts on coins OANDA can't
// quote. Primary source is Coinbase's public spot endpoint (no API key, globally
// reachable):
//   GET https://api.coinbase.com/v2/prices/{BASE}-USD/spot -> { data: { amount } }
// with a Kraken public-Ticker fallback when Coinbase can't price a coin:
//   GET https://api.kraken.com/0/public/Ticker?pair={BASE}USD -> result[..].c[0]
// Quotes are normalized to USD — USDT/USDC track USD closely enough for an alert
// threshold, and every major coin has a USD spot on one of the two. Best-effort:
// a coin neither can price is simply absent from the returned map.

const COINBASE_SPOT = 'https://api.coinbase.com/v2/prices';
const KRAKEN_TICKER = 'https://api.kraken.com/0/public/Ticker';

// A few base-asset aliases so exchange-specific tickers resolve to Coinbase's.
const BASE_ALIASES: Record<string, string> = { XBT: 'BTC' };

// Kraken uses legacy codes for a couple of assets in its `pair` param.
const KRAKEN_BASE_ALIASES: Record<string, string> = { BTC: 'XBT', DOGE: 'XDG' };

// Coins we recognize as crypto even when quoted in USD (where the quote alone
// can't tell crypto from forex — "BTCUSD" vs "EURUSD"). Not exhaustive; USDT/
// USDC-quoted pairs are always treated as crypto regardless of base.
const CRYPTO_BASES = new Set([
  'BTC', 'XBT', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'BCH', 'DOT', 'LINK',
  'MATIC', 'AVAX', 'UNI', 'ATOM', 'ETC', 'XLM', 'ALGO', 'FIL', 'APT', 'ARB', 'OP',
  'SUI', 'SHIB', 'TRX', 'TON', 'NEAR', 'INJ', 'PEPE', 'BNB', 'AAVE', 'MKR', 'CRO',
]);

// Stablecoin quotes only ever appear on crypto pairs, so they're a definitive
// crypto signal on their own (unlike USD).
const CRYPTO_QUOTES = new Set(['USDT', 'USDC']);

// Split a display instrument ("BTC/USDT") into base + quote, upper-cased.
function parts(displayInstrument: string): { base: string; quote: string } {
  const [base = '', quote = ''] = displayInstrument.toUpperCase().split('/');
  return { base, quote };
}

// Whether an instrument should be priced by the crypto feed (vs. OANDA). Takes
// the display form produced by toPricingInstrument, e.g. "BTC/USDT", "EUR/USD".
export function isCryptoInstrument(displayInstrument: string): boolean {
  const { base, quote } = parts(displayInstrument);
  if (quote && CRYPTO_QUOTES.has(quote)) return true;
  const canonicalBase = BASE_ALIASES[base] ?? base;
  return CRYPTO_BASES.has(canonicalBase);
}

function baseOf(displayInstrument: string): string {
  const { base } = parts(displayInstrument);
  return BASE_ALIASES[base] ?? base;
}

// Small fetch-with-timeout wrapper so a hung request can't stall a watch tick.
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function coinbaseSpot(base: string): Promise<number | null> {
  const json = await getJson<{ data?: { amount?: string } }>(
    `${COINBASE_SPOT}/${encodeURIComponent(base)}-USD/spot`,
  );
  const n = Number(json?.data?.amount);
  return Number.isFinite(n) ? n : null;
}

async function krakenSpot(base: string): Promise<number | null> {
  const kb = KRAKEN_BASE_ALIASES[base] ?? base;
  // One pair per request, so the sole `result` entry is this pair — no need to
  // decode Kraken's quirky normalized keys (XXBTZUSD etc.). `c` is the last
  // trade [price, volume]; we want the price.
  const json = await getJson<{ error?: string[]; result?: Record<string, { c?: string[] }> }>(
    `${KRAKEN_TICKER}?pair=${encodeURIComponent(`${kb}USD`)}`,
  );
  if (!json || (json.error && json.error.length > 0) || !json.result) return null;
  const entry = Object.values(json.result)[0];
  const n = Number(entry?.c?.[0]);
  return Number.isFinite(n) ? n : null;
}

// Spot for one base (already canonicalized), trying Coinbase then Kraken.
async function cryptoSpot(base: string): Promise<number | null> {
  const cb = await coinbaseSpot(base);
  if (cb != null) return cb;
  return krakenSpot(base);
}

const KRAKEN_OHLC = 'https://api.kraken.com/0/public/OHLC';
const DAY_MS = 86400_000;

// One completed daily candle, reduced to when it started and where it closed —
// the same shape `OandaDailyClose` uses, so the Market Data board's change math
// works on either source unchanged.
export interface CryptoDailyClose {
  timeMs: number;
  close: number;
}

// Daily closes for one coin from Kraken's public OHLC endpoint (keyless, and the
// same host the spot fallback above already uses):
//   GET /0/public/OHLC?pair=XBTUSD&interval=1440
//     -> { error: [], result: { XXBTZUSD: [[time, o, h, l, c, ...], …], last } }
// It returns up to 720 daily candles (~2 years), which covers every look-back
// the board asks for including year-to-date.
// Pure normalizer, exported so it can be checked against recorded JSON without
// any network access.
export function parseKrakenOhlc(
  json: { error?: string[]; result?: Record<string, unknown> } | null,
  now: number,
): CryptoDailyClose[] {
  if (!json || (json.error && json.error.length > 0) || !json.result) return [];

  // `result` holds the candle array under Kraken's normalized pair key
  // ("XXBTZUSD") *and* a `last` cursor alongside it — so pick the entry that is
  // actually an array rather than trusting key order. Reading `last` as candles
  // would yield nothing at best and garbage at worst.
  const rows = Object.values(json.result).find((v): v is unknown[] => Array.isArray(v));
  if (!rows) return [];

  const out: CryptoDailyClose[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const timeMs = Number(row[0]) * 1000;
    const close = Number(row[4]);
    if (!Number.isFinite(timeMs) || !Number.isFinite(close)) continue;
    // Drop the candle still forming — an incomplete day is not a close, and
    // using it would make "yesterday's close" mean "the price a moment ago".
    if (timeMs + DAY_MS > now) continue;
    out.push({ timeMs, close });
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

async function krakenDailyCloses(base: string): Promise<CryptoDailyClose[]> {
  const kb = KRAKEN_BASE_ALIASES[base] ?? base;
  const json = await getJson<{ error?: string[]; result?: Record<string, unknown> }>(
    `${KRAKEN_OHLC}?pair=${encodeURIComponent(`${kb}USD`)}&interval=1440`,
  );
  return parseKrakenOhlc(json, Date.now());
}

// Daily closes for the given crypto instruments (display form), keyed by that
// same display form. Best-effort: a coin Kraken cannot chart is simply absent,
// and the caller leaves that row's change columns blank rather than guessing.
export async function fetchCryptoDailyCloses(
  instruments: string[],
): Promise<Map<string, CryptoDailyClose[]>> {
  const out = new Map<string, CryptoDailyClose[]>();
  if (instruments.length === 0) return out;

  const baseToKeys = new Map<string, string[]>();
  for (const inst of instruments) {
    const b = baseOf(inst);
    if (!b) continue;
    const list = baseToKeys.get(b) ?? [];
    list.push(inst);
    baseToKeys.set(b, list);
  }

  await Promise.all(
    [...baseToKeys.entries()].map(async ([base, keys]) => {
      const closes = await krakenDailyCloses(base);
      if (closes.length > 0) for (const k of keys) out.set(k, closes);
    }),
  );
  return out;
}

// Live spot for the given crypto instruments (display form, e.g. "BTC/USDT"),
// keyed by that same display form. Deduped by base — one Coinbase call backs
// every display key sharing a coin (BTC/USD and BTC/USDT both read BTC-USD).
export async function fetchCryptoPrices(instruments: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (instruments.length === 0) return out;

  const baseToKeys = new Map<string, string[]>();
  for (const inst of instruments) {
    const b = baseOf(inst);
    if (!b) continue;
    const list = baseToKeys.get(b) ?? [];
    list.push(inst);
    baseToKeys.set(b, list);
  }

  await Promise.all(
    [...baseToKeys.entries()].map(async ([base, keys]) => {
      const price = await cryptoSpot(base);
      if (price != null) for (const k of keys) out.set(k, price);
    }),
  );
  return out;
}
