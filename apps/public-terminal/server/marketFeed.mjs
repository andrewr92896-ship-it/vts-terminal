import { fetchCoinCloses, fetchFredSeries } from './fredSource.mjs';
import { PUBLIC_FOMC_MEETING_DATES } from './fomcDates.mjs';

// The demo board's market data, read live on the public terminal's own server.
//
// WHAT THIS REPLACED, because it is the reason the module exists: the demo's
// board was a list of frozen literals in the bundle, most of them marked
// `source:'live'` and `sample:false`. During a demonstration it showed a Fed
// target that policy had moved past, review dates a month gone, and quotes
// presented as live that had not moved since they were typed. That is the one
// thing this repository's rules forbid outright — a figure nobody measured
// reported as a measured one — and it was on the screen a prospective customer
// is shown first.
//
// THREE RULES CARRY IT.
//
// 1. **A row is live or it says Sample. There is no third state.** Everything
//    here is best-effort: a provider that will not answer leaves the row on its
//    bundled fallback with `sample: true` and the grey dot, and the payload's
//    `sampleValues` says outright that part of the board is sample. A stale
//    figure quietly wearing the live styling is worse than an honest
//    placeholder, and it is what was there before.
//
// 2. **The row set is SHORT, and widening it is a decision.** The private board
//    carries seventy-odd series through a reader this may not import. Copying
//    that catalog would be a mirror nobody could keep in step, so what is here
//    is the showcase set — and only the three transforms those rows need. A row
//    no free provider covers (gold, the meeting odds) is not added at all
//    rather than added as a permanent placeholder.
//
// 3. **It never reaches the private terminal.** Every source here is a public
//    one — the St. Louis Fed, and Kraken's keyless public candles. There is no
//    portal hostname, no shared credential and no private route involved, which
//    is what keeps the public/private boundary intact.
//
// Cached process-wide, stale-while-revalidate, never replaced by a worse
// answer: a transient provider outage leaves the last good figures up.

const DAY_MS = 86400_000;
const TTL_MS = 10 * 60_000;
const HISTORY_YEARS = 4; // enough for a y/y rate's own 1-year look-back

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CADENCE_DAYS = { daily: 1, weekly: 7, monthly: 28, quarterly: 90 };

export const GROUPS = [
  { key: 'policy', label: 'Policy & rates' },
  { key: 'inflation', label: 'Inflation' },
  { key: 'labor', label: 'Labor & growth' },
  { key: 'yields', label: 'Yields & curve' },
  { key: 'fx', label: 'FX & dollar' },
  { key: 'commod', label: 'Commodities' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'equity', label: 'Indices & volatility' },
  { key: 'macro', label: 'Macro & liquidity' },
  { key: 'session', label: 'Sessions' },
];

