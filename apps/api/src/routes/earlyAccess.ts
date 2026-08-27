import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import {
  createEarlyAccessRequest,
  deleteEarlyAccessRequest,
  listEarlyAccessRequests,
  setEarlyAccessStatus,
} from '../earlyAccess/service.js';

// Public submission from the login screen's "Request Early Access" form. Last
// name is optional; "source" is the free-text "how did you hear about us".
const submitSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional(),
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

  // Mark a lead dealt with (or reopen it). Separate from deleting, because the
  // contact details are the reason the lead was collected — closing the item on
  // the Administrator Log must not mean throwing them away.
  app.post('/api/admin/early-access/:id/status', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = z.object({ status: z.enum(['new', 'handled']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Unknown status' });
    await setEarlyAccessStatus(id, parsed.data.status);
    return { requests: await listEarlyAccessRequests() };
  });

  app.delete('/api/admin/early-access/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    await deleteEarlyAccessRequest(id);
    return { ok: true };
  });
}
