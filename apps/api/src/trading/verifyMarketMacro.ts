import { __macroInternals } from './marketMacro.js';
import { parseFredCsv, type FredObservation } from './brokers/fred.js';
import { parseKrakenOhlc } from './brokers/crypto.js';

// Offline check of the Market Data macro math (`marketMacro.ts`).
//
// Everything that file does depends on a remote provider, so the parts worth
// getting wrong quietly — turning a CPI index into a y/y rate, turning a running
// jobs total into a monthly print, keeping a monthly series' 1-day column from
// borrowing its monthly move, scaling a spread into basis points — cannot be
// checked by running the app. This script feeds each transform observations
// whose answers are known by hand and compares the rendered strings.
//
//     npm run verify:market-macro          (root or @vts/api)
//
// Exits non-zero on the first mismatch. It reads no network and no database.

const { derive, changesFor, fmtValue, quoteFor, splitReleaseDates, MACRO } = __macroInternals;

type Def = (typeof MACRO)[number];

function obs(rows: [string, number][]): FredObservation[] {
  return rows.map(([date, value]) => ({
    date,
    timeMs: Date.parse(`${date}T00:00:00Z`),
    value,
  }));
}

// Monthly observation dates are the first of the month, as FRED publishes them.
function monthly(start: string, values: number[]): FredObservation[] {
  const [y0, m0] = start.split('-').map(Number);
  return obs(
    values.map((v, i) => {
      const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
      return [d.toISOString().slice(0, 10), v];
    }),
  );
}

let failures = 0;

