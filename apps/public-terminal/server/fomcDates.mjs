// The Fed's published decision dates, for the PUBLIC terminal's demo board.
//
// This is a MIRROR of the private terminal's own schedule, copied because this
// is a separate deployment that may not import from it. What keeps the two in
// step is `npm run verify:market-calendar`, which imports BOTH lists and fails
// when they disagree — and which also fails while only three meetings remain
// ahead, so the list is topped up months before any board could reach the end
// of it and start counting down to a date the Fed never published.
//
// Statement days only. The Fed publishes roughly two years ahead and labels the
// forward year tentative; keep two years loaded.
export const PUBLIC_FOMC_MEETING_DATES = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09',
  '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
];
