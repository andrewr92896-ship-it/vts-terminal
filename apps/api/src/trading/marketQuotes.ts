import {
  fetchOandaDailyCloses,
  fetchOandaPrices,
  fetchOandaTradeableInstruments,
  type OandaDailyClose,
} from './brokers/oanda.js';
import {
  fetchCryptoDailyCloses,
  fetchCryptoPrices,
  type CryptoDailyClose,
} from './brokers/crypto.js';
import { resolveOandaPricingConfig } from './priceSource.js';
import { pctDecimals } from './marketFormat.js';

// Live values for the Market Data board's price series, from OANDA.
//
// The board's catalog (marketData.ts) ships display-ready sample figures. This
// module replaces them for every series OANDA can quote — the FX majors, the
// dollar index, the two crypto majors, the commodities and the three US index
// CFDs — with a real spot mark and real 1D/1W/1M/YTD/1Y changes computed from
// daily candles. The macro side of the board (CPI, payrolls, the Treasury curve,
// the Fed balance sheet) is a different provider entirely and lives in
// `marketMacro.ts`; both overlay the catalog through the same `applyLiveQuotes`
// seam.
//
// Why candles: a spot price alone gives no change columns, and the board's whole
// point is the five of them. One `/v3/instruments/{sym}/candles` read per symbol
// gives ~19 months of completed daily closes, which is enough for every period
// including year-to-date.
//
// The result is cached process-wide with stale-while-revalidate: the screen polls
// every 2 minutes per open tab, and none of these figures move meaningfully
// inside a minute. A refresh never blocks a request that already has a snapshot.

const TTL_MS = 60_000;
// Candles cover far longer than prices, so they are refreshed on their own much
// slower clock — the 1Y reference close does not change during a session.
const HISTORY_TTL_MS = 30 * 60_000;
const CANDLE_COUNT = 400; // ~19 months of trading days

// How many decimals a series' value carries, matching the catalog's own
// formatting so a live figure sits in the column exactly like the sample did.
//
// `review` restates who the figure came from, and is set wherever the catalog's
// stated publisher would now be wrong. OANDA does not quote the exchange
// contract for any of these: metals are OTC spot rather than LBMA fixings or
// COMEX futures, and the energy, copper and index rows are CFDs tracking a
// future rather than the index or contract itself. The number is the right one
// to trade off; the row must simply not claim NYMEX or Cboe published it.
interface QuoteDef {
  id: string;
  symbol: string; // OANDA instrument
  decimals: number;
  group: 'fx' | 'crypto' | 'commod' | 'equity';
  review?: string;
}

const QUOTES: QuoteDef[] = [
  { id: 'eurusd', symbol: 'EUR_USD', decimals: 4, group: 'fx' },
  { id: 'gbpusd', symbol: 'GBP_USD', decimals: 4, group: 'fx' },
  { id: 'usdjpy', symbol: 'USD_JPY', decimals: 2, group: 'fx' },
  { id: 'usdcad', symbol: 'USD_CAD', decimals: 4, group: 'fx' },
  { id: 'audusd', symbol: 'AUD_USD', decimals: 4, group: 'fx' },
  { id: 'btc', symbol: 'BTC_USD', decimals: 0, group: 'crypto' },
  { id: 'eth', symbol: 'ETH_USD', decimals: 0, group: 'crypto' },
  { id: 'gold', symbol: 'XAU_USD', decimals: 2, group: 'commod', review: 'OANDA · spot' },
  { id: 'silver', symbol: 'XAG_USD', decimals: 2, group: 'commod', review: 'OANDA · spot' },
  { id: 'wti', symbol: 'WTICO_USD', decimals: 2, group: 'commod', review: 'OANDA · CFD' },
  { id: 'brent', symbol: 'BCO_USD', decimals: 2, group: 'commod', review: 'OANDA · CFD' },
  { id: 'copper', symbol: 'XCU_USD', decimals: 2, group: 'commod', review: 'OANDA · CFD' },
  { id: 'natgas', symbol: 'NATGAS_USD', decimals: 2, group: 'commod', review: 'OANDA · CFD' },
  { id: 'us100', symbol: 'NAS100_USD', decimals: 0, group: 'equity', review: 'OANDA · CFD' },
  { id: 'us500', symbol: 'SPX500_USD', decimals: 0, group: 'equity', review: 'OANDA · CFD' },
  { id: 'us30', symbol: 'US30_USD', decimals: 0, group: 'equity', review: 'OANDA · CFD' },
];

