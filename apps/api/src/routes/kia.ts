import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import { addDeal, getDashboard, removeDeal, updateSettings } from '../kia/service.js';

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

const settingsSchema = z
  .object({
    goalUnits: z.coerce.number().int().min(1).max(1000).optional(),
    reviewCount: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .refine((v) => v.goalUnits != null || v.reviewCount != null, {
    message: 'Provide goalUnits or reviewCount',
  });

export async function kiaRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('kia') };

  app.get('/api/kia/dashboard', guard, async (request) => {
    return getDashboard(request.currentUser!.id);
  });

  app.post('/api/kia/deals', guard, async (request, reply) => {
    const parsed = dealSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Model, type, and profit are required' });
    }
    const userId = request.currentUser!.id;
    await addDeal(userId, parsed.data);
    return getDashboard(userId);
  });

  app.delete('/api/kia/deals/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    await removeDeal(userId, id);
    return getDashboard(userId);
  });

  app.patch('/api/kia/settings', guard, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Provide a goal or review count' });
    }
    const userId = request.currentUser!.id;
    await updateSettings(userId, parsed.data);
    return getDashboard(userId);
  });
}
