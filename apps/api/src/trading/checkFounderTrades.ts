// Founder trade coordination — walked through the real services against a real
// database.
//
//   DATABASE_URL="file:/tmp/x.db" npm run db:migrate
//   DATABASE_URL="file:/tmp/x.db" npm run db:check-founder-trades
//
// Like db:check-rollover this one WRITES — it creates accounts and invitations —
// so it refuses any database that already holds a user. An empty one is a
// scratch one; a real deployment always has accounts in it. Do not weaken that
// guard.
//
// What only a database can show is the STATE MACHINE, and every case below is
// one where the wrong behaviour is silent rather than loud:
//
//   • DECLINING THE PRIMARY TRADE DOES NOT END THE WORKFLOW. The funded question
//     is separate and still owed. Treating a decline as a full stop would drop
//     half of what the recipient was asked, with nothing on screen to say so.
//   • FUNDED "YES" DOES NOT COMPLETE ANYTHING. The screenshot is what finishes
//     that branch, which is the whole reason the reminders keep going after it.
//   • A SECOND JOIN CANNOT REACH THE BROKER. Two tabs, a double-click and a
//     retried request all lose the claim, which is what stops one press becoming
//     two positions.
//   • THE RECIPIENT'S SIZE IS NEVER THE INVITER'S. An unset size is refused
//     rather than defaulted, and the inviter's is display only.
//   • ONE TRADE RAISES ONE INVITATION per recipient, however many times it is
//     asked for.
//   • NOBODY BUT THE TWO PARTIES CAN READ A WORKFLOW, and only the recipient can
//     decide one.
//   • REMINDERS STOP THE MOMENT THE WORK IS DONE, and are paced rather than
//     fired on every pass.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  brokerConnections,
  founderTradeEvents,
  founderTradeInvites,
  tradingOrders,
  userFeatures,
  users,
  type UserRow,
} from '../db/schema.js';
import {
  autoInviteAfterFill,
  createInvite,
  getFounderLinks,
  setFounderLink,
  linkPositions,
  listPositionLinks,
  linksForPositions,
  pairPositions,
  unlinkPositions,
  autoAmendAfterModify,
  pickInstrumentMatch,
  declinePrimary,
  dueReminders,
  eligibleFounders,
  getInvite,
  getFounderPrefs,
  invitableFounders,
  joinPrimary,
  markNotified,
  pendingForRecipient,
  setFounderPrefs,
} from './founderTrades.js';
import { SYSTEM } from './credentialAudit.js';
import { DEFAULT_SHARE_CONFIG, getShareConfig, setShareConfig } from './founderTradeConfig.js';

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

async function expectRefusal(label: string, run: () => Promise<unknown>, contains?: string) {
  try {
    await run();
    ok(label, false, 'it was allowed');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ok(label, contains ? message.toLowerCase().includes(contains.toLowerCase()) : true, message);
  }
}

