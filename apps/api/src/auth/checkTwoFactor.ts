// End-to-end terminal email two-factor checks against a migrated scratch database.
// The verifier supplies this process with a fresh file and AUTH_REQUIRE_2FA=true.
// Delivery is always fake: no provider or live mailbox is contacted.
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import {
  loginChallenges,
  sessions,
  terminalAuthLimits,
  terminalTrustedDevices,
  users,
  type UserRow,
} from '../db/schema.js';
import { authRoutes } from '../routes/auth.js';
import { loadUser } from './middleware.js';
import { hashPassword } from './passwords.js';
import { createSession, SESSION_COOKIE } from './sessions.js';
import {
  LOGIN_CHALLENGE_COOKIE,
  TERMINAL_DEVICE_COOKIE,
  forgetTerminalAuthForUser,
  generateLoginOtp,
  hashLoginOtp,
  loginOtpMatches,
  rememberTerminalDevice,
  verifyLoginChallenge,
  type LoginOtpMessage,
  type LoginTwoFactorDelivery,
} from './twoFactor.js';
import {
  checkTerminalAuthLock,
  recordTerminalAuthFailure,
  reserveTerminalTwoFactorSend,
} from './twoFactorRateLimit.js';

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const existing = await db.select({ id: users.id }).from(users).limit(1);
if (existing.length) {
  console.error('Refusing to run against a database that already has users.');
  process.exit(2);
}

const USER_ID = '22222222-2222-4222-8222-222222222222';
let password = 'Current-password-1!';
const now = new Date();
const insert: typeof users.$inferInsert = {
  id: USER_ID,
  username: 'two-factor-user',
  createdUsername: 'two-factor-user',
  displayName: 'Two Factor Test',
  email: 'two-factor-user@example.com',
  avatar: null,
  passwordHash: await hashPassword(password),
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
  // The emailed code is per-account now, so the account under test has to have
  // asked for it — AUTH_REQUIRE_2FA alone no longer challenges anybody.
  twoFactorEnabled: true,
  mustUpdateEmail: false,
  termsAcceptedVersion: null,
  termsAcceptedAt: null,
  createdAt: now,
  updatedAt: now,
};
await db.insert(users).values(insert);
const user = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0] as UserRow;

class FakeDelivery implements LoginTwoFactorDelivery {
  messages: LoginOtpMessage[] = [];
  available = true;
  succeeds = true;

  configured(): boolean {
    return this.available;
  }

  async send(message: LoginOtpMessage): Promise<boolean> {
    this.messages.push(message);
    return this.succeeds;
  }
}

const delivery = new FakeDelivery();
const app = Fastify({ logger: false });
await app.register(cookie, { secret: config.SESSION_SECRET });
app.decorateRequest('currentUser', null);
app.addHook('onRequest', loadUser);
await app.register(authRoutes, { twoFactorDelivery: delivery });

type InjectResponse = Awaited<ReturnType<typeof app.inject>>;

function setCookies(response: InjectResponse): string[] {
  const value = response.headers['set-cookie'];
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function cookiePair(response: InjectResponse, name: string): string {
  return setCookies(response).map((value) => value.split(';')[0]!).find((value) => value.startsWith(`${name}=`)) ?? '';
}

function rawSignedCookie(pair: string): string {
  const encoded = pair.slice(pair.indexOf('=') + 1);
  const unsigned = app.unsignCookie(decodeURIComponent(encoded));
  if (!unsigned.valid || !unsigned.value) throw new Error('Expected a valid signed cookie');
  return unsigned.value;
}

function signedCookiePair(name: string, raw: string): string {
  return `${name}=${encodeURIComponent(app.signCookie(raw))}`;
}

async function resetAuthState(): Promise<void> {
  await Promise.all([
    db.delete(sessions),
    db.delete(loginChallenges),
    db.delete(terminalTrustedDevices),
    db.delete(terminalAuthLimits),
  ]);
}

async function login(ip = '192.0.2.10'): Promise<InjectResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password },
    remoteAddress: ip,
  });
}

