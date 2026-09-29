#!/usr/bin/env node
// THE FRESHNESS RULE EXISTS TWICE AND MUST STAY IDENTICAL.
//
// `apps/api/src/trading/marketFreshness.ts` is the original. The public
// terminal is a separate deployment that may not import from the private one,
// so `apps/public-terminal/server/marketFreshness.mjs` carries a copy with its
// type annotations stripped.
//
// Nothing else in either build would notice them diverging: each typechecks,
// each runs, and each board would go on rendering. What would differ is the
// one thing both boards are asked — is this figure current? — so a drift means
// the private board calling a reading stale while the demo board serves the
// same reading with the green dot. That is the audit finding this rule was
// written to close, told twice instead of once.
//
// So this check does two jobs. It **regenerates** the mirror from the
// TypeScript, by an explicit list of substitutions, and fails when what is on
// disk differs — which is what makes editing either file safe. Then it runs
// every fixture through the mirror, whose text has just been proved identical.
import { readFileSync, writeFileSync } from 'node:fs';

const PRIVATE = 'apps/api/src/trading/marketFreshness.ts';
const PUBLIC = 'apps/public-terminal/server/marketFreshness.mjs';

// The mirror's own preamble: everything before the shared header. Written here
// rather than read from the file, so a note deleted from the mirror is a
// failure rather than something this quietly accepts.
const MIRROR_NOTE = `// THE MIRROR. This file is generated from \`marketFreshness.ts\` in the private
// API by \`npm run verify:market-freshness\`, which regenerates it and fails when
// what is here differs — so the two cannot drift by hand. Edit the TypeScript
// one and run that check; never edit this file directly.
//
`;

// Every TypeScript-only construct in the private file, and what the mirror says
// instead. An annotation added there and not named here fails loudly on the
// next run rather than silently shipping a mirror that is not one.
const SUBSTITUTIONS = [
  [/export type MarketFreshness = .*?;\n\n/s, ''],
  [/export type FreshnessCadence = .*?;\n\n/s, ''],
  [
    "export const STALE_AFTER_MS: Record<Exclude<FreshnessCadence, 'daily' | 'continuous'>, number> = {",
    'export const STALE_AFTER_MS = {',
  ],
  [
    'export function businessDaysBetween(fromMs: number, toMs: number): number {',
    'export function businessDaysBetween(fromMs, toMs) {',
  ],
  [
    'export function freshnessFor(timeMs: number, cadence: FreshnessCadence, now: number): MarketFreshness {',
    'export function freshnessFor(timeMs, cadence, now) {',
  ],
];

function generateMirror() {
  let text = readFileSync(PRIVATE, 'utf8');
  for (const [from, to] of SUBSTITUTIONS) {
    if (typeof from === 'string' && !text.includes(from)) {
      return { error: `the private file no longer contains:\n    ${from}` };
    }
    text = text.replace(from, to);
  }
  // Nothing TypeScript-shaped may survive the substitutions, or the mirror
  // would be a file Node refuses to parse.
  const leftover = text.match(/^(export )?(function|const) [A-Za-z]+[^\n]*: [A-Za-z]/m);
  if (leftover) return { error: `an unstripped type annotation survived:\n    ${leftover[0]}` };
  return { text: MIRROR_NOTE + text };
}

const failures = [];
const check = (what, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) failures.push(`  ${what}\n    expected ${b}\n    got      ${a}`);
};

// ---- the mirror is a mirror ----

const generated = generateMirror();
if (generated.error) {
  console.error(`FAIL ${PRIVATE} has changed shape and the mirror cannot be generated:\n\n  ${generated.error}\n`);
  console.error(`Add the new construct to SUBSTITUTIONS in scripts/verify-market-freshness.mjs.`);
  process.exit(1);
}

// `--write` regenerates the mirror, which is how the drift below is repaired.
// The check itself never writes: one that quietly fixed a drift could not fail
// on one, and the whole point is that a change made to one file and not the
// other is caught rather than absorbed.
if (process.argv.includes('--write')) {
  writeFileSync(PUBLIC, generated.text);
  console.log(`rewrote ${PUBLIC} from ${PRIVATE}`);
}

const onDisk = readFileSync(PUBLIC, 'utf8');
if (onDisk !== generated.text) {
  const want = generated.text.split('\n');
  const got = onDisk.split('\n');
  const diff = [];
  for (let i = 0; i < Math.max(want.length, got.length) && diff.length < 5; i += 1) {
    if (want[i] !== got[i]) {
      diff.push(`  line ${i + 1}\n    expected: ${want[i] ?? '(missing)'}\n    on disk:  ${got[i] ?? '(missing)'}`);
    }
  }
  console.error('FAIL the freshness rule has drifted between the two deployments:\n');
  console.error(diff.join('\n'));
  console.error(`\nEdit ${PRIVATE}; ${PUBLIC} is generated from it.`);
  process.exit(1);
}

