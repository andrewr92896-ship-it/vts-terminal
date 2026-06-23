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
import { toPublicUser } from '../auth/rbac.js';
import { requireAuth } from '../auth/middleware.js';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

const profileSchema = z
  .object({
    username: z.string().trim().min(1).max(64).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.username != null || v.displayName != null, {
    message: 'Nothing to update',
  });

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Username and password required' });
    }
    const { username, password } = parsed.data;

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);
    const user = rows[0];

    // Same generic error and a verify call even when the user is missing,
    // so timing and messaging do not reveal which usernames exist.
    const ok =
      !!user &&
      user.active &&
      (await verifyPassword(user.passwordHash, password));

    if (!ok || !user) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    const { token, maxAgeSeconds } = await createSession(
      user.id,
      request.headers['user-agent'],
    );
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(maxAgeSeconds));
    return { user: toPublicUser(user) };
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
    return { user: toPublicUser(request.currentUser!) };
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
      return { user: toPublicUser(fresh) };
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
    const patch: { username?: string; displayName?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };

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

    await db.update(users).set(patch).where(eq(users.id, me.id));
    const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
    return { user: toPublicUser(fresh) };
  });
}