console.log('\nCryptographic primitives');
for (let i = 0; i < 100; i += 1) check('generated code is six digits', /^\d{6}$/.test(generateLoginOtp()));
const contextHash = hashLoginOtp('challenge-a', '123456');
check('code digest is fixed length', contextHash.length === 64);
check('correct code matches in its challenge context', loginOtpMatches(contextHash, '123456', 'challenge-a'));
check('wrong code does not match', !loginOtpMatches(contextHash, '123457', 'challenge-a'));
check('same code cannot be transplanted to another challenge',
  !loginOtpMatches(contextHash, '123456', 'challenge-b'));

console.log('\nChallenge issuance and pre-auth isolation');
const issued = await login();
check('valid password starts a second-factor challenge',
  issued.statusCode === 200 && issued.json<{ requiresTwoFactor: boolean }>().requiresTwoFactor === true,
  { status: issued.statusCode, body: issued.body });
const challengeCookie = cookiePair(issued, LOGIN_CHALLENGE_COOKIE);
check('challenge uses its own signed cookie', !!challengeCookie && !cookiePair(issued, SESSION_COOKIE));
check('no application session exists before verification', (await db.select().from(sessions)).length === 0);
const meWithChallenge = await app.inject({
  method: 'GET', url: '/api/auth/me', headers: { cookie: challengeCookie },
});
check('challenge cookie grants no authenticated API access', meWithChallenge.statusCode === 401);
const issuedRow = (await db.select().from(loginChallenges).limit(1))[0]!;
const firstCode = delivery.messages.at(-1)!.code;
check('plaintext code is not stored', issuedRow.codeHash !== firstCode && !JSON.stringify(issuedRow).includes(firstCode));
check('challenge token is stored only as a digest', issuedRow.id.length === 64);
check('destination hint is masked',
  issued.json<{ sentTo: string }>().sentTo !== user.email &&
  !issued.json<{ sentTo: string }>().sentTo.startsWith('two-factor-user@'));

console.log('\nWrong, expired, spent, and single-use codes');
const oneWrong = await app.inject({
  method: 'POST',
  url: '/api/auth/two-factor/verify',
  headers: { cookie: challengeCookie },
  payload: { code: '000000' },
  remoteAddress: '192.0.2.10',
});
check('wrong code is rejected without a session',
  oneWrong.statusCode === 401 && (await db.select().from(sessions)).length === 0);
await resetAuthState();
const spentLogin = await login('192.0.2.11');
const spentPair = cookiePair(spentLogin, LOGIN_CHALLENGE_COOKIE);
const spentRaw = rawSignedCookie(spentPair);
for (let i = 0; i < 4; i += 1) {
  const result = await verifyLoginChallenge(spentRaw, '000000');
  check(`wrong guess ${i + 1} is rejected`, !result.ok && result.reason === 'invalid');
}
const spent = await verifyLoginChallenge(spentRaw, '000000');
check('fifth wrong guess burns the challenge', !spent.ok && spent.reason === 'attempts');
check('spent challenge row is removed', (await db.select().from(loginChallenges)).length === 0);

await resetAuthState();
const expiredLogin = await login('192.0.2.12');
const expiredPair = cookiePair(expiredLogin, LOGIN_CHALLENGE_COOKIE);
const expiredCode = delivery.messages.at(-1)!.code;
await db.update(loginChallenges).set({ expiresAt: new Date(Date.now() - 1) });
const expired = await app.inject({
  method: 'POST',
  url: '/api/auth/two-factor/verify',
  headers: { cookie: expiredPair },
  payload: { code: expiredCode },
  remoteAddress: '192.0.2.12',
});
check('expired code is rejected and creates no session',
  expired.statusCode === 401 && (await db.select().from(sessions)).length === 0);

await resetAuthState();
const raceLogin = await login('192.0.2.13');
const raceRaw = rawSignedCookie(cookiePair(raceLogin, LOGIN_CHALLENGE_COOKIE));
const raceCode = delivery.messages.at(-1)!.code;
const race = await Promise.all([
  verifyLoginChallenge(raceRaw, raceCode),
  verifyLoginChallenge(raceRaw, raceCode),
]);
check('concurrent verification consumes exactly once',
  race.filter((result) => result.ok).length === 1, race);

