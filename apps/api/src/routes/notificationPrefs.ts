import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireWorkspace } from '../auth/middleware.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import { scopedTraderIds } from '../trading/scope.js';
import {
  DEFAULT_PREF_FLAGS,
  getPrefsFor,
  setPref,
  type NotifPrefFlags,
} from '../notifications/prefs.js';

// Per-user notification preferences. A trader picks which teammate they want
// trade notifications about and, per teammate, which trade events buzz them.
// Gated behind trading access (these are the trade feed); the demo is read-only.

const flagsSchema = z.object({
  open: z.boolean(),
  close: z.boolean(),
  placeSl: z.boolean(),
  moveSl: z.boolean(),
  placeTp: z.boolean(),
  moveTp: z.boolean(),
});

export async function notificationPrefsRoutes(app: FastifyInstance) {
  const trading = { preHandler: requireWorkspace('trading') };

  // The teammates this trader can be notified about (their own team, or just
  // themselves if team-less), plus their current per-teammate prefs. A target
  // with no stored row falls back to the all-on default so the UI can render it.
  app.get('/api/notification-prefs', trading, async (request) => {
    const me = request.currentUser!;
    const scopeIds = await scopedTraderIds({ id: me.id, teamId: me.teamId });
    const rows = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName, roles: users.roles })
      .from(users)
      .where(inArray(users.id, [...scopeIds]));

    // Only traders generate trade events worth watching; drop the demo and any
    // teammate without trading access.
    const targets = rows
      .filter((r) => !isDemoUser({ username: r.username }) && canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading'))
      .map((r) => ({
        id: r.id,
        name: r.displayName?.trim() || r.username,
        isSelf: r.id === me.id,
      }))
      .sort((a, b) => (a.isSelf === b.isSelf ? a.name.localeCompare(b.name) : a.isSelf ? -1 : 1));

    const stored = await getPrefsFor(me.id);
    const prefs: Record<string, NotifPrefFlags> = {};
    for (const t of targets) prefs[t.id] = stored[t.id] ?? { ...DEFAULT_PREF_FLAGS };

    return { targets, prefs };
  });

  // Save the caller's prefs for one teammate. The target must be in the caller's
  // team scope, so a user can't stash prefs about someone off their desk.
  app.put('/api/notification-prefs/:targetUserId', trading, async (request, reply) => {
    const me = request.currentUser!;
    const targetUserId = (request.params as { targetUserId: string }).targetUserId;
    const parsed = flagsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid notification preferences' });

    const scopeIds = await scopedTraderIds({ id: me.id, teamId: me.teamId });
    if (!scopeIds.has(targetUserId)) {
      return reply.code(404).send({ error: 'That user is not on your desk' });
    }

    await setPref(me.id, targetUserId, parsed.data);
    return { ok: true };
  });
}
