import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireFounder } from '../auth/middleware.js';
import {
  WallTemplateError,
  createTemplate,
  discardDraft,
  listAllTemplates,
  listPublishedTemplates,
  publishTemplate,
  removeTemplate,
  saveDraft,
} from '../trading/wallTemplates.js';

// Live Wall templates.
//
// The READ that members use is on plain `requireAuth` and returns published
// layouts only — it is what every free account's layout picker offers, so it has
// to be reachable by everybody, and it must never expose a draft.
//
// Everything else is `requireFounder`. Editing these changes what every unpaid
// account opens on, which is not an ordinary admin action.

const tileSchema = z.object({
  kind: z.string().min(1).max(40),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const createSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  blurb: z.string().trim().max(140).default(''),
});

const patchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  blurb: z.string().trim().max(140).optional(),
  tiles: z.array(tileSchema).max(40).optional(),
  hidden: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export async function wallTemplateRoutes(app: FastifyInstance): Promise<void> {
  const member = { preHandler: requireAuth };
  const dev = { preHandler: requireFounder };

  const fail = (reply: import('fastify').FastifyReply, err: unknown) => {
    if (err instanceof WallTemplateError) return reply.code(400).send({ error: err.message });
    throw err;
  };

  // What the Live Wall's layout picker offers. Published only.
  app.get('/api/wall-templates', member, async () => ({
    templates: await listPublishedTemplates(),
  }));

  app.get('/api/admin/wall-templates', dev, async () => ({
    templates: await listAllTemplates(),
  }));

  app.post('/api/admin/wall-templates', dev, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the template details' });
    try {
      return { templates: await createTemplate(request.currentUser!.id, parsed.data) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.patch('/api/admin/wall-templates/:id', dev, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid changes' });
    try {
      return { templates: await saveDraft(request.currentUser!.id, id, parsed.data) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/admin/wall-templates/:id/publish', dev, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      return { templates: await publishTemplate(request.currentUser!.id, id) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/admin/wall-templates/:id/discard', dev, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      return { templates: await discardDraft(request.currentUser!.id, id) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete('/api/admin/wall-templates/:id', dev, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      return { templates: await removeTemplate(id) };
    } catch (err) {
      return fail(reply, err);
    }
  });
}
