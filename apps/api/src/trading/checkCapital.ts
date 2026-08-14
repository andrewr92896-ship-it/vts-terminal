// Capital per (trader, broker account) — checked through the real service
// against a real database.
//
//   DATABASE_URL="file:/tmp/x.db" npm run db:migrate
//   DATABASE_URL="file:/tmp/x.db" npm run db:check-capital
//
// Like db:check-sharing this one WRITES, so it refuses any database that
// already holds a user. An empty one is a scratch one; a real deployment always
// has accounts in it. Do not weaken that guard.
//
// Two things are worth protecting here, and neither is visible to a typecheck:
//
//   • ONE ACCOUNT'S FIGURE IS ITS OWN. Typing over one account's number must
//     leave every other account exactly as it was — sync included. That is the
//     whole point of the change: a trader holding their own account beside a
//     partner's sets theirs by hand while the partner's keeps syncing.
//   • THE CARRY-OVER SPLITS RATHER THAN GUESSES. The old single figure was the
//     SUM of every account's funding, so it is carried by turning that sync on
//     for each account and letting each one read its own — never by attributing
//     the whole summed figure to one of them.
//
// Every connection here is INACTIVE on purpose (except in the carry-over
// section, which does not read one): an active broker connection would send the
// service to OANDA, and a check that needs the network is a check that fails for
// reasons that have nothing to do with the code.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { brokerConnections, tradingCapitalAccounts, tradingDeskSettings, users } from '../db/schema.js';
import { encryptSecret } from '../security/secretbox.js';
import {
  backfillCapitalAccounts,
  getDeskCapital,
  getTraderCapital,
  updateTraderCapital,
  OTHER_ACCOUNT,
} from './traderCapital.js';

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
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function makeConnection(userId: string, label: string, active: boolean): Promise<string> {
  const id = randomUUID();
  await db.insert(brokerConnections).values({
    id,
    userId,
    broker: 'oanda',
    label,
    secretEnc: encryptSecret(
      JSON.stringify({ token: 'x', accountId: '001-001-1', env: 'practice' }),
      { userId, connectionId: id },
    ),
    summary: 'Practice · 001-001-1',
    active,
    lastStatus: 'unknown',
    createdAt: new Date(),
    updatedAt: new Date(),
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
        '  DATABASE_URL="file:/tmp/x.db" npm run db:check-capital',
    );
    process.exit(1);
  }

  // ---- One trader, two accounts ------------------------------------------
  const andrew = await makeUser('andrew');
  const mine = await makeConnection(andrew, 'Andrew’s OANDA', false);
  const partner = await makeConnection(andrew, 'Partner’s OANDA', false);

  section('an account each, and nothing stated yet');
  let cap = await getTraderCapital(andrew);
  ok('every account is listed', cap.breakdown.length === 3, `${cap.breakdown.length} slots`);
  ok('including the account-less bucket', cap.breakdown.some((a) => a.key === OTHER_ACCOUNT));
  ok('the total states nothing', cap.deposited.value === null && cap.deposited.mode === 'none');
  // Counted rather than read as zero: a figure that leaves an account out has to
  // say so rather than reading as complete.
  ok('and counts what is unstated', cap.deposited.unstated === 3);

  section('a figure on one account is that account’s own');
  cap = await updateTraderCapital(andrew, { account: mine, deposited: 10000 });
  ok('it is stated there', cap.breakdown.find((a) => a.key === mine)?.deposited.value === 10000);
  ok('and nowhere else', cap.breakdown.find((a) => a.key === partner)?.deposited.value === null);
  ok('the card totals what is stated', cap.deposited.value === 10000);
  ok('over one account', cap.deposited.stated === 1 && cap.deposited.unstated === 2);

  cap = await updateTraderCapital(andrew, { account: partner, deposited: 5000 });
  ok('two accounts add up', cap.deposited.value === 15000);
  ok('and both are typed', cap.deposited.mode === 'manual');

  // The partner's account keeps itself in step with the broker. Written
  // directly, because reading a real funding history needs OANDA.
  await db
    .update(tradingCapitalAccounts)
    .set({ depositedSync: true, syncedDeposited: 7000, currency: 'USD', capitalSyncedAt: new Date() })
    .where(
      and(eq(tradingCapitalAccounts.userId, andrew), eq(tradingCapitalAccounts.accountKey, partner)),
    );

  section('one synced beside one typed — the owner’s own case');
  cap = await getTraderCapital(andrew);
  ok('the synced account reads the broker’s figure', cap.breakdown.find((a) => a.key === partner)?.deposited.value === 7000);
  ok('the typed one is untouched', cap.breakdown.find((a) => a.key === mine)?.deposited.value === 10000);
  ok('the total is the two together', cap.deposited.value === 17000);
  ok('and says it is part automatic', cap.deposited.mode === 'mixed');

  section('typing over one figure leaves the other alone');
  cap = await updateTraderCapital(andrew, { account: mine, deposited: 12000 });
  const partnerAfter = cap.breakdown.find((a) => a.key === partner);
  ok('the edited account took the new figure', cap.breakdown.find((a) => a.key === mine)?.deposited.value === 12000);
  ok('the other account is STILL synced', partnerAfter?.deposited.mode === 'synced');
  ok('and still reads its own figure', partnerAfter?.deposited.value === 7000);

  section('turning sync off on one account');
  cap = await updateTraderCapital(andrew, { account: partner, depositedSync: false });
  const partnerOff = cap.breakdown.find((a) => a.key === partner);
  // Back to the figure that was typed on THAT account before it was synced —
  // never the broker's number left standing as though somebody had entered it.
  ok('that account hands back its own typed figure', partnerOff?.deposited.value === 5000);
  ok('and the reading is kept for switching back', partnerOff?.deposited.synced === 7000);
  ok('the other account is unaffected', cap.breakdown.find((a) => a.key === mine)?.deposited.value === 12000);
  cap = await updateTraderCapital(andrew, { account: partner, depositedSync: true });
  ok('and switching back restores it', cap.breakdown.find((a) => a.key === partner)?.deposited.value === 7000);

  section('withdrawn is a separate switch');
  cap = await updateTraderCapital(andrew, { account: partner, withdrawn: 500 });
  ok('it takes the typed figure', cap.breakdown.find((a) => a.key === partner)?.withdrawn.value === 500);
  ok('without disturbing deposited', cap.breakdown.find((a) => a.key === partner)?.deposited.mode === 'synced');

  section('accounts in different currencies are not added');
  await db
    .update(tradingCapitalAccounts)
    .set({ depositedSync: true, syncedDeposited: 8000, currency: 'GBP', capitalSyncedAt: new Date() })
    .where(and(eq(tradingCapitalAccounts.userId, andrew), eq(tradingCapitalAccounts.accountKey, mine)));
  cap = await getTraderCapital(andrew);
  ok('there is no total', cap.deposited.value === null);
  ok('and it says why', cap.deposited.mixedCurrency);
  ok('each account still reads correctly', cap.breakdown.find((a) => a.key === mine)?.deposited.value === 8000);
  // Put it back so the isolation check below reads a real total.
  await db
    .update(tradingCapitalAccounts)
    .set({ currency: 'USD' })
    .where(and(eq(tradingCapitalAccounts.userId, andrew), eq(tradingCapitalAccounts.accountKey, mine)));

  section('an account that is not this trader’s is refused');
  const dale = await makeUser('dale');
  const dalesOwn = await makeConnection(dale, 'Dale’s OANDA', false);
  let refused = false;
  try {
    await updateTraderCapital(andrew, { account: dalesOwn, deposited: 1 });
  } catch {
    refused = true;
  }
  ok('a stranger’s account cannot be written to', refused);

  section('the whole desk is the traders added together');
  // The card follows the KPI row's trader filter, so "Whole desk" has to mean
  // the desk here too — one person's deposit standing in for everybody's was
  // the fault this replaced.
  await updateTraderCapital(dale, { account: dalesOwn, deposited: 40000 });
  const desk = await getDeskCapital([andrew, dale]);
  ok('it covers both traders', desk.traders === 2);
  ok('and adds their deposits', desk.deposited.value === 15000 + 40000);
  ok('the breakdown says whose each account is', desk.breakdown.some((a) => a.ownerId === dale && a.owner === 'dale'));
  // No single owner to write the TOTAL back to — which is why there is no
  // group-level figure at all: it is set on each person's own accounts, listed
  // under them in the panel.
  ok('it belongs to no single trader', desk.userId === null);
  ok('every account still names its own owner', desk.breakdown.every((a) => !!a.ownerId));
  const solo = await getDeskCapital([andrew]);
  ok('a desk of one reads as one trader', solo.traders === 1 && solo.deposited.value === 15000);

  section('who may SET each account, on the desk’s own card');
  // A founder or admin reaches everyone, a group leader their own group. The
  // row says so per account, so a person the viewer cannot set is shown and not
  // editable rather than hidden.
  const asLead = await getDeskCapital([andrew, dale], { editableOwners: new Set([andrew, dale]) });
  ok('a lead may set every account', asLead.breakdown.every((a) => a.canEdit) && asLead.canEdit);
  const asMember = await getDeskCapital([andrew, dale], { editableOwners: new Set([andrew]) });
  ok('a member may set their own', asMember.breakdown.filter((a) => a.ownerId === andrew).every((a) => a.canEdit));
  ok('and not a teammate’s', asMember.breakdown.filter((a) => a.ownerId === dale).every((a) => !a.canEdit));
  ok('the card still offers the panel', asMember.canEdit);
  const asWatcher = await getDeskCapital([andrew, dale], { editableOwners: new Set<string>() });
  ok('with nothing to set, the card says so', !asWatcher.canEdit);

  section('two traders never combine');
  await updateTraderCapital(dale, { account: dalesOwn, deposited: 250000 });
  const andrewNow = await getTraderCapital(andrew);
  const daleNow = await getTraderCapital(dale);
  ok('each reads only their own', daleNow.deposited.value === 250000 && andrewNow.deposited.value === 15000);
  ok('and each says whose it is', daleNow.userId === dale && andrewNow.userId === andrew);

  // ---- Carrying the old single figure across ------------------------------
  section('a summed sync is split across the accounts it was summing');
  const carl = await makeUser('carl');
  const c1 = await makeConnection(carl, 'Carl’s OANDA', true);
  const c2 = await makeConnection(carl, 'Carl’s second OANDA', true);
  await db.insert(tradingDeskSettings).values({
    id: carl,
    depositedSync: true,
    syncedDeposited: 50000,
    withdrawnCapital: 1234,
    updatedAt: new Date(),
  });
  // The shared default row must never answer a capital question: one trader's
  // deposit is not another's.
  await db.insert(tradingDeskSettings).values({
    id: 'desk',
    depositedCapital: 999999,
    updatedAt: new Date(),
  });
  await backfillCapitalAccounts();
  const carlRows = await db
    .select()
    .from(tradingCapitalAccounts)
    .where(eq(tradingCapitalAccounts.userId, carl));
  const byKey = new Map(carlRows.map((r) => [r.accountKey, r]));
  ok('each account gets the sync that was on', !!byKey.get(c1)?.depositedSync && !!byKey.get(c2)?.depositedSync);
  // The old figure was the SUM of both accounts. Attributing it to either one
  // would be a number that account never held; each reads its own instead.
  ok('and none of them inherits the summed figure', byKey.get(c1)?.depositedCapital == null && byKey.get(c2)?.depositedCapital == null);
  ok('the switch that was off stays off', !byKey.get(c1)?.withdrawnSync);
  ok('the typed figure lands in the account-less bucket', byKey.get(OTHER_ACCOUNT)?.withdrawnCapital === 1234);
  ok('and nothing was invented beside it', byKey.get(OTHER_ACCOUNT)?.depositedCapital == null);
  const deskRows = await db
    .select()
    .from(tradingCapitalAccounts)
    .where(eq(tradingCapitalAccounts.userId, 'desk'));
  ok('the shared desk default is never carried', deskRows.length === 0);

  section('a typed figure with no sync');
  const dana = await makeUser('dana');
  await db.insert(tradingDeskSettings).values({ id: dana, depositedCapital: 7000, updatedAt: new Date() });
  section('a sync with no account left to read');
  const eve = await makeUser('eve');
  await db.insert(tradingDeskSettings).values({
    id: eve,
    depositedSync: true,
    syncedDeposited: 3000,
    updatedAt: new Date(),
  });
  await backfillCapitalAccounts();
  const danaRows = await db.select().from(tradingCapitalAccounts).where(eq(tradingCapitalAccounts.userId, dana));
  ok('it moves to the account-less bucket', danaRows.length === 1 && danaRows[0].accountKey === OTHER_ACCOUNT);
  ok('with the figure intact', danaRows[0]?.depositedCapital === 7000);
  const eveRows = await db.select().from(tradingCapitalAccounts).where(eq(tradingCapitalAccounts.userId, eve));
  // What was on the card stays on the card rather than blanking: with nothing
  // left to sync from, the last reading is the trader's own number now.
  ok('the last reading is kept as a typed figure', eveRows[0]?.depositedCapital === 3000);
  ok('and it is no longer claiming to sync', !eveRows[0]?.depositedSync);

  section('carrying over runs once, not every boot');
  await updateTraderCapital(carl, { account: OTHER_ACCOUNT, withdrawn: 4321 });
  await backfillCapitalAccounts();
  const carlAgain = await db
    .select()
    .from(tradingCapitalAccounts)
    .where(
      and(eq(tradingCapitalAccounts.userId, carl), eq(tradingCapitalAccounts.accountKey, OTHER_ACCOUNT)),
    );
  ok('a later edit is not overwritten', carlAgain[0]?.withdrawnCapital === 4321);
  const carlCount = (
    await db.select().from(tradingCapitalAccounts).where(eq(tradingCapitalAccounts.userId, carl))
  ).length;
  ok('and no rows are duplicated', carlCount === carlRows.length);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
