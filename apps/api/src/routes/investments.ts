import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { isDemoUser } from '../demo/identity.js';
import {
  INVESTMENT_ACCOUNT_KINDS,
  INVESTMENT_ASSET_CLASSES,
  INVESTMENT_GOAL_KINDS,
  INVESTMENT_TX_KINDS,
} from '../db/schema.js';
import {
  InvestmentError,
  createAccount,
  createGoal,
  createHolding,
  createTransaction,
  getContributions,
  getDividends,
  getPerformance,
  getPortfolio,
  getProjection,
  listTransactions,
  removeAccount,
  removeGoal,
  removeHolding,
  removeTransaction,
  updateAccount,
  updateHolding,
} from '../investments/service.js';

// The Investments workspace API.
//
// Everything is behind plain `requireAuth`: Investments is included with every
// account (see features/service.ts — only Advanced Trading and Funded are
// opt-in), so there is no workspace gate to apply. What there IS, on every
// single route, is the caller's own id — this workspace has no team scope and
// must never grow one. An investment account is personal.
//
// The demo reaches the reads and none of the writes: demoGuard 403s every
// non-GET before a handler here runs.

const accountBody = z.object({
  kind: z.enum(INVESTMENT_ACCOUNT_KINDS),
  label: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(80).nullish(),
  cashBalance: z.number().finite().min(0).max(1e12).optional(),
  note: z.string().trim().max(500).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const holdingBody = z.object({
  accountId: z.string().min(1),
  symbol: z.string().trim().max(20).nullish(),
  name: z.string().trim().min(1).max(120),
  assetClass: z.enum(INVESTMENT_ASSET_CLASSES),
  quantity: z.number().finite().min(0).max(1e12),
  costBasis: z.number().finite().min(0).max(1e12).nullish(),
  manualPrice: z.number().finite().min(0).max(1e9).nullish(),
  sector: z.string().trim().max(60).nullish(),
  region: z.string().trim().max(60).nullish(),
  note: z.string().trim().max(500).nullish(),
});

const txBody = z.object({
  accountId: z.string().min(1),
  holdingId: z.string().min(1).nullish(),
  kind: z.enum(INVESTMENT_TX_KINDS),
  amount: z.number().finite().min(0).max(1e12),
  quantity: z.number().finite().min(0).max(1e12).nullish(),
  symbol: z.string().trim().max(20).nullish(),
  occurredAt: z.number().int().positive(),
  taxYear: z.number().int().min(1900).max(2200).nullish(),
  note: z.string().trim().max(500).nullish(),
});

const goalBody = z.object({
  accountId: z.string().min(1).nullish(),
  kind: z.enum(INVESTMENT_GOAL_KINDS),
  label: z.string().trim().min(1).max(80),
  targetAmount: z.number().finite().positive().max(1e12),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullish(),
  note: z.string().trim().max(500).nullish(),
});

const projectionQuery = z.object({
  monthlyContribution: z.coerce.number().finite().min(0).max(1e7).default(0),
  // Bounded deliberately. This is a compound-growth calculator, and an
  // unbounded rate turns it into a fantasy generator rather than an estimate.
  annualRatePct: z.coerce.number().finite().min(-20).max(30).default(7),
  years: z.coerce.number().int().min(1).max(50).default(20),
});

function fail(err: unknown): string {
  return err instanceof InvestmentError ? err.message : 'Something went wrong';
}

export async function investmentRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: requireAuth };

  // ---- Portfolio (Overview / Holdings / Allocation all read this) ----
  app.get('/api/investments/portfolio', auth, async (request) => {
    const user = request.currentUser!;
    // The daily snapshot is a write on a GET, which is fine for a real account
    // (it is how Performance gets a history at all) but wrong for the demo:
    // the showcase must not accumulate rows, and demoGuard only covers non-GET.
    return getPortfolio(user.id, { recordSnapshot: !isDemoUser(user) });
  });

  // ---- Accounts ----
  app.post('/api/investments/accounts', auth, async (request, reply) => {
    const parsed = accountBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Give the account a name and a type' });
    try {
      const id = await createAccount(request.currentUser!.id, parsed.data);
      return { id, portfolio: await getPortfolio(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.patch<{ Params: { id: string } }>('/api/investments/accounts/:id', auth, async (request, reply) => {
    const parsed = accountBody.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to change' });
    try {
      await updateAccount(request.currentUser!.id, request.params.id, parsed.data);
      return { portfolio: await getPortfolio(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/investments/accounts/:id', auth, async (request, reply) => {
    try {
      await removeAccount(request.currentUser!.id, request.params.id);
      return { portfolio: await getPortfolio(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  // ---- Holdings ----
  app.post('/api/investments/holdings', auth, async (request, reply) => {
    const parsed = holdingBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Give the holding a name and a quantity' });
    try {
      const id = await createHolding(request.currentUser!.id, parsed.data);
      return { id, portfolio: await getPortfolio(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.patch<{ Params: { id: string } }>('/api/investments/holdings/:id', auth, async (request, reply) => {
    const parsed = holdingBody.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to change' });
    try {
      await updateHolding(request.currentUser!.id, request.params.id, parsed.data);
      return { portfolio: await getPortfolio(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/investments/holdings/:id', auth, async (request, reply) => {
    try {
      await removeHolding(request.currentUser!.id, request.params.id);
      return { portfolio: await getPortfolio(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  // ---- Transactions (contributions, dividends, buys, sells) ----
  app.get<{ Querystring: { accountId?: string } }>(
    '/api/investments/transactions',
    auth,
    async (request) => ({
      entries: await listTransactions(request.currentUser!.id, {
        accountId: request.query.accountId,
      }),
    }),
  );

  app.post('/api/investments/transactions', auth, async (request, reply) => {
    const parsed = txBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter an amount and a date' });
    try {
      const id = await createTransaction(request.currentUser!.id, parsed.data);
      return { id, entries: await listTransactions(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.delete<{ Params: { id: string } }>(
    '/api/investments/transactions/:id',
    auth,
    async (request, reply) => {
      try {
        await removeTransaction(request.currentUser!.id, request.params.id);
        return { entries: await listTransactions(request.currentUser!.id) };
      } catch (err) {
        return reply.code(400).send({ error: fail(err) });
      }
    },
  );

  // ---- Contributions & Goals ----
  app.get<{ Querystring: { taxYear?: string } }>(
    '/api/investments/contributions',
    auth,
    async (request) => {
      const year = Number(request.query.taxYear);
      const taxYear =
        Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : new Date().getFullYear();
      return getContributions(request.currentUser!.id, taxYear);
    },
  );

  app.post('/api/investments/goals', auth, async (request, reply) => {
    const parsed = goalBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Give the goal a name and a target above 0' });
    try {
      const id = await createGoal(request.currentUser!.id, parsed.data);
      return { id };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/investments/goals/:id', auth, async (request, reply) => {
    try {
      await removeGoal(request.currentUser!.id, request.params.id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  // ---- Performance ----
  app.get<{ Querystring: { days?: string } }>('/api/investments/performance', auth, async (request) => {
    const days = Number(request.query.days);
    const rangeDays = Number.isInteger(days) && days > 0 && days <= 3650 ? days : 365;
    return getPerformance(request.currentUser!.id, rangeDays);
  });

  // ---- Dividends & income ----
  app.get('/api/investments/dividends', auth, async (request) => getDividends(request.currentUser!.id));

  // ---- Projections ----
  app.get('/api/investments/projection', auth, async (request, reply) => {
    const parsed = projectionQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the projection settings' });
    return getProjection(request.currentUser!.id, parsed.data);
  });
}
