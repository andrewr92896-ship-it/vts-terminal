import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import {
  addDeal,
  getDashboard,
  removeDeal,
  restoreDeal,
  updateDeal,
  updatePayPlan,
  updateSettings,
} from '../kia/service.js';
import { parseDeal } from '../kia/dealParser.js';
import { runKiaCommand } from '../kia/command.js';
import { aiConfigured } from '../ai/claude.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';

const payPlanSchema = z
  .object({
    commissionMode: z.enum(['total', 'split']).optional(),
    commissionPct: z.coerce.number().min(0).max(100).optional(),
    commissionFrontPct: z.coerce.number().min(0).max(100).optional(),
    commissionBackPct: z.coerce.number().min(0).max(100).optional(),
    miniAmount: z.coerce.number().int().min(0).max(100000).optional(),
    reviewRequired: z.boolean().optional(),
    reviewReqPct: z.coerce.number().int().min(0).max(100).optional(),
    bonusTiers: z
      .array(
        z.object({
          units: z.coerce.number().int().min(1).max(1000),
          amount: z.coerce.number().int().min(0).max(1_000_000),
        }),
      )
      .max(20)
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });

const money = z.coerce.number().finite().min(0).max(1_000_000);

const dealSchema = z
  .object({
    customer: z.string().trim().max(120).optional(),
    model: z.string().trim().min(1).max(120),
    type: z.enum(['New', 'Used']),
    profit: money.optional(),
    frontProfit: money.optional(),
    backProfit: money.optional(),
    soldAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(), // YYYY-MM-DD in the seller's local calendar
  })
  .refine((v) => v.profit != null || v.frontProfit != null || v.backProfit != null, {
    message: 'Profit is required',
  });

const parseSchema = z.object({ note: z.string().trim().min(1).max(500) });

// All fields optional for editing an existing deal.
const dealEditSchema = z
  .object({
    customer: z.string().trim().max(120).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    type: z.enum(['New', 'Used']).optional(),
    profit: money.optional(),
    frontProfit: money.optional(),
    backProfit: money.optional(),
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

const restoreSchema = z.object({
  id: z.string().min(1),
  customer: z.string().max(120),
  model: z.string().min(1).max(120),
  type: z.enum(['New', 'Used']),
  profit: z.number().int().min(0).max(1_000_000),
  frontProfit: z.number().int().min(0).max(1_000_000).nullable(),
  backProfit: z.number().int().min(0).max(1_000_000).nullable(),
  soldAt: z.number().int(),
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

  // Log a deal from a plain-English note via Claude (Sonnet).
  app.post('/api/kia/deals/parse', guard, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const parsed = parseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a deal to log' });
    const userId = request.currentUser!.id;
    try {
      await enforceAiLimit(userId, 'kia_deal');
      return await parseDeal(userId, parsed.data.note);
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not parse deal' });
    }
  });

  // Plain-English command bar via Claude (Sonnet): log deals, set the unit
  // goal, set the review count — several at once.
  app.post('/api/kia/command', guard, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const parsed = parseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a command' });
    const userId = request.currentUser!.id;
    try {
      await enforceAiLimit(userId, 'kia_command');
      return await runKiaCommand(userId, parsed.data.note);
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not process that' });
    }
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
    const removed = await removeDeal(userId, id);
    const dashboard = await getDashboard(userId, monthOf(request));
    return { ...dashboard, removed };
  });

  // Undo a deal removal.
  app.post('/api/kia/deals/restore', guard, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore deal' });
    }
    const userId = request.currentUser!.id;
    await restoreDeal(userId, parsed.data);
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

  app.patch('/api/kia/payplan', guard, async (request, reply) => {
    const parsed = payPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the pay plan values and try again' });
    }
    const userId = request.currentUser!.id;
    await updatePayPlan(userId, parsed.data);
    return getDashboard(userId, monthOf(request));
  });
}
