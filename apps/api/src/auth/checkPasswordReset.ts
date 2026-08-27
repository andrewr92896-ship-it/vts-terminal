// Exercises password recovery through the real service and auth routes against
// a scratch database. The root verifier provisions and migrates that database;
// this file refuses to run if it already contains a user.
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { passwordResetCredentials, sessions, users, type UserRow } from '../db/schema.js';
import { authRoutes, FORGOT_PASSWORD_RESPONSE } from '../routes/auth.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { loadUser } from './middleware.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  promotePasswordResetCredential,
  requestPasswordReset,
  type PasswordResetDelivery,
  type PasswordResetMessage,
} from './passwordReset.js';
import { PasswordResetRateLimiter } from './passwordResetRateLimit.js';
import { createSession } from './sessions.js';

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

const ADMITTED_ID = '11111111-1111-4111-8111-111111111111';
const CURRENT_PASSWORD = 'Current-password-1!';

async function addUser(input: {
  id?: string;
  username: string;
  email: string | null;
  active?: boolean;
  displayName?: string;
}): Promise<UserRow> {
  const now = new Date();
  const row: typeof users.$inferInsert = {
    id: input.id ?? crypto.randomUUID(),
    username: input.username,
    createdUsername: input.username,
    displayName: input.displayName ?? input.username,
    email: input.email,
    avatar: null,
    passwordHash: await hashPassword(CURRENT_PASSWORD),
    role: 'Viewer',
    roles: JSON.stringify(['member']),
    badges: null,
    displayTimezone: null,
    hideFromLeaderboards: false,
    homeWorkspace: null,
    homeScreen: null,
    teamId: null,
    viewBrokerage: false,
    active: input.active ?? true,
    mustChangePassword: false,
    termsAcceptedVersion: null,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(row);
  return (await db.select().from(users).where(eq(users.id, row.id)).limit(1))[0]!;
}

class CaptureDelivery implements PasswordResetDelivery {
  messages: PasswordResetMessage[] = [];
  sends = 0;

  constructor(private readonly available = true, private readonly succeeds = true) {}
  configured(): boolean { return this.available; }
  async send(message: PasswordResetMessage): Promise<boolean> {
    this.sends += 1;
    this.messages.push(message);
    return this.succeeds;
  }
}

async function eventually(condition: () => boolean | Promise<boolean>, timeoutMs = 4_000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

const admitted = await addUser({
  id: ADMITTED_ID,
  username: 'alice',
  email: 'alice@example.com',
  displayName: '<img src=x onerror=alert(1)>',
});
await addUser({ username: 'inactive', email: 'inactive@example.com', active: false });
await addUser({ username: 'not-admitted', email: 'outside@example.com' });
await addUser({ username: DEMO_USERNAME, email: 'demo@example.com' });

console.log('\nGeneric response and enumeration resistance');
const routeDelivery = new CaptureDelivery(true, false);
const limiter = new PasswordResetRateLimiter({
  email: { cooldownMs: 0, maxInWindow: 100 },
  ip: { cooldownMs: 0, maxInWindow: 100 },
});
const app = Fastify({ logger: false });
await app.register(cookie, { secret: 'test-session-secret-that-is-long-enough' });
app.decorateRequest('currentUser', null);
app.addHook('onRequest', loadUser);
await app.register(authRoutes, { passwordResetDelivery: routeDelivery, passwordResetLimiter: limiter });

const forgot = (email: unknown, ip = '203.0.113.8') =>
  app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email }, remoteAddress: ip });
const genericBody = JSON.stringify(FORGOT_PASSWORD_RESPONSE);
for (const [label, email] of [
  ['missing account', 'nobody@example.com'],
  ['inactive account', 'inactive@example.com'],
  ['private-allowlist denial', 'outside@example.com'],
  ['demo identity', 'demo@example.com'],
  ['malformed email', 'not an email'],
] as const) {
  const response = await forgot(email);
  check(`${label} returns the generic 202`, response.statusCode === 202 && response.body === genericBody, {
    status: response.statusCode,
    body: response.body,
  });
}
const failedSendResponse = await forgot('alice@example.com');
check('delivery failure returns the identical generic 202',
  failedSendResponse.statusCode === 202 && failedSendResponse.body === genericBody);
check('delivery failure completed in the background', await eventually(() => routeDelivery.sends === 1));
check('failed delivery rolled the pending row back',
  (await db.select().from(passwordResetCredentials).where(eq(passwordResetCredentials.userId, admitted.id))).length === 0);
