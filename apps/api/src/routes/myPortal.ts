import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { getMyHoldings } from '../myportal/holdings.js';

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
  app.get('/api/my-portal/holdings', { preHandler: requireAuth }, async (request) =>
    getMyHoldings(request.currentUser!),
  );
}