console.log('\nSuccessful verification, replay, and remembered-device expiry');
await resetAuthState();
const successLogin = await login('192.0.2.20');
const successChallenge = cookiePair(successLogin, LOGIN_CHALLENGE_COOKIE);
const successCode = delivery.messages.at(-1)!.code;
const success = await app.inject({
  method: 'POST',
  url: '/api/auth/two-factor/verify',
  headers: { cookie: successChallenge },
  payload: { code: successCode, remember: true },
  remoteAddress: '192.0.2.20',
});
check('correct code creates one application session',
  success.statusCode === 200 && (await db.select().from(sessions)).length === 1,
  { status: success.statusCode, body: success.body });
const devicePair = cookiePair(success, TERMINAL_DEVICE_COOKIE);
const trust = (await db.select().from(terminalTrustedDevices).limit(1))[0]!;
check('remembered token is hashed and scoped to the account',
  !!devicePair && trust.id.length === 64 && trust.userId === USER_ID);
check('remembered trust expires at exactly 30 days',
  trust.expiresAt.getTime() - trust.createdAt.getTime() === 30 * 24 * 60 * 60_000);
const sessionCount = (await db.select().from(sessions)).length;
const replay = await app.inject({
  method: 'POST',
  url: '/api/auth/two-factor/verify',
  headers: { cookie: successChallenge },
  payload: { code: successCode },
  remoteAddress: '192.0.2.20',
});
check('replayed code is rejected without another session',
  replay.statusCode === 401 && (await db.select().from(sessions)).length === sessionCount);

await db.delete(sessions);
const messagesBeforeRemembered = delivery.messages.length;
const rememberedLogin = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  headers: { cookie: devicePair },
  payload: { email: user.email, password },
  remoteAddress: '192.0.2.20',
});
check('remembered device skips only the emailed step',
  rememberedLogin.statusCode === 200 &&
  rememberedLogin.json<{ requiresTwoFactor: boolean }>().requiresTwoFactor === false &&
  delivery.messages.length === messagesBeforeRemembered);
check('remembered login still requires the password',
  (await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { cookie: devicePair },
    payload: { email: user.email, password: 'wrong-password' },
    remoteAddress: '192.0.2.20',
  })).statusCode === 401);

await db.delete(sessions);
await db.delete(loginChallenges);
await db.delete(terminalAuthLimits);
await db.update(terminalTrustedDevices).set({ expiresAt: new Date(Date.now() - 1) });
const expiredDeviceLogin = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  headers: { cookie: devicePair },
  payload: { email: user.email, password },
  remoteAddress: '192.0.2.21',
});
check('expired remembered device requires a fresh code',
  expiredDeviceLogin.statusCode === 200 &&
  expiredDeviceLogin.json<{ requiresTwoFactor: boolean }>().requiresTwoFactor === true);

console.log('\nResend and durable abuse limits');
await resetAuthState();
const resendLogin = await login('192.0.2.30');
const resendPair = cookiePair(resendLogin, LOGIN_CHALLENGE_COOKIE);
const oldCode = delivery.messages.at(-1)!.code;
const earlyResend = await app.inject({
  method: 'POST',
  url: '/api/auth/two-factor/resend',
  headers: { cookie: resendPair },
  remoteAddress: '192.0.2.30',
});
check('immediate resend is throttled', earlyResend.statusCode === 429);
await db.update(loginChallenges).set({ sentAt: new Date(Date.now() - 31_000) });
await db.update(terminalAuthLimits).set({
  lastSentAt: new Date(Date.now() - 31_000),
  sendCount: 1,
  sendWindowStartedAt: new Date(),
});
const resent = await app.inject({
  method: 'POST',
  url: '/api/auth/two-factor/resend',
  headers: { cookie: resendPair },
  remoteAddress: '192.0.2.30',
});
const newCode = delivery.messages.at(-1)!.code;
check('resend succeeds after cooldown and replaces the code',
  resent.statusCode === 200 && newCode !== oldCode);