check('the working password was not changed by a failed request',
  await verifyPassword((await db.select().from(users).where(eq(users.id, admitted.id)).limit(1))[0]!.passwordHash, CURRENT_PASSWORD));

const unconfiguredDelivery = new CaptureDelivery(false, true);
const unconfiguredApp = Fastify({ logger: false });
await unconfiguredApp.register(cookie, { secret: 'test-session-secret-that-is-long-enough' });
await unconfiguredApp.register(authRoutes, {
  passwordResetDelivery: unconfiguredDelivery,
  passwordResetLimiter: new PasswordResetRateLimiter({
    email: { cooldownMs: 0, maxInWindow: 100 }, ip: { cooldownMs: 0, maxInWindow: 100 },
  }),
});
const unconfiguredResponse = await unconfiguredApp.inject({
  method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'alice@example.com' }, remoteAddress: '203.0.113.9',
});
check('no provider returns the identical generic 202',
  unconfiguredResponse.statusCode === 202 && unconfiguredResponse.body === genericBody);
check('no provider never invokes the mail fallback', unconfiguredDelivery.sends === 0);

console.log('\nPending credential, replacement, expiry, and rollback');
const successfulDelivery = new CaptureDelivery();
check('an eligible request is delivered',
  await requestPasswordReset(' Alice@Example.COM ', successfulDelivery) === 'sent');
const firstPending = (await db.select().from(passwordResetCredentials).where(eq(passwordResetCredentials.userId, admitted.id)).limit(1))[0]!;
const firstPlain = successfulDelivery.messages.at(-1)!.temporaryPassword;
check('only an Argon2 hash is stored',
  firstPending.passwordHash !== firstPlain && firstPending.passwordHash.startsWith('$argon2id$'));
check('the stored hash verifies the mailed password', await verifyPassword(firstPending.passwordHash, firstPlain));
check('the pending credential uses the configured 15-minute expiry',
  firstPending.expiresAt.getTime() - firstPending.createdAt.getTime() === 15 * 60_000);
check('user-derived display HTML is absent from the plain-text mail contract',
  !JSON.stringify(successfulDelivery.messages.at(-1)).includes('<img'));
const passwordBeforeReplacement = (await db.select().from(users).where(eq(users.id, admitted.id)).limit(1))[0]!.passwordHash;

check('a newer request is delivered', await requestPasswordReset('alice@example.com', successfulDelivery) === 'sent');
const secondPending = (await db.select().from(passwordResetCredentials).where(eq(passwordResetCredentials.userId, admitted.id)).limit(1))[0]!;
const secondPlain = successfulDelivery.messages.at(-1)!.temporaryPassword;
check('newer request replaces the older row', secondPending.id !== firstPending.id);
check('older temporary password no longer matches', !(await verifyPassword(secondPending.passwordHash, firstPlain)));
check('current password remains untouched while recovery is pending',
  passwordBeforeReplacement === (await db.select().from(users).where(eq(users.id, admitted.id)).limit(1))[0]!.passwordHash);

await db.update(passwordResetCredentials).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(passwordResetCredentials.id, secondPending.id));
check('expired credential cannot promote',
  await promotePasswordResetCredential(admitted, secondPlain) === null);
check('expired credential is cleaned up',
  (await db.select().from(passwordResetCredentials).where(eq(passwordResetCredentials.userId, admitted.id))).length === 0);

const failedDelivery = new CaptureDelivery(true, false);
check('send failure reports only an internal failure result',
  await requestPasswordReset('alice@example.com', failedDelivery) === 'delivery-failed');
check('send failure leaves no credential behind',
  (await db.select().from(passwordResetCredentials).where(eq(passwordResetCredentials.userId, admitted.id))).length === 0);

console.log('\nRate limiting and bounded memory');
const tight = new PasswordResetRateLimiter({
  email: { cooldownMs: 1_000, windowMs: 10_000, maxInWindow: 2 },
  ip: { cooldownMs: 0, windowMs: 10_000, maxInWindow: 20 },
  maxEntries: 100,
});
check('first mailbox request is allowed', tight.take('198.51.100.1', 'rate@example.com', 1_000));
check('mailbox cooldown blocks the immediate repeat', !tight.take('198.51.100.2', 'rate@example.com', 1_500));
check('mailbox request is allowed after cooldown', tight.take('198.51.100.2', 'rate@example.com', 2_100));
check('mailbox window cap blocks further sends', !tight.take('198.51.100.3', 'rate@example.com', 4_000));
const ipTight = new PasswordResetRateLimiter({
  email: { cooldownMs: 0, windowMs: 10_000, maxInWindow: 20 },
  ip: { cooldownMs: 0, windowMs: 10_000, maxInWindow: 2 },
});
check('IP budget allows its first two distinct mailboxes',
  ipTight.take('198.51.100.50', 'one@example.com', 1_000) &&
  ipTight.take('198.51.100.50', 'two@example.com', 1_001));
