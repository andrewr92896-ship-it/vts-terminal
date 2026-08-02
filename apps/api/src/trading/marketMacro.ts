import { config } from '../config.js';
import { fetchFredSeries, type FredObservation } from './brokers/fred.js';
import type { LiveQuote } from './marketQuotes.js';

// Live values for the Market Data board's MACRO series, from FRED.
//
// `marketQuotes.ts` does the price half of the board off OANDA. This is the
// other half — policy rates, inflation, the labor prints, the Treasury curve,
// the Fed balance sheet — and it overlays the catalog through the same
// `applyLiveQuotes` seam, so the two never need to know about each other.
//
// Three things make macro different from a price, and they are the whole design
// of this file:
//
// 1. **The published number is rarely the number on the board.** FRED serves
//    CPI as an index level; the board wants the year-over-year rate. It serves
//    payrolls as a running total of jobs; the board wants the monthly print.
//    So each row declares a `transform` that turns the raw observations into a
//    series of the figure actually displayed, and everything downstream —
//    value and all five change columns — reads that derived series.
//
// 2. **The change columns are differences, not percent moves.** A yield going
//    4.05 → 4.02 is "−0.03" on this board, not "−0.74%". That is what the
//    catalog's own fixtures show and what a desk means by the move in a rate.
//    The price side percent-changes; this side subtracts.
//
// 3. **Most of these series do not move daily, and a change column must not
//    imply otherwise.** CPI prints monthly, so its 1D and 1W columns can only
//    honestly read zero — but a naive date look-back would land on the previous
//    *month's* reading and print that monthly move in the 1D column. Every row
//    therefore declares its `cadence`, and a period shorter than the cadence
//    resolves to a flat zero instead of borrowing a longer period's move.
//
// What is deliberately NOT here: the rows no free provider covers — CME
// FedWatch meeting odds, the ISM surveys, the MOVE index, FactSet earnings, the
// Citi surprise index, BoE/BoJ policy rates, and the crypto flow/funding rows.
// Those keep the catalog's sample figures and the grey Sample dot. Adding one
// means adding a provider, not a row here.
//
// Cached process-wide, stale-while-revalidate, and never replaced by an empty
// result — a transient FRED outage leaves the last good figures on the board
// rather than reverting it to placeholders.

const TTL_MS = 30 * 60_000; // macro data moves daily at the very fastest
const HISTORY_YEARS = 4; // enough for a y/y rate's own 1-year look-back
const CONCURRENCY = 6;

const DAY_MS = 86400_000;

// ---- series definitions ----

// How often the series publishes. A change period shorter than this cannot show
// a real move, so it renders as a flat zero.
type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';

const CADENCE_DAYS: Record<Cadence, number> = {
  daily: 1,
  weekly: 7,
  monthly: 28,
  quarterly: 90,
};

// How the published observations become the figure on the board.
type Transform =
  | 'level' // the observation itself (yields, policy rates, the unemployment rate)
  | 'yoy' // percent change vs twelve months earlier (CPI, PCE, earnings)
  | 'mom' // percent change vs the previous observation (core PCE m/m, retail sales)
  | 'delta' // difference vs the previous observation (payrolls: a level becomes the print)
  | 'delta3' // three-observation average of `delta` (the payrolls 3-month average)
  | 'qoqSaar' // quarterly growth annualized: ((x / prev) ^ 4 − 1) × 100
  | 'ytdIndex'; // percent change vs the final reading of the previous year