check('code replaced by resend no longer works',
  !(await verifyLoginChallenge(rawSignedCookie(resendPair), oldCode)).ok);
check('replacement code remains usable',
  (await verifyLoginChallenge(rawSignedCookie(resendPair), newCode)).ok);

await resetAuthState();
const sendBase = new Date('2030-01-01T00:00:00.000Z');
let userBudgetAllowed = true;
for (let i = 0; i < 5; i += 1) {
  const result = await reserveTerminalTwoFactorSend(USER_ID, `192.0.2.${40 + i}`,
    new Date(sendBase.getTime() + i * 31_000));
  userBudgetAllowed &&= result.ok;
}
const userBurst = await reserveTerminalTwoFactorSend(
  USER_ID,
  '192.0.2.99',
  new Date(sendBase.getTime() + 5 * 31_000),
);
check('per-account hourly send budget blocks mailbox flooding', userBudgetAllowed && !userBurst.ok);

await db.delete(terminalAuthLimits);
let ipBudgetAllowed = true;
for (let i = 0; i < 20; i += 1) {
  const result = await reserveTerminalTwoFactorSend(
    `synthetic-user-${i}`,
    '198.51.100.44',
    new Date(sendBase.getTime() + i * 1_100),
  );
  ipBudgetAllowed &&= result.ok;
}
const ipBurst = await reserveTerminalTwoFactorSend(
  'synthetic-user-overflow',
  '198.51.100.44',
  new Date(sendBase.getTime() + 20 * 1_100),
);
check('per-IP hourly send budget blocks account cycling', ipBudgetAllowed && !ipBurst.ok);

await db.delete(terminalAuthLimits);
for (let i = 0; i < 5; i += 1) {
  await recordTerminalAuthFailure('user:locked-test', '203.0.113.44',
    new Date(sendBase.getTime() + i * 100));
}
check('verification failures create a durable account/IP lock',
  (await checkTerminalAuthLock('user:locked-test', '203.0.113.44',
    new Date(sendBase.getTime() + 1_000))).locked);

console.log('\nSafe delivery failure, logout, and security invalidation');
await resetAuthState();
delivery.succeeds = false;
const failedMail = await login('192.0.2.50');
check('mail failure fails closed without a challenge or session',
  failedMail.statusCode === 503 &&
  (await db.select().from(loginChallenges)).length === 0 &&
  (await db.select().from(sessions)).length === 0);
delivery.succeeds = true;

await resetAuthState();
const remembered = await rememberTerminalDevice(USER_ID, {
  ip: '192.0.2.51',
  userAgent: 'synthetic-browser',
});
const active = await createSession(USER_ID, 'synthetic-browser');
const logout = await app.inject({
  method: 'POST',
  url: '/api/auth/logout',
  headers: {
    cookie: [
      signedCookiePair(TERMINAL_DEVICE_COOKIE, remembered.token),
      signedCookiePair(SESSION_COOKIE, active.token),
    ].join('; '),
  },
  remoteAddress: '192.0.2.51',
});
check('logout revokes the current session and remembered trust',
  logout.statusCode === 200 &&
  (await db.select().from(sessions)).length === 0 &&
  (await db.select().from(terminalTrustedDevices)).length === 0);
check('logout clears both auth cookies',
  setCookies(logout).some((value) => value.startsWith(`${SESSION_COOKIE}=`)) &&
  setCookies(logout).some((value) => value.startsWith(`${TERMINAL_DEVICE_COOKIE}=`)));

await resetAuthState();
const invalidationLogin = await login('192.0.2.52');
const invalidationPair = cookiePair(invalidationLogin, LOGIN_CHALLENGE_COOKIE);
const invalidationCode = delivery.messages.at(-1)!.code;
await rememberTerminalDevice(USER_ID, { ip: '192.0.2.52' });
await forgetTerminalAuthForUser(USER_ID);
const invalidated = await app.inject({
  method: 'POST',
  url: '/api/auth/two-factor/verify',
  headers: { cookie: invalidationPair },
  payload: { code: invalidationCode },
  remoteAddress: '192.0.2.52',
});
check('security invalidation removes pending challenges and remembered trust',
  invalidated.statusCode === 401 &&
  (await db.select().from(loginChallenges)).length === 0 &&
  (await db.select().from(terminalTrustedDevices)).length === 0);