// ---- and it behaves ----
//
// Run against the mirror, whose text has just been proved identical to the
// private file's, so one run covers both.
const { freshnessFor, businessDaysBetween, DAILY_STALE_AFTER_BUSINESS_DAYS } = await import(
  `../${PUBLIC}`
);

const DAY = 86400_000;
const HOUR = 3600_000;
// A Wednesday, so every weekday offset below is unambiguous.
const WED = Date.parse('2026-09-30T14:00:00Z');
const at = (ms) => WED - ms;

// A DAILY SERIES IS COUNTED IN WEEKDAYS. This is the half a calendar window
// gets wrong in both directions at once — it calls Friday's close stale on a
// Tuesday, and it cannot tell a genuine two-publication lag from a weekend.
check('weekdays across a weekend: Friday to Monday is one', businessDaysBetween(Date.parse('2026-09-25T00:00:00Z'), Date.parse('2026-09-28T14:00:00Z')), 1);
check('...Friday to Tuesday is two', businessDaysBetween(Date.parse('2026-09-25T00:00:00Z'), Date.parse('2026-09-29T14:00:00Z')), 2);
check('...Friday to Wednesday is three', businessDaysBetween(Date.parse('2026-09-25T00:00:00Z'), Date.parse('2026-09-30T14:00:00Z')), 3);
check('a weekend on its own contains no weekdays', businessDaysBetween(Date.parse('2026-09-26T00:00:00Z'), Date.parse('2026-09-27T14:00:00Z')), 0);
check('a reading in the future counts nothing', businessDaysBetween(WED + DAY, WED), 0);

// The published close from the previous business day is the newest one there
// is. Marking it stale would put the faint dot on every row of a working board.
check('yesterday’s close is current', freshnessFor(Date.parse('2026-09-29T00:00:00Z'), 'daily', WED), 'live');
// Friday read on Monday: three CALENDAR days, one business day. The reason the
// window is not measured in calendar days at all.
check('Friday’s close read on Monday is current', freshnessFor(Date.parse('2026-09-25T00:00:00Z'), 'daily', Date.parse('2026-09-28T14:00:00Z')), 'live');
// One missed publication, which is what a public holiday looks like.
check('...and on Tuesday it still is', freshnessFor(Date.parse('2026-09-25T00:00:00Z'), 'daily', Date.parse('2026-09-29T14:00:00Z')), 'live');
// Two missed publications is the series genuinely lagging — the VIX case the
// audit reported, which a calendar window buried among the weekends.
check('...but by Wednesday it is stale', freshnessFor(Date.parse('2026-09-25T00:00:00Z'), 'daily', WED), 'stale');
check('a daily reading six days old is stale', freshnessFor(at(6 * DAY), 'daily', WED), 'stale');
check('the business-day allowance is two', DAILY_STALE_AFTER_BUSINESS_DAYS, 2);

// A MONTHLY READING IS CURRENT UNTIL THE NEXT ONE PRINTS, which is far longer
// than a month: August CPI is dated 1 August and is not superseded until
// September's prints in the middle of October.
check('August CPI in the middle of September is current', freshnessFor(Date.parse('2026-08-01T00:00:00Z'), 'monthly', Date.parse('2026-09-15T14:00:00Z')), 'live');
check('...and at the start of October it still is', freshnessFor(Date.parse('2026-08-01T00:00:00Z'), 'monthly', Date.parse('2026-10-09T14:00:00Z')), 'live');
check('...but once September’s has printed, it is stale', freshnessFor(Date.parse('2026-08-01T00:00:00Z'), 'monthly', Date.parse('2026-10-28T14:00:00Z')), 'stale');

check('last week’s claims are current', freshnessFor(at(9 * DAY), 'weekly', WED), 'live');
check('claims three weeks old are stale', freshnessFor(at(21 * DAY), 'weekly', WED), 'stale');

// GDP for a quarter stands for most of the following two.
check('last quarter’s GDP is current', freshnessFor(at(150 * DAY), 'quarterly', WED), 'live');
check('GDP from three quarters back is stale', freshnessFor(at(270 * DAY), 'quarterly', WED), 'stale');

// A COIN IS JUDGED ON ITS CANDLE, NOT ON WHEN WE FETCHED IT. Judged on the
// fetch, a continuous row is permanently live — the only thing being tested
// would be our own clock, so a feed serving week-old candles would pass.
check('today’s forming candle is current', freshnessFor(at(3 * HOUR), 'continuous', WED), 'live');
check('...and yesterday’s still is', freshnessFor(at(26 * HOUR), 'continuous', WED), 'live');
check('a candle two days old is stale', freshnessFor(at(2 * DAY), 'continuous', WED), 'stale');

// Never a cheerful default on nonsense: a row with no usable timestamp must not
// inherit the green dot.
check('a missing timestamp is stale', freshnessFor(Number.NaN, 'daily', WED), 'stale');
check('an unknown cadence falls back to the monthly window', freshnessFor(at(120 * DAY), 'annual', WED), 'stale');

if (failures.length > 0) {
  console.error(`FAIL ${failures.length} freshness check(s) failed:\n`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('market freshness: the mirror is identical and every window holds.');
