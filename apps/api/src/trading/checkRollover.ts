// Rollover close and the re-entry check — walked through the real services
// against a real database.
//
//   DATABASE_URL="file:/tmp/x.db" npm run db:migrate
//   DATABASE_URL="file:/tmp/x.db" npm run db:check-rollover
//
// Like db:check-notes this one WRITES — it creates an account, a funded account
// and funded trades — so it refuses any database that already holds a user. An
// empty one is a scratch one; a real deployment always has accounts in it. Do
// not weaken that guard.
//
// The firing decision and the re-entry arithmetic are pure and are covered
// offline by `npm run verify:rollover`. What is left, and what only a database
// can show, is the STORAGE half:
//
//   • A PARTIAL SAVE LEAVES THE OTHER EVENTS ALONE. The web app is a
//     service-worker-cached PWA, so an old bundle posts a subset of the plan —
//     and that must never blank an event it does not know about. This is the one
//     failure here that is completely silent: nothing errors, an alert just
//     stops arriving.
//   • A TIME THAT CANNOT FIRE IS NEVER STORED. Junk keeps the previous value
//     rather than being written as a time no minute ever matches.
//   • THE RECHECK GATE READS AN EASTERN DAY. A trade closed today counts, one
//     closed two days ago does not, and neither does a still-open one being
//     counted as closed.
//   • COMMISSION IS NULL, NOT ZERO, until somebody states a rate — and the
//     re-entry check reports no total rather than a flattering one.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fundedAccounts, fundedTrades, rolloverPlans, users } from '../db/schema.js';
import { openActivityFor, getRolloverPlan, setRolloverPlan } from './rollover.js';
import { getReentryChecks } from './reentry.js';
import { SYSTEM } from './credentialAudit.js';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name: string) {
  console.log(`\n[${name}]`);
}