// The dollar index is not an OANDA instrument, so it is computed from the six
// components and weights ICE uses. Signed exponents: a component quoted USD-base
// (USD/JPY) pushes the index up, one quoted USD-quote (EUR/USD) pushes it down.
const DXY_CONSTANT = 50.14348112;
const DXY_LEGS: { symbol: string; exponent: number }[] = [
  { symbol: 'EUR_USD', exponent: -0.576 },
  { symbol: 'USD_JPY', exponent: 0.136 },
  { symbol: 'GBP_USD', exponent: -0.119 },
  { symbol: 'USD_CAD', exponent: 0.091 },
  { symbol: 'USD_SEK', exponent: 0.042 },
  { symbol: 'USD_CHF', exponent: 0.036 },
];

// Every symbol a refresh needs: the quoted series plus the DXY legs.
const ALL_SYMBOLS = [...new Set([...QUOTES.map((q) => q.symbol), ...DXY_LEGS.map((l) => l.symbol)])];

// What a live series contributes back to the catalog row. `reviewBody` is only
// set where the catalog's stated publisher would now be wrong — the dollar index
// is computed here rather than read from ICE, so it must not claim ICE published
// the figure on screen.
export interface LiveQuote {
  value: string;
  changes: [string, string, string, string, string];
  asOf: string;
  reviewBody?: string;
  // Restates the review *cycle* ("continuous", "daily · 3:30 PM"), or — on a
  // macro row with a keyed FRED schedule behind it — the ISO date the figure was
  // last published. Needed wherever a source publishes on a different rhythm
  // than the catalog assumed: an index read as a published daily close is not
  // "continuous", and a row saying both at once contradicts itself on screen.
  reviewLast?: string;
  // The ISO date the figure is next published. Only a keyed FRED schedule can
  // answer this, so it is absent on a keyless install and the row keeps the
  // catalog's hand-entered date.
  reviewNext?: string;
}

interface Snapshot {
  quotes: Map<string, LiveQuote>;
  at: number;
}

let snapshot: Snapshot | null = null;
let inFlight: Promise<Snapshot> | null = null;

// Candle history, cached separately and much longer than spot.
let history: { closes: Map<string, OandaDailyClose[]>; at: number } | null = null;
let historyInFlight: Promise<Map<string, OandaDailyClose[]>> | null = null;

const DAY_MS = 86400_000;

// ---- formatting ----

function fmtValue(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// A percent change in the board's own style: two decimals on the 1-day column,
// one on the longer periods, a real minus sign (U+2212), and an unsigned zero so
// "no move" reads neutral rather than green. `null` renders as the em dash the
// catalog uses for a period that has no reading.
function fmtPct(pct: number | null, decimals: number): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const dp = pctDecimals(pct, decimals);
  const rounded = Number(pct.toFixed(dp));
  const body = Math.abs(rounded).toFixed(dp);
  if (rounded === 0) return `${body}%`;
  return `${rounded > 0 ? '+' : '−'}${body}%`;
}

// ---- change math ----

// The close that had most recently happened at instant `at`, or null when the
// history does not reach back that far.
//
// `timeMs` is the candle's START (OANDA reports it that way) and a daily candle
// closes 24h later, so the comparison has to be against `timeMs + DAY`. Matching
// on the start instead reads the close of the candle that was still forming at
// `at` — a value from up to a day in the future of the look-back point, which
// quietly skews every period by one session.
function closeAtOrBefore(closes: OandaDailyClose[], at: number): number | null {
  let found: number | null = null;
  for (const c of closes) {
    if (c.timeMs + DAY_MS <= at) found = c.close;
    else break;
  }
  return found;
}

// The Eastern-Time calendar year right now — year-to-date is measured against the
// desk's own year boundary, not UTC's.
function etYear(now: number): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(now),
  );
}