function check(name: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${name.padEnd(46)} ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

function def(id: string): Def {
  const d = MACRO.find((m) => m.id === id);
  if (!d) throw new Error(`no macro definition for "${id}" — did the id change?`);
  return d;
}

// Render a definition against fixture observations, as the board would.
function render(id: string, observations: FredObservation[], now: number) {
  const d = def(id);
  const points = derive(observations, d);
  return {
    value: fmtValue(points[points.length - 1].v, d),
    changes: changesFor(points, d, now),
  };
}

console.log('Market Data · macro transform check\n');

// ---- y/y from an index level, and the cadence gate ----
// A CPI index rising 100 → 102.6 over twelve months is a 2.6% y/y rate. Thirteen
// months of history give one derived point; twenty-five give a year of them.
{
  // Jan 2025 = 100, flat to Jan 2026, then rising. Index values chosen so the
  // y/y rate is exactly 2.6% in Jun 2026 and 2.9% in May 2026.
  const idx = monthly('2025-01', [
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, // 2025
    100, 100, 100, 100, 102.9, 102.6, // Jan–Jun 2026
  ]);
  const now = Date.parse('2026-08-02T12:00:00Z');
  const r = render('cpi', idx, now);
  check('cpi · y/y rate from an index', r.value, '2.6');
  // Monthly series: 1D and 1W cannot contain a move, so they are flat zeros
  // rather than the −0.3 that a naive date look-back would put there.
  check('cpi · 1D gated flat (monthly cadence)', r.changes[0], '0.0');
  check('cpi · 1W gated flat (monthly cadence)', r.changes[1], '0.0');
  check('cpi · 1M vs the previous print', r.changes[2], '−0.3');
  // Dec 2025 was 100 vs Dec 2024 — no y/y point exists there, so YTD has no base.
  check('cpi · YTD with no base reads em dash', r.changes[3], '—');
}

// ---- a level series, daily, with real 1D ----
{
  const y10 = obs([
    ['2026-07-28', 4.11],
    ['2026-07-29', 4.08],
    ['2026-07-30', 4.06],
    ['2026-07-31', 4.02],
  ]);
  const now = Date.parse('2026-08-02T12:00:00Z');
  const r = render('y10', y10, now);
  check('y10 · level value', r.value, '4.02');
  check('y10 · 1D is a real move (daily cadence)', r.changes[0], '−0.04');
}

// ---- basis-point scaling and a signed value ----
{
  const spread = obs([
    ['2026-07-30', 0.33],
    ['2026-07-31', 0.34],
  ]);
  const now = Date.parse('2026-08-02T12:00:00Z');
  const r = render('s2s10', spread, now);
  check('s2s10 · percent scaled to bps, signed', r.value, '+34');
  check('s2s10 · 1D in bps', r.changes[0], '+1');
}

// ---- a running total becomes the monthly print ----
{
  // Total jobs in thousands. The last three monthly gains are 145, 145 and 112.
  const jobs = monthly('2026-01', [159_000, 159_200, 159_400, 159_545, 159_690, 159_802]);
  const now = Date.parse('2026-08-02T12:00:00Z');
  const r = render('nfp', jobs, now);
  check('nfp · level becomes the month print', r.value, '+112');
  check('nfp · 1M vs the previous print', r.changes[2], '−33');

  const avg = render('nfp3', jobs, now);
  check('nfp3 · three-month average print', avg.value, '+134');
}

// ---- value and changes in different units ----
{
  // H.4.1 total assets in millions: 6.42T, down 12B on the week.
  const wal = obs([
    ['2026-07-08', 6_528_000],
    ['2026-07-15', 6_466_000],
    ['2026-07-17', 6_432_000],
    ['2026-07-24', 6_420_000],
  ]);
  const now = Date.parse('2026-08-02T12:00:00Z');
  const r = render('bs', wal, now);
  check('bs · millions shown as trillions', r.value, '6.42');
  check('bs · weekly change shown in billions', r.changes[1], '−12B');
  check('bs · 1D gated flat (weekly cadence)', r.changes[0], '0B');
}

// ---- quarterly growth, annualized ----
{
  // 0.934% on the quarter annualizes to ~3.8%.
  const gdp = obs([
    ['2025-10-01', 23_000],
    ['2026-01-01', 23_215],
  ]);
  const now = Date.parse('2026-08-02T12:00:00Z');
  const r = render('gdp', gdp, now);
  check('gdp · q/q annualized', r.value, '3.8');
  check('gdp · 1M gated flat (quarterly cadence)', r.changes[2], '0.0');
}

// ---- year to date against last year's final reading ----
{
  const idx = monthly('2025-11', [100, 100.4, 100.7, 101, 101.3, 101.5, 101.8]);
  const now = Date.parse('2026-05-15T12:00:00Z');
  const r = render('cpiytd', idx, now);
  // Mar 2026 (101.8) against Dec 2025 (100.4) = +1.4%.
  check('cpiytd · vs the previous year-end reading', r.value, '1.4');
}

// ---- a price row read off FRED still reads as a price ----
// The indices and the energy rows can come from either provider, so their
// change columns must be percent (and carry the extra 1-day decimal) no matter
// which one filled them — a "+18" on the S&P would match nothing else on the
// board.
{
  const spx = obs([
    ['2026-07-24', 6_600],
    ['2026-07-29', 6_650],
    ['2026-07-30', 6_724.16],
    ['2026-07-31', 6_743.0],
  ]);
  const now = Date.parse('2026-08-02T12:00:00Z');
  const r = render('us500', spx, now);
  check('us500 · index level with separators', r.value, '6,743');
  check('us500 · 1D is a percent, 2dp', r.changes[0], '+0.28%');
  check('us500 · 1W is a percent, 1dp', r.changes[1], '+2.2%');
}

// ---- the Fed target range reads off two series ----
{
  const now = Date.parse('2026-08-02T12:00:00Z');
  const upper = obs([
    ['2026-07-30', 4.5],
    ['2026-07-31', 4.5],
  ]);
  const lower = obs([
    ['2026-07-30', 4.25],
    ['2026-07-31', 4.25],
  ]);
  const both = new Map([
    ['DFEDTARU', upper],
    ['DFEDTARL', lower],
  ]);
  check('ffr · both bounds render as a range', quoteFor(def('ffr'), both, now)?.value ?? '', '4.25–4.50');

  // Without the lower bound there is no range. Printing the upper bound alone
  // would state policy as a point target, so the row stays sample instead.
  const upperOnly = new Map([['DFEDTARU', upper]]);
  check('ffr · a missing bound yields no quote', String(quoteFor(def('ffr'), upperOnly, now)), 'null');
}

// ---- the keyless CSV parser ----
{
  // A header FRED has shipped under two different names, a "." no-reading
  // marker, and a trailing blank line — all of which must fall out.
  const csv = 'observation_date,DGS10\n2026-07-29,4.08\n2026-07-30,.\n2026-07-31,4.02\n\n';
  const rows = parseFredCsv(csv);
  check('csv · header, "." and blank lines dropped', String(rows.length), '2');
  check('csv · last reading parsed', `${rows[1].date}=${rows[1].value}`, '2026-07-31=4.02');
}

// ---- a curve spread is derived from the two yields the board displays ----
// The three rows have to add up on screen, so the spread is pinned to the last
// day BOTH legs published — not to whichever leg FRED refreshed first.
{
  const now = Date.parse('2026-08-02T12:00:00Z');
  const y10 = obs([
    ['2026-07-30', 4.68],
    // A day the 2-year has not published yet. Using it would print a spread the
    // two yield rows beside it contradict.
    ['2026-07-31', 4.71],
  ]);
  const y2 = obs([
    ['2026-07-29', 4.2],
    ['2026-07-30', 4.23],
  ]);
  const both = new Map([
    ['DGS10', y10],
    ['DGS2', y2],
  ]);
  const q = quoteFor(def('s2s10'), both, now);
  check('s2s10 · derived, in bps, signed', q?.value ?? '', '+45');
  check('s2s10 · pinned to the day both legs have', q?.asOf ?? '', 'Jul 30');
  check(
    's2s10 · a missing leg yields no quote',
    String(quoteFor(def('s2s10'), new Map([['DGS10', y10]]), now)),
    'null',
  );
}

// ---- a big percent move drops a decimal rather than being clipped ----
{
  const now = Date.parse('2026-08-02T12:00:00Z');
  // The VIX at 17.09 after a 20.66 close: −17.28%, which rendered as "−17.28%"
  // and was clipped on screen to "−17.2…".
  const vix = obs([
    ['2026-07-24', 16.5],
    ['2026-07-30', 20.66],
    ['2026-07-31', 17.09],
  ]);
  const r = render('vix', vix, now);
  check('vix · percent, not points', r.changes[0], '−17.3%');
  check('vix · small move keeps both decimals', render('vix', obs([
    ['2026-07-30', 17.04],
    ['2026-07-31', 17.09],
  ]), now).changes[0], '+0.29%');
}

// ---- Kraken's daily candles, for the crypto rows OANDA cannot quote ----
{
  const now = Date.parse('2026-08-02T12:00:00Z');
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
  const json = {
    error: [],
    result: {
      XXBTZUSD: [
        [day('2026-07-30'), '61000', '62000', '60500', '61800', '0', '0', 1],
        [day('2026-07-31'), '61800', '63000', '61500', '62762', '0', '0', 1],
        // Today's candle is still forming and must not count as a close.
        [day('2026-08-02'), '62762', '63500', '62700', '63100', '0', '0', 1],
      ],
      // Kraken returns this cursor beside the candles; reading it as the candle
      // array is the trap this parser exists to avoid.
      last: 1_785_000_000,
    },
  };
  const closes = parseKrakenOhlc(json, now);
  check('kraken ohlc · forming candle dropped', String(closes.length), '2');
  check('kraken ohlc · last completed close', String(closes[1].close), '62762');
  check('kraken ohlc · `last` cursor not read as candles', String(parseKrakenOhlc({ error: [], result: { last: 1 } }, now).length), '0');
  check('kraken ohlc · an error array yields nothing', String(parseKrakenOhlc({ error: ['EGeneral:Invalid arguments'], result: {} }, now).length), '0');
}

// ---- the FRED release calendar, split around today ----
{
  const dates = ['2026-05-12', '2026-06-10', '2026-07-14', '2026-08-02', '2026-08-12', '2026-09-11'];
  // A release happening TODAY is the last one, not the next — the figure is out,
  // and calling today the "next review" recreates the past-date problem.
  const w = splitReleaseDates(dates, '2026-08-02');
  check('release · last is today when it publishes today', w.last ?? '', '2026-08-02');
  check('release · next is the following date', w.next ?? '', '2026-08-12');

  const before = splitReleaseDates(dates, '2026-07-20');
  check('release · last is the most recent past date', before.last ?? '', '2026-07-14');
  check('release · next is the soonest future date', before.next ?? '', '2026-08-02');

  // Past the end of the published calendar there is no next — the row falls back
  // to "tbc" rather than inventing one.
  const after = splitReleaseDates(dates, '2027-01-01');
  check('release · no next past the calendar end', String(after.next), 'undefined');
  check('release · no last before the calendar start', String(splitReleaseDates(dates, '2026-01-01').last), 'undefined');
}

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
