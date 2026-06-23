import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { ROLE_KEYS } from '../auth/rbac.js';
import { AdminError, createUser, listUsers, updateUser } from '../admin/service.js';

const createSchema = z.object({
  username: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(256),
  roles: z.array(z.enum(ROLE_KEYS)),
  viewBrokerage: z.boolean().optional(),
});

const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  roles: z.array(z.enum(ROLE_KEYS)).optional(),
  active: z.boolean().optional(),
  viewBrokerage: z.boolean().optional(),
  password: z.string().min(8).max(256).optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAdmin };

  app.get('/api/admin/users', guard, async () => {
    return { users: await listUsers() };
  });

  app.post('/api/admin/users', guard, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the user details and try again' });
    }
    try {
      const user = await createUser(parsed.data);
      return { user };
    } catch (err) {
      if (err instanceof AdminError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.patch('/api/admin/users/:id', guard, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid changes' });
    }
    const targetId = (request.params as { id: string }).id;
    try {
      const user = await updateUser(request.currentUser!.id, targetId, parsed.data);
      return { user };
    } catch (err) {
      if (err instanceof AdminError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });
}
