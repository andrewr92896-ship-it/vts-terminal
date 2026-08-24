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
  setFundedDecision,
  uploadProof,
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
async function makeOrder(userId: string, stopLoss: number | null): Promise<string> {
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
    brokerTradeId: 't1',
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

  section('declining the primary trade does NOT end the workflow');
  const declined = await declinePrimary(beta, inviteId);
  ok('the decline is recorded', declined.primaryDecision === 'declined');
  ok('the funded question is still owed', declined.status === 'funded_pending');
  ok('so the workflow is not complete', declined.completedAt === null);
  const repeat = await declinePrimary(beta, inviteId);
  ok('a second decline converges instead of erroring', repeat.status === 'funded_pending');

  section('the funded decision is separate, and YES completes nothing');
  await expectRefusal('the inviter cannot answer it either', () => setFundedDecision(alpha, inviteId, 'no'));
  const yes = await setFundedDecision(beta, inviteId, 'yes');
  ok('YES moves to verification', yes.status === 'proof_pending');
  ok('and deliberately does not complete the workflow', yes.completedAt === null);
  const yesAgain = await setFundedDecision(beta, inviteId, 'no');
  ok('a contradictory second answer does not overwrite the first', yesAgain.fundedDecision === 'yes');

  section('the screenshot is what finishes it');
  await expectRefusal('junk is not a screenshot', () => uploadProof(beta, inviteId, 'not-an-image'), 'image');
  const done = await uploadProof(beta, inviteId, 'data:image/png;base64,aGVsbG8=');
  ok('the workflow completes on the upload', done.status === 'complete');
  ok('and it is stamped', done.completedAt !== null && done.hasProof);
  ok('nothing is left pending for the recipient', (await pendingForRecipient(beta)).length === 0);

  section('a declined funded leg completes without a screenshot');
  const order2 = await makeOrder(alpha.id, null);
  const second = await createInvite(alpha, { recipientUserId: beta.id, sourceOrderId: order2 });
  ok('a trade with no stop is still shareable, and says so', second.stopLoss === null);
  await declinePrimary(beta, second.id);
  const no = await setFundedDecision(beta, second.id, 'no');
  ok('NO completes the workflow there and then', no.status === 'complete' && no.completedAt !== null);

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
    () => setFounderLink(alpha, alpha.id, alpha.id, true),
    'cannot be sent',
  );
  await expectRefusal(
    'nor to somebody without Founder access',
    () => setFounderLink(alpha, alpha.id, member.id, true),
    'cannot take part',
  );

  section('EITHER end may switch a link on');
  // The receiving side sets this one up: beta asks for alpha's trades without
  // touching alpha's account, which is the whole point of a link over a
  // sender-only switch.
  const asRecipient = await setFounderLink(beta, alpha.id, beta.id, true);
  ok('the recipient can arrange it themselves', asRecipient.receiving.some((f) => f.userId === alpha.id));
  ok('and it shows on the sender\'s screen too', (await getFounderLinks(alpha)).sending.some((f) => f.userId === beta.id));
  await expectRefusal(
    'but nobody can arrange a link between two other people',
    () => setFounderLink(beta, alpha.id, gamma.id, true),
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
  await setFounderLink(alpha, alpha.id, gamma.id, true);
  const fanned = await autoInviteAfterFill(alpha, await makeOrder(alpha.id, 1.005), 'filled');
  ok('both are invited from one fill', fanned.length === 2);
  ok('each to their own person', new Set(fanned.map((i) => i.recipient.userId)).size === 2);
  await setFounderLink(alpha, alpha.id, gamma.id, false);
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
  await setFounderLink(alpha, alpha.id, beta.id, false);

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
  await setFundedDecision(beta, third.id, 'no');
  const after = await dueReminders();
  ok('finishing it stops the reminders with nothing to unschedule', !after.some((d) => d.id === third.id));

  section('every step is auditable');
  await settle();
  const timeline = await kinds(inviteId);
  for (const k of [
    'source_trade.placed',
    'invite.created',
    'primary.declined',
    'funded.accepted',
    'proof.requested',
    'proof.uploaded',
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
