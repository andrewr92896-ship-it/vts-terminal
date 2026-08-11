import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requirePremium, requireTradingTeams } from '../auth/middleware.js';
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
  setMemberTileColor,
  setTeamTileColors,
  transferLeadership,
} from '../userTeams/service.js';
import { TILE_COLOR_OPTIONS } from '../trading/tileColors.js';

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });
const inviteSchema = z.object({ username: z.string().trim().min(1).max(64) });
const respondSchema = z.object({ accept: z.boolean() });
const transferSchema = z.object({ userId: z.string().min(1).max(64) });
const badgeSchema = z.object({ badge: z.string().trim().max(40).nullable() });
// A tile colour is a palette key or null (no colour). The service is the
// enforcer — it refuses any key the palette does not carry — so this only has to
// keep an unbounded string out of the handler.
const tileColorSchema = z.object({ color: z.string().trim().max(32).nullable() });
const teamTileColorsSchema = z
  .object({
    funded: z.string().trim().max(32).nullable().optional(),
    manual: z.string().trim().max(32).nullable().optional(),
  })
  // An empty patch would be a save that silently does nothing.
  .refine((v) => v.funded !== undefined || v.manual !== undefined, 'Pick a colour to change');
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
  // Trading Teams are hidden at public launch and handed out by a software
  // developer (see requireTradingTeams). EVERY route here sits behind that
  // grant, reads included: without it there is no team screen, so a read
  // reaching this file is a hand-rolled request and there is nothing it should
  // be told. The two exceptions below are deliberate.
  const guard = { preHandler: [requireAuth, requireTradingTeams] };
  // Running a team is paid; being ON one is not. The team's owner pays, and the
  // people they invite join for free — so `team` guards creating, renaming,
  // inviting and moving members around, while responding to an invite and
  // leaving stay on `guard`. Leaving is never gated on purpose: a lapsed
  // membership must not be able to trap somebody on a desk they want off.
  const team = { preHandler: [requireAuth, requireTradingTeams, requirePremium('teams')] };
  // The cosmetic member badges are their own paid feature.
  const badges = { preHandler: [requireAuth, requireTradingTeams, requirePremium('premiumBadges')] };
  // Leaving a team and answering an invite stay reachable WITHOUT the grant, for
  // the same reason leaving is not gated on the membership: revoking somebody's
  // grant must never strand them on a team with no way off it. Both routes act
  // only on the caller's own membership.
  const selfOnly = { preHandler: requireAuth };

  const fail = (reply: import('fastify').FastifyReply, err: unknown) => {
    if (err instanceof UserTeamError) return reply.code(400).send({ error: err.message });
    throw err;
  };

  // Static config the UI needs: badge presets, the member cap, and the trade
  // tile palette. The palette is sent rather than mirrored in the web bundle so
  // the swatches a leader picks from are the exact colours the wall paints —
  // there is no second copy of the hexes anywhere.
  app.get('/api/my-portal/config', guard, async () => {
    return { badgePresets: BADGE_PRESETS, maxMembers: MAX_TEAM_MEMBERS, tileColors: TILE_COLOR_OPTIONS };
  });

  app.get('/api/my-portal/team', guard, async (request) => {
    return getMyPortal(request.currentUser!.id);
  });

  app.post('/api/my-portal/team', team, async (request, reply) => {
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A group name is required' });
    try {
      const team = await createTeam(request.currentUser!.id, parsed.data.name);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/my-portal/team/rename', team, async (request, reply) => {
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A group name is required' });
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
    if (!ctx) return reply.code(400).send({ error: 'Create a group first' });
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
  app.post('/api/my-portal/invites/:id/respond', selfOnly, async (request, reply) => {
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

  app.post('/api/my-portal/team/leave', selfOnly, async (request, reply) => {
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

  // Trade tile colours. On `team` (the paid group guard) rather than `badges`:
  // this is not a badge, and the service additionally requires the caller to be
  // the group leader — the owner's instruction that the colour choices are the
  // leader's, so the board reads one way for everybody in the group.
  app.post('/api/my-portal/team/members/:userId/tile-color', team, async (request, reply) => {
    const memberUserId = (request.params as { userId: string }).userId;
    const parsed = tileColorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid tile colour' });
    try {
      const team = await setMemberTileColor(request.currentUser!.id, memberUserId, parsed.data.color);
      return { team };
    } catch (err) {
      return fail(reply, err);
    }
  });

  // The funded and manual tile colours — group-wide, and deliberately not tied
  // to any one person.
  app.post('/api/my-portal/team/tile-colors', team, async (request, reply) => {
    const parsed = teamTileColorsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid tile colours' });
    try {
      const team = await setTeamTileColors(request.currentUser!.id, parsed.data);
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
