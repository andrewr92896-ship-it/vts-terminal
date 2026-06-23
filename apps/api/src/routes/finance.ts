import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import {
  getOverview,
  updateSettings,
  listExpenses,
  addExpense,
  updateExpense,
  removeExpense,
  getNetWorth,
  addNetWorth,
  updateNetWorth,
  removeNetWorth,
} from '../finance/service.js';
import { FTP_PHASES, NET_WORTH_KINDS } from '../db/schema.js';

const money = z.number().finite().min(0).max(1_000_000_000);
const day = z.number().int().min(1).max(31);

const settingsSchema = z
  .object({
    ftpPhase: z.enum(FTP_PHASES).optional(),
    ftpDivisor: z.number().finite().min(0.0001).max(100000).optional(),
    ftpPayoutPct: z.number().finite().min(0).max(100).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const addExpenseSchema = z.object({
  label: z.string().trim().min(1).max(80),
  amount: money,
  dayOfMonth: day,
  category: z.string().trim().max(40).nullish(),
});
const editExpenseSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    amount: money.optional(),
    dayOfMonth: day.optional(),
    category: z.string().trim().max(40).nullish(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const kind = z.enum(NET_WORTH_KINDS);
const addNwSchema = z.object({ label: z.string().trim().min(1).max(80), amount: money, kind });
const editNwSchema = z
  .object({ label: z.string().trim().min(1).max(80).optional(), amount: money.optional(), kind: kind.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export async function financeRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('finance') };
  const uid = (r: { currentUser: { id: string } | null }) => r.currentUser!.id;

  app.get('/api/finance/overview', guard, async (request) => getOverview(uid(request)));

  app.patch('/api/finance/settings', guard, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the settings and try again' });
    return updateSettings(uid(request), parsed.data);
  });

  // Expenses
  app.get('/api/finance/expenses', guard, async (request) => ({ expenses: await listExpenses(uid(request)) }));
  app.post('/api/finance/expenses', guard, async (request, reply) => {
    const parsed = addExpenseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A label, amount and day are required' });
    return { expenses: await addExpense(uid(request), parsed.data) };
  });
  app.patch('/api/finance/expenses/:id', guard, async (request, reply) => {
    const parsed = editExpenseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the expense details' });
    return { expenses: await updateExpense(uid(request), (request.params as { id: string }).id, parsed.data) };
  });
  app.delete('/api/finance/expenses/:id', guard, async (request) => ({
    expenses: await removeExpense(uid(request), (request.params as { id: string }).id),
  }));

  // Net worth
  app.get('/api/finance/net-worth', guard, async (request) => getNetWorth(uid(request)));
  app.post('/api/finance/net-worth', guard, async (request, reply) => {
    const parsed = addNwSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A label, amount and type are required' });
    return addNetWorth(uid(request), parsed.data);
  });
  app.patch('/api/finance/net-worth/:id', guard, async (request, reply) => {
    const parsed = editNwSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the item details' });
    return updateNetWorth(uid(request), (request.params as { id: string }).id, parsed.data);
  });
  app.delete('/api/finance/net-worth/:id', guard, async (request) => removeNetWorth(uid(request), (request.params as { id: string }).id));
}
