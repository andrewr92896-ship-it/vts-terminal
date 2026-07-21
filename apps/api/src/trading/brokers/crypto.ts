// Keyless public crypto spot prices, for user price alerts on coins OANDA can't
// quote. Uses Coinbase's public spot endpoint (no API key, globally reachable):
//   GET https://api.coinbase.com/v2/prices/{BASE}-USD/spot -> { data: { amount } }
// Quotes are normalized to USD — USDT/USDC track USD closely enough for an alert
// threshold, and every major coin has a Coinbase USD spot. Best-effort: a failed
// request or an unknown coin is simply absent from the returned map.

const COINBASE_SPOT = 'https://api.coinbase.com/v2/prices';

// A few base-asset aliases so exchange-specific tickers resolve to Coinbase's.
const BASE_ALIASES: Record<string, string> = { XBT: 'BTC' };

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

async function spot(base: string): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${COINBASE_SPOT}/${encodeURIComponent(base)}-USD/spot`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { amount?: string } };
    const n = Number(json.data?.amount);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
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
      const price = await spot(base);
      if (price != null) for (const k of keys) out.set(k, price);
    }),
  );
  return out;
}
