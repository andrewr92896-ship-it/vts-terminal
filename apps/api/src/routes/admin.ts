import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { ROLE_KEYS } from '../auth/rbac.js';
import { AdminError, createUser, deleteUser, listUsers, updateUser } from '../admin/service.js';
import { TeamError, createTeam, deleteTeam, listTeams, renameTeam } from '../teams/service.js';

const createSchema = z.object({
  username: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(256),
  roles: z.array(z.enum(ROLE_KEYS)),
  viewBrokerage: z.boolean().optional(),
  teamId: z.string().min(1).max(64).nullable().optional(),
});

const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(255).optional(),
  roles: z.array(z.enum(ROLE_KEYS)).optional(),
  badges: z.array(z.string().max(40)).max(20).optional(),
  active: z.boolean().optional(),
  viewBrokerage: z.boolean().optional(),
  teamId: z.string().min(1).max(64).nullable().optional(),
  password: z.string().min(8).max(256).optional(),
});

const teamCreateSchema = z.object({ name: z.string().trim().min(1).max(80) });
const teamRenameSchema = z.object({ name: z.string().trim().min(1).max(80) });

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
      const user = await createUser(request.currentUser!.id, parsed.data);
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

  app.delete('/api/admin/users/:id', guard, async (request, reply) => {
    const targetId = (request.params as { id: string }).id;
    try {
      await deleteUser(request.currentUser!.id, targetId);
      return { ok: true };
    } catch (err) {
      if (err instanceof AdminError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // ---- Trading teams ----
  // Admin-managed groups. Members are assigned via the user PATCH above
  // (`teamId`); deleting a team unassigns its members first.
  app.get('/api/admin/teams', guard, async () => {
    return { teams: await listTeams() };
  });

  app.post('/api/admin/teams', guard, async (request, reply) => {
    const parsed = teamCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A team name is required' });
    try {
      const team = await createTeam(parsed.data.name);
      return { team, teams: await listTeams() };
    } catch (err) {
      if (err instanceof TeamError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.patch('/api/admin/teams/:id', guard, async (request, reply) => {
    const parsed = teamRenameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A team name is required' });
    const id = (request.params as { id: string }).id;
    try {
      const team = await renameTeam(id, parsed.data.name);
      return { team, teams: await listTeams() };
    } catch (err) {
      if (err instanceof TeamError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/admin/teams/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      await deleteTeam(id);
      return { ok: true, teams: await listTeams() };
    } catch (err) {
      if (err instanceof TeamError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });
}
