import {
  FOMC_MEETINGS_2026,
  FOMC_MEETINGS_2027,
  FOMC_MEETING_DATES,
  upcomingMeetingCount,
} from '../../../../api/src/trading/fomcCalendar';
import { etMonthDay, etStampYMD, etYear, nextMeetingFrom, prevMeetingFrom } from './etClock';

// Offline check of the Fed decision countdown.
//
// WHAT THIS EXISTS FOR, in one sentence: the schedule held a single year and
// the resolver rolled an exhausted list onto `year + 1` reusing its month-days,
// so the day after a year's last meeting the Fed bar counted down to a date the
// Fed had never published — 2027 opens on the 27th, 2026 on the 28th. One day
// wrong, stated with total confidence, on the one bar whose entire job is
// saying when the decision lands.
//
// Two things are checked, and the second is the one that keeps it fixed:
//
//   1. The resolver REFUSES when the schedule runs out (returns 0, which hides
//      the bar) instead of inventing a date.
//   2. There is still RUNWAY. This fails while three meetings are ahead, so the
//      list is topped up months before a deployed board could ever reach the
//      end of it. A red check naming the fix beats a board quietly lying.
//
//     npm run verify:market-calendar        (root or @vts/web)
//
// Exits non-zero on the first failure. Reads no network and no database.

let failures = 0;

function check(name: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(62)} ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`,
  );
}

// 2:00 PM Eastern on that date, through the same zone arithmetic the resolver
// uses. Written as a fixed UTC offset first, which is how the hour-past-the-
// statement case came to fail here: 19:00Z is 2 PM EST, and September is EDT,
// so every fixture in a daylight-saving month was an hour out.
const stamp = (iso: string): number => {
  const [y, m, d] = iso.split('-');
  return etStampYMD(Number(y), Number(m), Number(d), 14, 0);
};
const label = (t: number): string => (t > 0 ? `${etMonthDay(t)}, ${etYear(t)}` : 'none');

// ---- the schedule itself ----

check('2026 holds eight meetings', String(FOMC_MEETINGS_2026.length), '8');
check('2027 holds eight meetings', String(FOMC_MEETINGS_2027.length), '8');
check(
  'every date is ISO',
  String(FOMC_MEETING_DATES.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
  'true',
);
check(
  'dates ascend with no repeats',
  String(FOMC_MEETING_DATES.every((d, i) => i === 0 || d > FOMC_MEETING_DATES[i - 1])),
  'true',
);

// ---- resolution ----

const first = FOMC_MEETING_DATES[0];
const last = FOMC_MEETING_DATES[FOMC_MEETING_DATES.length - 1];

check(
  'the next meeting after a mid-year day',
  label(nextMeetingFrom(stamp('2026-08-15'), FOMC_MEETING_DATES)),
  'Sep 16, 2026',
);
check(
  'a meeting still resolves to itself an hour past the statement',
  label(nextMeetingFrom(stamp('2026-09-16') + 1800_000, FOMC_MEETING_DATES)),
  'Sep 16, 2026',
);
check(
  'and rolls on once it is well past',
  label(nextMeetingFrom(stamp('2026-09-16') + 7200_000, FOMC_MEETING_DATES)),
  'Oct 28, 2026',
);

// THE BUG, pinned. The old resolver answered "Jan 28, 2027" here, because it
// reused 2026's first month-day against the following year.
check(
  'crossing the year boundary lands on the real 2027 opener',
  label(nextMeetingFrom(stamp('2026-12-10'), FOMC_MEETING_DATES)),
  'Jan 27, 2027',
);

// THE REFUSAL. Past the end of the schedule there is no answer, and inventing
// one is the whole failure this check exists for.
check(
  'past the last meeting it refuses rather than extrapolating',
  label(nextMeetingFrom(stamp(last) + 7200_000, FOMC_MEETING_DATES)),
  'none',
);
check('an empty schedule refuses too', label(nextMeetingFrom(Date.now(), [])), 'none');

check(
  'the previous meeting before a mid-year day',
  label(prevMeetingFrom(stamp('2026-08-15'), FOMC_MEETING_DATES)),
  'Jul 29, 2026',
);
check(
  'before the first meeting there is no previous one',
  label(prevMeetingFrom(stamp(first) - 7200_000, FOMC_MEETING_DATES)),
  'none',
);

// ---- runway ----
//
// The only check here that depends on today's date, and deliberately so. When
// it goes red the fix is five minutes: add the next year to `fomcCalendar.ts`.

const MIN_UPCOMING = 3;
const remaining = upcomingMeetingCount();
const hasRunway = remaining >= MIN_UPCOMING;
if (!hasRunway) failures += 1;
console.log(
  `${hasRunway ? 'ok  ' : 'FAIL'} ${`at least ${MIN_UPCOMING} meetings still scheduled`.padEnd(62)} ${remaining}`,
);
if (!hasRunway) {
  console.error(
    `\nThe FOMC schedule is running out — ${remaining} meeting(s) left.\n` +
      `Add the next year's statement dates to apps/api/src/trading/fomcCalendar.ts\n` +
      `(federalreserve.gov/monetarypolicy/fomccalendars.htm), then re-run this.\n` +
      `Until you do, the Fed decision bar hides itself once the list is spent —\n` +
      `it will not guess a date.`,
  );
}

console.log();
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
