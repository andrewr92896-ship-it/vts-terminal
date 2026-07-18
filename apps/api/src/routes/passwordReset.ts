import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import {
  createPasswordResetRequest,
  deletePasswordResetRequest,
  listPasswordResetRequests,
  resolvePasswordResetRequest,
} from '../passwordResets/service.js';

// Public submission from the login screen's "Forgot password?" form. Only an
// email is required; `note` is an optional free-text message. We always answer
// 201 regardless of whether the email matches an account, so the form can't be
// used to probe which emails exist (same posture as login's generic 401).
const submitSchema = z.object({
  email: z.string().trim().email().max(255),
  note: z.string().trim().max(1000).optional(),
});

export async function passwordResetRoutes(app: FastifyInstance) {
  // Public — no auth. Anyone on the login screen can ask for a reset.
  app.post('/api/password-reset', async (request, reply) => {
    const parsed = submitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Please enter a valid email address.' });
    }
    await createPasswordResetRequest(parsed.data);
    return reply.code(201).send({ ok: true });
  });

  // Admin — review the requests under Admin ▸ User Support.
  const guard = { preHandler: requireAdmin };

  app.get('/api/admin/password-resets', guard, async () => {
    return { requests: await listPasswordResetRequests() };
  });

  app.post('/api/admin/password-resets/:id/resolve', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    await resolvePasswordResetRequest(id);
    return { ok: true };
  });

  app.delete('/api/admin/password-resets/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    await deletePasswordResetRequest(id);
    return { ok: true };
  });
}
