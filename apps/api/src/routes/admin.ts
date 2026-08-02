import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { ROLE_KEYS } from '../auth/rbac.js';
import {
  AdminError,
  createUser,
  deleteUser,
  grantMembership,
  listUsers,
  updateUser,
} from '../admin/service.js';
import { listAdminLog, resolveAdminLogEntry } from '../admin/adminLog.js';
import { MEMBERSHIP_TIERS, MembershipError } from '../memberships/service.js';
import { parseRoles } from '../auth/rbac.js';
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

// A membership grant. `note` is required and non-empty: the owner's rule is that
// nothing is ever handed out without a stated reason, so it is a schema
// constraint rather than a convention somebody can forget.
const membershipSchema = z.object({
  tier: z.enum(MEMBERSHIP_TIERS),
  // Null = indefinite; the service refuses that for a plain admin.
  expiresAt: z.number().int().positive().nullable(),
  note: z.string().trim().min(1).max(500),
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

  // ---- Memberships ----

  app.post('/api/admin/users/:id/membership', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = membershipSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Pick a tier and say why this membership is being granted' });
    }
    const actor = request.currentUser!;
    try {
      const user = await grantMembership(
        { id: actor.id, displayName: actor.displayName, roles: parseRoles(actor) },
        id,
        parsed.data,
      );
      return { user, users: await listUsers() };
    } catch (err) {
      if (err instanceof MembershipError || err instanceof AdminError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // ---- Administrator Log ----

  app.get('/api/admin/log', guard, async () => {
    return { entries: await listAdminLog() };
  });

  // Close a STORED entry. A projected ticket (a bug report, a support request, an
  // early-access lead) is not closable here on purpose — it is closed in its own
  // section, which is the only place that can resolve the underlying thing, and
  // its log entry follows automatically.
  app.post('/api/admin/log/:id/resolve', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (id.includes(':')) {
      return reply
        .code(400)
        .send({ error: 'Close this one in the section it came from — it will update here.' });
    }
    const actor = request.currentUser!;
    await resolveAdminLogEntry(id, { id: actor.id, name: actor.displayName });
    return { entries: await listAdminLog() };
  });
}