// ---- the catalog ----
//
// `transform` is one of `level`, `yoy`, `ytdIndex` — deliberately the only three
// the showcase rows need. `changeMode` decides how a move reads: a RATE moves by
// subtraction (a yield 4.05 -> 4.02 is "−0.03", not "−0.74%") and a PRICE moves
// by percent. Getting that the wrong way round is the most plausible mistake
// here, which is why `verify:public-market` pins one of each.
export const CATALOG = [
  { id: 'ffr', group: 'policy', label: 'Fed funds target', unit: '%', fred: 'DFEDTARU', fredLower: 'DFEDTARL', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'delta', review: 'FOMC', reviewLast: 'fomc-prev', reviewNext: 'fomc' },
  { id: 'effr', group: 'policy', label: 'Effective fed funds', unit: '%', fred: 'EFFR', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'delta', review: 'New York Fed', reviewCycle: 'daily' },
  { id: 'cpi', group: 'inflation', label: 'CPI Y/Y', unit: '%', fred: 'CPIAUCSL', transform: 'yoy', cadence: 'monthly', decimals: 1, changeMode: 'delta', review: 'BLS', reviewCycle: 'monthly' },
  { id: 'cpiytd', group: 'inflation', label: 'CPI year to date', unit: '%', fred: 'CPIAUCSL', transform: 'ytdIndex', cadence: 'monthly', decimals: 1, changeMode: 'delta', review: 'BLS', reviewCycle: 'monthly' },
  { id: 'cpce', group: 'inflation', label: 'Core PCE Y/Y', unit: '%', fred: 'PCEPILFE', transform: 'yoy', cadence: 'monthly', decimals: 1, changeMode: 'delta', review: 'BEA', reviewCycle: 'monthly' },
  { id: 'claims', group: 'labor', label: 'Initial jobless claims', unit: 'k', fred: 'ICSA', transform: 'level', cadence: 'weekly', decimals: 0, scale: 1 / 1000, changeMode: 'delta', review: 'DOL', reviewCycle: 'weekly · Thursday' },
  { id: 'unrate', group: 'labor', label: 'Unemployment rate', unit: '%', fred: 'UNRATE', transform: 'level', cadence: 'monthly', decimals: 1, changeMode: 'delta', review: 'BLS', reviewCycle: 'monthly' },
  { id: 'y2', group: 'yields', label: '2Y Treasury', unit: '%', fred: 'DGS2', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'delta', review: 'U.S. Treasury', reviewCycle: 'daily' },
  { id: 'y10', group: 'yields', label: '10Y Treasury', unit: '%', fred: 'DGS10', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'delta', review: 'U.S. Treasury', reviewCycle: 'daily' },
  // Derived from the two rows above rather than read from FRED's ready-made
  // spread, which refreshes on its own clock: read separately it could reach a
  // day the yield rows had not and print a spread the board's own numbers
  // contradict. Subtracting makes the three reconcile by construction.
  { id: 's2s10', group: 'macro', label: '10Y − 2Y spread', unit: 'bp', fred: 'DGS10', fredMinus: 'DGS2', transform: 'level', cadence: 'daily', decimals: 0, scale: 100, signed: true, changeMode: 'delta', review: 'Derived from the two Treasury rows', reviewCycle: 'daily' },
  { id: 'eurusd', group: 'fx', label: 'EUR/USD', unit: '', fred: 'DEXUSEU', transform: 'level', cadence: 'daily', decimals: 4, changeMode: 'pct', review: 'Federal Reserve H.10', reviewCycle: 'daily · noon rate' },
  { id: 'gbpusd', group: 'fx', label: 'GBP/USD', unit: '', fred: 'DEXUSUK', transform: 'level', cadence: 'daily', decimals: 4, changeMode: 'pct', review: 'Federal Reserve H.10', reviewCycle: 'daily · noon rate' },
  // Deliberately NOT labelled DXY, and deliberately NOT given the private
  // board's `dxy` id. This is the Fed's own broad trade-weighted index, a
  // different basket from ICE's dollar index — sharing the id would make two
  // boards disagree about one row, which is worse than carrying two rows.
  // Every other id here matches the private catalog on purpose.
  { id: 'broad-usd', group: 'fx', label: 'Broad dollar index', unit: '', fred: 'DTWEXBGS', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'pct', review: 'Federal Reserve H.10', reviewCycle: 'daily' },
  { id: 'btc', group: 'crypto', label: 'Bitcoin', unit: 'USD', money: true, kraken: 'XBTUSD', transform: 'level', cadence: 'daily', decimals: 0, changeMode: 'pct', review: 'Kraken', reviewCycle: 'continuous' },
  { id: 'eth', group: 'crypto', label: 'Ethereum', unit: 'USD', money: true, kraken: 'ETHUSD', transform: 'level', cadence: 'daily', decimals: 0, changeMode: 'pct', review: 'Kraken', reviewCycle: 'continuous' },
  { id: 'us500', group: 'equity', label: 'S&P 500', unit: '', fred: 'SP500', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'pct', review: 'S&P Dow Jones Indices', reviewCycle: 'daily close' },
  { id: 'vix', group: 'equity', label: 'VIX', unit: '', fred: 'VIXCLS', transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'delta', review: 'Cboe', reviewCycle: 'daily close' },
];

// Rows no free provider covers. They are carried so the board's groups are not
// left with holes, and they are marked Sample — never dressed as live.
export const SAMPLE_ROWS = [
  { id: 'gold', group: 'commod', label: 'Gold spot', value: '—', unit: 'USD', money: true, asOf: 'sample', changes: ['—', '—', '—', '—', '—'], review: { body: 'No free provider', last: 'sample', next: '' } },
];

// ---- derivation ----

