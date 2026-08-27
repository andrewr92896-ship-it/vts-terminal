import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import {
  deleteEarlyAccessRequest,
  listEarlyAccessRequests,
  setEarlyAccessStatus,
} from '../earlyAccess/service.js';

export async function earlyAccessRoutes(app: FastifyInstance) {

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
