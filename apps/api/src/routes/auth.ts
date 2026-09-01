import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { passwordResetCredentials, users } from '../db/schema.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../auth/passwords.js';
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroyOtherUserSessions,
  destroySession,
  sessionIdForToken,
} from '../auth/sessions.js';
import { isUsableTimezone, toPublicUser, type PublicUser } from '../auth/rbac.js';
import { LEGAL_VERSION } from '../legal/version.js';
import { requireAuth } from '../auth/middleware.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { destroyEmployeeSessionsForUser } from '../employee/sessions.js';
import { forgetAllDevices as forgetEmployeeDevices } from '../employee/trustedDevices.js';
import { isPrivateUserAllowed } from '../auth/privateAccess.js';
import { getTeamName } from '../teams/service.js';
import { featuresForUser } from '../features/service.js';
import { assertDisplayNameFree } from '../admin/service.js';
import { getMembershipView } from '../memberships/service.js';
import {
  defaultPasswordResetDelivery,
  normalizePasswordResetEmail,
  promotePasswordResetCredential,
  requestPasswordReset,
  type PasswordResetDelivery,
} from '../auth/passwordReset.js';
import {
  passwordResetRateLimiter,
  type PasswordResetRateLimiter,
} from '../auth/passwordResetRateLimit.js';
import {
  LOGIN_CHALLENGE_COOKIE,
  TERMINAL_DEVICE_COOKIE,
  beginLoginChallenge,
  challengeUser,
  destroyLoginChallenge,
  forgetTerminalAuthForUser,
  forgetTerminalDevice,
  loginChallengeCookieOptions,
  rememberTerminalDevice,
  resendLoginChallenge,
  terminalDeviceCookieOptions,
  terminalDeviceTrusted,
  verifyLoginChallenge,
  type LoginTwoFactorDelivery,
} from '../auth/twoFactor.js';
import {
  checkTerminalAuthLock,
  clearTerminalAuthFailures,
  recordTerminalAuthFailure,
} from '../auth/twoFactorRateLimit.js';

// Build the browser-safe user: the trading-team name from the user's teamId, the
// optional features they have turned on (which decides the workspaces the
// sidebar draws), and their membership (which decides what is locked inside
// them). Features and membership are separate axes on purpose — a Max member can
// still have Advanced Trading switched off, because that is a choice rather than
// a purchase.
async function publicUser(u: typeof users.$inferSelect): Promise<PublicUser> {
  const [teamName, features, membership] = await Promise.all([
    getTeamName(u.teamId),
    featuresForUser(u),
    getMembershipView(u),
  ]);
  return toPublicUser(u, teamName, features, membership);
}

// Sign-in is by email. `username` is still accepted as an optional fallback
// identifier so a legacy credential (or an account whose email is not yet set)
// keeps working during the transition; both are matched case-insensitively.
const loginSchema = z
  .object({
    email: z.string().trim().min(1).max(255).optional(),
    username: z.string().trim().min(1).max(64).optional(),
    password: z.string().min(1).max(256),
  })
  .refine((v) => !!(v.email || v.username), {
    message: 'Email and password required',
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().max(255),
});


const verifyTwoFactorSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
  remember: z.boolean().optional(),
});

export const FORGOT_PASSWORD_RESPONSE = {
  ok: true,
  message:
    'If an eligible account exists and email delivery is available, a temporary password will be sent shortly.',
} as const;


function signedCookie(request: FastifyRequest, name: string): string | undefined {
  const raw = request.cookies[name];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? unsigned.value ?? undefined : undefined;
}

export interface AuthRouteOptions {
  passwordResetDelivery?: PasswordResetDelivery;
  passwordResetLimiter?: PasswordResetRateLimiter;
  twoFactorDelivery?: LoginTwoFactorDelivery;
}