function atOrBefore(points, at) {
  let found = null;
  for (const p of points) {
    if (p.timeMs <= at) found = p;
    else break;
  }
  return found;
}

const minusMonths = (t, months) => {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
};

const minusYears = (t, years) => {
  const d = new Date(t);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
};

// The reading twelve months before observation `i`, tolerating the few days a
// publication date can drift. Without the tolerance a gap in the series would
// silently pair a reading with one from TWO years earlier and report that as a
// year-over-year rate.
function yearEarlier(obs, i) {
  const target = minusYears(obs[i].timeMs, 1);
  let found = null;
  for (let j = i - 1; j >= 0; j -= 1) {
    if (obs[j].timeMs <= target) { found = obs[j]; break; }
  }
  if (!found) return null;
  if (Math.abs(found.timeMs - target) > 45 * DAY_MS) return null;
  return found.value;
}

const utcYear = (t) => new Date(t).getUTCFullYear();

// The year it is right now on the desk. Deliberately Eastern, matching every
// other clock in the terminal: between 7pm and midnight ET on 31 December the
// UTC year has already turned, and a year-to-date measured against it would
// jump into the new year while the rest of the board was still in the old one.
const etYear = (now) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(now));

export function derive(obs, def) {
  const scale = def.scale ?? 1;
  const out = [];
  const push = (o, v) => {
    if (Number.isFinite(v)) out.push({ timeMs: o.timeMs, date: o.date, v: v * scale });
  };
  for (let i = 0; i < obs.length; i += 1) {
    const o = obs[i];
    if (def.transform === 'level') { push(o, o.value); continue; }
    if (def.transform === 'yoy') {
      const base = yearEarlier(obs, i);
      if (base != null && base !== 0) push(o, (o.value / base - 1) * 100);
      continue;
    }
    if (def.transform === 'ytdIndex') {
      const year = utcYear(o.timeMs);
      let base = null;
      for (let j = i - 1; j >= 0; j -= 1) {
        if (utcYear(obs[j].timeMs) < year) { base = obs[j].value; break; }
      }
      if (base != null && base !== 0) push(o, (o.value / base - 1) * 100);
    }
  }
  return out;
}

// Two series, inner-joined on date and subtracted. The join is what makes a
// spread reconcile with the rows it is derived from.
export function subtractSeries(a, b) {
  const byDate = new Map(b.map((o) => [o.date, o.value]));
  const out = [];
  for (const o of a) {
    const other = byDate.get(o.date);
    if (other == null) continue;
    out.push({ date: o.date, timeMs: o.timeMs, value: o.value - other });
  }
  return out;
}

// ---- formatting ----

// A real minus sign (U+2212), matching every figure the board ships.
const withSign = (n, body, forceSign) => (n < 0 ? `−${body}` : forceSign ? `+${body}` : body);

const fmtNumber = (n, decimals) =>
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function fmtValue(n, def) {
  const rounded = Number(n.toFixed(def.decimals));
  return withSign(rounded, fmtNumber(rounded, def.decimals), def.signed === true && rounded !== 0);
}

// How many decimals a percent can afford before it stops fitting its column:
// the change columns are narrow and fixed, so a large move spends its characters
// on the digits that carry information.
export function pctDecimals(pct, decimals) {
  const m = Math.abs(pct);
  if (m >= 100) return 0;
  if (m >= 10) return Math.min(decimals, 1);
  return decimals;
}

// A change column measured by SUBTRACTION. An unsigned zero, so "no move" reads
// neutral rather than as a gain; `null` renders as the em dash the board uses
// for a period with no reading behind it.
export function fmtDelta(diff, def) {
  if (diff == null || !Number.isFinite(diff)) return '—';
  const decimals = def.changeDecimals ?? def.decimals;
  const rounded = Number((diff * (def.changeScale ?? 1)).toFixed(decimals));
  const body = `${fmtNumber(rounded, decimals)}${def.changeSuffix ?? ''}`;
  return rounded === 0 ? body : withSign(rounded, body, true);
}

// A change column measured by PERCENT.
export function fmtPct(pct, decimals) {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const dp = pctDecimals(pct, decimals);
  const rounded = Number(pct.toFixed(dp));
  const body = `${Math.abs(rounded).toFixed(dp)}%`;
  return rounded === 0 ? body : withSign(rounded, body, true);
}