await resetAuthState();
const trustBeforePasswordChange = await rememberTerminalDevice(USER_ID, { ip: '192.0.2.53' });
const sessionBeforePasswordChange = await createSession(USER_ID, 'synthetic-browser');
const nextPassword = 'Next-permanent-password-2!';
const changed = await app.inject({
  method: 'POST',
  url: '/api/auth/change-password',
  headers: { cookie: signedCookiePair(SESSION_COOKIE, sessionBeforePasswordChange.token) },
  payload: { currentPassword: password, newPassword: nextPassword },
  remoteAddress: '192.0.2.53',
});
check('password change revokes remembered trust',
  changed.statusCode === 200 &&
  (await db.select().from(terminalTrustedDevices).where(eq(terminalTrustedDevices.userId, USER_ID))).length === 0,
  { status: changed.statusCode, body: changed.body, tokenLength: trustBeforePasswordChange.token.length });
password = nextPassword;

// THE CODE IS AN OPT-IN, AND OFF IS THE DEFAULT.
//
// This is the property the whole change rests on: the code is emailed to the
// account's own address, so a mandatory one means an account whose mailbox is
// closing cannot sign in at all. AUTH_REQUIRE_2FA is true for this whole
// process, so the only thing deciding below is the account's own flag.
console.log('\nThe code is the account\'s own choice');
await resetAuthState();
await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, USER_ID));
const optedOut = await login('192.0.2.60');
check('an account with the code off signs in on the password alone',
  optedOut.statusCode === 200 &&
  optedOut.json<{ requiresTwoFactor: boolean }>().requiresTwoFactor === false,
  { status: optedOut.statusCode, body: optedOut.body });
check('...and gets a real session rather than a challenge',
  !!cookiePair(optedOut, SESSION_COOKIE) && !cookiePair(optedOut, LOGIN_CHALLENGE_COOKIE));
check('...with nothing emailed to the address that is going away',
  (await db.select().from(loginChallenges)).length === 0);

await resetAuthState();
await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, USER_ID));
const optedIn = await login('192.0.2.61');
check('an account that asked for the code is still challenged',
  optedIn.statusCode === 200 &&
  optedIn.json<{ requiresTwoFactor: boolean }>().requiresTwoFactor === true,
  { status: optedIn.statusCode, body: optedIn.body });

// The account is admitted by its ID in this process's allowlist, so moving its
// email cannot drop it out of the admitted set — and the prompt stops asking.
console.log('\nChanging the sign-in address');
await resetAuthState();
await db.update(users).set({ mustUpdateEmail: true }).where(eq(users.id, USER_ID));
const sessionForEmail = await createSession(USER_ID, 'synthetic-browser');
const movedEmail = await app.inject({
  method: 'PATCH',
  url: '/api/auth/profile',
  headers: { cookie: signedCookiePair(SESSION_COOKIE, sessionForEmail.token) },
  payload: { email: 'moved-on@example.com' },
  remoteAddress: '192.0.2.62',
});
const afterMove = (await db.select().from(users).where(eq(users.id, USER_ID)).limit(1))[0]!;
check('an account admitted by its ID may move its address',
  movedEmail.statusCode === 200 && afterMove.email === 'moved-on@example.com',
  { status: movedEmail.statusCode, body: movedEmail.body });
check('...and saving one stops the prompt asking', afterMove.mustUpdateEmail === false);
check('...while the trusted browser tied to the old mailbox is forgotten',
  (await db.select().from(terminalTrustedDevices).where(eq(terminalTrustedDevices.userId, USER_ID))).length === 0);

await app.close();
console.log(failures === 0 ? '\nAll terminal email two-factor checks passed.' :
  `\n${failures} terminal email two-factor check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
