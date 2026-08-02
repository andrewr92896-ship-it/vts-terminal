import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { hasEntitlement } from '../memberships/service.js';
import {
  FEATURE_LABELS,
  FEATURE_TIER,
  TIER_LABELS,
  type PremiumFeature,
} from '../memberships/tiers.js';
import {
  supportTurn,
  listSupportRequests,
  setSupportRequestStatus,
  removeSupportRequest,
  SUPPORT_KINDS,
} from '../support/service.js';

const turnSchema = z.object({
  kind: z.enum(SUPPORT_KINDS),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'ai']),
        body: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

export async function supportRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const admin = { preHandler: requireAdmin };

  // One turn of the chat-bubble Support tab intake. Stateless until the intake
  // is complete, at which point it is filed to the matching admin section.
  app.post('/api/support/message', auth, async (request, reply) => {
    const parsed = turnSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a message to continue' });
    const u = request.currentUser!;
    // Gated by KIND rather than by a preHandler, because one endpoint serves all
    // three intake types. Reporting a BUG is free on every account, deliberately
    // and permanently: a bug report is the user doing you a favour, and charging
    // for it means never hearing about the bug. Suggestions and general support
    // are paid.
    const paidFor: Partial<Record<typeof parsed.data.kind, PremiumFeature>> = {
      suggestion: 'suggestions',
      support: 'supportChat',
    };
    const needed = paidFor[parsed.data.kind];
    if (needed && !(await hasEntitlement(u, needed))) {
      return reply.code(402).send({
        error: `${FEATURE_LABELS[needed]} needs a ${TIER_LABELS[FEATURE_TIER[needed]]} membership`,
        upgrade: { feature: needed, requiredTier: FEATURE_TIER[needed] },
      });
    }
    try {
      const result = await supportTurn(u, parsed.data.kind, parsed.data.messages);
      return result;
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send message' });
    }
  });

  // Admin Support section (general support requests only).
  app.get('/api/admin/support', admin, async () => {
    return { requests: await listSupportRequests() };
  });

  app.patch('/api/admin/support/:id', admin, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = z.object({ status: z.enum(['submitted', 'resolved']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid status' });
    return { requests: await setSupportRequestStatus(id, parsed.data.status) };
  });

  app.delete('/api/admin/support/:id', admin, async (request) => {
    const id = (request.params as { id: string }).id;
    return { requests: await removeSupportRequest(id) };
  });
}
