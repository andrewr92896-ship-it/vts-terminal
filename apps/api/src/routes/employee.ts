import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  EMPLOYEE_DOC_CATEGORIES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  WORKING_STATUSES,
  employeeProfiles,
  users,
  type UserRow,
} from '../db/schema.js';
import { config } from '../config.js';
import { verifyPassword } from '../auth/passwords.js';
import { canAccessEmployeePortal, isFounder, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME, isDemoUser } from '../demo/identity.js';
import {
  EMPLOYEE_COOKIE,
  clearSessionOtp,
  createEmployeeSession,
  destroyEmployeeSession,
  destroyEmployeeSessionById,
  destroyEmployeeSessionsForUser,
  employeeCookieOptions,
  employeeCsrfToken,
  getEmployeeSessionById,
  lastOtpSentAtForUser,
  listEmployeeSessions,
  promoteEmployeeSession,
  purgeExpiredEmployeeSessions,
  recordOtpAttempt,
  setSessionOtp,
} from '../employee/sessions.js';
import {
  applyEmployeeSecurityHeaders,
  employeeCookieToken,
  employeeDeviceCookieToken as deviceCookieToken,
  enforceIpAllowlist,
  loadEmployeeContext,
  requireEmployee,
  requireEmployeeAdmin,
  requireEmployeeDeveloper,
  requirePendingEmployee,
  requestMeta,
} from '../employee/guard.js';
import { audit, readAudit } from '../employee/audit.js';
import { checkLock, clearFailures, ipKey, recordFailure, userKey } from '../employee/lockout.js';
import {
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  generateOtpCode,
  hashOtpCode,
  otpMatches,
  otpTtlMs,
  sendOtpEmail,
} from '../employee/emailOtp.js';
import {
  EMPLOYEE_DEVICE_COOKIE,
  deviceCookieOptions,
  deviceTrusted,
  forgetDevice,
  listTrustedDevices,
  purgeExpiredTrustedDevices,
  rememberDevice,
  trustedDeviceId,
} from '../employee/trustedDevices.js';
import {
  EmployeeError,
  buildMe,
  createAnnouncement,
  createDocument,
  deleteAnnouncement,
  deleteDocument,
  assignTaskToAll,
  createTask,
  deleteTask,
  ensureProfile,
  getDirectory,
  listMyTasks,
  grantEmployeeAccess,
  listAnnouncements,
  listCandidates,
  listDocuments,
  listPeople,
  forgetTrustedDevices,
  revokeEmployeeAccess,
  setUserPhoto,
  setMyWorkingStatus,
  setTaskDone,
  updateAnnouncement,
  updateDocument,
  updateProfile,
} from '../employee/service.js';

// The employee portal's API. Registered as its own Fastify plugin so the
// security-header hook below is scoped to exactly these routes and nothing else.
//
// Nothing in this file reads `request.currentUser` — the main portal's session
// grants no authority here. Every route resolves the separate employee session
// through the guard instead.

// Deliberately identical for every rejection: wrong address, wrong password,
// no employee role, suspended record. The response must not tell an attacker
// which of those it was.
const GENERIC_LOGIN_ERROR = 'Those credentials are not valid for the employee portal';

const loginSchema = z.object({
  email: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(256),
});

// The emailed sign-in code, plus the employee's choice about this browser.
const verifySchema = z.object({
  code: z.string().trim().min(1).max(16),
  remember: z.boolean().optional(),
});

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).nullable().optional(),
  dueOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
});
// A portal admin may assign to one person, or to everyone at once.
const assignTaskSchema = taskSchema.extend({
  userId: z.string().trim().min(1).max(64).optional(),
  everyone: z.boolean().optional(),
});

// A headshot, already center-cropped and downscaled in the browser. The cap and
// the data-URL shape are the server's checks — it will not accept an arbitrary
// blob just because the client said it was a picture. An empty string removes it.
const photoSchema = z.object({
  photo: z
    .string()
    .max(400_000)
    .refine((v) => v === '' || /^data:image\/(png|jpe?g|webp);base64,/.test(v), {
      message: 'That does not look like an image',
    }),
});

const workingStatusSchema = z.object({ workingStatus: z.enum(WORKING_STATUSES) });

const announcementSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(8000),
  pinned: z.boolean().optional(),
});
const announcementPatchSchema = announcementSchema.partial().refine(
  (v) => v.title != null || v.body != null || v.pinned != null,
  { message: 'Nothing to update' },
);

const documentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(EMPLOYEE_DOC_CATEGORIES).default('policy'),
  summary: z.string().trim().max(400).nullable().optional(),
  body: z.string().trim().max(20000).nullable().optional(),
  // Only http(s) links — never a javascript: or data: URL, which would turn a
  // document card into a script-execution vector for whoever clicks it.
  linkUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^https?:\/\//i.test(v), { message: 'Link must start with http:// or https://' })
    .nullable()
    .optional(),
});
const documentPatchSchema = documentSchema.partial();

const profilePatchSchema = z.object({
  employeeNo: z.string().trim().max(40).nullable().optional(),
  title: z.string().trim().max(120).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  workEmail: z.string().trim().max(255).nullable().optional(),
  workPhone: z.string().trim().max(40).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  managerId: z.string().trim().max(64).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  startedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  isAdmin: z.boolean().optional(),
});

const grantSchema = profilePatchSchema.extend({ userId: z.string().trim().min(1).max(64) });

// Where the code goes: the account's own sign-in address, which the guard has
// already required to be on the company domain. Never an address supplied in
// the request — the sign-in form also accepts a username, and a code must land
// in a company mailbox regardless of what was typed to reach it.
function otpAddress(user: UserRow): string | null {
  return user.email;
}

// A hint at the destination, not the destination: enough for the employee to
// know which mailbox to open, not enough to hand an attacker an address they
// did not already have. "andrew@vitalis…" becomes "an•••@vitalistradingsystems.com".
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(3, local.length - head.length))}@${domain}`;
}

// Seconds this account must still wait before another code may be sent, or 0.
// Keyed on the person, not the session, so asking for a fresh session does not
// buy a fresh allowance — that loophole is what makes a per-session throttle
// useless against both mail-flooding and code-guessing.
async function codeSendCooldown(userId: string): Promise<number> {
  const last = await lastOtpSentAtForUser(userId);
  if (!last) return 0;
  const since = Date.now() - last.getTime();
  return since >= OTP_RESEND_COOLDOWN_MS ? 0 : Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
}

// Mint a code, store its hash against this one session, and mail it. The
// plaintext never leaves this function except into the message body.
async function issueOtp(
  sessionId: string,
  user: UserRow,
  ip: string,
): Promise<{ delivered: boolean; sentTo: string | null }> {
  const address = otpAddress(user);
  if (!address) return { delivered: false, sentTo: null };
  const code = generateOtpCode();
  await setSessionOtp(sessionId, hashOtpCode(code), new Date(Date.now() + otpTtlMs()));
  const delivered = await sendOtpEmail(address, code, { name: user.displayName, ip });
  return { delivered, sentTo: maskEmail(address) };
}

// Look the account up the same way the main portal does (email, then username),
// but never resolve the demo account.
async function findLoginUser(identifier: string): Promise<UserRow | undefined> {
  const id = identifier.toLowerCase();
  const byEmail = (
    await db
      .select()
      .from(users)
      .where(and(eq(users.email, id), ne(users.username, DEMO_USERNAME)))
      .limit(1)
  )[0];
  if (byEmail) return byEmail;
  return (
    await db
      .select()
      .from(users)
      .where(and(eq(users.username, id), ne(users.username, DEMO_USERNAME)))
      .limit(1)
  )[0];
}

export async function employeeRoutes(app: FastifyInstance) {
  // Scoped to this plugin: every employee response carries the hardened header
  // set, including the error responses produced by the guard.
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    if (request.url.startsWith('/api/employee')) applyEmployeeSecurityHeaders(reply);
    return payload;
  });

  // ---- Session bootstrap ----
  // Answers "is this browser signed in?" without a 401, so the page can render
  // its sign-in form on a cold load. Also hands back the CSRF token the client
  // must echo on every write.
  app.get('/api/employee/session', async (request, reply) => {
    if (!(await enforceIpAllowlist(request, reply))) return reply;
    const loaded = await loadEmployeeContext(request);
    if (!loaded) {
      return { authenticated: false, requires2fa: config.EMPLOYEE_REQUIRE_2FA };
    }
    const { ctx, stage } = loaded;
    return {
      authenticated: true,
      stage,
      requires2fa: config.EMPLOYEE_REQUIRE_2FA,
      csrfToken: employeeCsrfToken(ctx.sessionId),
      // A reload part-way through the code step lands back on the code screen,
      // still knowing which mailbox it went to.
      sentTo: stage === 'pending_2fa' ? maskEmail(ctx.user.email ?? '') : null,
      rememberDays: config.EMPLOYEE_REMEMBER_DEVICE_DAYS,
      me: stage === 'active' ? await buildMe(ctx.user, ctx.profile, ctx.isPortalAdmin, ctx.isDeveloper) : null,
    };
  });

  // ---- Sign in ----
  app.post('/api/employee/login', async (request, reply) => {
    if (!(await enforceIpAllowlist(request, reply))) return reply;
    const meta = requestMeta(request);

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: GENERIC_LOGIN_ERROR });
    const { email, password } = parsed.data;

    // The address key is checked before anything else, so a locked-out source
    // spends a request and learns nothing.
    const preLock = await checkLock([ipKey(meta.ip)]);
    if (preLock.locked) {
      await audit({ action: 'login.locked', actor: email, ...meta, ok: false });
      return reply
        .code(429)
        .header('Retry-After', String(preLock.retryAfterSeconds))
        .send({ error: 'Too many attempts. Try again later.', retryAfter: preLock.retryAfterSeconds });
    }

    const user = await findLoginUser(email);
    // Always run a verify, even with no matching account, so response timing
    // does not reveal which addresses exist.
    const passwordOk =
      !!user && user.active && (await verifyPassword(user.passwordHash, password));

    const keys = user ? [ipKey(meta.ip), userKey(user.id)] : [ipKey(meta.ip)];

    if (user) {
      const userLock = await checkLock([userKey(user.id)]);
      if (userLock.locked) {
        await audit({ action: 'login.locked', userId: user.id, actor: email, ...meta, ok: false });
        return reply
          .code(429)
          .header('Retry-After', String(userLock.retryAfterSeconds))
          .send({ error: 'Too many attempts. Try again later.', retryAfter: userLock.retryAfterSeconds });
      }
    }

    if (!passwordOk || !user) {
      await recordFailure(keys);
      await audit({ action: 'login.failed', userId: user?.id ?? null, actor: email, ...meta, ok: false });
      return reply.code(401).send({ error: GENERIC_LOGIN_ERROR });
    }

    // Authorization, checked separately from authentication but reported the
    // same way. Two conditions must hold — the `employee` role and a
    // company-domain sign-in email — so a personal address never gets in even
    // if the role is granted by mistake. The demo can never reach this surface
    // regardless of its roles.
    const roles = parseRoles(user);
    if (isDemoUser(user) || !canAccessEmployeePortal(roles, user.email)) {
      await recordFailure(keys);
      await audit({
        action: 'login.denied',
        userId: user.id,
        actor: user.displayName,
        // Recorded for the admin's benefit, never revealed to the caller.
        detail: roles.includes('employee') ? 'email not on the company domain' : 'no employee access',
        ...meta,
        ok: false,
      });
      return reply.code(401).send({ error: GENERIC_LOGIN_ERROR });
    }

    const profile = await ensureProfile(user.id);
    if (profile.status !== 'active') {
      await recordFailure(keys);
      await audit({
        action: 'login.denied',
        userId: user.id,
        actor: user.displayName,
        detail: `record ${profile.status}`,
        ...meta,
        ok: false,
      });
      return reply.code(401).send({ error: GENERIC_LOGIN_ERROR });
    }

    // ---- Second factor ----
    // The password is right. Unless this browser is one the employee has told
    // us to remember, they now owe us a code sent to their company mailbox.
    const remembered =
      config.EMPLOYEE_REQUIRE_2FA &&
      (await deviceTrusted(user.id, deviceCookieToken(request)));

    if (config.EMPLOYEE_REQUIRE_2FA && !remembered) {
      // Deliberately NOT clearing the failure counters here. The counters are
      // what bounds guessing at the code, and this request — a correct password
      // — is one an attacker who has the password can make at will. Clearing
      // here would let them loop "log in, guess four, log in again" forever
      // without ever reaching a rung of the ladder. Only a *completed* sign-in
      // clears them (see /2fa/verify), which is the one thing an attacker who
      // cannot read the mailbox never gets to do.
      //
      // Issuing a code is also rate-limited per account, not per session, for
      // the same reason: a fresh session must not buy a fresh mailbox flood.
      const wait = await codeSendCooldown(user.id);
      if (wait > 0) {
        return reply
          .code(429)
          .header('Retry-After', String(wait))
          .send({ error: `Wait ${wait}s before asking for another code`, retryAfter: wait });
      }
      const created = await createEmployeeSession(user.id, 'pending_2fa', {
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      reply.setCookie(EMPLOYEE_COOKIE, created.token, employeeCookieOptions(created.maxAgeSeconds));
      const { delivered, sentTo } = await issueOtp(created.sessionId, user, meta.ip);
      await audit({
        action: 'login.code_sent',
        userId: user.id,
        actor: user.displayName,
        detail: delivered ? 'sign-in code emailed' : 'sign-in code could not be emailed',
        ...meta,
        ok: delivered,
      });
      return {
        status: 'code_sent',
        csrfToken: created.csrfToken,
        sentTo,
        delivered,
        rememberDays: config.EMPLOYEE_REMEMBER_DEVICE_DAYS,
      };
    }

    // ---- Signed in ----
    await clearFailures(keys);
    if (remembered) {
      await audit({
        action: 'login.remembered_device',
        userId: user.id,
        actor: user.displayName,
        detail: 'signed in on a remembered device — no code required',
        ...meta,
      });
    }
    void purgeExpiredEmployeeSessions();
    const created = await createEmployeeSession(user.id, 'active', {
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    reply.setCookie(EMPLOYEE_COOKIE, created.token, employeeCookieOptions(created.maxAgeSeconds));
    await db
      .update(employeeProfiles)
      .set({ lastLoginAt: new Date(), lastLoginIp: meta.ip, updatedAt: new Date() })
      .where(eq(employeeProfiles.userId, user.id));
    await audit({ action: 'login.success', userId: user.id, actor: user.displayName, ...meta });

    const fresh = (
      await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1)
    )[0];
    return {
      status: 'ok',
      csrfToken: created.csrfToken,
      me: await buildMe(user, fresh, fresh.isAdmin || isFounder(roles), isFounder(roles)),
    };
  });

  app.post('/api/employee/logout', async (request, reply) => {
    const token = employeeCookieToken(request);
    const loaded = await loadEmployeeContext(request);
    await destroyEmployeeSession(token);
    reply.clearCookie(EMPLOYEE_COOKIE, employeeCookieOptions());
    if (loaded) {
      await audit({
        action: 'logout',
        userId: loaded.ctx.user.id,
        actor: loaded.ctx.user.displayName,
        ...requestMeta(request),
      });
    }
    return { ok: true };
  });

  // ---- The emailed sign-in code ----
  // Reachable only by a session that has passed the password check and is
  // waiting on its code. Both endpoints run behind requirePendingEmployee, so
  // the network fence, the origin check and the CSRF token all still apply.

  app.post('/api/employee/2fa/verify', { preHandler: requirePendingEmployee }, async (request, reply) => {
    const ctx = request.employee!;
    const meta = requestMeta(request);
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter the 6-digit code' });

    // The ladder is checked here, not just fed: without this, someone holding a
    // valid password could guess five codes, ask for a fresh one and guess five
    // more, forever. Failures below count against the same keys the password
    // step uses, so the lockout covers the whole sign-in, not half of it.
    const lock = await checkLock([ipKey(meta.ip), userKey(ctx.user.id)]);
    if (lock.locked) {
      await audit({
        action: 'login.locked',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        ...meta,
        ok: false,
      });
      return reply
        .code(429)
        .header('Retry-After', String(lock.retryAfterSeconds))
        .send({ error: 'Too many attempts. Try again later.', retryAfter: lock.retryAfterSeconds });
    }

    const session = await getEmployeeSessionById(ctx.sessionId);
    if (!session || session.stage !== 'pending_2fa') {
      return reply.code(400).send({ error: 'Start signing in again' });
    }
    if (!session.otpCodeHash || !session.otpExpiresAt) {
      return reply.code(400).send({ error: 'Request a new code', need: 'code' });
    }
    if (session.otpExpiresAt.getTime() < Date.now()) {
      await clearSessionOtp(ctx.sessionId);
      return reply.code(400).send({ error: 'That code has expired. Request a new one.', need: 'code' });
    }

    if (!otpMatches(session.otpCodeHash, parsed.data.code)) {
      // Both counters move: the per-code ceiling burns this code quickly, and
      // the account/address ladder — which nothing on the sign-in path clears
      // any more until a code actually succeeds — is what stops someone asking
      // for code after code and guessing at each one.
      const lock = await recordFailure([ipKey(meta.ip), userKey(ctx.user.id)]);
      const attempts = await recordOtpAttempt(ctx.sessionId);
      const spent = attempts >= MAX_OTP_ATTEMPTS;
      if (spent) await clearSessionOtp(ctx.sessionId);
      await audit({
        action: 'login.code_failed',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        detail: spent ? 'code discarded after too many wrong guesses' : undefined,
        ...meta,
        ok: false,
      });
      return reply.code(400).send({
        error: spent ? 'Too many wrong guesses. Request a new code.' : 'That code is not valid',
        need: 'code',
        ...(spent ? { expired: true } : {}),
        ...(lock.locked ? { retryAfter: lock.retryAfterSeconds } : {}),
      });
    }

    // ---- Accepted ----
    await clearFailures([ipKey(meta.ip), userKey(ctx.user.id)]);
    // Promoting clears the stored code with it, so it cannot be presented twice.
    await promoteEmployeeSession(ctx.sessionId);

    if (parsed.data.remember) {
      void purgeExpiredTrustedDevices();
      const device = await rememberDevice(ctx.user.id, { ip: meta.ip, userAgent: meta.userAgent });
      reply.setCookie(
        EMPLOYEE_DEVICE_COOKIE,
        device.token,
        deviceCookieOptions(device.maxAgeSeconds),
      );
      await audit({
        action: 'device.remembered',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        detail: `this browser may skip the code for ${config.EMPLOYEE_REMEMBER_DEVICE_DAYS} days`,
        ...meta,
      });
    }

    await db
      .update(employeeProfiles)
      .set({ lastLoginAt: new Date(), lastLoginIp: meta.ip, updatedAt: new Date() })
      .where(eq(employeeProfiles.userId, ctx.user.id));
    await audit({ action: 'login.success', userId: ctx.user.id, actor: ctx.user.displayName, ...meta });

    const fresh = (
      await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, ctx.user.id)).limit(1)
    )[0];
    return { me: await buildMe(ctx.user, fresh, ctx.isPortalAdmin, ctx.isDeveloper) };
  });

  // Send a fresh code, replacing whatever is outstanding. Throttled so the
  // button cannot be turned into a way to flood somebody's inbox.
  app.post('/api/employee/2fa/resend', { preHandler: requirePendingEmployee }, async (request, reply) => {
    const ctx = request.employee!;
    const meta = requestMeta(request);
    // Locked out means locked out: a fresh code must not be obtainable while the
    // ladder is holding this account or address shut.
    const lock = await checkLock([ipKey(meta.ip), userKey(ctx.user.id)]);
    if (lock.locked) {
      return reply
        .code(429)
        .header('Retry-After', String(lock.retryAfterSeconds))
        .send({ error: 'Too many attempts. Try again later.', retryAfter: lock.retryAfterSeconds });
    }

    const session = await getEmployeeSessionById(ctx.sessionId);
    if (!session || session.stage !== 'pending_2fa') {
      return reply.code(400).send({ error: 'Start signing in again' });
    }
    // The same per-account cooldown /login uses, so the two routes cannot be
    // alternated to halve the gap between messages.
    const wait = await codeSendCooldown(ctx.user.id);
    if (wait > 0) {
      return reply
        .code(429)
        .header('Retry-After', String(wait))
        .send({ error: `Wait ${wait}s before asking for another code`, retryAfter: wait });
    }

    const { delivered, sentTo } = await issueOtp(ctx.sessionId, ctx.user, meta.ip);
    await audit({
      action: 'login.code_sent',
      userId: ctx.user.id,
      actor: ctx.user.displayName,
      detail: delivered ? 'resent' : 'resend could not be emailed',
      ...meta,
      ok: delivered,
    });
    return { sentTo, delivered };
  });

  // ---- Everything below requires a fully authenticated employee ----

  app.get('/api/employee/overview', { preHandler: requireEmployee }, async (request) => {
    const ctx = request.employee!;
    const [me, announcements, directory, documents] = await Promise.all([
      buildMe(ctx.user, ctx.profile, ctx.isPortalAdmin, ctx.isDeveloper),
      listAnnouncements(5),
      getDirectory(ctx.user.id),
      listDocuments(),
    ]);
    return {
      me,
      announcements,
      counts: { people: directory.length, documents: documents.length },
      // Surfaced in the UI so an employee can see the portal's own posture.
      security: {
        sessionHours: config.EMPLOYEE_SESSION_HOURS,
        idleMinutes: config.EMPLOYEE_IDLE_MINUTES,
        requires2fa: config.EMPLOYEE_REQUIRE_2FA,
      },
    };
  });

  app.get('/api/employee/directory', { preHandler: requireEmployee }, async (request) => {
    return { people: await getDirectory(request.employee!.user.id) };
  });

  // ---- Photos and working status ----
  // Your own photo is self-service, and so is your working status — a portal
  // admin edits titles and departments from the People screen, but not where
  // someone else is working today. Photos are the one exception: a developer can
  // set anyone's, because in practice the directory only ever fills up if
  // somebody can do it on everyone's behalf. That is a founder-level power, not
  // an HR one, and every use of it is audited against the person it touched.

  app.put('/api/employee/photo', { preHandler: requireEmployee }, async (request, reply) => {
    const parsed = photoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid image' });
    }
    const ctx = request.employee!;
    await setUserPhoto(ctx.user.id, parsed.data.photo || null);
    await audit({
      action: parsed.data.photo ? 'photo.updated' : 'photo.removed',
      userId: ctx.user.id,
      actor: ctx.user.displayName,
      ...requestMeta(request),
    });
    return { ok: true };
  });

  // Set — or clear — someone else's headshot. Founder-level only.
  app.put(
    '/api/employee/admin/people/:id/photo',
    { preHandler: [requireEmployee, requireEmployeeDeveloper] },
    async (request, reply) => {
      const parsed = photoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid image' });
      }
      const ctx = request.employee!;
      const { id } = request.params as { id: string };
      // Only an actual active employee, not any account id that gets posted.
      const target = (await getDirectory(ctx.user.id)).find((p) => p.userId === id);
      if (!target) return reply.code(400).send({ error: 'That person is not an active employee' });

      await setUserPhoto(id, parsed.data.photo || null);
      await audit({
        action: parsed.data.photo ? 'photo.updated' : 'photo.removed',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: target.name,
        detail: 'set by a developer',
        ...requestMeta(request),
      });
      return { ok: true, people: await getDirectory(ctx.user.id) };
    },
  );

  app.put('/api/employee/working-status', { preHandler: requireEmployee }, async (request, reply) => {
    const parsed = workingStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid status' });
    const ctx = request.employee!;
    await setMyWorkingStatus(ctx.user.id, parsed.data.workingStatus);
    return { ok: true };
  });

  // ---- Tasks ----
  // Every route here is scoped to the caller. There is deliberately no endpoint
  // that reads another employee's tasks: a portal admin can *assign* work, but
  // seeing what someone has and has not ticked off is a different thing, and
  // nothing in the design asks for it.

  app.get('/api/employee/tasks', { preHandler: requireEmployee }, async (request) => {
    return { tasks: await listMyTasks(request.employee!.user.id) };
  });

  // Add a task for yourself.
  app.post('/api/employee/tasks', { preHandler: requireEmployee }, async (request, reply) => {
    const parsed = taskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'A title is required' });
    }
    const ctx = request.employee!;
    await createTask(ctx.user.id, parsed.data, ctx.user);
    return { tasks: await listMyTasks(ctx.user.id) };
  });

  // Tick one off, or put it back.
  app.patch('/api/employee/tasks/:id', { preHandler: requireEmployee }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ done: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const ctx = request.employee!;
    const ok = await setTaskDone(ctx.user.id, id, parsed.data.done);
    if (!ok) return reply.code(404).send({ error: 'Task not found' });
    return { tasks: await listMyTasks(ctx.user.id) };
  });

  app.delete('/api/employee/tasks/:id', { preHandler: requireEmployee }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ctx = request.employee!;
    const ok = await deleteTask(ctx.user.id, id);
    if (!ok) return reply.code(404).send({ error: 'Task not found' });
    return { tasks: await listMyTasks(ctx.user.id) };
  });

  // Assign work — to one employee, or to everyone active.
  app.post(
    '/api/employee/admin/tasks',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const parsed = assignTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'A title is required' });
      }
      const ctx = request.employee!;
      const { userId, everyone, ...task } = parsed.data;

      if (everyone) {
        const count = await assignTaskToAll(task, ctx.user);
        await audit({
          action: 'task.assigned',
          userId: ctx.user.id,
          actor: ctx.user.displayName,
          target: 'everyone',
          detail: `${task.title} (${count} people)`,
          ...requestMeta(request),
        });
        return { assigned: count, tasks: await listMyTasks(ctx.user.id) };
      }

      if (!userId) return reply.code(400).send({ error: 'Pick someone to assign this to' });
      // Only to an actual active employee — not to any account id that is posted.
      const target = (await getDirectory(ctx.user.id)).find((p) => p.userId === userId);
      if (!target) return reply.code(400).send({ error: 'That person is not an active employee' });

      await createTask(userId, task, ctx.user);
      await audit({
        action: 'task.assigned',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: target.name,
        detail: task.title,
        ...requestMeta(request),
      });
      return { assigned: 1, tasks: await listMyTasks(ctx.user.id) };
    },
  );

  // ---- Announcements ----

  app.get('/api/employee/announcements', { preHandler: requireEmployee }, async () => {
    return { announcements: await listAnnouncements() };
  });

  app.post(
    '/api/employee/announcements',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const parsed = announcementSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'A title and body are required' });
      const ctx = request.employee!;
      const created = await createAnnouncement(parsed.data, ctx.user);
      await audit({
        action: 'announcement.created',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: created.title,
        ...requestMeta(request),
      });
      return { announcement: created };
    },
  );

  app.patch(
    '/api/employee/announcements/:id',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = announcementPatchSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Nothing to update' });
      const ctx = request.employee!;
      await updateAnnouncement(id, parsed.data);
      await audit({
        action: 'announcement.updated',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: id,
        ...requestMeta(request),
      });
      return { announcements: await listAnnouncements() };
    },
  );

  app.delete(
    '/api/employee/announcements/:id',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const ctx = request.employee!;
      await deleteAnnouncement(id);
      await audit({
        action: 'announcement.deleted',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: id,
        ...requestMeta(request),
      });
      return { ok: true };
    },
  );

  // ---- Documents ----

  app.get('/api/employee/documents', { preHandler: requireEmployee }, async () => {
    return { documents: await listDocuments() };
  });

  app.post(
    '/api/employee/documents',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const parsed = documentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid document' });
      }
      const ctx = request.employee!;
      const created = await createDocument(parsed.data, ctx.user);
      await audit({
        action: 'document.created',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: created.title,
        ...requestMeta(request),
      });
      return { document: created };
    },
  );

  app.patch(
    '/api/employee/documents/:id',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = documentPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid document' });
      }
      const ctx = request.employee!;
      await updateDocument(id, parsed.data);
      await audit({
        action: 'document.updated',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: id,
        ...requestMeta(request),
      });
      return { documents: await listDocuments() };
    },
  );

  app.delete(
    '/api/employee/documents/:id',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const ctx = request.employee!;
      await deleteDocument(id);
      await audit({
        action: 'document.deleted',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: id,
        ...requestMeta(request),
      });
      return { ok: true };
    },
  );

  // ---- Your own security ----

  app.get('/api/employee/sessions', { preHandler: requireEmployee }, async (request) => {
    const ctx = request.employee!;
    const rows = await listEmployeeSessions(ctx.user.id);
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        current: s.id === ctx.sessionId,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt.getTime(),
        lastSeenAt: s.lastSeenAt.getTime(),
        expiresAt: s.expiresAt.getTime(),
      })),
    };
  });

  app.delete('/api/employee/sessions/:id', { preHandler: requireEmployee }, async (request) => {
    const { id } = request.params as { id: string };
    const ctx = request.employee!;
    await destroyEmployeeSessionById(id, ctx.user.id);
    await audit({
      action: 'session.revoked',
      userId: ctx.user.id,
      actor: ctx.user.displayName,
      target: id === ctx.sessionId ? 'this session' : 'another session',
      ...requestMeta(request),
    });
    return { ok: true };
  });

  // ---- Remembered devices ----
  // The browsers this employee has allowed to skip the emailed code. Listed and
  // revoked only by their owner — there is no endpoint that reads anyone else's,
  // the same way there is none for anyone else's sessions.

  app.get('/api/employee/trusted-devices', { preHandler: requireEmployee }, async (request) => {
    const ctx = request.employee!;
    const thisDevice = trustedDeviceId(deviceCookieToken(request));
    const rows = await listTrustedDevices(ctx.user.id);
    return {
      rememberDays: config.EMPLOYEE_REMEMBER_DEVICE_DAYS,
      devices: rows.map((d) => ({
        id: d.id,
        current: d.id === thisDevice,
        ip: d.ip,
        userAgent: d.userAgent,
        createdAt: d.createdAt.getTime(),
        lastUsedAt: d.lastUsedAt.getTime(),
        expiresAt: d.expiresAt.getTime(),
      })),
    };
  });

  app.delete('/api/employee/trusted-devices/:id', { preHandler: requireEmployee }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ctx = request.employee!;
    await forgetDevice(id, ctx.user.id);
    // Forgetting the browser you are on should also drop its cookie, so the
    // next sign-in here really does ask for a code.
    if (id === trustedDeviceId(deviceCookieToken(request))) {
      reply.clearCookie(EMPLOYEE_DEVICE_COOKIE, deviceCookieOptions());
    }
    await audit({
      action: 'device.forgotten',
      userId: ctx.user.id,
      actor: ctx.user.displayName,
      ...requestMeta(request),
    });
    return { ok: true };
  });

  // Your own trail by default; portal admins may ask for the whole log.
  app.get('/api/employee/audit', { preHandler: requireEmployee }, async (request) => {
    const ctx = request.employee!;
    const { scope } = request.query as { scope?: string };
    const all = scope === 'all' && ctx.isPortalAdmin;
    return {
      scope: all ? 'all' : 'mine',
      entries: await readAudit(all ? { limit: 250 } : { userId: ctx.user.id, limit: 100 }),
    };
  });

  // ---- People management (portal admins) ----

  app.get(
    '/api/employee/admin/people',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request) => {
      const ctx = request.employee!;
      return { people: await listPeople(ctx.user.id), candidates: await listCandidates() };
    },
  );

  app.post(
    '/api/employee/admin/people',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const parsed = grantSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Pick an account to grant access to' });
      const ctx = request.employee!;
      const { userId, ...details } = parsed.data;
      try {
        await grantEmployeeAccess(userId, details);
      } catch (err) {
        if (err instanceof EmployeeError) return reply.code(400).send({ error: err.message });
        throw err;
      }
      await audit({
        action: 'people.granted',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: userId,
        ...requestMeta(request),
      });
      return { people: await listPeople(ctx.user.id), candidates: await listCandidates() };
    },
  );

  app.patch(
    '/api/employee/admin/people/:userId',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const parsed = profilePatchSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Nothing to update' });
      const ctx = request.employee!;
      // Nobody removes their own portal-admin rights or suspends themselves —
      // that is the classic way to lock the last administrator out.
      if (userId === ctx.user.id) {
        if (parsed.data.isAdmin === false || (parsed.data.status && parsed.data.status !== 'active')) {
          return reply.code(400).send({ error: 'You cannot remove your own access' });
        }
      }
      await updateProfile(userId, parsed.data);
      await audit({
        action: 'people.updated',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: userId,
        detail: Object.keys(parsed.data).join(', '),
        ...requestMeta(request),
      });
      return { people: await listPeople(ctx.user.id), candidates: await listCandidates() };
    },
  );

  // Drop every browser this person had remembered, and end their live sessions
  // with it. The "they left a laptop somewhere" lever: afterwards each of their
  // devices must prove a fresh emailed code again.
  app.post(
    '/api/employee/admin/people/:userId/forget-devices',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request) => {
      const { userId } = request.params as { userId: string };
      const ctx = request.employee!;
      await forgetTrustedDevices(userId);
      await audit({
        action: 'device.forgotten_all',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: userId,
        ...requestMeta(request),
      });
      return { people: await listPeople(ctx.user.id), candidates: await listCandidates() };
    },
  );

  app.delete(
    '/api/employee/admin/people/:userId',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const ctx = request.employee!;
      if (userId === ctx.user.id) {
        return reply.code(400).send({ error: 'You cannot revoke your own access' });
      }
      try {
        await revokeEmployeeAccess(userId);
      } catch (err) {
        if (err instanceof EmployeeError) return reply.code(400).send({ error: err.message });
        throw err;
      }
      await destroyEmployeeSessionsForUser(userId);
      await audit({
        action: 'people.revoked',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        target: userId,
        ...requestMeta(request),
      });
      return { people: await listPeople(ctx.user.id), candidates: await listCandidates() };
    },
  );
}