interface MacroDef {
  id: string; // catalog series id
  fred: string;
  // Second FRED series, for a row that is a range rather than a point. Only
  // `ffr` uses it: the Fed publishes the target as two bounds and the board
  // shows "4.25–4.50", with the change columns tracking the upper bound.
  fredLower?: string;
  transform: Transform;
  cadence: Cadence;
  decimals: number;
  // Multiplies the transformed figure into the board's unit. A curve spread
  // arrives in percent and is shown in basis points (×100); the balance sheet
  // arrives in millions and is shown in trillions (÷1e6); jobless claims arrive
  // in persons and are shown in thousands (÷1e3).
  scale?: number;
  // Multiplies the *difference* when the change column uses a coarser unit than
  // the value. The balance sheet reads 6.42 T but moves in billions a week.
  changeScale?: number;
  changeDecimals?: number;
  changeSuffix?: string;
  // Render the value with an explicit leading '+' when positive. Used where the
  // sign is the point of the figure (a curve spread, a payrolls print).
  signed?: boolean;
  // How the change columns read. Macro figures are rates and levels, where the
  // move that matters is the difference (`delta`, the default) — a yield 4.05 →
  // 4.02 is "−0.03", not "−0.74%". A **price** is the opposite: the S&P moving
  // 6,724 → 6,742 is "+0.28%", and a row showing "+18" would not match the other
  // price rows on the board or what anyone means by an index's move.
  changeMode?: 'delta' | 'pct';
  // Restates who the figure came from, where the catalog's publisher would now
  // be wrong. An index read off FRED is a published daily close, not the
  // exchange's continuous tape.
  review?: string;
  // Restates the review *cycle* alongside it. The catalog gives every price
  // group "continuous", which is true of a live tape and false of a daily
  // close — leaving it made the row say "close" and "continuous" at once.
  reviewLast?: string;
}

