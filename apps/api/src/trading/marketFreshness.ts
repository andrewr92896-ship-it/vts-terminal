// HOW OLD A READING MAY BE AND STILL BE CALLED CURRENT.
//
// **THIS FILE EXISTS TWICE ON PURPOSE** — once in the private terminal's own
// trading module and once beside the public terminal's demo feed, identical
// below their headers. The public terminal is a separate deployment that may
// not import from the private one, and both boards have to agree about what
// "current" means — a figure the private board calls stale and the demo board calls live
// is the same lie told twice. `npm run verify:market-freshness` imports BOTH and
// runs every fixture through each, so a change made to one and not the other
// fails there rather than on a board. **Change one file and change the other.**
//
// WHY IT EXISTS AT ALL. An outside audit found the green "Live feed" dot on
// Treasury yields, FX and a VIX that were days old. `MarketFreshness` has
// carried a `stale` value since the board was built and nothing in the
// repository had ever set it: every row a provider could fill was stamped
// `live` outright. The figures were real; the claim about them was not.
//
// THE WINDOW IS "HOW LONG THIS READING STAYS THE NEWEST ONE THAT EXISTS", and
// that is a property of the series' RELEASE SCHEDULE rather than of the clock.
// The first cut used tidy multiples of the period (45 days for a monthly
// series, 120 for a quarterly one) and they are too short by a wide margin:
// August CPI is dated the 1st of August and is not superseded until September's
// prints in mid-October, so it is the current reading at 73 days old. A window
// of 45 would have marked the newest CPI that exists as stale for the last
// three weeks of every month — the original bug pointing the other way.
//
// So each window is **period + publication lag + a little slack**, measured
// against the reading's own date:
//
// | cadence    | superseded after            | window |
// | ---------- | --------------------------- | ------ |
// | weekly     | claims: Sat date, Thu +12d  | 17d    |
// | monthly    | CPI: 1st, next prints +73d  | 80d    |
// | quarterly  | GDP: Q start, next +212d    | 230d   |
//
// A DAILY SERIES IS COUNTED IN BUSINESS DAYS, NOT CALENDAR ONES, and that is
// the half a calendar window cannot get right in either direction. Friday's
// close read on Monday is three calendar days old and is the current reading;
// the same figure still up on Thursday is six calendar days old and is two
// missed publications. Counting weekdays separates those cleanly, which is what
// makes a genuinely lagging series legible instead of being lost among the
// weekends.
//
// A CONTINUOUS ROW IS JUDGED ON ITS CANDLE, NEVER ON WHEN WE FETCHED IT. The
// tempting shortcut — a coin was read just now, so it is live — makes the row
// permanently live: a feed serving week-old candles would still pass, because
// the only thing being tested would be our own clock.

export type MarketFreshness = 'live' | 'manual' | 'stale';

export type FreshnessCadence = 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly';

const DAY_MS = 86400_000;
const HOUR_MS = 3600_000;

// A daily exchange or statistical series publishes the next business day, so
// the newest reading is normally one business day old. Two absorbs a public
// holiday; beyond that the series has missed a publication and the board should
// say so.
export const DAILY_STALE_AFTER_BUSINESS_DAYS = 2;

// The forming daily candle is stamped midnight UTC of the day it is forming, so
// it is up to 24 hours old while being entirely current. The slack covers a
// quiet weekend on a venue that publishes one anyway.
const CONTINUOUS_WINDOW_MS = 36 * HOUR_MS;

export const STALE_AFTER_MS: Record<Exclude<FreshnessCadence, 'daily' | 'continuous'>, number> = {
  weekly: 17 * DAY_MS,
  monthly: 80 * DAY_MS,
  quarterly: 230 * DAY_MS,
};

// Past this, a daily series is stale whatever the calendar did, and the loop
// below is skipped. Without it a garbage or wildly old timestamp would walk a
// day at a time through however many years separate it from now.
const DAILY_MAX_CALENDAR_MS = 14 * DAY_MS;

// Weekdays strictly after `fromMs` and up to and including `toMs`, counted on
// whole UTC days. Saturday and Sunday are skipped; public holidays are not
// enumerated, which is what the window's second business day is slack for.
export function businessDaysBetween(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return 0;
  const start = Math.floor(fromMs / DAY_MS);
  const end = Math.floor(toMs / DAY_MS);
  let days = 0;
  for (let d = start + 1; d <= end; d += 1) {
    const weekday = new Date(d * DAY_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

// `timeMs` is the reading's OWN date — the day a statistical observation
// measures, or a candle's own timestamp — never the moment we read it.
export function freshnessFor(timeMs: number, cadence: FreshnessCadence, now: number): MarketFreshness {
  if (!Number.isFinite(timeMs) || !Number.isFinite(now)) return 'stale';
  if (cadence === 'continuous') return now - timeMs > CONTINUOUS_WINDOW_MS ? 'stale' : 'live';
  if (cadence === 'daily') {
    if (now - timeMs > DAILY_MAX_CALENDAR_MS) return 'stale';
    return businessDaysBetween(timeMs, now) > DAILY_STALE_AFTER_BUSINESS_DAYS ? 'stale' : 'live';
  }
  const window = STALE_AFTER_MS[cadence] ?? STALE_AFTER_MS.monthly;
  return now - timeMs > window ? 'stale' : 'live';
}
