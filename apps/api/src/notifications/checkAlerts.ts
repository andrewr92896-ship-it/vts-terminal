// Exercises the alert-level, repeat-timing and receipt plumbing through the
// real services against a scratch database. Writes, so it refuses a database
// that already holds users (same guard as db:check-sharing).
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import * as S from './prefs.js';
import * as A from './alertPrefs.js';
import * as R from './pushoverReceipts.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

const existing = await db.select({ id: users.id }).from(users).limit(1);
if (existing.length) {
  console.error('Refusing to run against a database that already has users.');
  process.exit(2);
}

async function mkUser(name: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(users).values({
    id,
    username: name,
    createdUsername: name,
    displayName: name,
    email: `${name}@example.com`,
    avatar: null,
    passwordHash: 'x',
    role: 'Viewer',
    roles: JSON.stringify(['member']),
    badges: null,
    displayTimezone: null,
    hideFromLeaderboards: false,
    homeWorkspace: null,
    homeScreen: null,
    teamId: null,
    viewBrokerage: false,
    active: true,
    mustChangePassword: false,
    termsAcceptedVersion: null,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

const me = await mkUser('alice');
const trader = await mkUser('bob');

console.log('\nLevels');
// No stored row: everything on at 'alert' — exactly the pre-levels behaviour.
let lv = await S.recipientLevelsForEvent([me], trader, 'open');
check('no row → notified at alert', lv.get(me) === 'alert', [...lv]);

await S.setPref(me, trader, { ...S.DEFAULT_PREF_FLAGS }, { ...S.DEFAULT_PREF_LEVELS, open: 'repeating', close: 'silent' });
lv = await S.recipientLevelsForEvent([me], trader, 'open');
check('open → repeating', lv.get(me) === 'repeating', [...lv]);
lv = await S.recipientLevelsForEvent([me], trader, 'close');
check('close → silent', lv.get(me) === 'silent', [...lv]);
lv = await S.recipientLevelsForEvent([me], trader, 'moveSl');
check('untouched event keeps alert', lv.get(me) === 'alert', [...lv]);

// A muted event drops out entirely rather than arriving at some level.
await S.setPref(me, trader, { ...S.DEFAULT_PREF_FLAGS, moveTp: false }, { ...S.DEFAULT_PREF_LEVELS, open: 'repeating' });
lv = await S.recipientLevelsForEvent([me], trader, 'moveTp');
check('muted event yields nobody', !lv.has(me), [...lv]);
lv = await S.recipientLevelsForEvent([me], trader, 'open');
check('levels survive a flags-and-levels save', lv.get(me) === 'repeating', [...lv]);

// Saving flags WITHOUT levels must not reset them (the stale-bundle case).
await S.setPref(me, trader, { ...S.DEFAULT_PREF_FLAGS });
lv = await S.recipientLevelsForEvent([me], trader, 'open');
check('flags-only save leaves levels alone', lv.get(me) === 'repeating', [...lv]);

check('priority ladder maps as documented',
  S.LEVEL_PRIORITY.silent === -1 && S.LEVEL_PRIORITY.normal === 0 &&
  S.LEVEL_PRIORITY.alert === 1 && S.LEVEL_PRIORITY.repeating === 2);

console.log('\nRepeat timing');
check('default before any save', (await A.getRepeatPrefs(me)).repeatEverySeconds === 30);
let rp = await A.setRepeatPrefs(me, { repeatEverySeconds: 5, repeatForSeconds: 99999 });
check('retry clamped up to Pushover minimum', rp.repeatEverySeconds === 30, rp);
check('expire clamped to Pushover 3h ceiling', rp.repeatForSeconds === 10800, rp);
rp = await A.setRepeatPrefs(me, { repeatEverySeconds: 600, repeatForSeconds: 60 });
check('expire floored at the retry interval', rp.repeatForSeconds >= rp.repeatEverySeconds, rp);
rp = await A.setRepeatPrefs(me, { repeatEverySeconds: 60, repeatForSeconds: 900 });
check('a sane pair is stored verbatim', rp.repeatEverySeconds === 60 && rp.repeatForSeconds === 900, rp);
check('read back matches', (await A.getRepeatPrefs(me)).repeatForSeconds === 900);

console.log('\nReceipts');
const token = R.newCallbackToken();
await R.recordReceipt({
  userId: me, receipt: 'rcpt-1', callbackToken: token,
  title: 'Trade opened · EUR/USD', body: 'BUY 1000', kind: 'open',
  expiresAt: new Date(Date.now() + 60_000),
});
check('live after recording', (await R.liveAlerts(me)).length === 1);
check('another user sees nothing', (await R.liveAlerts(trader)).length === 0);

// An expired row stops being live without anybody touching it.
const expiredToken = R.newCallbackToken();
await R.recordReceipt({
  userId: me, receipt: 'rcpt-old', callbackToken: expiredToken,
  title: 'old', body: 'old', kind: 'open',
  expiresAt: new Date(Date.now() - 1000),
});
check('past its expiry is not live', (await R.liveAlerts(me)).length === 1);

check('callback token resolves it', await R.resolveByCallbackToken(token));
check('resolved is no longer live', (await R.liveAlerts(me)).length === 0);
check('the same token cannot resolve twice', !(await R.resolveByCallbackToken(token)));
check('an unknown token resolves nothing', !(await R.resolveByCallbackToken('nope')));

console.log('\nAccount + group switches');
// Both default on for an account that has never touched them.
const fresh = await A.getAlertPrefs(trader);
check('both switches default on', fresh.accountAlerts && fresh.groupAlerts, fresh);
check('no row → included by the master filter', (await A.filterAccountAlerts([trader])).length === 1);

await A.setAlertPrefs(trader, { accountAlerts: false });
check('master off → filtered out', (await A.filterAccountAlerts([trader])).length === 0);
check('master off also blocks group alerts', (await A.recipientsAcceptingGroupAlerts([trader])).length === 0);
check('repeat timing survives a switch-only save', (await A.getAlertPrefs(trader)).repeatEverySeconds === 30);

await A.setAlertPrefs(trader, { accountAlerts: true, groupAlerts: false });
check('master back on', (await A.filterAccountAlerts([trader])).length === 1);
check('group off → no group alerts', (await A.recipientsAcceptingGroupAlerts([trader])).length === 0);

await A.setAlertPrefs(trader, { groupAlerts: true });
check('group back on', (await A.recipientsAcceptingGroupAlerts([trader])).length === 1);
check('switch-only save left the master alone', (await A.getAlertPrefs(trader)).accountAlerts);

// Alice never saved switches, so she is on by default and unaffected by Bob's.
check('one account’s switches do not touch another’s',
  (await A.filterAccountAlerts([me, trader])).length === 2);

console.log('\nGroup nudge');
const G = await import('./groupAlerts.js');
G.resetGroupAlertCooldown();
// Nobody is on a team in this fixture, so the send must refuse rather than
// quietly buzzing the whole install.
let refused = false;
try {
  await G.sendGroupAlert({ id: me, teamId: null, displayName: 'Alice', username: 'alice' }, 'standard');
} catch (e) {
  refused = e instanceof G.GroupAlertError;
}
check('no group → refused', refused);

// With a group, the sender is never a recipient of their own nudge.
await db.update(users).set({ teamId: 'team-x' }).where(eq(users.id, me));
await db.update(users).set({ teamId: 'team-x' }).where(eq(users.id, trader));
G.resetGroupAlertCooldown();
const sent = await G.sendGroupAlert({ id: me, teamId: 'team-x', displayName: 'Alice', username: 'alice' }, 'standard');
check('reaches the one teammate, not the sender', sent.recipients === 1, sent);
check('a second send inside the cooldown is refused', G.cooldownRemainingMs(me) > 0);

let cooled = false;
try {
  await G.sendGroupAlert({ id: me, teamId: 'team-x', displayName: 'Alice', username: 'alice' }, 'standard');
} catch (e) {
  cooled = e instanceof G.GroupAlertError;
}
check('cooldown refuses with an error, not silently', cooled);

// A teammate who switched group alerts off drops out.
await A.setAlertPrefs(trader, { groupAlerts: false });
G.resetGroupAlertCooldown();
const none = await G.sendGroupAlert({ id: me, teamId: 'team-x', displayName: 'Alice', username: 'alice' }, 'standard');
check('opted-out teammate is not reached', none.recipients === 0, none);

console.log('\nPicking specific people');
const carol = await mkUser('carol');
const outsider = await mkUser('dave');
await db.update(users).set({ teamId: 'team-x' }).where(eq(users.id, carol));
await A.setAlertPrefs(trader, { groupAlerts: true });
await A.setAlertPrefs(carol, { groupAlerts: true });
const alice = { id: me, teamId: 'team-x', displayName: 'Alice', username: 'alice' };

G.resetGroupAlertCooldown();
const everyone = await G.sendGroupAlert(alice, 'standard');
check('no selection still means everyone', everyone.recipients === 2, everyone);

G.resetGroupAlertCooldown();
const justOne = await G.sendGroupAlert(alice, 'standard', [trader]);
check('picking one reaches only that person', justOne.recipients === 1, justOne);

G.resetGroupAlertCooldown();
const two = await G.sendGroupAlert(alice, 'standard', [trader, carol]);
check('picking two reaches both', two.recipients === 2, two);

// The picker must not become a way to buzz somebody outside the group.
G.resetGroupAlertCooldown();
let outsiderRefused = false;
try {
  await G.sendGroupAlert(alice, 'standard', [outsider]);
} catch (e) {
  outsiderRefused = e instanceof G.GroupAlertError;
}
check('an id outside the group is refused, not sent to', outsiderRefused);

// A mixed list keeps the valid part and silently drops the rest rather than
// failing the whole send — but must never widen to everybody.
G.resetGroupAlertCooldown();
const mixed = await G.sendGroupAlert(alice, 'standard', [trader, outsider]);
check('a mixed list reaches only the valid member', mixed.recipients === 1, mixed);

// Naming somebody individually does not override their own opt-out.
await A.setAlertPrefs(carol, { groupAlerts: false });
G.resetGroupAlertCooldown();
const optedOut = await G.sendGroupAlert(alice, 'standard', [carol]);
check('picking an opted-out person still reaches nobody', optedOut.recipients === 0, optedOut);

// The sender cannot nudge themselves, even by naming themselves.
G.resetGroupAlertCooldown();
let selfRefused = false;
try {
  await G.sendGroupAlert(alice, 'standard', [me]);
} catch (e) {
  selfRefused = e instanceof G.GroupAlertError;
}
check('picking yourself reaches nobody', selfRefused);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
