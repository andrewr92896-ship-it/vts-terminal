import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { z } from 'zod';
import { isDemoUser } from '../demo/identity.js';
import { NET_WORTH_CATEGORIES, NET_WORTH_KINDS } from '../db/schema.js';
import { getMyHoldings } from '../myportal/holdings.js';
import {
  NetWorthError,
  createNetWorthItem,
  getNetWorth,
  removeNetWorthItem,
  updateNetWorthItem,
} from '../myportal/netWorth.js';

const itemBody = z.object({
  kind: z.enum(NET_WORTH_KINDS),
  category: z.enum(NET_WORTH_CATEGORIES),
  label: z.string().trim().min(1).max(80),
  value: z.number().finite().min(0).max(1e12),
  note: z.string().trim().max(500).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

function fail(err: unknown): string {
  return err instanceof NetWorthError ? err.message : 'Something went wrong';
}

// My Terminal's cross-workspace roll-ups.
//
// The team routes under /api/my-portal/* live in routes/userTeams.ts — that file
// is about teams, and this one is about a single person's own money, so they are
// kept apart even though they share a URL prefix.
//
// Behind plain `requireAuth`: My Terminal is included with every account. The
// trading half of the payload is gated inside the service by the Advanced
// Trading opt-in rather than by a guard here, because a user without it still
// gets a useful screen — their investments — instead of a 403.

export async function myPortalRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: requireAuth };

  app.get('/api/my-portal/holdings', auth, async (request) => getMyHoldings(request.currentUser!));

  // ---- Net Worth ----
  app.get<{ Querystring: { days?: string } }>('/api/my-portal/net-worth', auth, async (request) => {
    const user = request.currentUser!;
    const days = Number(request.query.days);
    // The daily reading is a write on a GET — right for a real account (it is
    // how the trend line gets a history at all) and wrong for the demo, whose
    // writes demoGuard otherwise refuses and which must not accumulate rows.
    return getNetWorth(user, {
      recordSnapshot: !isDemoUser(user),
      historyDays: Number.isInteger(days) && days > 0 && days <= 3650 ? days : 365,
    });
  });

  app.post('/api/my-portal/net-worth/items', auth, async (request, reply) => {
    const parsed = itemBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Give it a name and an amount' });
    try {
      const id = await createNetWorthItem(request.currentUser!.id, parsed.data);
      return { id, ...(await getNetWorth(request.currentUser!)) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.patch<{ Params: { id: string } }>('/api/my-portal/net-worth/items/:id', auth, async (request, reply) => {
    const parsed = itemBody.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to change' });
    try {
      await updateNetWorthItem(request.currentUser!.id, request.params.id, parsed.data);
      return getNetWorth(request.currentUser!);
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/my-portal/net-worth/items/:id', auth, async (request, reply) => {
    try {
      await removeNetWorthItem(request.currentUser!.id, request.params.id);
      return getNetWorth(request.currentUser!);
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });
}
