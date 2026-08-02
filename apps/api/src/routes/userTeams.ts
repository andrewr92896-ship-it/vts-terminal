import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requirePremium } from '../auth/middleware.js';
import {
  UserTeamError,
  BADGE_PRESETS,
  MAX_TEAM_MEMBERS,
  cancelInvite,
  createTeam,
  getMyPortal,
  getUserTeamContext,
  inviteByUsername,
  leaveTeam,
  removeMember,
  renameTeam,
  respondToInvite,
  setMemberBadge,
  setMemberPermissions,
  transferLeadership,
} from '../userTeams/service.js';

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });
const inviteSchema = z.object({ username: z.string().trim().min(1).max(64) });
const respondSchema = z.object({ accept: z.boolean() });
const transferSchema = z.object({ userId: z.string().min(1).max(64) });
const badgeSchema = z.object({ badge: z.string().trim().max(40).nullable() });
const permsSchema = z.object({
  canCreateStudyGuides: z.boolean().optional(),
  canInvite: z.boolean().optional(),
  canManageBadges: z.boolean().optional(),
  canRemoveMembers: z.boolean().optional(),
  canEditTeam: z.boolean().optional(),
  canDeleteTrades: z.boolean().optional(),
});

// My Terminal — user-created Trading Teams. All routes require a signed-in user;
// the global demo guard already refuses demo writes.
export async function userTeamRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth };
  // Running a team is paid; being ON one is not. The team's owner pays, and the
  // people they invite join for free — so `team` guards creating, renaming,
  // inviting and moving members around, while responding to an invite and
  // leaving stay on `guard`. Leaving is never gated on purpose: a lapsed
  // membership must not be able to trap somebody on a desk they want off.
  const team = { preHandler: [requireAuth, requirePremium('teams')] };
  // The cosmetic member badges are their own paid feature.
  const badges = { preHandler: [requireAuth, requirePremium('premiumBadges')] };

  const fail = (reply: import('fastify').FastifyReply, err: unknown) => {
    if (err instanceof UserTeamError) return reply.code(400).send({ error: err.message });
    throw err;
  };

  // Static config the UI needs: badge presets + the member cap.
  app.get('/api/my-portal/config', guard, async () => {
    return { badgePresets: BADGE_PRESETS, maxMembers: MAX_TEAM_MEMBERS };
  });

  app.get('/api/my-portal/team', guard, async (request) => {
    return getMyPortal(request.currentUser!.id);
  });

  app.post('/api/my-portal/team', team, async (request, reply) => {
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A team name is required' });
    try {
      const team = await createTeam(request.currentUser!.id, parsed.data.name);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/rename', team, async (request, reply) => {
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A team name is required' });
    try {
      const team = await renameTeam(request.currentUser!.id, parsed.data.name);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/invite', team, async (request, reply) => {
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter a username to invite' });
    const ctx = await getUserTeamContext(request.currentUser!.id);
    if (!ctx) return reply.code(400).send({ error: 'Create a Trading Team first' });
    try {
      const team = await inviteByUsername(request.currentUser!.id, ctx.teamId, parsed.data.username);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/invites/:id/cancel', team, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      const team = await cancelInvite(request.currentUser!.id, id);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  // The invited user accepts or declines an invitation addressed to them.
  app.post('/api/my-portal/invites/:id/respond', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = respondSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid response' });
    try {
      await respondToInvite(request.currentUser!.id, id, parsed.data.accept);
      return getMyPortal(request.currentUser!.id);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/leave', guard, async (request, reply) => {
    try {
      await leaveTeam(request.currentUser!.id);
      return { ok: true };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/members/:userId/remove', team, async (request, reply) => {
    const memberUserId = (request.params as { userId: string }).userId;
    try {
      const team = await removeMember(request.currentUser!.id, memberUserId);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/transfer', team, async (request, reply) => {
    const parsed = transferSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Pick a member' });
    try {
      const team = await transferLeadership(request.currentUser!.id, parsed.data.userId);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/members/:userId/badge', badges, async (request, reply) => {
    const memberUserId = (request.params as { userId: string }).userId;
    const parsed = badgeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid badge' });
    try {
      const team = await setMemberBadge(request.currentUser!.id, memberUserId, parsed.data.badge);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/members/:userId/permissions', team, async (request, reply) => {
    const memberUserId = (request.params as { userId: string }).userId;
    const parsed = permsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid permissions' });
    try {
      const team = await setMemberPermissions(request.currentUser!.id, memberUserId, parsed.data);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });
}
