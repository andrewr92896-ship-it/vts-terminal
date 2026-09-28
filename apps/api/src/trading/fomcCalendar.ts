// The FOMC statement calendar, and nothing else.
//
// **IMPORT-FREE ON PURPOSE**, the same reason `pushoverRefusal.ts` is: it lets
// `verify:market-calendar` read the schedule with no config, no database and no
// network. Pulling it out of `marketData.ts` was the only way — that module
// reaches the price and macro providers, which reach `config.ts`, which exits
// on a missing credential key.
//
// Real published dates, never arithmetic. The Fed publishes about two years
// ahead and labels the forward year tentative.
//
// **THE LIST MUST NEVER RUN OUT, AND THE CHECK IS WHAT GUARANTEES THAT.** The
// countdown used to hold one year and fall back to `year + 1` with the same
// month-days, so the day after a year's last meeting the Fed bar began counting
// down to a date the Fed had never published — 2027 opens on the 27th, not
// 2026's 28th, so the bar whose whole job is saying when the decision lands
// would have been confidently one day wrong. That is this repo's own rule
// breaking where it matters most: a figure nobody measured must never be
// reported as though it had been.
//
// So the resolver refuses rather than extrapolates, and the check fails while
// three meetings are still ahead — months of warning, remedy in the message.
// **When CI tells you to, add the next year below.**

export const FOMC_MEETINGS_2026 = [
  '01-28',
  '03-18',
  '04-29',
  '06-17',
  '07-29',
  '09-16',
  '10-28',
  '12-09',
];

// Verified against the Fed's published calendar, 2026-09.
export const FOMC_MEETINGS_2027 = [
  '01-27',
  '03-17',
  '04-28',
  '06-09',
  '07-28',
  '09-15',
  '10-27',
  '12-08',
];

export const FOMC_MEETING_YEAR = 2026;

// Every scheduled statement as a full ISO date, in order. This is what the
// client resolves against; the MM-DD list plus `meetingYear` stay on the
// payload only for a service-worker-cached bundle built before this existed,
// which would read an ISO string as a month-day and render nonsense.
export const FOMC_MEETING_DATES: string[] = [
  ...FOMC_MEETINGS_2026.map((md) => `2026-${md}`),
  ...FOMC_MEETINGS_2027.map((md) => `2027-${md}`),
];

// A statement lands at 2:00 PM Eastern. Both ET offsets are -5/-4, and a
// meeting is never scheduled near a DST switch, so 19:00Z is the correct
// instant within the hour this is ever compared at. The client does the real
// zone arithmetic; this is only for counting what is still ahead.
const statementInstant = (iso: string): number => Date.parse(`${iso}T19:00:00Z`);

// How many scheduled meetings still lie ahead. The calendar check reads this;
// nothing on a screen does.
export function upcomingMeetingCount(now: number = Date.now()): number {
  return FOMC_MEETING_DATES.filter((iso) => statementInstant(iso) > now).length;
}
