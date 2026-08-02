import { fetchCryptoPrices } from '../trading/brokers/crypto.js';
import type { InvestmentAssetClass } from '../db/schema.js';

// Live quotes for Investments holdings — the ONE seam through which a price
// reaches this workspace. Adding a provider means adding an entry here, not a
// branch inside the portfolio service.
//
// What this install can actually price today, and what it cannot:
//
//   • Crypto      — the existing keyless Coinbase/Kraken public feed. Live for
//                   everyone, no key, no connection.
//   • Equities +  — Finnhub's /quote, but ONLY when FINNHUB_API_KEY is set. The
//     ETFs          key is optional in this repo and today only feeds news, so
//                   most installs will not have one.
//   • Mutual      — nothing free covers these, and they are the bulk of a
//     funds,        401(k). There is no provider to wire; these stay on the
//     collective    price the user typed.
//     trusts
//
// So a price here is never assumed. Every quote reports where it came from, the
// service marks each holding `live` / `manual` / `none`, and the screens say so
// plainly. That is the same honesty rule the Market Data board follows with
// `sample: true` — a figure that might be stale must never render as though it
// were live.
//
// Do NOT try Stooq for quotes. It was tried twice for the Market Data metals and
// does not answer a server (see docs/design/market-data/NOTES.md).

export interface Quote {
  price: number;
  /** Previous close, when the provider gives one. Only then is a day move real. */
  previousClose: number | null;
}

export interface QuoteRequest {
  symbol: string;
  assetClass: InvestmentAssetClass;
}

const FINNHUB_QUOTE = 'https://finnhub.io/api/v1/quote';

// Stale-while-revalidate, process-wide. A portfolio screen can be opened
// repeatedly; the provider should not be.
const TTL_MS = 60_000;
// How long a cached quote may still be served while a refresh fails. Past this
// the entry is dropped and the holding falls back to its manual price, which is
// better than rendering a figure from an hour ago as live.
const MAX_AGE_MS = 15 * 60_000;
// Finnhub's free tier allows 60 calls/minute. A portfolio is a handful of
// symbols, but bound it anyway so one large account cannot spend the budget.
const MAX_SYMBOLS_PER_REFRESH = 40;

interface CacheEntry {
  quote: Quote;
  at: number;
}

const cache = new Map<string, CacheEntry>();
// Symbols we asked about and the provider did not recognise. Kept so an unknown
// ticker is not re-queried on every single portfolio load.
const unknown = new Map<string, number>();
const UNKNOWN_TTL_MS = 30 * 60_000;

let inFlight: Promise<void> | null = null;

export function investmentPricesConfigured(): boolean {
  return !!process.env.FINNHUB_API_KEY;
}

function isCryptoClass(req: QuoteRequest): boolean {
  return req.assetClass === 'crypto';
}

async function fetchFinnhubQuote(symbol: string, key: string): Promise<Quote | null> {
  const url = `${FINNHUB_QUOTE}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { c?: number; pc?: number };
  const price = typeof json.c === 'number' ? json.c : 0;
  // Finnhub answers 200 with every field zeroed for a symbol it does not carry
  // (a mutual fund, a collective trust, a typo). A zero price is not a price —
  // reading it as one would value the holding at nothing, which is exactly the
  // silent understatement this module exists to prevent.
  if (!Number.isFinite(price) || price <= 0) return null;
  const pc = typeof json.pc === 'number' && json.pc > 0 ? json.pc : null;
  return { price, previousClose: pc };
}

async function refresh(requests: QuoteRequest[]): Promise<void> {
  const now = Date.now();
  const crypto: QuoteRequest[] = [];
  const equities: QuoteRequest[] = [];

  for (const r of requests) {
    const at = unknown.get(r.symbol);
    if (at != null && now - at < UNKNOWN_TTL_MS) continue;
    (isCryptoClass(r) ? crypto : equities).push(r);
  }

  // Crypto — one batched call, keyless, always available.
  if (crypto.length > 0) {
    try {
      const pairs = crypto.map((r) => `${r.symbol.toUpperCase()}/USD`);
      const prices = await fetchCryptoPrices(pairs);
      for (const r of crypto) {
        const p = prices.get(`${r.symbol.toUpperCase()}/USD`);
        if (p != null && Number.isFinite(p) && p > 0) {
          // The public coin feed is spot-only — no previous close, so no day
          // move is claimed for crypto rather than one being invented.
          cache.set(r.symbol, { quote: { price: p, previousClose: null }, at: now });
        } else {
          unknown.set(r.symbol, now);
        }
      }
    } catch {
      /* best-effort: holdings fall back to their manual price */
    }
  }

  // Equities/ETFs — needs a key. Without one nothing here is reachable and the
  // holdings simply stay on their manual price.
  const key = process.env.FINNHUB_API_KEY;
  if (key && equities.length > 0) {
    const slice = equities.slice(0, MAX_SYMBOLS_PER_REFRESH);
    await Promise.all(
      slice.map(async (r) => {
        try {
          const q = await fetchFinnhubQuote(r.symbol, key);
          if (q) cache.set(r.symbol, { quote: q, at: now });
          else unknown.set(r.symbol, now);
        } catch {
          /* leave whatever is cached; the holding falls back if nothing is */
        }
      }),
    );
  }
}

/**
 * Live quotes for the given symbols, keyed by symbol (as passed in). A symbol
 * absent from the returned map has no live price — the caller must fall back to
 * the user's manual price and mark the holding accordingly, never to zero.
 *
 * Best-effort and never throws: a provider outage degrades the screen to manual
 * prices rather than failing the portfolio read.
 */
export async function fetchInvestmentQuotes(requests: QuoteRequest[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const wanted = requests.filter((r) => r.symbol && r.symbol.trim().length > 0);
  if (wanted.length === 0) return out;

  const now = Date.now();
  const stale = wanted.filter((r) => {
    const hit = cache.get(r.symbol);
    return !hit || now - hit.at > TTL_MS;
  });

  if (stale.length > 0) {
    // Collapse concurrent refreshes: several screens opening at once should
    // cost one round of provider calls, not one per request.
    if (!inFlight) {
      inFlight = refresh(stale).finally(() => {
        inFlight = null;
      });
    }
    try {
      await inFlight;
    } catch {
      /* fall through to whatever is cached */
    }
  }

  for (const r of wanted) {
    const hit = cache.get(r.symbol);
    if (hit && now - hit.at <= MAX_AGE_MS) out.set(r.symbol, hit.quote);
  }
  return out;
}

/** Test seam — drops every cached quote. */
export function resetInvestmentQuoteCache(): void {
  cache.clear();
  unknown.clear();
}