const MACRO: MacroDef[] = [
  // ---- Policy & rates ----
  // The target is a range, so it reads off both bounds; every other policy rate
  // is a single published level.
  { id: 'ffr', fred: 'DFEDTARU', fredLower: 'DFEDTARL', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'effr', fred: 'EFFR', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'iorb', fred: 'IORB', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'sofr', fred: 'SOFR', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'disc', fred: 'DPCREDIT', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'ecb', fred: 'ECBDFR', transform: 'level', cadence: 'daily', decimals: 2 },

  // ---- Inflation ----
  // The price indices are levels; the board wants rates, so they are y/y.
  { id: 'cpi', fred: 'CPIAUCSL', transform: 'yoy', cadence: 'monthly', decimals: 1 },
  { id: 'ccpi', fred: 'CPILFESL', transform: 'yoy', cadence: 'monthly', decimals: 1 },
  { id: 'cpiytd', fred: 'CPIAUCSL', transform: 'ytdIndex', cadence: 'monthly', decimals: 1 },
  { id: 'pce', fred: 'PCEPI', transform: 'yoy', cadence: 'monthly', decimals: 1 },
  { id: 'cpce', fred: 'PCEPILFE', transform: 'yoy', cadence: 'monthly', decimals: 1 },
  { id: 'cpcemm', fred: 'PCEPILFE', transform: 'mom', cadence: 'monthly', decimals: 1 },
  { id: 'ppi', fred: 'PPIFIS', transform: 'yoy', cadence: 'monthly', decimals: 1 },
  // Breakevens are already published as rates. There is no 1-year breakeven on
  // FRED, so `be1` stays sample.
  { id: 'be5', fred: 'T5YIE', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'be10', fred: 'T10YIE', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'umich', fred: 'MICH', transform: 'level', cadence: 'monthly', decimals: 1 },

  // ---- Labor & growth ----
  { id: 'unrate', fred: 'UNRATE', transform: 'level', cadence: 'monthly', decimals: 1 },
  // PAYEMS is total jobs in thousands; the print everyone quotes is the month's
  // change in it, which is already the board's "K" unit.
  { id: 'nfp', fred: 'PAYEMS', transform: 'delta', cadence: 'monthly', decimals: 0, signed: true },
  { id: 'nfp3', fred: 'PAYEMS', transform: 'delta3', cadence: 'monthly', decimals: 0, signed: true },
  { id: 'ahe', fred: 'CES0500000003', transform: 'yoy', cadence: 'monthly', decimals: 1 },
  { id: 'claims', fred: 'ICSA', transform: 'level', cadence: 'weekly', decimals: 0, scale: 1e-3 },
  { id: 'part', fred: 'CIVPART', transform: 'level', cadence: 'monthly', decimals: 1 },
  { id: 'gdp', fred: 'GDPC1', transform: 'qoqSaar', cadence: 'quarterly', decimals: 1 },
  { id: 'retail', fred: 'RSAFS', transform: 'mom', cadence: 'monthly', decimals: 1 },

  // ---- Yields & curve ----
  { id: 'y3m', fred: 'DGS3MO', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'y2', fred: 'DGS2', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'y10', fred: 'DGS10', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'y30', fred: 'DGS30', transform: 'level', cadence: 'daily', decimals: 2 },
  // FRED publishes both spreads the same way round the board shows them
  // (10-year minus the short leg), in percent — so ×100 into basis points.
  { id: 's2s10', fred: 'T10Y2Y', transform: 'level', cadence: 'daily', decimals: 0, scale: 100, signed: true },
  { id: 's3m10', fred: 'T10Y3M', transform: 'level', cadence: 'daily', decimals: 0, scale: 100, signed: true },
  { id: 'real10', fred: 'DFII10', transform: 'level', cadence: 'daily', decimals: 2 },
  { id: 'mtg30', fred: 'MORTGAGE30US', transform: 'level', cadence: 'weekly', decimals: 2 },

  // ---- Indices & volatility ----
  // The VIX close. The MOVE index and blended EPS are licensed and stay sample.
  { id: 'vix', fred: 'VIXCLS', transform: 'level', cadence: 'daily', decimals: 2, reviewLast: 'daily · close' },
  // The three US indices as published daily closes. OANDA quotes a CFD on each
  // and is preferred where the account can see them (it is real-time, and it is
  // what the desk actually trades) — but most OANDA entities do not offer index
  // CFDs at all, so these are what make the rows live for everyone. Percent
  // changes, like every other price row on the board.
  { id: 'us500', fred: 'SP500', transform: 'level', cadence: 'daily', decimals: 0, changeMode: 'pct', review: 'S&P Dow Jones', reviewLast: 'daily · close' },
  { id: 'us100', fred: 'NASDAQ100', transform: 'level', cadence: 'daily', decimals: 0, changeMode: 'pct', review: 'Nasdaq OMX', reviewLast: 'daily · close' },
  { id: 'us30', fred: 'DJIA', transform: 'level', cadence: 'daily', decimals: 0, changeMode: 'pct', review: 'S&P Dow Jones', reviewLast: 'daily · close' },

  // ---- Commodities ----
  // Energy spot, published daily by the EIA. Same reasoning as the indices: the
  // OANDA CFDs are preferred when the account carries them, and these keep the
  // rows live when it does not.
  { id: 'wti', fred: 'DCOILWTICO', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'pct', review: 'EIA', reviewLast: 'daily · close' },
  { id: 'brent', fred: 'DCOILBRENTEU', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'pct', review: 'EIA', reviewLast: 'daily · close' },
  { id: 'natgas', fred: 'DHHNGSP', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'pct', review: 'EIA · Henry Hub', reviewLast: 'daily · close' },

  // ---- Macro & liquidity ----
  // H.4.1 total assets: millions on the wire, trillions on the board, and it
  // moves in billions a week — so the value and its changes use different units.
  { id: 'bs', fred: 'WALCL', transform: 'level', cadence: 'weekly', decimals: 2, scale: 1e-6, changeScale: 1e3, changeDecimals: 0, changeSuffix: 'B' },
  { id: 'rrp', fred: 'RRPONTSYD', transform: 'level', cadence: 'daily', decimals: 0, changeDecimals: 0, changeSuffix: 'B' },
  { id: 'nfci', fred: 'NFCI', transform: 'level', cadence: 'weekly', decimals: 2 },
  { id: 'sahm', fred: 'SAHMREALTIME', transform: 'level', cadence: 'monthly', decimals: 2 },
];

// ---- derived series ----

// One point of the figure the board actually shows, dated by the reading it came
// from.
interface Point {
  timeMs: number;
  date: string;
  v: number;
}

// The observation at or before `at`, or null when the history does not reach.
// A FRED observation is dated for the period it measures and its value is final
// at that date, so this compares the stamp directly — unlike a price candle,
// whose stamp is its start and whose close lands 24h later.
function atOrBefore(points: Point[], at: number): Point | null {
  let found: Point | null = null;
  for (const p of points) {
    if (p.timeMs <= at) found = p;
    else break;
  }
  return found;
}

