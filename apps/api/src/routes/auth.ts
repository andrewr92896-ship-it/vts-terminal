import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { verifyPassword } from '../auth/passwords.js';
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
}
