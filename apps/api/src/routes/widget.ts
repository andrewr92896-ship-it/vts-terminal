import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import { isDemoUser } from '../demo/identity.js';
import {
  getWidgetTokenStatus,
  issueWidgetToken,
  revokeWidgetToken,
  resolveWidgetToken,
  buildWidgetPositions,
} from '../trading/widgetToken.js';

// Home-screen widget API. Two halves:
//   • Token management (GET/POST/DELETE /api/widget/token) is the user's own,
//     authenticated by the normal session cookie like the rest of the terminal.
//   • The data read (GET /api/widget/positions) is the ONLY endpoint on the
//     whole API authenticated by a bearer token instead of the cookie, because a
//     native iOS widget / Scriptable can't hold the httpOnly session cookie. It
//     is strictly read-only and returns display data only.

function bearerFrom(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim() || undefined;
  const q = (request.query as { token?: string } | undefined)?.token;
  return q?.trim() || undefined;
}

export async function widgetRoutes(app: FastifyInstance) {
  // Only trading-capable users get a widget (it shows trading positions). The
  // cookie already resolved request.currentUser via the global loadUser hook.
  const tradingRead = { preHandler: requireWorkspace('trading') };

  // ---- Token management (cookie-authed; the caller's own token) ----
  app.get('/api/widget/token', tradingRead, async (request) => {
    return getWidgetTokenStatus(request.currentUser!.id);
  });

  // Generate (or regenerate) the caller's widget token — the raw token is
  // returned exactly once here and never retrievable again. The demo account is
  // read-only and never issues one.
  app.post('/api/widget/token', tradingRead, async (request, reply) => {
    const u = request.currentUser!;
    if (isDemoUser(u)) return reply.code(403).send({ error: 'Not available for the demo account' });
    const token = await issueWidgetToken(u.id);
    return { token };
  });

  app.delete('/api/widget/token', tradingRead, async (request) => {
    await revokeWidgetToken(request.currentUser!.id);
    return { ok: true };
  });

  // ---- Positions read (bearer-authed — the widget's only data call) ----
  // `owner` optionally narrows to one teammate by handle (the short name before
  // the email domain), so a user can pin one widget per person. Scoping is
  // inherited from the Live Wall, so the filter can never reach outside the
  // caller's own team.
  const querySchema = z.object({ owner: z.string().trim().max(80).optional() });
  app.get('/api/widget/positions', async (request, reply) => {
    const user = await resolveWidgetToken(bearerFrom(request));
    if (!user) return reply.code(401).send({ error: 'Invalid or missing widget token' });
    const parsed = querySchema.safeParse(request.query);
    const owner = parsed.success ? parsed.data.owner ?? null : null;
    return buildWidgetPositions(user, owner);
  });
}