function minusMonths(t: number, months: number): number {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

function minusYears(t: number, years: number): number {
  const d = new Date(t);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
}

// The reading twelve months before `t`, tolerating the few days a publication
// date can drift. Without the tolerance a gap in the series would silently pair
// a reading with one from two years earlier and report that as a y/y rate.
function yearEarlier(obs: FredObservation[], i: number): number | null {
  const target = minusYears(obs[i].timeMs, 1);
  let found: FredObservation | null = null;
  for (let j = i - 1; j >= 0; j -= 1) {
    if (obs[j].timeMs <= target) {
      found = obs[j];
      break;
    }
  }
  if (!found) return null;
  if (Math.abs(found.timeMs - target) > 45 * DAY_MS) return null;
  return found.value;
}

function utcYear(t: number): number {
  return new Date(t).getUTCFullYear();
}

// Turn raw observations into the series of figures the board displays.
function derive(obs: FredObservation[], def: MacroDef): Point[] {
  const scale = def.scale ?? 1;
  const out: Point[] = [];
  const push = (o: FredObservation, v: number): void => {
    if (Number.isFinite(v)) out.push({ timeMs: o.timeMs, date: o.date, v: v * scale });
  };

  for (let i = 0; i < obs.length; i += 1) {
    const o = obs[i];
    const prev = i > 0 ? obs[i - 1].value : null;

    switch (def.transform) {
      case 'level':
        push(o, o.value);
        break;
      case 'yoy': {
        const base = yearEarlier(obs, i);
        if (base != null && base !== 0) push(o, (o.value / base - 1) * 100);
        break;
      }
      case 'mom':
        if (prev != null && prev !== 0) push(o, (o.value / prev - 1) * 100);
        break;
      case 'delta':
        if (prev != null) push(o, o.value - prev);
        break;
      case 'delta3': {
        // The average of the last three monthly prints, so it needs four levels.
        if (i < 3) break;
        push(o, (o.value - obs[i - 3].value) / 3);
        break;
      }
      case 'qoqSaar':
        if (prev != null && prev > 0) push(o, (Math.pow(o.value / prev, 4) - 1) * 100);
        break;
      case 'ytdIndex': {
        // Against the last reading of the previous calendar year.
        const year = utcYear(o.timeMs);
        let base: number | null = null;
        for (let j = i - 1; j >= 0; j -= 1) {
          if (utcYear(obs[j].timeMs) < year) {
            base = obs[j].value;
            break;
          }
        }
        if (base != null && base !== 0) push(o, (o.value / base - 1) * 100);
        break;
      }
    }
  }
  return out;
}

// ---- formatting ----

// A real minus sign (U+2212), matching every figure the catalog ships.
function withSign(n: number, body: string, forceSign: boolean): string {
  if (n < 0) return `−${body}`;
  return forceSign ? `+${body}` : body;
}

function fmtNumber(n: number, decimals: number): string {
  return Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtValue(n: number, def: MacroDef): string {
  const rounded = Number(n.toFixed(def.decimals));
  return withSign(rounded, fmtNumber(rounded, def.decimals), def.signed === true && rounded !== 0);
}

// A change column: the difference in the displayed figure, signed, with an
// unsigned zero so "no move" reads neutral rather than green. `null` renders as
// the em dash the catalog uses for a period with no reading behind it.
function fmtDelta(diff: number | null, def: MacroDef): string {
  if (diff == null || !Number.isFinite(diff)) return '—';
  const decimals = def.changeDecimals ?? def.decimals;
  const suffix = def.changeSuffix ?? '';
  const scaled = diff * (def.changeScale ?? 1);
  const rounded = Number(scaled.toFixed(decimals));
  const body = `${fmtNumber(rounded, decimals)}${suffix}`;
  if (rounded === 0) return body;
  return withSign(rounded, body, true);
}

// A percent change, in the board's own style — and deliberately identical to the
// price side's (`marketQuotes.ts`): two decimals on the 1-day column, one on the
// longer periods. A price row must read the same whether OANDA or FRED filled
// it.
function fmtPct(pct: number | null, decimals: number): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const rounded = Number(pct.toFixed(decimals));
  const body = `${Math.abs(rounded).toFixed(decimals)}%`;
  if (rounded === 0) return body;
  return withSign(rounded, body, true);
}

// How the board labels when a reading is *for*. Not when it was released —
// FRED's observations carry no release date, so the row's "Last → next review"
// column keeps the catalog's published schedule.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function asOfLabel(p: Point, cadence: Cadence, now: number): string {
  const d = new Date(p.timeMs);
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const stale = year !== utcYear(now);
  const tail = stale ? ` ${year}` : '';
  switch (cadence) {
    case 'daily':
      return `${month} ${d.getUTCDate()}${tail}`;
    case 'weekly':
      return `wk to ${month} ${d.getUTCDate()}${tail}`;
    case 'monthly':
      return `${month}${tail}`;
    case 'quarterly':
      return `Q${Math.floor(d.getUTCMonth() / 3) + 1}${tail}`;
  }
}