// When a reading is FOR — never when it was released. A FRED observation is
// dated for the period it measures, so June CPI is dated 2026-06-01 and comes
// out in July.
export function asOfLabel(point, cadence, now) {
  const d = new Date(point.timeMs);
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const tail = year !== etYear(now) ? ` ${year}` : '';
  if (cadence === 'daily') return `${month} ${d.getUTCDate()}${tail}`;
  if (cadence === 'weekly') return `wk to ${month} ${d.getUTCDate()}${tail}`;
  if (cadence === 'quarterly') return `Q${Math.floor(d.getUTCMonth() / 3) + 1}${tail}`;
  return `${month}${tail}`;
}

// ---- change columns ----
//
// Look-backs anchor on the LATEST READING, not on the wall clock: a June CPI
// print released in July is still the current reading in August, and its
// 1-month column means against May's print. Anchored on `now` it would compare
// June with June and report a flat month.
//
// Year-to-date is the exception and anchors on the calendar — the last reading
// before this year began — which is what a desk means by the move so far this
// year regardless of when the series last printed.
//
// A period SHORTER than the publication cadence resolves to a flat zero rather
// than borrowing a longer period's move. CPI prints monthly, so a naive 1-day
// look-back lands on the previous MONTH's reading and prints a monthly move in
// the daily column. Zero is right here and blank is not: the figure genuinely
// has not changed over that window.
export function changesFor(points, def, now) {
  const latest = points[points.length - 1];
  const cadenceDays = CADENCE_DAYS[def.cadence];
  const pct = def.changeMode === 'pct';

  const moveAt = (at) => {
    const ref = atOrBefore(points, at);
    if (!ref) return null;
    if (!pct) return latest.v - ref.v;
    return ref.v > 0 ? (latest.v / ref.v - 1) * 100 : null;
  };
  const gated = (periodDays, at) => (periodDays < cadenceDays ? 0 : moveAt(at));

  const moves = [
    gated(1, latest.timeMs - DAY_MS),
    gated(7, latest.timeMs - 7 * DAY_MS),
    gated(30, minusMonths(latest.timeMs, 1)),
    // Ungated: the previous year's final reading is a real base in every month,
    // January included.
    moveAt(Date.UTC(etYear(now), 0, 1) - 1),
    gated(365, minusYears(latest.timeMs, 1)),
  ];
  return pct ? moves.map((m, i) => fmtPct(m, i === 0 ? 2 : 1)) : moves.map((m) => fmtDelta(m, def));
}

// ---- assembling a row ----

export function rowFor(def, observations, now) {
  let obs = observations.get(def.fred ?? def.kraken);
  if (!obs || obs.length === 0) return null;

  if (def.fredMinus) {
    const minus = observations.get(def.fredMinus);
    // Without the second leg there is no spread, and printing the first leg
    // alone would put a 10-year yield in a row labelled as a spread.
    if (!minus || minus.length === 0) return null;
    obs = subtractSeries(obs, minus);
    if (obs.length === 0) return null;
  }

  const points = derive(obs, def);
  if (points.length === 0) return null;
  const latest = points[points.length - 1];

  // A range row prints both bounds; its change columns still track the upper
  // one, which is what policy is quoted against. Without the lower bound there
  // is no range, and showing the upper alone would misstate policy as a point
  // target.
  let value = fmtValue(latest.v, def);
  if (def.fredLower) {
    const lowerObs = observations.get(def.fredLower);
    const lowerPoints = lowerObs ? derive(lowerObs, def) : [];
    const lowerLatest = lowerPoints[lowerPoints.length - 1];
    if (!lowerLatest) return null;
    value = `${fmtValue(lowerLatest.v, def)}–${fmtValue(latest.v, def)}`;
  }

  return {
    id: def.id,
    group: def.group,
    label: def.label,
    value,
    unit: def.unit ?? '',
    asOf: asOfLabel(latest, def.cadence, now),
    source: 'live',
    money: def.money === true,
    session: null,
    changes: changesFor(points, def, now),
    review: { body: def.review, last: def.reviewLast ?? def.reviewCycle ?? 'daily', next: def.reviewNext ?? '' },
    sample: false,
  };
}

