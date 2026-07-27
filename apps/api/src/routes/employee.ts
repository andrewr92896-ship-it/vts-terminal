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
  type EmployeeProfileRow,
  type UserRow,
} from '../db/schema.js';
import { config } from '../config.js';
import { verifyPassword } from '../auth/passwords.js';
import { canAccessEmployeePortal, isFounder, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME, isDemoUser } from '../demo/identity.js';
import { encryptSecret, decryptSecret } from '../security/secretbox.js';
import {
  EMPLOYEE_COOKIE,
  createEmployeeSession,
  destroyEmployeeSession,
  destroyEmployeeSessionById,
  destroyEmployeeSessionsForUser,
  employeeCookieOptions,
  employeeCsrfToken,
  listEmployeeSessions,
  promoteEmployeeSession,
  purgeExpiredEmployeeSessions,
} from '../employee/sessions.js';
import {
  applyEmployeeSecurityHeaders,
  employeeCookieToken,
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
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from '../employee/totp.js';
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
  resetTwoFactor,
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
  // A TOTP code, or one of the single-use recovery codes.
  code: z.string().trim().max(32).optional(),
});

const codeSchema = z.object({ code: z.string().trim().min(1).max(32) });

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

// "Enrolled" means the employee finished the flow, not merely that a candidate
// secret exists — `2fa/begin` writes the secret, `2fa/complete` stamps the date.
function isEnrolled(profile: EmployeeProfileRow): boolean {
  return !!profile.totpSecret && !!profile.totpEnrolledAt;
}

function readRecoveryHashes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