// ---- change math ----

// The five change columns for a derived series.
//
// Look-backs are anchored on the LATEST READING, not on the wall clock: a June
// CPI print released in July is still "the current reading" in August, and its
// 1-month change means against May's print. Anchoring on `now` would instead
// compare June against June and report a flat month.
//
// Year-to-date is the exception and is anchored on the calendar: the last
// reading before this year began, which is what a desk means by the move so far
// this year regardless of when the series last printed.
function changesFor(
  points: Point[],
  def: MacroDef,
  now: number,
): [string, string, string, string, string] {
  const latest = points[points.length - 1];
  const cadenceDays = CADENCE_DAYS[def.cadence];
  const pct = def.changeMode === 'pct';

  // The move over a window, in whichever way this row measures one.
  const moveAt = (at: number): number | null => {
    const ref = atOrBefore(points, at);
    if (!ref) return null;
    if (!pct) return latest.v - ref.v;
    return ref.v > 0 ? (latest.v / ref.v - 1) * 100 : null;
  };

  // A period shorter than the publication cadence cannot contain a move, so it
  // reports a flat zero rather than the previous reading's move. Zero is right
  // here and blank is not: the figure genuinely has not changed over that
  // window, which is a different statement from having no reading for it.
  const gated = (periodDays: number, at: number): number | null =>
    periodDays < cadenceDays ? 0 : moveAt(at);

  const yearStart = Date.UTC(utcYear(now), 0, 1);

  const moves = [
    gated(1, latest.timeMs - DAY_MS),
    gated(7, latest.timeMs - 7 * DAY_MS),
    gated(30, minusMonths(latest.timeMs, 1)),
    // Ungated: the previous year's final reading is a real base in every month,
    // including January.
    moveAt(yearStart - 1),
    gated(365, minusYears(latest.timeMs, 1)),
  ];

  // Percent columns carry more precision on the 1-day reading than on the
  // longer ones, matching the price side exactly.
  if (pct) return moves.map((m, i) => fmtPct(m, i === 0 ? 2 : 1)) as [string, string, string, string, string];
  return moves.map((m) => fmtDelta(m, def)) as [string, string, string, string, string];
}

// ---- fetching ----

function historyStart(now: number): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - HISTORY_YEARS);
  return d.toISOString().slice(0, 10);
}

// Every distinct FRED series the definitions need, read with a small
// concurrency cap so a refresh is a steady trickle rather than 40 simultaneous
// requests at a public endpoint.
async function loadObservations(now: number): Promise<Map<string, FredObservation[]>> {
  const ids = [
    ...new Set(MACRO.flatMap((d) => (d.fredLower ? [d.fred, d.fredLower] : [d.fred]))),
  ];
  const start = historyStart(now);
  const out = new Map<string, FredObservation[]>();

  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= ids.length) return;
      const id = ids[i];
      const obs = await fetchFredSeries(id, start);
      if (obs.length > 0) out.set(id, obs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return out;
}

