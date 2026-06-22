import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import { addDeal, getDashboard, removeDeal, updateDeal, updateSettings } from '../kia/service.js';

const dealSchema = z.object({
  customer: z.string().trim().max(120).optional(),
  model: z.string().trim().min(1).max(120),
  type: z.enum(['New', 'Used']),
  profit: z.coerce.number().finite().min(0).max(1_000_000),
  soldAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(), // YYYY-MM-DD in the seller's local calendar
});

// All fields optional for editing an existing deal.
const dealEditSchema = z
  .object({
    customer: z.string().trim().max(120).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    type: z.enum(['New', 'Used']).optional(),
    profit: z.coerce.number().finite().min(0).max(1_000_000).optional(),
    soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });

const settingsSchema = z
  .object({
    goalUnits: z.coerce.number().int().min(1).max(1000).optional(),
    reviewCount: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .refine((v) => v.goalUnits != null || v.reviewCount != null, {
    message: 'Provide goalUnits or reviewCount',
  });

// The dashboard is month-scoped; mutations echo back the month the client is
// viewing so the response matches what's on screen.
function monthOf(request: { query: unknown }): string | undefined {
  const q = request.query as { month?: string } | undefined;
  return q?.month;
}

export async function kiaRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('kia') };

  app.get('/api/kia/dashboard', guard, async (request) => {
    return getDashboard(request.currentUser!.id, monthOf(request));
  });

  app.post('/api/kia/deals', guard, async (request, reply) => {
    const parsed = dealSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Model, type, and profit are required' });
    }
    const userId = request.currentUser!.id;
    await addDeal(userId, parsed.data);
    return getDashboard(userId, monthOf(request));
  });

  app.patch('/api/kia/deals/:id', guard, async (request, reply) => {
    const parsed = dealEditSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the deal details and try again' });
    }
    const userId = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    try {
      await updateDeal(userId, id, parsed.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update deal';
      return reply.code(400).send({ error: msg });
    }
    return getDashboard(userId, monthOf(request));
  });

  app.delete('/api/kia/deals/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    await removeDeal(userId, id);
    return getDashboard(userId, monthOf(request));
  });

  app.patch('/api/kia/settings', guard, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Provide a goal or review count' });
    }
    const userId = request.currentUser!.id;
    const month = monthOf(request);
    await updateSettings(userId, month, parsed.data);
    return getDashboard(userId, month);
  });
}