// Try the submitted code as a TOTP first, then as a single-use recovery code.
// A consumed recovery code is removed from the stored set immediately.
async function verifySecondFactor(
  profile: EmployeeProfileRow,
  code: string,
): Promise<{ ok: boolean; usedRecovery: boolean }> {
  if (!profile.totpSecret) return { ok: false, usedRecovery: false };

  let secret: string;
  try {
    secret = decryptSecret(profile.totpSecret);
  } catch {
    // Unreadable secret (e.g. CREDENTIALS_KEY was rotated). Fail closed — an
    // admin reset is the recovery path.
    return { ok: false, usedRecovery: false };
  }

  const step = verifyTotp(secret, code, { minStep: profile.totpLastStep });
  if (step != null) {
    await db
      .update(employeeProfiles)
      .set({ totpLastStep: step, updatedAt: new Date() })
      .where(eq(employeeProfiles.userId, profile.userId));
    return { ok: true, usedRecovery: false };
  }

  const hashes = readRecoveryHashes(profile.recoveryCodes);
  if (hashes.length) {
    const presented = hashRecoveryCode(code);
    const idx = hashes.indexOf(presented);
    if (idx >= 0) {
      hashes.splice(idx, 1);
      await db
        .update(employeeProfiles)
        .set({ recoveryCodes: JSON.stringify(hashes), updatedAt: new Date() })
        .where(eq(employeeProfiles.userId, profile.userId));
      return { ok: true, usedRecovery: true };
    }
  }
  return { ok: false, usedRecovery: false };
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
      me: stage === 'active' ? await buildMe(ctx.user, ctx.profile, ctx.isPortalAdmin, ctx.isDeveloper) : null,
    };
  });

  // ---- Sign in ----
  app.post('/api/employee/login', async (request, reply) => {
    if (!(await enforceIpAllowlist(request, reply))) return reply;
    const meta = requestMeta(request);

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: GENERIC_LOGIN_ERROR });
    const { email, password, code } = parsed.data;

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
    if (isEnrolled(profile)) {
      if (!code) {
        // The password was right; ask for the code without burning an attempt.
        // `need` tells the client to reveal the code field.
        return reply.code(401).send({ error: 'Enter your authenticator code', need: 'totp' });
      }
      const { ok, usedRecovery } = await verifySecondFactor(profile, code);
      if (!ok) {
        const lock = await recordFailure(keys);
        await audit({
          action: 'login.totp_failed',
          userId: user.id,
          actor: user.displayName,
          ...meta,
          ok: false,
        });
        return reply.code(401).send({
          error: 'That code is not valid',
          need: 'totp',
          ...(lock.locked ? { retryAfter: lock.retryAfterSeconds } : {}),
        });
      }
      if (usedRecovery) {
        await audit({
          action: '2fa.recovery_used',
          userId: user.id,
          actor: user.displayName,
          detail: 'signed in with a single-use recovery code',
          ...meta,
        });
      }
    } else if (config.EMPLOYEE_REQUIRE_2FA) {
      // Password accepted, but this account still owes us a second factor. The
      // session it gets can only reach the enrollment endpoints.
      await clearFailures(keys);
      const created = await createEmployeeSession(user.id, 'pending_2fa', {
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      reply.setCookie(EMPLOYEE_COOKIE, created.token, employeeCookieOptions(created.maxAgeSeconds));
      await audit({
        action: 'login.success',
        userId: user.id,
        actor: user.displayName,
        detail: 'pending two-factor enrollment',
        ...meta,
      });
      return { status: 'enroll_required', csrfToken: created.csrfToken };
    }

    // ---- Signed in ----
    await clearFailures(keys);
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

  // ---- Two-factor enrollment ----
  // Reachable by a pending session (first sign-in) and by an active session that
  // has somehow not enrolled (only possible when EMPLOYEE_REQUIRE_2FA is off).

  app.post('/api/employee/2fa/begin', { preHandler: requirePendingEmployee }, async (request, reply) => {
    const ctx = request.employee!;
    if (isEnrolled(ctx.profile)) {
      // Rotating an existing authenticator is an admin reset, not a self-serve
      // overwrite — otherwise an abandoned rotation silently breaks the account.
      return reply.code(400).send({ error: 'A second factor is already enrolled' });
    }
    const secret = generateTotpSecret();
    await db
      .update(employeeProfiles)
      .set({ totpSecret: encryptSecret(secret), totpEnrolledAt: null, updatedAt: new Date() })
      .where(eq(employeeProfiles.userId, ctx.user.id));
    return {
      secret,
      otpauthUrl: otpauthUrl(secret, ctx.user.email || ctx.user.username),
    };
  });

  app.post('/api/employee/2fa/complete', { preHandler: requirePendingEmployee }, async (request, reply) => {
    const ctx = request.employee!;
    const parsed = codeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter the 6-digit code' });
    if (isEnrolled(ctx.profile)) {
      return reply.code(400).send({ error: 'A second factor is already enrolled' });
    }
    if (!ctx.profile.totpSecret) {
      return reply.code(400).send({ error: 'Start the setup again' });
    }

    let secret: string;
    try {
      secret = decryptSecret(ctx.profile.totpSecret);
    } catch {
      return reply.code(400).send({ error: 'Start the setup again' });
    }
    const step = verifyTotp(secret, parsed.data.code);
    if (step == null) {
      await audit({
        action: 'login.totp_failed',
        userId: ctx.user.id,
        actor: ctx.user.displayName,
        detail: 'enrollment',
        ...requestMeta(request),
        ok: false,
      });
      return reply.code(400).send({ error: 'That code is not valid' });
    }

    // Shown once, here, and never again — only the hashes are kept.
    const recoveryCodes = generateRecoveryCodes();
    await db
      .update(employeeProfiles)
      .set({
        totpEnrolledAt: new Date(),
        totpLastStep: step,
        recoveryCodes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
        lastLoginAt: new Date(),
        lastLoginIp: requestMeta(request).ip,
        updatedAt: new Date(),
      })
      .where(eq(employeeProfiles.userId, ctx.user.id));
    await promoteEmployeeSession(ctx.sessionId);
    await audit({
      action: '2fa.enrolled',
      userId: ctx.user.id,
      actor: ctx.user.displayName,
      ...requestMeta(request),
    });

    const fresh = (
      await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, ctx.user.id)).limit(1)
    )[0];
    return {
      recoveryCodes,
      me: await buildMe(ctx.user, fresh, ctx.isPortalAdmin, ctx.isDeveloper),
    };
  });

  // Issue a fresh set of recovery codes. Requires a live authenticator code, so
  // a borrowed session cannot mint itself a permanent way back in.
  app.post('/api/employee/2fa/recovery', { preHandler: requireEmployee }, async (request, reply) => {
    const ctx = request.employee!;
    const parsed = codeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter your authenticator code' });
    if (!isEnrolled(ctx.profile)) {
      return reply.code(400).send({ error: 'No second factor is enrolled' });
    }
    const { ok } = await verifySecondFactor(ctx.profile, parsed.data.code);
    if (!ok) return reply.code(400).send({ error: 'That code is not valid' });

    const recoveryCodes = generateRecoveryCodes();
    await db
      .update(employeeProfiles)
      .set({ recoveryCodes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)), updatedAt: new Date() })
      .where(eq(employeeProfiles.userId, ctx.user.id));
    await audit({
      action: '2fa.recovery_regenerated',
      userId: ctx.user.id,
      actor: ctx.user.displayName,
      ...requestMeta(request),
    });
    return { recoveryCodes };
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

  app.post(
    '/api/employee/admin/people/:userId/reset-2fa',
    { preHandler: [requireEmployee, requireEmployeeAdmin] },
    async (request) => {
      const { userId } = request.params as { userId: string };
      const ctx = request.employee!;
      await resetTwoFactor(userId);
      await audit({
        action: '2fa.reset',
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