check('IP window cap blocks mailbox cycling',
  !ipTight.take('198.51.100.50', 'three@example.com', 1_002));
for (let i = 0; i < 180; i += 1) tight.take(`192.0.2.${i}`, `person-${i}@example.com`, 20_000 + i);
const sizes = tight.sizes();
check('rate-limit memory remains bounded', sizes.emails <= 100 && sizes.ips <= 100, sizes);

const routeTight = new PasswordResetRateLimiter({
  email: { cooldownMs: 60_000, maxInWindow: 1 },
  ip: { cooldownMs: 0, maxInWindow: 10 },
});
const limitedDelivery = new CaptureDelivery();
const limitedApp = Fastify({ logger: false });
await limitedApp.register(cookie, { secret: 'test-session-secret-that-is-long-enough' });
await limitedApp.register(authRoutes, { passwordResetDelivery: limitedDelivery, passwordResetLimiter: routeTight });
const limitedOne = await limitedApp.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'alice@example.com' } });
const limitedTwo = await limitedApp.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'alice@example.com' } });
check('limited and allowed HTTP responses are indistinguishable',
  limitedOne.statusCode === 202 && limitedTwo.statusCode === 202 && limitedOne.body === limitedTwo.body && limitedTwo.body === genericBody);
check('mailbox limit prevents a second delivery', await eventually(() => limitedDelivery.sends === 1));

console.log('\nSuccessful temporary login and forced change');
// Let the limited request finish, then replace it with the credential this test
// controls and captures.
await eventually(async () =>
  (await db.select().from(passwordResetCredentials).where(eq(passwordResetCredentials.userId, admitted.id))).length === 1);
const loginDelivery = new CaptureDelivery();
check('temporary login credential is issued', await requestPasswordReset('alice@example.com', loginDelivery) === 'sent');
const temporaryPassword = loginDelivery.messages.at(-1)!.temporaryPassword;
await createSession(admitted.id, 'old-browser-one');
await createSession(admitted.id, 'old-browser-two');

const loginResponse = await app.inject({
  method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: temporaryPassword },
});
check('temporary credential signs in', loginResponse.statusCode === 200, loginResponse.body);
const loginBody = loginResponse.json<{ user: { mustChangePassword: boolean } }>();
check('temporary login forces Change Password', loginBody.user.mustChangePassword === true, loginBody);
check('reset row is consumed after promotion',
  (await db.select().from(passwordResetCredentials).where(eq(passwordResetCredentials.userId, admitted.id))).length === 0);
check('older sessions are revoked before the new login is created',
  (await db.select().from(sessions).where(eq(sessions.userId, admitted.id))).length === 1);

const promotedUser = (await db.select().from(users).where(eq(users.id, admitted.id)).limit(1))[0]!;
check('promoted account hash accepts the temporary password',
  await verifyPassword(promotedUser.passwordHash, temporaryPassword));
check('consumed reset record cannot be promoted a second time',
  await promotePasswordResetCredential(promotedUser, temporaryPassword) === null);

const setCookie = loginResponse.headers['set-cookie'];
const sessionCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
await createSession(admitted.id, 'another-old-browser');
const newPassword = 'A-new-permanent-password-2!';
const changeResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/change-password',
  headers: { cookie: sessionCookie },
  payload: { currentPassword: temporaryPassword, newPassword },
});
check('forced Change Password accepts the promoted temporary password', changeResponse.statusCode === 200, changeResponse.body);
check('forced change clears the must-change flag',
  changeResponse.json<{ user: { mustChangePassword: boolean } }>().user.mustChangePassword === false);
const finalUser = (await db.select().from(users).where(eq(users.id, admitted.id)).limit(1))[0]!;
check('new permanent password is stored', await verifyPassword(finalUser.passwordHash, newPassword));
check('the current response session survives while other sessions are revoked',
  (await db.select().from(sessions).where(eq(sessions.userId, admitted.id))).length === 1);
check('the surviving session is the cookie that completed the change',
  (await db.select().from(sessions).where(and(eq(sessions.userId, admitted.id), eq(sessions.userAgent, 'another-old-browser')))).length === 0);

await Promise.all([app.close(), unconfiguredApp.close(), limitedApp.close()]);
console.log(failures === 0 ? '\nAll password reset checks passed.' : `\n${failures} password reset check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
