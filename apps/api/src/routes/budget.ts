import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
  BudgetError,
  addCategory,
  addEntry,
  etThisMonth,
  getBudgetMonth,
  isMonthKey,
  removeCategory,
  removeEntry,
  updateCategory,
} from '../finances/budget.js';

// Finances ▸ Budget. Every route is the caller's own — the service takes a
// userId and there is no parameter anywhere here that names somebody else.
//
// On plain `requireAuth`: budgeting is included with every account. It holds no
// credential, places no order and reads no broker, so there is nothing to opt
// into and nothing to charge for. The demo is refused its writes by demoGuard.

// Money arrives from the client as DOLLARS (what the user typed) and is stored
// as CENTS. The conversion happens exactly here, at the edge, so nothing in the
// service has to wonder which unit it is holding.
//
// `Math.round` rather than truncation: 12.345 typed into a money field means
// 12.35 to the person typing it, and truncating would quietly lose a cent per
// entry in a feature whose whole job is adding money up.
const dollarsToCents = (v: number) => Math.round(v * 100);

const moneySchema = z.number().finite().min(0).max(1_000_000_000);

const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['income', 'expense']),
  monthlyLimit: moneySchema.nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
});

const categoryPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  monthlyLimit: moneySchema.nullable().optional(),
  archived: z.boolean().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
});

const entrySchema = z.object({
  categoryId: z.string().min(1).max(64),
  amount: moneySchema,
  note: z.string().trim().max(200).nullable().optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: requireAuth };

  const fail = (reply: import('fastify').FastifyReply, err: unknown) => {
    if (err instanceof BudgetError) return reply.code(400).send({ error: err.message });
    throw err;
  };

  app.get('/api/finances/budget', guard, async (request, reply) => {
    const q = request.query as { month?: string };
    const month = q.month && isMonthKey(q.month) ? q.month : etThisMonth();
    try {
      return await getBudgetMonth(request.currentUser!.id, month);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/finances/budget/categories', guard, async (request, reply) => {
    const parsed = categorySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the category details' });
    try {
      await addCategory(request.currentUser!.id, {
        name: parsed.data.name,
        kind: parsed.data.kind,
        monthlyLimit:
          parsed.data.monthlyLimit == null ? null : dollarsToCents(parsed.data.monthlyLimit),
        icon: parsed.data.icon ?? null,
      });
      return await getBudgetMonth(request.currentUser!.id, etThisMonth());
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.patch('/api/finances/budget/categories/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = categoryPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid changes' });
    const q = request.query as { month?: string };
    const month = q.month && isMonthKey(q.month) ? q.month : etThisMonth();
    try {
      await updateCategory(request.currentUser!.id, id, {
        name: parsed.data.name,
        monthlyLimit:
          parsed.data.monthlyLimit === undefined
            ? undefined
            : parsed.data.monthlyLimit === null
              ? null
              : dollarsToCents(parsed.data.monthlyLimit),
        archived: parsed.data.archived,
        icon: parsed.data.icon,
      });
      return await getBudgetMonth(request.currentUser!.id, month);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete('/api/finances/budget/categories/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const q = request.query as { month?: string };
    const month = q.month && isMonthKey(q.month) ? q.month : etThisMonth();
    try {
      await removeCategory(request.currentUser!.id, id);
      return await getBudgetMonth(request.currentUser!.id, month);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/finances/budget/entries', guard, async (request, reply) => {
    const parsed = entrySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the amount and category' });
    try {
      await addEntry(request.currentUser!.id, {
        categoryId: parsed.data.categoryId,
        amountCents: dollarsToCents(parsed.data.amount),
        note: parsed.data.note ?? null,
        occurredOn: parsed.data.occurredOn,
      });
      const month = (parsed.data.occurredOn ?? '').slice(0, 7);
      return await getBudgetMonth(
        request.currentUser!.id,
        isMonthKey(month) ? month : etThisMonth(),
      );
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete('/api/finances/budget/entries/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const q = request.query as { month?: string };
    const month = q.month && isMonthKey(q.month) ? q.month : etThisMonth();
    try {
      await removeEntry(request.currentUser!.id, id);
      return await getBudgetMonth(request.currentUser!.id, month);
    } catch (err) {
      return fail(reply, err);
    }
  });
}
