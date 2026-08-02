import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireFounder } from '../auth/middleware.js';
import { MESSAGE_TEMPLATE_KINDS } from '../db/schema.js';
import {
  MessageTemplateError,
  createMessageTemplate,
  listMessageTemplates,
  removeMessageTemplate,
  updateMessageTemplate,
} from '../messageTemplates/service.js';

// Admin ▸ Message Templates — a shared copy library of text-message and email
// templates. Reading is open to every admin (they copy them out of the terminal);
// authoring/editing/deleting is founder-level only (software developers), so the
// write routes sit behind requireFounder while the read route uses requireAdmin.

const createSchema = z.object({
  kind: z.enum(MESSAGE_TEMPLATE_KINDS),
  title: z.string().trim().min(1).max(160),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(8000),
});

const updateSchema = z.object({
  kind: z.enum(MESSAGE_TEMPLATE_KINDS).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(8000).optional(),
});

export async function messageTemplateRoutes(app: FastifyInstance) {
  const adminGuard = { preHandler: requireAdmin };
  const founderGuard = { preHandler: requireFounder };

  // Every admin can see the templates so they can copy them.
  app.get('/api/admin/message-templates', adminGuard, async () => {
    return { templates: await listMessageTemplates() };
  });

  // Only software developers (founder-level) may author a template.
  app.post('/api/admin/message-templates', founderGuard, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the template details and try again' });
    try {
      const templates = await createMessageTemplate(
        { id: request.currentUser!.id, displayName: request.currentUser!.displayName },
        parsed.data,
      );
      return { templates };
    } catch (err) {
      if (err instanceof MessageTemplateError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.patch('/api/admin/message-templates/:id', founderGuard, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid changes' });
    const id = (request.params as { id: string }).id;
    try {
      const templates = await updateMessageTemplate(id, parsed.data);
      return { templates };
    } catch (err) {
      if (err instanceof MessageTemplateError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/admin/message-templates/:id', founderGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      const templates = await removeMessageTemplate(id);
      return { templates };
    } catch (err) {
      if (err instanceof MessageTemplateError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });
}