// 1D / 1W / 1M / YTD / 1Y percent changes of `spot` against the daily closes.
// 1D is measured against the most recent completed close (yesterday's), which is
// what a desk means by "today's move"; the rest look back by calendar distance.
function changesFor(
  spot: number,
  closes: OandaDailyClose[],
  now: number,
): [string, string, string, string, string] {
  const pct = (ref: number | null): number | null =>
    ref != null && ref > 0 ? (spot / ref - 1) * 100 : null;

  const prev = closes.length > 0 ? closes[closes.length - 1].close : null;
  const yearStart = Date.UTC(etYear(now), 0, 1);
  const monthAgo = new Date(now);
  monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const yearAgo = new Date(now);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);

  return [
    fmtPct(pct(prev), 2),
    fmtPct(pct(closeAtOrBefore(closes, now - 7 * DAY_MS)), 1),
    fmtPct(pct(closeAtOrBefore(closes, monthAgo.getTime())), 1),
    // The final close of last year: the last candle to have closed by the moment
    // this year began.
    fmtPct(pct(closeAtOrBefore(closes, yearStart)), 1),
    fmtPct(pct(closeAtOrBefore(closes, yearAgo.getTime())), 1),
  ];
}

// ---- dollar index ----

function dxyFrom(legs: Map<string, number>): number | null {
  let acc = DXY_CONSTANT;
  for (const { symbol, exponent } of DXY_LEGS) {
    const p = legs.get(symbol);
    if (p == null || !(p > 0)) return null; // one missing leg invalidates the index
    acc *= Math.pow(p, exponent);
  }
  return acc;
}

// A synthetic DXY close series, built by evaluating the index on every day all
// six legs closed. Aligned on candle start time, so a day any leg is missing is
// skipped rather than computed from a stale price.
function dxyCloses(closes: Map<string, OandaDailyClose[]>): OandaDailyClose[] {
  const legSeries = DXY_LEGS.map((l) => closes.get(l.symbol) ?? []);
  if (legSeries.some((s) => s.length === 0)) return [];
  const byTime = legSeries.map((s) => new Map(s.map((c) => [c.timeMs, c.close])));
  const out: OandaDailyClose[] = [];
  for (const { timeMs } of legSeries[0]) {
    const legs = new Map<string, number>();
    let complete = true;
    for (let i = 0; i < DXY_LEGS.length; i += 1) {
      const c = byTime[i].get(timeMs);
      if (c == null) {
        complete = false;
        break;
      }
      legs.set(DXY_LEGS[i].symbol, c);
    }
    if (!complete) continue;
    const v = dxyFrom(legs);
    if (v != null) out.push({ timeMs, close: v });
  }
  return out;
}

// ---- fetching ----

async function loadHistory(
  cfg: NonNullable<Awaited<ReturnType<typeof resolveOandaPricingConfig>>>,
  symbols: string[],
): Promise<Map<string, OandaDailyClose[]>> {
  const entries = await Promise.all(
    symbols.map(async (s) => [s, await fetchOandaDailyCloses(cfg, s, CANDLE_COUNT)] as const),
  );
  return new Map(entries.filter(([, closes]) => closes.length > 0));
}

async function historyFor(
  cfg: NonNullable<Awaited<ReturnType<typeof resolveOandaPricingConfig>>>,
  symbols: string[],
  now: number,
): Promise<Map<string, OandaDailyClose[]>> {
  if (history && now - history.at < HISTORY_TTL_MS) return history.closes;
  if (!historyInFlight) {
    historyInFlight = loadHistory(cfg, symbols)
      .then((closes) => {
        // Keep the previous history if a refresh came back empty (a blip should
        // not drop the change columns that were working a minute ago).
        if (closes.size > 0) history = { closes, at: Date.now() };
        return history?.closes ?? closes;
      })
      .finally(() => {
        historyInFlight = null;
      });
  }
  // A stale history is still better than none while the refresh runs.
  if (history) {
    void historyInFlight;
    return history.closes;
  }
  return historyInFlight;
}

