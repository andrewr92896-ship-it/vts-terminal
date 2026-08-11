// Exercises the alert-level, repeat-timing and receipt plumbing through the
// real services against a scratch database. Writes, so it refuses a database
// that already holds users (same guard as db:check-sharing).
import crypto from 'node:crypto';
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

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
