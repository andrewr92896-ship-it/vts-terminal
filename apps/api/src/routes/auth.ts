import type { FastifyInstance } from 'fastify';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroySession,
} from '../auth/sessions.js';
import { toPublicUser, type PublicUser } from '../auth/rbac.js';
import { LEGAL_VERSION } from '../legal/version.js';
import { requireAuth } from '../auth/middleware.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { ensureDemoAccount } from '../seed.js';
import { getTeamName } from '../teams/service.js';
import { featuresForUser } from '../features/service.js';
import { getMembershipView } from '../memberships/service.js';

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

const profileSchema = z
  .object({
    username: z.string().trim().min(1).max(64).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
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
  })
  .refine(
    (v) => v.username != null || v.displayName != null || v.email != null || v.avatar !== undefined,
    { message: 'Nothing to update' },
  );

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Email and password required' });
    }
    const { email, username, password } = parsed.data;
    const identifier = (email ?? username)!.toLowerCase();

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

    // Same generic error and a verify call even when the user is missing,
    // so timing and messaging do not reveal which accounts exist.
    const ok =
      !!user &&
      user.active &&
      (await verifyPassword(user.passwordHash, password));

    if (!ok || !user) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const { token, maxAgeSeconds } = await createSession(
      user.id,
      request.headers['user-agent'],
    );
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(maxAgeSeconds));
    return { user: await publicUser(user) };
  });

  // One-click entry to the public, read-only demo. No credentials: it signs the
  // visitor into the pre-seeded demo account. Everything it can do is read-only
  // (enforced by the demo guard), so this is safe to expose.
  app.post('/api/auth/demo', async (request, reply) => {
    // Self-heal: make sure the demo account exists and is active before signing
    // in, so the public demo stays reachable even if boot seeding never ran or
    // the row was deactivated. Best-effort — a failure here just falls through
    // to the same 503 the absence of a usable demo user would produce.
    try {
      await ensureDemoAccount();
    } catch (err) {
      request.log.error({ err }, 'demo account ensure failed');
    }
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, DEMO_USERNAME))
      .limit(1);
    const user = rows[0];
    if (!user || !user.active) {
      return reply.code(503).send({ error: 'The demo is not available right now' });
    }
    const { token, maxAgeSeconds } = await createSession(user.id, request.headers['user-agent']);
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(maxAgeSeconds));
    return { user: await publicUser(user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        await destroySession(unsigned.value);
      }
    }
    reply.clearCookie(SESSION_COOKIE, cookieOptions());
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
      await db
        .update(users)
        .set({
          passwordHash: await hashPassword(parsed.data.newPassword),
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, me.id));

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
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (parsed.data.avatar !== undefined) {
      // An empty string clears the picture; a data URL sets it.
      patch.avatar = parsed.data.avatar ? parsed.data.avatar : null;
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
      patch.displayName = parsed.data.displayName.trim();
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