async function makeUser(username: string, roles: string[]): Promise<UserRow> {
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
    roles: JSON.stringify(roles),
    teamId: null,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  // The desk opt-in, which joining requires — being founder-level is authority
  // to take part, not consent to place real orders.
  await db.insert(userFeatures).values({
    id: randomUUID(),
    userId: id,
    advancedTrading: true,
    funded: false,
    tradingAckAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
}

// A broker connection so a JOIN gets past its pre-flight checks and actually
// reaches the claim. Its stored secret is deliberately unreadable: this database
// has no credentials key behind it, so an order that gets as far as the broker
// fails there — which is the failure path worth walking anyway.
async function makeConnection(userId: string): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(brokerConnections).values({
    id,
    userId,
    broker: 'oanda',
    label: 'Check account',
    secretEnc: 'v2:deadbeef:00:00:00',
    summary: 'Practice · 001-check',
    active: true,
    lastStatus: 'ok',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

// A fill on the inviter's own order journal — what an invitation is raised from.
async function makeOrder(userId: string, stopLoss: number | null, tradeId = 't1'): Promise<string> {
  const id = randomUUID();
  await db.insert(tradingOrders).values({
    id,
    userId,
    connectionId: 'conn-inviter',
    broker: 'oanda',
    kind: 'entry',
    instrument: 'EUR_USD',
    side: 'long',
    orderType: 'market',
    units: 50_000,
    requestedPrice: null,
    takeProfit: 1.12,
    stopLoss,
    status: 'filled',
    brokerOrderId: 'o1',
    brokerTradeId: tradeId,
    fillPrice: 1.1,
    realizedPl: null,
    errorCode: null,
    error: null,
    createdAt: new Date(),
  });
  return id;
}

async function kinds(inviteId: string): Promise<string[]> {
  const rows = await db
    .select({ kind: founderTradeEvents.kind })
    .from(founderTradeEvents)
    .where(eq(founderTradeEvents.inviteId, inviteId));
  return rows.map((r) => r.kind);
}

// The audit is written fire-and-forget, so give the inserts a tick to land
// before reading them back.
const settle = () => new Promise((r) => setTimeout(r, 60));

async function main() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) {
    console.error(
      'Refusing to run: this database already has accounts in it.\n' +
        'This check creates users, so it only runs against an empty scratch database:\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:migrate\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:check-founder-trades',
    );
    process.exit(1);
  }

  const alpha = await makeUser('alpha', ['founder']);
  const beta = await makeUser('beta', ['software_developer']);
  const gamma = await makeUser('gamma', ['founder']);
  const member = await makeUser('member', ['member']);
  const adminOnly = await makeUser('adminonly', ['admin']);

  section('eligibility comes from the role, and from nothing else');
  const eligible = (await eligibleFounders()).map((f) => f.username).sort();
  ok('every founder-level account is eligible', eligible.join(',') === 'alpha,beta,gamma', eligible.join(','));
  ok('an ordinary member is not', !eligible.includes('member'));
  // software_developer is permission-equivalent to founder throughout the
  // terminal, so it counts here for the same reason it counts everywhere else.
  ok('a plain admin is not', !eligible.includes('adminonly'));
  const invitable = await invitableFounders(alpha);
  ok('the picker never offers you yourself', invitable.every((f) => f.userId !== alpha.id));
  await expectRefusal('a member cannot list recipients', () => invitableFounders(member), 'founder-only');

  section('an invitation is raised from the trade that was actually placed');
  const order = await makeOrder(alpha.id, 1.09);
  const { id: inviteId, ...first } = await createInvite(alpha, {
    recipientUserId: beta.id,
    sourceOrderId: order,
  });
  ok('the snapshot is read off the journal row', first.instrument === 'EUR_USD' && first.side === 'long');
  ok("it carries the inviter's initial stop", first.stopLoss === 1.09);
  ok("and the inviter's size, for display", first.inviterUnits === 50_000);
  ok('it starts owing a primary decision', first.status === 'primary_pending');

  section('one trade raises one invitation per recipient');
  const again = await createInvite(alpha, { recipientUserId: beta.id, sourceOrderId: order });
  ok('asking twice returns the invitation that already exists', again.id === inviteId);
  const queue = await pendingForRecipient(beta);
  ok('so the recipient is asked once, not twice', queue.length === 1);

  section("an invitation cannot be raised on somebody else's trade");
  await expectRefusal(
    "another account's order id is not even visible",
    () => createInvite(beta, { recipientUserId: alpha.id, sourceOrderId: order }),
    'not on your order journal',
  );
  await expectRefusal(
    'a member cannot invite at all',
    () => createInvite(member, { recipientUserId: alpha.id, sourceOrderId: order }),
    'founder-only',
  );
  await expectRefusal(
    'and nobody can invite themselves',
    () => createInvite(alpha, { recipientUserId: alpha.id, sourceOrderId: order }),
    'yourself',
  );

  section('only the recipient can decide, and only the two parties can read');
  await expectRefusal('the inviter cannot answer for the recipient', () => declinePrimary(alpha, inviteId), 'not available');
  await expectRefusal('a member cannot read the workflow', () => getInvite(member, inviteId), 'founder-only');
  await expectRefusal(
    'nor can an uninvolved admin',
    () => getInvite(adminOnly, inviteId),
    'founder-only',
  );
  const readByInviter = await getInvite(alpha, inviteId);
  ok('the inviter can read it', readByInviter.invite.id === inviteId);
  ok('and it carries its audit timeline', readByInviter.events.length > 0);

  section("the recipient's size is their own, and an unset one is refused");
  ok('nothing is stated to begin with', (await getFounderPrefs(beta.id)).defaultUnits === null);
  await expectRefusal('so a JOIN is refused rather than defaulted', () => joinPrimary(beta, inviteId, SYSTEM), 'size');
  const saved = await setFounderPrefs(beta, { defaultUnits: 1000 });
  ok('a size can be stated', saved.defaultUnits === 1000);
  ok("and it is never the inviter's", saved.defaultUnits !== first.inviterUnits);
  const zeroed = await setFounderPrefs(beta, { defaultUnits: 0 });
  ok('a size of zero is stored as "not stated", never as a size', zeroed.defaultUnits === null);
  await setFounderPrefs(beta, { defaultUnits: 1000 });
  await expectRefusal(
    'and a JOIN with no account chosen is refused too',
    () => joinPrimary(beta, inviteId, SYSTEM),
    'broker accounts',
  );
  const conn = await makeConnection(beta.id);
  await expectRefusal(
    "somebody else's connection cannot be named",
    () => setFounderPrefs(alpha, { defaultConnectionId: conn }),
    'not on your account',
  );
  await setFounderPrefs(beta, { defaultConnectionId: conn });

  section('Account % sizing — the share is what is stored, not a size');
  // FIXED UNITS IS UNTOUCHED BY THE NEW MODE. A setting made before this
  // existed has a null `size_mode`, which reads as 'units' — checked above,
  // where every join so far has gone out at the stated 1,000.
  ok('a pre-existing setting reads as fixed units', (await getFounderPrefs(beta.id)).sizeMode === 'units');
  const pctSaved = await setFounderPrefs(beta, { sizeMode: 'account_pct', sizePct: 25 });
  ok('a share can be stated', pctSaved.sizeMode === 'account_pct' && pctSaved.sizePct === 25);
  ok('and the fixed size is kept beside it, so switching back loses nothing', pctSaved.defaultUnits === 1000);
  ok('rounding starts off', pctSaved.pctRound === false);
  ok('at a 0.50 increment', pctSaved.pctRoundIncrement === 0.5);
  const rounded = await setFounderPrefs(beta, { pctRound: true, pctRoundIncrement: 0.25 });
  ok('rounding can be turned on with its own increment', rounded.pctRound && rounded.pctRoundIncrement === 0.25);
  // Never read as a number: a share of nothing, or of more than the whole
  // account, is stored as "not stated" so the join refuses rather than guessing.
  ok('a share of zero is not a share', (await setFounderPrefs(beta, { sizePct: 0 })).sizePct === null);
  ok('nor is more than the whole account', (await setFounderPrefs(beta, { sizePct: 150 })).sizePct === null);
  await expectRefusal(
    'and a JOIN with no share stated is refused rather than falling back to the units',
    () => joinPrimary(beta, inviteId, SYSTEM),
    'share of your account',
  );
  await setFounderPrefs(beta, { sizePct: 25 });
  // THE SIZE COMES FROM THE RECIPIENT'S OWN ACCOUNT. There is no reachable
  // broker here, so it refuses at the account read — which is the point: it
  // never falls back to a stored unit count, and it never reads the inviter's.
  await expectRefusal(
    "a share that cannot be priced refuses rather than using a stale or the inviter's size",
    () => joinPrimary(beta, inviteId, SYSTEM),
  );
  const afterPct = await pendingForRecipient(beta);
  ok('the workflow is left exactly where it was', afterPct[0]?.status === 'primary_pending');
  ok(
    'and the invitation states no fixed size, because a share has none until it is sent',
    afterPct[0]?.recipientUnits === null,
  );
  // Back to fixed units for the rest of the walk-through.
  await setFounderPrefs(beta, { sizeMode: 'units', pctRound: false });
  ok('switching back restores the fixed size', (await getFounderPrefs(beta.id)).defaultUnits === 1000);

  section('an order the broker refuses leaves the workflow where it was');
  // The connection's stored secret cannot be read here, so this gets past every
  // pre-flight check and fails at the broker — the real failure path.
  await expectRefusal('the JOIN reports the failure', () => joinPrimary(beta, inviteId, SYSTEM));
  const stillPending = await pendingForRecipient(beta);
  ok('a refused JOIN leaves the workflow exactly where it was', stillPending[0]?.status === 'primary_pending');
  ok('nothing is left claimed, so it can be retried at once', stillPending[0]?.sending === false);
  ok('and the reason is kept on the row, so it is still there after a refresh', !!stillPending[0]?.primaryError);

  section('a JOIN already in flight cannot be sent a second time');
  // Stand a live claim up by hand — a request that has reached the broker and
  // not come back yet.
  await db
    .update(founderTradeInvites)
    .set({ claimToken: 'in-flight', claimedAt: new Date() })
    .where(eq(founderTradeInvites.id, inviteId));
  await expectRefusal('a second tab is refused rather than sending its own order', () =>
    joinPrimary(beta, inviteId, SYSTEM),
  );
  await expectRefusal('and the decision cannot be answered around it either', () =>
    declinePrimary(beta, inviteId),
  );

  section('a claim that never reported back is released UNSENT');
  // The same claim, now past its window: the attempt behind it may still reach
  // the broker, so taking it over must not place an order.
  await db
    .update(founderTradeInvites)
    .set({ claimToken: 'abandoned', claimedAt: new Date(Date.now() - 10 * 60_000) })
    .where(eq(founderTradeInvites.id, inviteId));
  await expectRefusal(
    'the takeover refuses once instead of placing',
    () => joinPrimary(beta, inviteId, SYSTEM),
    'never finished',
  );
  const recovered = (await pendingForRecipient(beta))[0];
  ok('the claim is cleared so the next press can go through', recovered?.sending === false);
  ok('and the recipient is told to check their broker first', (recovered?.primaryError ?? '').includes('Check your account'));
  ok('with the workflow still exactly where it was', recovered?.status === 'primary_pending');

  section('ANSWERING IS FINISHING — the funded question left this workflow');
  // Owner decision, 2026-08. A trade invitation used to advance to "are you also
  // placing this on your funded account?" and then to a screenshot. Both are
  // gone: either answer to the one question now ends it. Nothing about the
  // funded BOOK changed, and this is the check that says so about the workflow.
  const declined = await declinePrimary(beta, inviteId);
  ok('the decline is recorded', declined.primaryDecision === 'declined');
  ok('and it completes the workflow there and then', declined.status === 'complete');
  ok('stamped', declined.completedAt !== null);
  ok('with nothing left pending for the recipient', (await pendingForRecipient(beta)).length === 0);
  const repeat = await declinePrimary(beta, inviteId);
  ok('a second decline converges instead of erroring', repeat.status === 'complete');
  ok('and does not restamp the first answer', repeat.primaryDecidedAt === declined.primaryDecidedAt);

  section("what travels with an invitation is the GROUP's rule");
  const shipped = await getShareConfig();
  ok('both levels travel by default', shipped.copyStopLoss && shipped.copyTakeProfit);
  ok('which is what the code default says', DEFAULT_SHARE_CONFIG.copyTakeProfit);
  const narrowed = await setShareConfig({ copyTakeProfit: false });
  ok('a level can be switched off for everybody', narrowed.copyTakeProfit === false);
  ok('and switching one leaves the other alone', narrowed.copyStopLoss === true);
  ok('it is install-wide, not per person', (await getShareConfig()).copyTakeProfit === false);
  await setShareConfig({ copyTakeProfit: true });
  ok('and it can be switched back', (await getShareConfig()).copyTakeProfit === true);

  section("an invitation carries the sender's target as well as their stop");
  const withTp = await makeOrder(alpha.id, 1.09);
  const tpInvite = await createInvite(alpha, { recipientUserId: beta.id, sourceOrderId: withTp });
  ok('the target is snapshotted onto the row', tpInvite.takeProfit === 1.12);
  ok('beside the stop', tpInvite.stopLoss === 1.09);

  section('links: nothing is sent until somebody switches one on');
  ok('a Founder starts with no links either way', (await getFounderLinks(alpha)).sending.length === 0);
  const quiet = await makeOrder(alpha.id, 1.07);
  ok('so a fill raises nothing', (await autoInviteAfterFill(alpha, quiet, 'filled')).length === 0);
  await expectRefusal(
    'a trade cannot be sent to whoever placed it',
    () => setFounderLink(alpha, alpha.id, alpha.id, { entries: true }),
    'cannot be sent',
  );
  await expectRefusal(
    'nor to somebody without Founder access',
    () => setFounderLink(alpha, alpha.id, member.id, { entries: true }),
    'cannot take part',
  );

  section('EITHER end may switch a link on');
  // The receiving side sets this one up: beta asks for alpha's trades without
  // touching alpha's account, which is the whole point of a link over a
  // sender-only switch.
  const asRecipient = await setFounderLink(beta, alpha.id, beta.id, { entries: true });
  ok('the recipient can arrange it themselves', asRecipient.receiving.some((f) => f.person.userId === alpha.id));
  ok('and it shows on the sender\'s screen too', (await getFounderLinks(alpha)).sending.some((f) => f.person.userId === beta.id));
  await expectRefusal(
    'but nobody can arrange a link between two other people',
    () => setFounderLink(beta, alpha.id, gamma.id, { entries: true }),
    'part of',
  );

  section('switched on, a FILL is sent and a resting order is not');
  const resting = await makeOrder(alpha.id, 1.06);
  // A limit or stop entry that has not triggered is not a trade anybody is in,
  // and the recipient would join at market — so it is deliberately not sent.
  ok('a working order raises nothing', (await autoInviteAfterFill(alpha, resting, 'accepted')).length === 0);
  const autoOrder = await makeOrder(alpha.id, 1.05);
  const [auto] = await autoInviteAfterFill(alpha, autoOrder, 'filled');
  ok('a fill raises the invitation by itself', auto?.recipient.userId === beta.id);
  ok('and it carries the trade, as a manual one does', auto?.stopLoss === 1.05);
  const [twice] = await autoInviteAfterFill(alpha, autoOrder, 'filled');
  ok('the same fill reported twice still raises one', twice?.id === auto?.id);

  section('a link is one direction only, never symmetric by accident');
  ok('the reverse direction does not exist', (await getFounderLinks(beta)).sending.length === 0);
  const betaOrder = await makeOrder(beta.id, 1.04);
  ok('so their fill sends nothing back', (await autoInviteAfterFill(beta, betaOrder, 'filled')).length === 0);

  section('a sender can reach more than one Founder');
  await setFounderLink(alpha, alpha.id, gamma.id, { entries: true });
  const fanned = await autoInviteAfterFill(alpha, await makeOrder(alpha.id, 1.005), 'filled');
  ok('both are invited from one fill', fanned.length === 2);
  ok('each to their own person', new Set(fanned.map((i) => i.recipient.userId)).size === 2);
  await setFounderLink(alpha, alpha.id, gamma.id, { entries: false });
  ok('and switching one off leaves the other', (await getFounderLinks(alpha)).sending.length === 1);

  section('a TEST invitation comes to whoever ran it');
  const testOrder = await makeOrder(alpha.id, 1.02);
  const testInvite = await createInvite(alpha, {
    recipientUserId: alpha.id,
    sourceOrderId: testOrder,
    isTest: true,
  });
  ok('it is marked', testInvite.isTest === true);
  ok('addressed to the person testing', testInvite.recipient.userId === alpha.id);
  ok('and it owes exactly what a real one owes', testInvite.status === 'primary_pending');
  ok('so it lands in their own queue', (await pendingForRecipient(alpha)).some((i) => i.isTest));
  const selfOrder = await makeOrder(alpha.id, 1.015);
  await expectRefusal(
    'a REAL invitation still cannot be sent to yourself',
    () => createInvite(alpha, { recipientUserId: alpha.id, sourceOrderId: selfOrder }),
    'yourself',
  );
  const ordinary = await createInvite(alpha, {
    recipientUserId: beta.id,
    sourceOrderId: await makeOrder(alpha.id, 1.01),
  });
  ok('an ordinary invitation is not marked', ordinary.isTest === false);
  await settle();
  ok('the timeline records that it was a test', (await kinds(testInvite.id)).includes('invite.test'));

  section('notifications are settable in BOTH directions');
  const bothWays = await setFounderPrefs(alpha, {
    reminderLevel: 'alert',
    reminderEverySeconds: 120,
    notifyOnResponse: false,
    responseLevel: 'silent',
  });
  ok('the receive side is kept', bothWays.reminderLevel === 'alert' && bothWays.reminderEverySeconds === 120);
  ok('and the send side beside it', bothWays.notifyOnResponse === false && bothWays.responseLevel === 'silent');
  const partial = await setFounderPrefs(alpha, { reminderEverySeconds: 300 });
  ok('a partial save leaves the other direction alone', partial.notifyOnResponse === false);
  await setFounderPrefs(alpha, { reminderLevel: 'repeating', notifyOnResponse: true, responseLevel: 'normal' });

  section('a recipient who loses Founder access stops receiving trades');
  await db.update(users).set({ roles: JSON.stringify(['member']) }).where(eq(users.id, beta.id));
  const afterRevoke = await makeOrder(alpha.id, 1.03);
  ok('nothing is sent to them', (await autoInviteAfterFill(alpha, afterRevoke, 'filled')).length === 0);
  ok('and they drop out of the link list', (await getFounderLinks(alpha)).sending.length === 0);
  await db.update(users).set({ roles: JSON.stringify(['software_developer']) }).where(eq(users.id, beta.id));
  ok('coming back restores it', (await getFounderLinks(alpha)).sending.length === 1);
  await setFounderLink(alpha, alpha.id, beta.id, { entries: false });

  section('THE TWO SWITCHES ON A LINK ARE INDEPENDENT');
  // Owner instruction, 2026-08: separate switches per direction, full custom.
  // Opening a trade and moving a stop on one are different things to want, and a
  // Founder can take either without the other.
  const amendsOnly = await setFounderLink(alpha, alpha.id, beta.id, { entries: false, amends: true });
  const linkAB = amendsOnly.sending.find((l) => l.person.userId === beta.id);
  ok('a link can carry level moves and nothing else', linkAB?.amends === true && linkAB?.entries === false);
  const entriesOff = await makeOrder(alpha.id, 1.09, 'no-entries');
  ok('so a FILL raises nothing', (await autoInviteAfterFill(alpha, entriesOff, 'filled')).length === 0);
  // A PATCH over what is stored: a browser on an old cached bundle changing one
  // switch must never silently reset the other.
  const patched = await setFounderLink(beta, alpha.id, beta.id, { entries: true });
  const bothOn = patched.receiving.find((l) => l.person.userId === alpha.id);
  ok('changing one switch leaves the other exactly as it was', bothOn?.entries === true && bothOn?.amends === true);
  // BOTH OFF IS NOT A STATE — the row is the link, so the last switch going off
  // removes it. That is what keeps "a disabled link and no link are the same
  // fact", the property this table was built on.
  const gone = await setFounderLink(alpha, alpha.id, beta.id, { entries: false, amends: false });
  ok('turning both off removes the link entirely', gone.sending.length === 0);
  await setFounderLink(alpha, alpha.id, beta.id, { entries: true, amends: true });

  section('LEVEL MOVES: what is sent, and what is deliberately not');
  const moved = (over: Partial<Parameters<typeof autoAmendAfterModify>[1]>) =>
    ({
      orderRecordId: randomUUID(),
      instrument: 'EUR_USD',
      side: 'long' as const,
      previousStopLoss: 1.09,
      previousTakeProfit: null,
      stopLoss: 1.095,
      takeProfit: null,
      entryPrice: 1.1,
      units: 50_000,
      changedStopLoss: true,
      changedTakeProfit: false,
      ...over,
    });
  // A REMOVAL IS NOT SENT (owner asked for "moves or adds"). One press that
  // strips the protection off somebody else's live position is a different risk
  // from one that tightens it.
  ok(
    'taking a stop OFF raises nothing',
    (await autoAmendAfterModify(alpha, moved({ stopLoss: null }), 'conn-inviter', 'pos-a')).length === 0,
  );
  // A level re-sent at the value it already had is not a move.
  ok(
    'a level saved again unchanged raises nothing',
    (await autoAmendAfterModify(alpha, moved({ stopLoss: 1.09 }), 'conn-inviter', 'pos-a')).length === 0,
  );
  // Nothing is invented from a position the venue would not report.
  ok(
    'a change with no known direction raises nothing',
    (await autoAmendAfterModify(alpha, moved({ side: null }), 'conn-inviter', 'pos-a')).length === 0,
  );

  section('a level move is raised, and it never guesses which position it is about');
  // No pairing, and this scratch database has no broker to match an instrument
  // against — so the target resolves to NOTHING rather than to a plausible
  // guess. The invitation is still raised: the recipient is told what changed,
  // and simply gets no button.
  const [unaimed] = await autoAmendAfterModify(alpha, moved({}), 'conn-inviter', 'pos-a');
  ok('the invitation is raised', unaimed?.kind === 'amend');
  ok('carrying the new level', unaimed?.stopLoss === 1.095);
  ok('and the one it moved from', unaimed?.prevStopLoss === 1.09);
  ok('with no position of theirs to apply it to', unaimed?.hasTarget === false);
  ok('so nothing claims a match', unaimed?.targetMatch === null);
  await expectRefusal(
    'and pressing apply refuses rather than moving something at random',
    () => joinPrimary(beta, unaimed!.id, SYSTEM),
    'no position of yours',
  );
  // The same move sent twice while the first is still unanswered queues one
  // modal, not two.
  ok(
    'the same move repeated while unanswered is folded in',
    (await autoAmendAfterModify(alpha, moved({}), 'conn-inviter', 'pos-a')).length === 0,
  );
  const dismissed = await declinePrimary(beta, unaimed!.id);
  ok('dismissing it completes the workflow', dismissed.status === 'complete');
  ok('and records leaving their own levels alone', dismissed.primaryDecision === 'declined');
  await settle();
  ok('the timeline says it was a level move', (await kinds(unaimed!.id)).includes('amend.created'));
  ok('and that no position could be aimed at', (await kinds(unaimed!.id)).includes('amend.target_unresolved'));
  ok('and that it was dismissed rather than joined', (await kinds(unaimed!.id)).includes('amend.dismissed'));

  section('MATCHING ON INSTRUMENT: exactly one, or nothing');
  // The rule that decides whether a level move can be applied without a
  // pairing, and the most important one in this half — moving a stop on the
  // wrong position is the failure it exists to prevent. Checked as a pure
  // function because the ambiguity case is unreachable from anything that has
  // to read a real broker account.
  const pos = (tradeId: string, instrument: string, side: 'long' | 'short') => ({ tradeId, instrument, side });
  const one = [pos('a', 'EUR/USD', 'long')];
  ok('one match is a match', pickInstrumentMatch(one, 'EUR_USD', 'long')?.tradeId === 'a');
  ok('spelled either way', pickInstrumentMatch(one, 'EUR/USD', 'long')?.tradeId === 'a');
  ok('the opposite direction is not the same trade', pickInstrumentMatch(one, 'EUR_USD', 'short') === null);
  ok('and neither is another instrument', pickInstrumentMatch(one, 'GBP_USD', 'long') === null);
  ok('an empty book matches nothing', pickInstrumentMatch([], 'EUR_USD', 'long') === null);
  // TWO OR MORE IS NONE. Picking one would be picking at random.
  const two = [pos('a', 'EUR/USD', 'long'), pos('b', 'EUR_USD', 'long')];
  ok('TWO candidates resolve to NOTHING rather than the first', pickInstrumentMatch(two, 'EUR_USD', 'long') === null);
  // The narrowing still has to work around the ambiguity: two positions in the
  // pair, one each way, is one match per direction and not an ambiguous book.
  const opposite = [pos('a', 'EUR/USD', 'long'), pos('b', 'EUR/USD', 'short')];
  ok('a hedged pair is one match each way', pickInstrumentMatch(opposite, 'EUR_USD', 'long')?.tradeId === 'a');
  ok('and the other way round', pickInstrumentMatch(opposite, 'EUR_USD', 'short')?.tradeId === 'b');

  section('a PAIRING is what makes a level move land in one press');
  await pairPositions({
    a: { userId: alpha.id, connectionId: 'conn-inviter', tradeId: 'pos-a' },
    b: { userId: beta.id, connectionId: 'conn-joiner', tradeId: 'pos-b' },
    instrument: 'EUR_USD',
    side: 'long',
    source: 'manual',
    createdByUserId: alpha.id,
  });
  const [aimed] = await autoAmendAfterModify(alpha, moved({ stopLoss: 1.0975 }), 'conn-inviter', 'pos-a');
  ok('the paired position is found', aimed?.hasTarget === true);
  ok('and it says the two are provably the same trade', aimed?.targetMatch === 'chain');
  await settle();
  ok('recorded on the timeline', (await kinds(aimed!.id)).includes('amend.target_resolved'));

  section('a pairing is one row however many times it is made');
  await pairPositions({
    // The same pair, stated the other way round. The canonical ordering is what
    // makes it one row rather than two that could later disagree.
    a: { userId: beta.id, connectionId: 'conn-joiner', tradeId: 'pos-b' },
    b: { userId: alpha.id, connectionId: 'conn-inviter', tradeId: 'pos-a' },
    instrument: 'EUR_USD',
    side: 'long',
    source: 'manual',
    createdByUserId: beta.id,
  });
  const alphaLinks = await listPositionLinks(alpha);
  ok('pairing it again in reverse adds nothing', alphaLinks.length === 1);
  ok('the viewer sees their OWN side of the pair', alphaLinks[0]?.tradeId === 'pos-a');
  ok('and who it is with', alphaLinks[0]?.person.userId === beta.id);
  const betaLinks = await listPositionLinks(beta);
  ok('the other end sees theirs', betaLinks[0]?.tradeId === 'pos-b');
  ok('and it is the same pairing', betaLinks[0]?.id === alphaLinks[0]?.id);

  section('the LINKED marker is per position and per viewer');
  const marks = await linksForPositions(alpha.id, ['pos-a', 'pos-unlinked']);
  ok('a paired position is marked', (marks.get('pos-a') ?? []).length === 1);
  ok('an unpaired one is not', marks.has('pos-unlinked') === false);
  ok('and the mark names the other Founder', marks.get('pos-a')?.[0]?.person.userId === beta.id);
  ok('somebody outside the pair sees nothing', (await linksForPositions(gamma.id, ['pos-a'])).size === 0);

  section('EITHER party may break a pairing');
  await expectRefusal(
    'and somebody outside it cannot',
    () => unlinkPositions(gamma, alphaLinks[0]!.id),
    'not on your account',
  );
  const afterUnlink = await unlinkPositions(beta, alphaLinks[0]!.id);
  ok('the receiving end can break it themselves', afterUnlink.length === 0);
  ok('and it is gone for the other side too', (await listPositionLinks(alpha)).length === 0);
  await expectRefusal(
    'pairing a position with your own is refused',
    () => linkPositions(alpha, { withUserId: alpha.id, myTradeId: 'x', theirTradeId: 'y' }, SYSTEM),
    'itself',
  );
  await expectRefusal(
    'and so is pairing with somebody who is not a Founder',
    () => linkPositions(alpha, { withUserId: member.id, myTradeId: 'x', theirTradeId: 'y' }, SYSTEM),
    'cannot take part',
  );

  section('reminders are paced, and stop when the work is done');
  const order3 = await makeOrder(alpha.id, 1.08);
  const third = await createInvite(alpha, { recipientUserId: beta.id, sourceOrderId: order3 });
  const due = await dueReminders();
  ok('an unresolved workflow is due a reminder', due.some((d) => d.id === third.id));
  ok('a completed one is not', !due.some((d) => d.id === inviteId));
  await markNotified(third.id, 'primary_pending');
  const soon = await dueReminders();
  ok('and it is not due again a moment later', !soon.some((d) => d.id === third.id));
  await declinePrimary(beta, third.id);
  const after = await dueReminders();
  ok('finishing it stops the reminders with nothing to unschedule', !after.some((d) => d.id === third.id));

  section('every step is auditable');
  await settle();
  const timeline = await kinds(inviteId);
  for (const k of [
    'source_trade.placed',
    'invite.created',
    'primary.declined',
    'workflow.completed',
  ]) {
    ok(`the timeline records ${k}`, timeline.includes(k));
  }
  // A JOIN refused before anything was sent — no size, no account, no desk
  // opt-in. Recorded, because it is a press that did not become a trade.
  ok('including the refusals that never became a trade', timeline.includes('primary.join_refused'));
  ok('and the order the broker would not take', timeline.includes('primary.join_failed'));
  ok('and the duplicate invitation that was folded in', timeline.includes('invite.duplicate_suppressed'));
  ok('the JOIN that was blocked as a duplicate', timeline.includes('primary.duplicate_blocked'));
  ok('and the abandoned claim that was released unsent', timeline.includes('primary.claim_recovered'));
  await settle();
  ok(
    'an auto-sent invitation says so on its own timeline',
    (await kinds(auto!.id)).includes('invite.auto_sent'),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