const profileSchema = z
  .object({
    username: z.string().trim().min(1).max(64).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    // Off the public study leaderboards. Set from My Terminal ▸ Preferences.
    hideFromLeaderboards: z.boolean().optional(),
    email: z.string().trim().email().max(255).optional(),
    // A client-resized profile picture as a data URL (~128px JPEG/PNG), or an
    // empty string / null to remove it. Capped to keep the inline blob small.
    avatar: z
      .string()
      .max(400_000)
      .refine((v) => v === '' || /^data:image\/(png|jpe?g|webp);base64,/.test(v), {
        message: 'Invalid image',
      })
      .nullable()
      .optional(),
    // The clock the user reads the terminal on: 'auto' to follow whichever
    // device they are on, or an IANA zone name. Checked against this runtime's
    // own Intl rather than a list, so a name the server could not format can
    // never be stored — that would blank every timestamp at once.
    displayTimezone: z
      .string()
      .trim()
      .max(64)
      .refine(isUsableTimezone, { message: 'Unknown time zone' })
      .optional(),
    // The screen the terminal opens on. Raw workspace/section keys, kept as
    // opaque strings on purpose: the server has no business knowing the client's
    // nav shape, and what a given account can reach is resolved at launch
    // anyway. Both nullable together — clearing the home page means going back
    // to the default, which is two nulls.
    homeWorkspace: z.string().trim().max(40).nullable().optional(),
    homeScreen: z.string().trim().max(40).nullable().optional(),
    // My Terminal's customization: which of its own rows are off, and which
    // sections from elsewhere are pinned on. Opaque section KEYS, for the same
    // reason the home screen above is — the server has no business knowing the
    // client's nav shape, and what this account can reach is resolved at render
    // anyway. Null clears it back to the default board. Bounded so a hand-rolled
    // request cannot store an unbounded list, and de-duplicated so a repeated
    // key cannot make one either.
    myTerminalSections: z
      .object({
        add: z.array(z.string().trim().min(1).max(40)).max(60),
        hide: z.array(z.string().trim().min(1).max(40)).max(60),
        // The arrangement. Optional because every layout stored before ordering
        // existed has no such key, and a client on an older cached bundle still
        // posts the pair — an absent order reads as "nothing positioned", which
        // renders exactly as it did before. Capped higher than the other two: it
        // holds a key per row the user has placed, and keeps the ones whose rows
        // are currently off so turning one back on restores its position.
        order: z.array(z.string().trim().min(1).max(40)).max(120).optional(),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.username != null ||
      v.displayName != null ||
      v.email != null ||
      v.avatar !== undefined ||
      v.displayTimezone != null ||
      v.homeWorkspace !== undefined ||
      v.homeScreen !== undefined ||
      v.myTerminalSections !== undefined ||
      v.hideFromLeaderboards != null,
    { message: 'Nothing to update' },
  );

export async function authRoutes(app: FastifyInstance, options: AuthRouteOptions = {}) {
  const resetDelivery = options.passwordResetDelivery ?? defaultPasswordResetDelivery;
  const resetLimiter = options.passwordResetLimiter ?? passwordResetRateLimiter;
  const twoFactorDelivery = options.twoFactorDelivery;

  app.post('/api/auth/forgot-password', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    const email = parsed.success ? normalizePasswordResetEmail(parsed.data.email) : null;
    const allowed = resetLimiter.take(request.ip ?? '', email ?? 'invalid');

    // The mailer deliberately has a log-body fallback for employee codes. This
    // route must never call it unless a real provider exists; checking here also
    // avoids even scheduling account work on an unconfigured deployment.
    if (allowed && email && resetDelivery.configured()) {
      void requestPasswordReset(email, resetDelivery)
        .then((result) => {
          // Auditable without retaining the address or ever touching the
          // plaintext. Public callers receive none of this internal outcome.
          app.log.info({ event: 'auth.password_reset', result });
        })
        .catch((error: unknown) => {
          app.log.error({ event: 'auth.password_reset', error }, 'Password reset task failed');
        });
    }

    // Malformed input, missing/inactive/disallowed account, no provider,
    // throttling, and delivery failure all converge here exactly.
    return reply.code(202).send(FORGOT_PASSWORD_RESPONSE);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Email and password required' });
    }
    const { email, username, password } = parsed.data;
    const identifier = (email ?? username)!.toLowerCase();
    const loginSubject = `login:${identifier}`;
    const ip = request.ip ?? '';
    const preLock = await checkTerminalAuthLock(loginSubject, ip);
    if (preLock.locked) {
      return reply
        .code(429)
        .header('Retry-After', String(preLock.retryAfter))
        .send({ error: 'Too many attempts. Try again later.', retryAfter: preLock.retryAfter });
    }

    // Primary: match by email. The demo account is excluded — its email column
    // stores an internal seed-version marker, not a real address. Fallback:
    // match by username so a not-yet-emailed account can still sign in.
    let rows = await db
      .select()
      .from(users)
      .where(and(eq(users.email, identifier), ne(users.username, DEMO_USERNAME)))
      .limit(1);
    let user = rows[0];
    if (!user) {
      rows = await db.select().from(users).where(eq(users.username, identifier)).limit(1);
      user = rows[0];
    }

    // Same generic error and a real Argon2 verify even when the user is missing,
    // so timing and messaging do not reveal which accounts exist.
    const permanentPasswordValid = await verifyPassword(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );
    const admitted = !!user && isPrivateUserAllowed(user);
    let credentialsValid = !!user && user.active && permanentPasswordValid;

    // A reset credential is checked only after the normal password fails. On a
    // match its Argon2 hash becomes the account password, the row is consumed,
    // must-change is set, and every older session is revoked atomically.
    if (!credentialsValid && user?.active && admitted) {
      const promoted = await promotePasswordResetCredential(user, password);
      if (promoted) {
        user = promoted;
        credentialsValid = true;
      }
    } else if (!credentialsValid) {
      // Match the reset-verification work done for an eligible account so an
      // invalid login cannot time whether the identifier is active/admitted.
      await verifyPassword(DUMMY_PASSWORD_HASH, password);
    }

    if (!credentialsValid || !admitted || !user) {
      await recordTerminalAuthFailure(loginSubject, ip);
      // The ANSWER stays generic — one message for every failure, so a stranger
      // cannot learn from it whether an address exists, is active, or is
      // admitted. That is right and does not change.
      //
      // But the SERVER has to know, and it did not. A correct password from an
      // account missing from PRIVATE_ACCESS_USER_IDS reads as "Invalid email or
      // password" with nothing anywhere saying otherwise — so the one person who
      // most needs to understand it, the owner of a private terminal locked out
      // of their own deployment, has no way to tell it from a typo. Two failures
      // that need completely different fixes, indistinguishable.
      //
      // So the reason goes to the log, where only the operator sees it. No
      // password, and no identifier the request did not already supply.
      const reason = !user
        ? 'no such account'
        : !user.active
          ? 'account is inactive'
          : !admitted
            ? 'account is not in PRIVATE_ACCESS_USER_IDS'
            : 'password did not match';
      app.log.warn(
        { userId: user?.id, reason },
        `[auth] sign-in refused: ${reason}`,
      );
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const userSubject = `user:${user.id}`;
    const userLock = await checkTerminalAuthLock(userSubject, ip);
    if (userLock.locked) {
      return reply
        .code(429)
        .header('Retry-After', String(userLock.retryAfter))
        .send({ error: 'Too many attempts. Try again later.', retryAfter: userLock.retryAfter });
    }

    // A remembered browser skips only the emailed code. The password above is
    // still required on every new session.
    const remembered = await terminalDeviceTrusted(
      user.id,
      signedCookie(request, TERMINAL_DEVICE_COOKIE),
    );
    if (config.AUTH_REQUIRE_2FA && user.username !== DEMO_USERNAME && !remembered) {
      const challenge = await beginLoginChallenge(
        user,
        { ip: request.ip, userAgent: request.headers['user-agent'] },
        twoFactorDelivery,
      );
      if (!challenge.ok) {
        if (challenge.reason === 'limited') {
          const retryAfter = challenge.retryAfter ?? 30;
          return reply
            .code(429)
            .header('Retry-After', String(retryAfter))
            .send({ error: 'Too many code requests. Try again later.', retryAfter });
        }
        return reply.code(503).send({
          error: 'A sign-in code could not be emailed. Please try again shortly.',
        });
      }
      reply.setCookie(
        LOGIN_CHALLENGE_COOKIE,
        challenge.token,
        loginChallengeCookieOptions(challenge.maxAgeSeconds),
      );
      return {
        requiresTwoFactor: true as const,
        sentTo: challenge.sentTo,
        rememberDays: config.AUTH_2FA_REMEMBER_DAYS,
      };
    }

    await Promise.all([
      clearTerminalAuthFailures(loginSubject, ip),
      clearTerminalAuthFailures(userSubject, ip),
    ]);
    const { token, maxAgeSeconds } = await createSession(
      user.id,
      request.headers['user-agent'],
    );
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(maxAgeSeconds));
    return { requiresTwoFactor: false as const, user: await publicUser(user) };
  });

  app.post('/api/auth/two-factor/verify', async (request, reply) => {
    const parsed = verifyTwoFactorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter the 6-digit code' });
    }
    const rawChallenge = signedCookie(request, LOGIN_CHALLENGE_COOKIE);
    const pendingUser = await challengeUser(rawChallenge);
    if (!pendingUser || !pendingUser.active || !isPrivateUserAllowed(pendingUser)) {
      reply.clearCookie(LOGIN_CHALLENGE_COOKIE, loginChallengeCookieOptions());
      return reply.code(401).send({ error: 'Sign in again to continue' });
    }
    const ip = request.ip ?? '';
    const userSubject = `user:${pendingUser.id}`;
    const lock = await checkTerminalAuthLock(userSubject, ip);
    if (lock.locked) {
      return reply
        .code(429)
        .header('Retry-After', String(lock.retryAfter))
        .send({ error: 'Too many attempts. Try again later.', retryAfter: lock.retryAfter });
    }

    const result = await verifyLoginChallenge(rawChallenge, parsed.data.code);
    if (!result.ok) {
      if (result.reason === 'invalid' || result.reason === 'attempts') {
        await recordTerminalAuthFailure(userSubject, ip);
      }
      if (result.reason === 'expired' || result.reason === 'missing' || result.reason === 'attempts') {
        reply.clearCookie(LOGIN_CHALLENGE_COOKIE, loginChallengeCookieOptions());
      }
      return reply.code(401).send({
        error:
          result.reason === 'expired'
            ? 'That code expired. Sign in again for a new code.'
            : result.reason === 'attempts'
              ? 'Too many incorrect codes. Sign in again.'
              : 'That code is not correct.',
      });
    }

    const user = (await db.select().from(users).where(eq(users.id, result.userId)).limit(1))[0];
    if (!user || !user.active || !isPrivateUserAllowed(user)) {
      reply.clearCookie(LOGIN_CHALLENGE_COOKIE, loginChallengeCookieOptions());
      return reply.code(401).send({ error: 'Sign in again to continue' });
    }

    await Promise.all([
      clearTerminalAuthFailures(userSubject, ip),
      ...(user.email ? [clearTerminalAuthFailures(`login:${user.email.toLowerCase()}`, ip)] : []),
      clearTerminalAuthFailures(`login:${user.username.toLowerCase()}`, ip),
    ]);
    const { token, maxAgeSeconds } = await createSession(
      user.id,
      request.headers['user-agent'],
    );
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(maxAgeSeconds));
    reply.clearCookie(LOGIN_CHALLENGE_COOKIE, loginChallengeCookieOptions());

    if (parsed.data.remember) {
      const device = await rememberTerminalDevice(user.id, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      reply.setCookie(
        TERMINAL_DEVICE_COOKIE,
        device.token,
        terminalDeviceCookieOptions(device.maxAgeSeconds),
      );
    }

    app.log.info({ event: 'auth.two_factor_verified', userId: user.id });
    return { user: await publicUser(user) };
  });

  app.post('/api/auth/two-factor/resend', async (request, reply) => {
    const rawChallenge = signedCookie(request, LOGIN_CHALLENGE_COOKIE);
    const user = await challengeUser(rawChallenge);
    if (!user || !user.active || !isPrivateUserAllowed(user)) {
      return reply.code(401).send({ error: 'Sign in again to request a new code' });
    }
    const lock = await checkTerminalAuthLock(`user:${user.id}`, request.ip ?? '');
    if (lock.locked) {
      return reply
        .code(429)
        .header('Retry-After', String(lock.retryAfter))
        .send({ error: 'Too many attempts. Try again later.', retryAfter: lock.retryAfter });
    }
    const result = await resendLoginChallenge(rawChallenge, user, request.ip, twoFactorDelivery);
    if (!result.ok) {
      if (result.reason === 'missing') {
        reply.clearCookie(LOGIN_CHALLENGE_COOKIE, loginChallengeCookieOptions());
        return reply.code(401).send({ error: 'Sign in again to request a new code' });
      }
      if (result.retryAfter) {
        return reply.code(429).send({
          error: `Wait ${result.retryAfter} seconds before requesting another code`,
          retryAfter: result.retryAfter,
        });
      }
      return reply.code(503).send({ error: 'A new code could not be emailed. Try again shortly.' });
    }
    return { ok: true as const, sentTo: result.sentTo };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const raw = signedCookie(request, SESSION_COOKIE);
    const challenge = signedCookie(request, LOGIN_CHALLENGE_COOKIE);
    const device = signedCookie(request, TERMINAL_DEVICE_COOKIE);
    await Promise.all([
      destroySession(raw),
      destroyLoginChallenge(challenge),
      forgetTerminalDevice(device),
    ]);
    reply.clearCookie(SESSION_COOKIE, cookieOptions());
    reply.clearCookie(LOGIN_CHALLENGE_COOKIE, loginChallengeCookieOptions());
    reply.clearCookie(TERMINAL_DEVICE_COOKIE, terminalDeviceCookieOptions());
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return { user: await publicUser(request.currentUser!) };
  });

  // Change your own password. Works both for the forced first-login change
  // and any later voluntary change; clears the must-change flag either way.
  app.post(
    '/api/auth/change-password',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'New password must be at least 8 characters' });
      }
      const me = request.currentUser!;
      const ok = await verifyPassword(me.passwordHash, parsed.data.currentPassword);
      if (!ok) {
        return reply.code(400).send({ error: 'Current password is incorrect' });
      }
      const nextHash = await hashPassword(parsed.data.newPassword);
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            passwordHash: nextHash,
            mustChangePassword: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, me.id));
        // Any unused recovery email must stop working once the account holder
        // has chosen a password through an authenticated session.
        await tx
          .delete(passwordResetCredentials)
          .where(eq(passwordResetCredentials.userId, me.id));
      });

      const raw = signedCookie(request, SESSION_COOKIE);
      if (raw) {
        await destroyOtherUserSessions(me.id, sessionIdForToken(raw));
      }
      await Promise.all([
        forgetTerminalAuthForUser(me.id),
        destroyEmployeeSessionsForUser(me.id),
        forgetEmployeeDevices(me.id),
      ]);
      reply.clearCookie(TERMINAL_DEVICE_COOKIE, terminalDeviceCookieOptions());

      const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
      return { user: await publicUser(fresh) };
    },
  );

  // Update your own profile: display name and/or username. The original
  // created username is preserved separately (admin view), so renaming here
  // only changes the login/display username.
  app.patch('/api/auth/profile', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }
    const me = request.currentUser!;
    const patch: {
      username?: string;
      displayName?: string;
      email?: string;
      avatar?: string | null;
      displayTimezone?: string;
      homeWorkspace?: string | null;
      homeScreen?: string | null;
      myTerminalSections?: string | null;
      hideFromLeaderboards?: boolean;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (parsed.data.avatar !== undefined) {
      // An empty string clears the picture; a data URL sets it.
      patch.avatar = parsed.data.avatar ? parsed.data.avatar : null;
    }

    if (parsed.data.displayTimezone != null) {
      patch.displayTimezone = parsed.data.displayTimezone;
    }

    // The pair moves together: a section key means nothing without the workspace
    // it belongs to, so a half-set home page would be a setting that cannot be
    // resolved. An empty string clears, matching how `avatar` above works.
    if (parsed.data.homeWorkspace !== undefined) {
      patch.homeWorkspace = parsed.data.homeWorkspace || null;
    }
    if (parsed.data.homeScreen !== undefined) {
      patch.homeScreen = parsed.data.homeScreen || null;
    }

    // Stored as the JSON the client sent, de-duplicated. A default board is
    // stored as NULL rather than as two empty arrays, so "never customized" and
    // "customized back to the default" are the same row — there is nothing a
    // second state could mean.
    if (parsed.data.myTerminalSections !== undefined) {
      const value = parsed.data.myTerminalSections;
      const add = value ? [...new Set(value.add)] : [];
      const hide = value ? [...new Set(value.hide)] : [];
      // The arrangement is written with the rest. This object is rebuilt by hand
      // rather than passed through, so a field added to the schema and not to
      // here is accepted, validated, and then silently dropped on the way to the
      // row — which reads to the user as a setting that will not save.
      const order = value?.order ? [...new Set(value.order)] : [];
      patch.myTerminalSections =
        add.length || hide.length || order.length ? JSON.stringify({ add, hide, order }) : null;
    }

    if (parsed.data.username != null) {
      const username = parsed.data.username.toLowerCase();
      const clash = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.username, username), ne(users.id, me.id)))
        .limit(1);
      if (clash[0]) {
        return reply.code(400).send({ error: 'That username is already taken' });
      }
      patch.username = username;
    }
    if (parsed.data.displayName != null) {
      const dn = parsed.data.displayName.trim();
      // Same rule as the admin path, checked here too: this is the route a user
      // changes their OWN name on, and it is the one most people will use.
      try {
        await assertDisplayNameFree(dn, me.id);
      } catch {
        return reply.code(400).send({ error: 'That display name is already taken' });
      }
      patch.displayName = dn;
    }
    if (parsed.data.hideFromLeaderboards != null) {
      patch.hideFromLeaderboards = parsed.data.hideFromLeaderboards;
    }
    if (parsed.data.email != null) {
      const email = parsed.data.email.toLowerCase();
      const clash = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), ne(users.id, me.id)))
        .limit(1);
      if (clash[0]) {
        return reply.code(400).send({ error: 'That email is already in use' });
      }
      patch.email = email;
    }

    await db.update(users).set(patch).where(eq(users.id, me.id));
    if (patch.email != null) {
      // Credentials and remembered browsers tied to the former mailbox stop
      // working when the account moves to a new address.
      await Promise.all([
        db
          .delete(passwordResetCredentials)
          .where(eq(passwordResetCredentials.userId, me.id)),
        forgetTerminalAuthForUser(me.id),
        destroyEmployeeSessionsForUser(me.id),
        forgetEmployeeDevices(me.id),
      ]);
      reply.clearCookie(TERMINAL_DEVICE_COOKIE, terminalDeviceCookieOptions());
    }
    const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
    return { user: await publicUser(fresh) };
  });

  // Record that the signed-in user has reviewed and accepted the currently
  // effective Terms of Service and Privacy Policy. Stamps the current
  // LEGAL_VERSION and the acceptance time onto the account, which clears
  // `mustAcceptTerms` and releases them from the acceptance gate. Idempotent:
  // accepting again just refreshes the timestamp. (The demo never reaches this —
  // it is exempt from the gate and the demo guard blocks the write regardless.)
  app.post('/api/auth/accept-terms', { preHandler: requireAuth }, async (request) => {
    const me = request.currentUser!;
    await db
      .update(users)
      .set({
        termsAcceptedVersion: LEGAL_VERSION,
        termsAcceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, me.id));
    const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
    return { user: await publicUser(fresh) };
  });
}
