import { commissionFor, decomposeReentry } from './reentryMath.js';
import { dueForPlan, DEFAULT_ROLLOVER_PLAN, type RolloverPlan } from './rolloverMath.js';
import { etTimeLabel, parseHHMM } from './etTime.js';

// Every import above is a PURE module — no database, no network. That is the
// point of the split those files describe: `db/index.ts` opens a connection at
// import time, so a check that reached it could not run offline at all.

// Offline check of the rollover-close firing decision and the re-entry
// arithmetic. Neither can be checked by running the app: the watch fires on one
// ET minute a day and only when a funded position happens to be open, and the
// re-entry figures need a live two-sided quote. Both are pure, so both can be
// fed known inputs and compared against answers worked out by hand.
//
//     npm run verify:rollover              (root or @vts/api)
//
// Exits non-zero on the first mismatch. Reads no network and no database.

let failures = 0;

function check(name: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${name.padEnd(58)} ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

const round = (n: number, dp = 6) => Number(n.toFixed(dp));

// ---- the re-entry identity ------------------------------------------------
//
// The whole point of measuring drift against the side the trade EXITED at is
// that drift + spread comes to exactly the distance from the exit fill to the
// re-entry fill. Measured against the mid instead, half a spread is counted
// twice and every figure on the panel is quietly wrong.
{
  console.log('\n-- re-entry decomposition --');

  // A long closed at 1.10500 (sold at the bid); market now 1.10560 / 1.10572.
  const long = decomposeReentry('long', 1.105, 1.1056, 1.10572);
  check('long · re-enters at the ask', String(round(long.reentryPrice)), '1.10572');
  check('long · drift is bid minus exit', String(round(long.driftPrice)), '0.0006');
  check('long · spread is ask minus bid', String(round(long.spreadPrice)), '0.00012');
  check(
    'long · drift + spread === re-entry minus exit',
    String(round(long.driftPrice + long.spreadPrice)),
    String(round(long.reentryPrice - 1.105)),
  );

  // A short closed at 1.10500 (bought back at the ask); market now the same.
  const short = decomposeReentry('short', 1.105, 1.1056, 1.10572);
  check('short · re-enters at the bid', String(round(short.reentryPrice)), '1.1056');
  check('short · drift is exit minus ask', String(round(short.driftPrice)), '-0.00072');
  check(
    'short · drift + spread === exit minus re-entry',
    String(round(short.driftPrice + short.spreadPrice)),
    String(round(1.105 - short.reentryPrice)),
  );

  // Positive is worse, in both directions. Price coming back to a long while it
  // was flat makes re-entry cheaper than the exit, and must read negative rather
  // than being reported as a cost.
  const favourable = decomposeReentry('long', 1.105, 1.1043, 1.10442);
  check('long · a favourable move reads negative', String(round(favourable.driftPrice)), '-0.0007');
  check('spread is never negative on a real quote', String(favourable.spreadPrice > 0), 'true');
}

// ---- commission -----------------------------------------------------------
{
  console.log('\n-- commission --');

  const oneLot = commissionFor('EUR/USD', 100_000, 7);
  check('one standard lot at $7 round turn', String(oneLot.money), '7');
  check('half a lot is half the charge', String(commissionFor('EUR/USD', 50_000, 7).money), '3.5');

  // Null is "not stated" and must never become zero — a free re-entry is a
  // different claim from an unpriced one, and it is the flattering direction.
  const unstated = commissionFor('EUR/USD', 100_000, null);
  check('no rate set yields null, not zero', String(unstated.money), 'null');
  check('no rate set says why', String(unstated.note != null), 'true');

  // A standard lot is 100,000 units for a currency pair and something else
  // entirely for gold or an index, so the rate is not applied there.
  const gold = commissionFor('XAU/USD', 100, 7);
  check('a non-pair is not charged per 100k units', String(gold.money), 'null');
  check('a non-pair says why', String(gold.note != null), 'true');
}

// ---- the firing decision --------------------------------------------------
{
  console.log('\n-- rollover firing --');

  const plan: RolloverPlan = {
    ...DEFAULT_ROLLOVER_PLAN,
    enabled: true,
  };
  const at = (hhmm: string) => ({ min: parseHHMM(hhmm)! });
  // The dedup set is the caller's, which is what lets this exercise "fires once
  // per ET day" without reaching into the watch's module state.
  const fired = new Set<string>();
  const due = (user: string, p: RolloverPlan, act: { open: string[]; closedToday: number }, hhmm: string, day: string) =>
    dueForPlan(user, p, act, at(hhmm), day, fired);
  const holding = { open: ['EUR/USD'], closedToday: 0 };
  const flat = { open: [], closedToday: 0 };
  const closedForRollover = { open: [], closedToday: 1 };

  // Evaluate and close only fire while something is open — the gate that makes
  // a flat day silent without a weekday picker anywhere.
  check(
    'evaluate fires at its minute while holding',
    due('u1', plan, holding, '16:30', 'd1').map((n: { event: string }) => n.event).join(','),
    'evaluate',
  );
  check(
    'evaluate is silent when flat',
    String(due('u2', plan, flat, '16:30', 'd1').length),
    '0',
  );
  check(
    'close is silent when flat',
    String(due('u3', plan, flat, '16:45', 'd1').length),
    '0',
  );

  // The recheck is the exception: by the time it is due the position is usually
  // closed, so gating it on "still open" would silence it in the one case it
  // exists for.
  check(
    'recheck fires on a trade closed today',
    due('u4', plan, closedForRollover, '17:15', 'd1').map((n: { event: string }) => n.event).join(','),
    'recheck',
  );
  check(
    'recheck is silent on a day with no funded activity',
    String(due('u5', plan, flat, '17:15', 'd1').length),
    '0',
  );

  // Once per event per ET day, whatever the tick cadence.
  check(
    'the same minute does not fire twice',
    String(due('u6', plan, holding, '16:30', 'd1').length + due('u6', plan, holding, '16:30', 'd1').length),
    '1',
  );
  check(
    'a new day re-arms it',
    String(due('u6', plan, holding, '16:30', 'd2').length),
    '1',
  );

  // A tick a minute late still fires; one long past does not, or a restart in
  // the evening would replay the afternoon.
  check('a tick one minute late still fires', String(due('u7', plan, holding, '16:31', 'd1').length), '1');
  check('a tick well past does not fire', String(due('u8', plan, holding, '16:40', 'd1').length), '0');

  // A switched-off event is silent even while the plan is on.
  const closeOff: RolloverPlan = { ...plan, close: { ...plan.close, on: false } };
  check('a switched-off event stays silent', String(due('u9', closeOff, holding, '16:45', 'd1').length), '0');

  // The close alert names the trader's own close time rather than a hardcoded
  // 5:00, so a plan moved earlier still reads correctly on a lock screen.
  const body = due('u10', plan, holding, '16:30', 'd3')[0]?.body ?? '';
  check('the evaluate alert names the close time', String(body.includes('4:45 PM ET')), 'true');
  check('the evaluate alert names what is open', String(body.includes('EUR/USD')), 'true');
}

// ---- the ET time label ----------------------------------------------------
{
  console.log('\n-- time labels --');
  check('midnight', etTimeLabel('00:00'), '12:00 AM ET');
  check('noon', etTimeLabel('12:00'), '12:00 PM ET');
  check('afternoon', etTimeLabel('16:45'), '4:45 PM ET');
  check('single-digit minute keeps its zero', etTimeLabel('17:05'), '5:05 PM ET');
}

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
