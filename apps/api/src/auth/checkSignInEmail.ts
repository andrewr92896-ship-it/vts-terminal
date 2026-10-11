// THE EMAIL CHANGE THAT WOULD LOCK THE ACCOUNT OUT, against a migrated scratch
// database. The verifier supplies the file and an allowlist naming one account
// by its EMAIL and another by its USERNAME, which is the whole point: both forms
// are legal in PRIVATE_ACCESS_USER_IDS, and only one of them survives the
// account changing its address.
//
// Why this needs a check at all. The sign-in refusal is deliberately generic —
// "Invalid email or password" — so an account that saved an address the
// allowlist does not name is locked out of a working terminal with the right
// password and nothing anywhere saying why. It is the exact invisible lockout
// the three-form allowlist was built to prevent, arriving by the one route it
// did not cover, and it is invisible in a typecheck and in a passing login.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { users, type UserRow } from '../db/schema.js';
import { authRoutes } from '../routes/auth.js';
import { loadUser } from './middleware.js';
import { hashPassword } from './passwords.js';
import { createSession, SESSION_COOKIE } from './sessions.js';
import { isPrivateUserAllowed, wouldRemainAdmitted } from './privateAccess.js';
import { updateUser } from '../admin/service.js';
import type { LoginOtpMessage, LoginTwoFactorDelivery } from './twoFactor.js';

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

// These two addresses and this username are what the verifier puts in the
// allowlist. Keep them in step with scripts/verify-db.mjs.
const BY_EMAIL_ID = '33333333-3333-4333-8333-333333333333';
const BY_USERNAME_ID = '44444444-4444-4444-8444-444444444444';
const ADMITTED_EMAIL = 'admitted-by-email@example.com';
const ADMITTED_USERNAME = 'admitted-by-username';
const PASSWORD = 'Current-password-1!';

const now = new Date();
const base = {
  avatar: null,
  passwordHash: await hashPassword(PASSWORD),
  role: 'Viewer' as const,
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
  twoFactorEnabled: false,
  // Both accounts are being asked for a new address, which is the situation.
  mustUpdateEmail: true,
  termsAcceptedVersion: null,
  termsAcceptedAt: null,
  createdAt: now,
  updatedAt: now,
};

await db.insert(users).values([
  {
    ...base,
    id: BY_EMAIL_ID,
    username: 'by-email-user',
    createdUsername: 'by-email-user',
    displayName: 'Admitted By Email',
    email: ADMITTED_EMAIL,
  },
  {
    ...base,
    id: BY_USERNAME_ID,
    username: ADMITTED_USERNAME,
    createdUsername: ADMITTED_USERNAME,
    displayName: 'Admitted By Username',
    email: 'by-username-user@example.com',
  },
]);

const byEmail = (await db.select().from(users).where(eq(users.id, BY_EMAIL_ID)).limit(1))[0] as UserRow;
const byUsername = (await db.select().from(users).where(eq(users.id, BY_USERNAME_ID)).limit(1))[0] as UserRow;

class SilentDelivery implements LoginTwoFactorDelivery {
  configured(): boolean {
    return true;
  }
  async send(_message: LoginOtpMessage): Promise<boolean> {
    return true;
  }
}

const app = Fastify({ logger: false });
await app.register(cookie, { secret: config.SESSION_SECRET });
app.decorateRequest('currentUser', null);
app.addHook('onRequest', loadUser);
await app.register(authRoutes, { twoFactorDelivery: new SilentDelivery() });

function signed(name: string, raw: string): string {
  return `${name}=${encodeURIComponent(app.signCookie(raw))}`;
}

async function changeEmail(userId: string, email: string) {
  const session = await createSession(userId, 'synthetic-browser');
  return app.inject({
    method: 'PATCH',
    url: '/api/auth/profile',
    headers: { cookie: signed(SESSION_COOKIE, session.token) },
    payload: { email },
    remoteAddress: '192.0.2.70',
  });
}

console.log('\nThe allowlist admits all three forms');
check('an account named by its email is admitted', isPrivateUserAllowed(byEmail));
check('an account named by its username is admitted', isPrivateUserAllowed(byUsername));
check('an account named by neither is refused',
  !isPrivateUserAllowed({ id: 'no-such-id', username: 'nobody', email: 'nobody@example.com' }));

console.log('\nWould the account still be admitted?');
check('moving the address of an account named by its USERNAME keeps it admitted',
  wouldRemainAdmitted(byUsername, 'personal@example.com'));
check('moving the address of an account named by its EMAIL does NOT',
  !wouldRemainAdmitted(byEmail, 'personal@example.com'));
check('...and keeping the same address obviously does',
  wouldRemainAdmitted(byEmail, ADMITTED_EMAIL));

console.log('\nThe change is refused rather than applied');
const refused = await changeEmail(BY_EMAIL_ID, 'personal@example.com');
const stillThere = (await db.select().from(users).where(eq(users.id, BY_EMAIL_ID)).limit(1))[0]!;
check('an address that would drop the account out of the allowlist is refused',
  refused.statusCode === 400, { status: refused.statusCode, body: refused.body });
check('...with a reason naming what is wrong rather than a generic failure',
  refused.statusCode === 400 && /admitted|lock/i.test(refused.body), { body: refused.body });
check('...and the stored address is untouched', stillThere.email === ADMITTED_EMAIL);
check('...so the prompt keeps asking', stillThere.mustUpdateEmail === true);
check('...and the account can still sign in',
  (await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: ADMITTED_EMAIL, password: PASSWORD },
    remoteAddress: '192.0.2.71',
  })).statusCode === 200);

console.log('\nAnd allowed where it is safe');
const allowed = await changeEmail(BY_USERNAME_ID, 'personal@example.com');
const moved = (await db.select().from(users).where(eq(users.id, BY_USERNAME_ID)).limit(1))[0]!;
check('an account named by its username may move its address',
  allowed.statusCode === 200, { status: allowed.statusCode, body: allowed.body });
check('...the new address is stored', moved.email === 'personal@example.com');
check('...the prompt stops asking', moved.mustUpdateEmail === false);
check('...and the new address signs in',
  (await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'personal@example.com', password: PASSWORD },
    remoteAddress: '192.0.2.72',
  })).statusCode === 200);

// THE ADMIN PATH IS GUARDED TOO. An admin moving somebody else's address can
// lock them out in exactly the same invisible way, and an admin is the one who
// can repair the allowlist — so the refusal there names the order to do it in
// rather than leaving a dead end.
console.log('\nAnd an admin cannot do it by the back door either');
await db.update(users).set({ email: ADMITTED_EMAIL }).where(eq(users.id, BY_EMAIL_ID));
let adminRefused = false;
let adminMessage = '';
try {
  await updateUser(BY_USERNAME_ID, BY_EMAIL_ID, { email: 'personal2@example.com' });
} catch (err) {
  adminRefused = true;
  adminMessage = err instanceof Error ? err.message : String(err);
}
const afterAdmin = (await db.select().from(users).where(eq(users.id, BY_EMAIL_ID)).limit(1))[0]!;
check('an admin is refused the same change', adminRefused, { message: adminMessage });
check('...with the remedy named', /PRIVATE_ACCESS_USER_IDS/.test(adminMessage), { message: adminMessage });
check('...and the address is untouched', afterAdmin.email === ADMITTED_EMAIL);

await app.close();
console.log(failures === 0 ? '\nAll sign-in email checks passed.' :
  `\n${failures} sign-in email check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