async function refresh(): Promise<Snapshot> {
  const now = Date.now();
  const quotes = new Map<string, LiveQuote>();
  const cfg = await resolveOandaPricingConfig();
  if (!cfg) return { quotes, at: now };

  // Only ask for what this OANDA entity actually offers. Crypto CFDs exist on
  // some entities and not others, and a symbol the account cannot see would
  // otherwise fail the whole pricing request rather than just its own row.
  const available = await fetchOandaTradeableInstruments(cfg);
  const wanted = available.size > 0 ? ALL_SYMBOLS.filter((s) => available.has(s)) : ALL_SYMBOLS;
  if (wanted.length === 0) return { quotes, at: now };

  const [spotByDisplay, closes] = await Promise.all([
    fetchOandaPrices(cfg, wanted).catch(() => new Map<string, number>()),
    historyFor(cfg, wanted, now),
  ]);

  // fetchOandaPrices keys by display form ("EUR/USD"); work in OANDA symbols.
  const spot = new Map<string, number>();
  for (const [display, px] of spotByDisplay) spot.set(display.replace('/', '_'), px);

  // Crypto that this entity does not carry still has a live spot available from
  // the portal's keyless coin feed — and most OANDA entities carry no crypto at
  // all, so this is the path BTC and ETH normally take rather than an edge case.
  //
  // The daily closes come from Kraken's public OHLC alongside it, so these rows
  // get the same five real change columns as everything else. They read as five
  // em dashes without it, which on a pinned row looks like a broken feed rather
  // than a missing history.
  const missingCrypto = QUOTES.filter((q) => q.group === 'crypto' && spot.get(q.symbol) == null);
  if (missingCrypto.length > 0) {
    const wantedCrypto = missingCrypto.map((q) => q.symbol.replace('_', '/'));
    const [fallback, cryptoCloses] = await Promise.all([
      fetchCryptoPrices(wantedCrypto).catch(() => new Map<string, number>()),
      fetchCryptoDailyCloses(wantedCrypto).catch(() => new Map<string, CryptoDailyClose[]>()),
    ]);
    for (const q of missingCrypto) {
      const display = q.symbol.replace('_', '/');
      const px = fallback.get(display);
      if (px != null) {
        const closes = cryptoCloses.get(display) ?? [];
        quotes.set(q.id, {
          value: fmtValue(px, q.decimals),
          changes: closes.length > 0 ? changesFor(px, closes, now) : ['—', '—', '—', '—', '—'],
          asOf: 'live · coin feed',
        });
      }
    }
  }

  for (const q of QUOTES) {
    const px = spot.get(q.symbol);
    if (px == null) continue;
    quotes.set(q.id, {
      value: fmtValue(px, q.decimals),
      changes: changesFor(px, closes.get(q.symbol) ?? [], now),
      asOf: 'live',
      ...(q.review ? { reviewBody: q.review } : {}),
    });
  }

  const dxy = dxyFrom(spot);
  if (dxy != null) {
    quotes.set('dxy', {
      value: fmtValue(dxy, 2),
      changes: changesFor(dxy, dxyCloses(closes), now),
      asOf: 'live · computed from majors',
      reviewBody: 'Computed · ICE weights',
    });
  }

  return { quotes, at: now };
}

// Live values for the price series, keyed by catalog series id. Empty when no
// OANDA credentials exist anywhere on the install, or while the very first fetch
// is still running. Never throws.
export async function getMarketQuotes(): Promise<Map<string, LiveQuote>> {
  const now = Date.now();
  if (snapshot && now - snapshot.at < TTL_MS) return snapshot.quotes;

  if (!inFlight) {
    inFlight = refresh()
      .then((s) => {
        // Only replace a working snapshot with one that priced something —
        // a transient OANDA failure must not blank the board.
        if (s.quotes.size > 0 || !snapshot) snapshot = s;
        else snapshot = { quotes: snapshot.quotes, at: s.at };
        return snapshot;
      })
      .catch(() => snapshot ?? { quotes: new Map<string, LiveQuote>(), at: Date.now() })
      .finally(() => {
        inFlight = null;
      });
  }

  // Stale-while-revalidate: a caller that already has figures gets them at once
  // and the refresh lands for the next poll. Only the very first caller waits.
  if (snapshot) return snapshot.quotes;
  return (await inFlight).quotes;
}

// Test/ops seam: drop every cache so the next read refetches.
export function resetMarketQuotes(): void {
  snapshot = null;
  history = null;
}