function quoteFor(
  def: MacroDef,
  observations: Map<string, FredObservation[]>,
  now: number,
): LiveQuote | null {
  const obs = observations.get(def.fred);
  if (!obs || obs.length === 0) return null;
  const points = derive(obs, def);
  if (points.length === 0) return null;
  const latest = points[points.length - 1];

  // A range row prints both bounds. Its change columns still track the upper
  // bound, which is the one policy is quoted against.
  let value = fmtValue(latest.v, def);
  if (def.fredLower) {
    const lower = observations.get(def.fredLower);
    const lowerPoints = lower ? derive(lower, def) : [];
    const lowerLatest = lowerPoints[lowerPoints.length - 1];
    // Without the lower bound there is no range to show, and printing the upper
    // bound alone would misstate policy as a point target.
    if (!lowerLatest) return null;
    value = `${fmtValue(lowerLatest.v, def)}–${fmtValue(latest.v, def)}`;
  }

  return {
    value,
    changes: changesFor(points, def, now),
    asOf: asOfLabel(latest, def.cadence, now),
    ...(def.review ? { reviewBody: def.review } : {}),
    ...(def.reviewLast ? { reviewLast: def.reviewLast } : {}),
  };
}

// ---- cache ----

interface Snapshot {
  quotes: Map<string, LiveQuote>;
  at: number;
}

let snapshot: Snapshot | null = null;
let inFlight: Promise<Snapshot> | null = null;

async function refresh(): Promise<Snapshot> {
  const now = Date.now();
  const observations = await loadObservations(now);
  const quotes = new Map<string, LiveQuote>();
  for (const def of MACRO) {
    const q = quoteFor(def, observations, now);
    if (q) quotes.set(def.id, q);
  }
  return { quotes, at: now };
}

// How long the very first caller on a cold process will wait for FRED. A full
// refresh is ~40 reads at six-at-a-time, so it is measured in seconds, not
// milliseconds — and this endpoint must not hang behind it. Past the budget the
// board renders from the catalog (every macro row honestly flagged Sample) while
// the refresh finishes into the snapshot for the next poll. `warmMarketMacro()`
// means production almost never pays this.
const COLD_READ_BUDGET_MS = 5000;

function startRefresh(): Promise<Snapshot> {
  if (!inFlight) {
    inFlight = refresh()
      .then((s) => {
        // Only replace a working snapshot with one that resolved something. A
        // transient FRED failure must not revert the board to placeholders.
        if (s.quotes.size > 0 || !snapshot) snapshot = s;
        else snapshot = { quotes: snapshot.quotes, at: s.at };
        return snapshot;
      })
      .catch(() => snapshot ?? { quotes: new Map<string, LiveQuote>(), at: Date.now() })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Live values for the macro series, keyed by catalog series id. Empty if the
// first fetch has not landed inside its budget, or if FRED cannot be reached at
// all. Never throws.
export async function getMarketMacro(): Promise<Map<string, LiveQuote>> {
  const now = Date.now();
  if (snapshot && now - snapshot.at < TTL_MS) return snapshot.quotes;

  const running = startRefresh();

  // Stale-while-revalidate: a caller that already has figures gets them at once
  // and the refresh lands for the next poll. Only a cold process waits, and only
  // up to the budget.
  if (snapshot) return snapshot.quotes;
  const timedOut = new Promise<null>((resolve) => {
    // Unref'd so a pending budget timer can never hold the process open.
    setTimeout(() => resolve(null), COLD_READ_BUDGET_MS).unref();
  });
  return (await Promise.race([running.then((s) => s.quotes), timedOut])) ?? new Map();
}

// Fill the cache at boot so no visitor pays the cold read. Fire-and-forget: it
// never blocks startup and a failure is simply the cold path on first request.
//
// Production only, like every other boot task — `tsx watch` restarts the dev
// server on each save, and warming there would fire forty requests at a public
// endpoint every time a file is touched. Dev pays the (budgeted) cold read on
// the first board load instead.
export function warmMarketMacro(): void {
  if (!config.isProd) return;
  void startRefresh().catch(() => undefined);
}

// Test/ops seam: drop the cache so the next read refetches.
export function resetMarketMacro(): void {
  snapshot = null;
}

// Internals, exported for the offline math check in `verifyMarketMacro.ts`.
export const __macroInternals = { MACRO, derive, changesFor, fmtValue, fmtDelta, asOfLabel, quoteFor };