// The one row with no provider behind it at all: the New York session, whose
// value is the clock rather than a reading.
const sessionRow = () => ({
  id: 'ny', group: 'session', label: 'New York session', value: '', unit: '',
  asOf: 'Eastern', source: 'live', money: false, session: [570, 960],
  changes: ['—', '—', '—', '—', '—'],
  review: { body: 'Market hours', last: 'continuous', next: '' }, sample: false,
});

const sampleRow = (row) => ({
  ...row, unit: row.unit ?? '', source: 'manual', money: row.money === true,
  session: null, sample: true,
});

// ---- fetching ----

const historyStart = (now) => {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - HISTORY_YEARS);
  return d.toISOString().slice(0, 10);
};

async function loadObservations(now) {
  const fredIds = new Set();
  const krakenPairs = new Set();
  for (const def of CATALOG) {
    if (def.fred) fredIds.add(def.fred);
    if (def.fredLower) fredIds.add(def.fredLower);
    if (def.fredMinus) fredIds.add(def.fredMinus);
    if (def.kraken) krakenPairs.add(def.kraken);
  }
  const start = historyStart(now);
  const out = new Map();
  await Promise.all([
    ...[...fredIds].map(async (id) => { out.set(id, await fetchFredSeries(id, start)); }),
    ...[...krakenPairs].map(async (pair) => { out.set(pair, await fetchCoinCloses(pair)); }),
  ]);
  return out;
}

export function buildPayload(observations, now) {
  const live = [];
  const missing = [];
  for (const def of CATALOG) {
    const row = rowFor(def, observations, now);
    if (row) live.push(row);
    else missing.push(def);
  }
  // A row whose provider would not answer is carried as Sample rather than
  // dropped: a group that silently loses its only row reads as a board with a
  // hole in it, and says nothing about why.
  const unread = missing.map((def) =>
    sampleRow({
      id: def.id, group: def.group, label: def.label, value: '—', unit: def.unit ?? '',
      money: def.money, asOf: 'sample', changes: ['—', '—', '—', '—', '—'],
      // The publication CYCLE is still true when a read fails — CPI is monthly
      // whether or not we reached it — so the row keeps it. What marks the row
      // is `sample`, not a word in the review column.
      review: { body: def.review, last: def.reviewCycle ?? 'sample', next: '' },
    }),
  );
  const series = [...live, ...unread, ...SAMPLE_ROWS.map(sampleRow), sessionRow()];
  const order = new Map(GROUPS.map((g, i) => [g.key, i]));
  series.sort((a, b) => (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99));
  return {
    groups: GROUPS,
    series,
    periods: ['1D', '1W', '1M', 'YTD', '1Y'],
    defaultPins: ['ffr', 'cpi', 'y10', 'us500'],
    // Both forms: the ISO list is what a current bundle resolves against, and
    // the month-day pair is kept beside it because a service-worker-cached
    // bundle from before the ISO list existed would read an ISO string as a
    // month-day.
    meetings: PUBLIC_FOMC_MEETING_DATES.map((iso) => iso.slice(5)),
    meetingYear: Number(PUBLIC_FOMC_MEETING_DATES[0].slice(0, 4)),
    meetingDates: PUBLIC_FOMC_MEETING_DATES,
    sampleValues: series.some((row) => row.sample),
  };
}

// ---- cache ----

let cached = null;
let inFlight = null;

async function refresh(now) {
  const observations = await loadObservations(now);
  const payload = buildPayload(observations, now);
  const liveRows = payload.series.filter((row) => !row.sample).length;
  // Never replace a good answer with a worse one. If every provider failed this
  // pass, the previous payload stands and the next pass tries again.
  if (cached && liveRows <= 1) return cached.payload;
  cached = { at: now, payload };
  return payload;
}

export async function readPublicMarketData(now = Date.now()) {
  if (cached && now - cached.at < TTL_MS) return cached.payload;
  if (!inFlight) {
    inFlight = refresh(now)
      .catch(() => cached?.payload ?? buildPayload(new Map(), now))
      .finally(() => { inFlight = null; });
  }
  // A cached payload past its TTL is served immediately and refreshed behind
  // the request; only a cold process waits.
  if (cached) return cached.payload;
  return inFlight;
}

export function resetPublicMarketData() {
  cached = null;
  inFlight = null;
}
