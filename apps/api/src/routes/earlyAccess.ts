import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import {
  createEarlyAccessRequest,
  deleteEarlyAccessRequest,
  listEarlyAccessRequests,
} from '../earlyAccess/service.js';

// Public submission from the login screen's "Request Early Access" form. Last
// name is optional; "source" is the free-text "how did you hear about us".
const submitSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(255),
  source: z.string().trim().min(1).max(500),
});

export async function earlyAccessRoutes(app: FastifyInstance) {
  // Public — no auth. Anyone on the login screen can request access.
  app.post('/api/early-access', async (request, reply) => {
    const parsed = submitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Please provide your first name, a valid email, and how you heard about us.' });
    }
    await createEarlyAccessRequest(parsed.data);
    return reply.code(201).send({ ok: true });
  });

  // Admin — review the leads in the Admin workspace.
  const guard = { preHandler: requireAdmin };

  app.get('/api/admin/early-access', guard, async () => {
    return { requests: await listEarlyAccessRequests() };
  });

  app.delete('/api/admin/early-access/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    await deleteEarlyAccessRequest(id);
    return { ok: true };
  });
}