async function makeUser(username: string): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(users).values({
    id,
    username,
    createdUsername: username,
    displayName: username,
    email: `${username}@example.test`,
    passwordHash: 'x',
    role: 'Viewer',
    roles: JSON.stringify(['member']),
    teamId: null,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function makeAccount(userId: string, commissionPerLot: number | null): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(fundedAccounts).values({
    id,
    userId,
    platform: 'FTP',
    label: 'Check account',
    currency: 'USD',
    balance: 50_000,
    startingBalance: 50_000,
    commissionPerLot,
    notes: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function makeTrade(
  userId: string,
  accountId: string,
  t: { instrument: string; status: 'open' | 'closed'; exitPrice?: number | null; closedAt?: Date | null },
): Promise<string> {
  const id = randomUUID();
  await db.insert(fundedTrades).values({
    id,
    userId,
    accountId,
    instrument: t.instrument,
    side: 'long',
    units: 100_000,
    entryPrice: 1.1,
    exitPrice: t.exitPrice ?? null,
    realizedPl: t.status === 'closed' ? 42 : null,
    stopLoss: null,
    takeProfit: null,
    status: t.status,
    openedAt: new Date(Date.now() - 6 * 3_600_000),
    closedAt: t.closedAt ?? null,
    dedupKey: id,
    notes: null,
    createdAt: new Date(),
  });
  return id;
}

async function main() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) {
    console.error(
      'Refusing to run: this database already has accounts in it.\n' +
        'This check creates users, so it only runs against an empty scratch database:\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:migrate\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:check-rollover',
    );
    process.exit(1);
  }

  const andrew = await makeUser('andrew');
  const dale = await makeUser('dale');

  // ---- Defaults ----------------------------------------------------------
  section('a trader with no plan gets the defaults, and nothing is stored');
  const fresh = await getRolloverPlan(andrew);
  ok('off until switched on', fresh.enabled === false);
  ok('evaluate defaults to 16:30', fresh.evaluate.at === '16:30');
  ok('close defaults to 16:45', fresh.close.at === '16:45');
  ok('recheck defaults to 17:15', fresh.recheck.at === '17:15');
  ok('the close alert is the loud one', fresh.close.level === 'alert' && fresh.evaluate.level === 'normal');
  // The open gate's defaults ARE what was hard-coded before it was a setting.
  // If any of these move, every plan stored before this feature existed has
  // silently changed meaning.
  ok('it asks about funded trades by default', fresh.openKinds.join(',') === 'funded');
  ok('evaluate needs something open by default', fresh.evaluate.requireOpen === true);
  ok('close needs something open by default', fresh.close.requireOpen === true);
  ok('the recheck does not', fresh.recheck.requireOpen === false);
  const noRow = await db.select().from(rolloverPlans).where(eq(rolloverPlans.userId, andrew));
  ok('reading the plan writes no row', noRow.length === 0);

  // ---- A partial save merges ---------------------------------------------
  section('a partial save leaves the other events alone');
  await setRolloverPlan(andrew, {
    enabled: true,
    evaluate: { on: true, at: '16:15', level: 'silent' },
    close: { on: true, at: '16:50', level: 'repeating' },
    recheck: { on: false, at: '17:30', level: 'normal' },
  });
  // What an old cached bundle would post: one event, and nothing else.
  const merged = await setRolloverPlan(andrew, { close: { at: '16:40' } });
  ok('the event that was posted changed', merged.close.at === '16:40');
  ok('its other fields survived', merged.close.on === true && merged.close.level === 'repeating');
  ok('the untouched events survived', merged.evaluate.at === '16:15' && merged.evaluate.level === 'silent');
  ok('a switched-off event stayed off', merged.recheck.on === false);
  ok('the master switch survived', merged.enabled === true);

  // An empty patch is a no-op rather than a reset.
  const untouched = await setRolloverPlan(andrew, {});
  ok('an empty save changes nothing', untouched.close.at === '16:40' && untouched.enabled === true);

  // ---- A time that cannot fire is never stored ---------------------------
  section('an unusable time keeps the stored one');
  const junk = await setRolloverPlan(andrew, { evaluate: { at: '99:99' } });
  ok('an impossible hour is refused', junk.evaluate.at === '16:15');
  const garbage = await setRolloverPlan(andrew, { evaluate: { at: 'soon' } as { at: string } });
  ok('a non-time is refused', garbage.evaluate.at === '16:15');
  const good = await setRolloverPlan(andrew, { evaluate: { at: '09:05' } });
  ok('a real time is taken', good.evaluate.at === '09:05');

  // One row per user, however many times it is saved.
  const rows = await db.select().from(rolloverPlans).where(eq(rolloverPlans.userId, andrew));
  ok('saving repeatedly keeps one row', rows.length === 1);

  // ---- The open gate is stored, and refuses a setting that cannot fire ----
  section('which trades count, and whether an event needs one');
  const kinds = await setRolloverPlan(andrew, { openKinds: ['broker', 'manual'] });
  ok('the kinds asked for are stored', kinds.openKinds.join(',') === 'broker,manual');
  const reread = await getRolloverPlan(andrew);
  ok('and survive a re-read', reread.openKinds.join(',') === 'broker,manual');

  // An empty list would mean "no trade can ever satisfy the gate" — a routine
  // that reads as switched on and never fires. It keeps what is stored, the
  // same way an unusable time does.
  const emptied = await setRolloverPlan(andrew, { openKinds: [] });
  ok('an empty kinds list keeps the stored one', emptied.openKinds.join(',') === 'broker,manual');
  const nonsense = await setRolloverPlan(andrew, { openKinds: ['nope'] as unknown as ['funded'] });
  ok('an unrecognised kind falls back to funded', nonsense.openKinds.join(',') === 'funded');

  // The per-event gate patches like every other field, and a save that does not
  // mention it leaves it alone.
  const ungated = await setRolloverPlan(andrew, { evaluate: { requireOpen: false } });
  ok('an event can be ungated', ungated.evaluate.requireOpen === false);
  ok('and its other fields survive', ungated.evaluate.at === '09:05');
  const elsewhere = await setRolloverPlan(andrew, { close: { at: '16:44' } });
  ok('a save elsewhere leaves the gate alone', elsewhere.evaluate.requireOpen === false);

  // ---- The funded-activity gate ------------------------------------------
  section('what the alerts are gated on');
  const acct = await makeAccount(andrew, null);
  const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000);

  const beforeAnything = await openActivityFor([andrew, dale]);
  ok('a flat trader has nothing open', (beforeAnything.get(andrew)?.open.funded.length ?? -1) === 0);
  ok('and nothing closed today', (beforeAnything.get(andrew)?.closedToday ?? -1) === 0);
  ok('every asked-for trader gets an entry', beforeAnything.has(dale));

  await makeTrade(andrew, acct, { instrument: 'EUR/USD', status: 'open' });
  await makeTrade(andrew, acct, { instrument: 'GBP/USD', status: 'closed', exitPrice: 1.2, closedAt: new Date() });
  await makeTrade(andrew, acct, { instrument: 'USD/JPY', status: 'closed', exitPrice: 150, closedAt: twoDaysAgo });

  const activity = await openActivityFor([andrew, dale]);
  const mine = activity.get(andrew)!;
  ok('the open position is counted once', mine.open.funded.length === 1);
  ok('and named, so the alert can say what it is', mine.open.funded[0] === 'EUR/USD');
  ok('a trade closed today counts', mine.closedToday === 1, `got ${mine.closedToday}`);
  ok('a trade closed two days ago does not', mine.closedToday === 1);
  ok("another trader's book is not counted into it", (activity.get(dale)?.open.funded.length ?? -1) === 0);
  // The three kinds are read into their own buckets. A funded-only plan must
  // not be satisfied by a broker position, which is only true if the read keeps
  // them apart in the first place.
  ok('a broker position is not filed as funded', mine.open.broker.length === 0);
  ok('nor a manual one', mine.open.manual.length === 0);

  // ---- The re-entry check ------------------------------------------------
  section('the re-entry check, with no price source configured');
  const report = await getReentryChecks(andrew, SYSTEM);
  ok('it lists the trade closed recently', report.checks.length === 1, `got ${report.checks.length}`);
  ok('and not the one from two days ago', report.checks.every((c) => c.instrument !== 'USD/JPY'));
  const check = report.checks[0];
  ok('it carries the exit price', check.exitPrice === 1.2);
  ok('a currency pair is read in pips', check.unit === 'pips');
  // Nothing here can reach OANDA, and an unpriced check must say so rather than
  // reporting a cost of zero.
  ok('an unpriced check has no drift', check.drift === null);
  ok('an unpriced check has no re-entry price', check.reentryPrice === null);
  ok('and it names no price source', check.source === null && report.priceSource === null);
  ok('commission is null while no rate is set', check.commission === null);
  ok('and it says why', (check.commissionNote ?? '').length > 0);
  ok('so there is no total at all', check.total === null);

  section('a stated commission rate is applied');
  await db.update(fundedAccounts).set({ commissionPerLot: 7 }).where(eq(fundedAccounts.id, acct));
  const priced = await getReentryChecks(andrew, SYSTEM);
  ok('one standard lot is charged the round-turn rate', priced.checks[0].commission === 7);
  ok('and it no longer needs a reason', priced.checks[0].commissionNote === null);
  // Still no quote, so still no total — commission alone is not the cost of
  // getting back on, and reporting it as one would understate.
  ok('but an unpriced check still has no total', priced.checks[0].total === null);

  section('a re-entry check only ever reads its own book');
  const others = await getReentryChecks(dale, SYSTEM);
  ok("another trader sees none of it", others.checks.length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
