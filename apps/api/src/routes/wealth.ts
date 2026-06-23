import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import {
  addClient,
  getClients,
  getPracticeOverview,
  removeClient,
  restoreClient,
  updateClient,
} from '../wealth/service.js';
import {
  getPortfolios,
  addPortfolio,
  updatePortfolio,
  removePortfolio,
  addAllocation,
  updateAllocation,
  removeAllocation,
} from '../wealth/portfolios.js';
import { getPlans, addPlan, updatePlan, removePlan } from '../wealth/planning.js';
import { runWealthCommand } from '../wealth/parser.js';
import { aiConfigured } from '../ai/claude.js';
import { generateBrief } from '../ai/brief.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';
import {
  getCompliance,
  addItem as addComplianceItem,
  updateItem as updateComplianceItem,
  removeItem as removeComplianceItem,
} from '../wealth/compliance.js';
import {
  WEALTH_CLIENT_STATUSES,
  PORTFOLIO_RISKS,
  ASSET_CLASSES,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_STATUSES,
} from '../db/schema.js';

const status = z.enum(WEALTH_CLIENT_STATUSES);
const money = z.coerce.number().finite().min(0).max(1_000_000_000);

const addSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  accountValue: money.optional(),
  status: status.optional(),
  notes: z.string().trim().max(2000).optional(),
});

// All fields optional for editing; accountValue may be sent as null to clear it.
const editSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(60).optional(),
    accountValue: money.nullable().optional(),
    status: status.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });

const restoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().max(200).nullable(),
  phone: z.string().max(60).nullable(),
  accountValue: z.number().int().min(0).max(1_000_000_000).nullable(),
  status,
  notes: z.string().max(2000).nullable(),
  createdAt: z.number().int(),
});

export async function wealthRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('wealth') };

  app.get('/api/wealth/overview', guard, async (request) => {
    return getPracticeOverview(request.currentUser!.id);
  });

  // Claude (Sonnet) read of the advisory practice.
  app.post('/api/wealth/overview/brief', guard, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const o = await getPracticeOverview(request.currentUser!.id);
    const wusd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
    if (o.summary.totalClients === 0) {
      return { brief: 'Your book is empty — add a few clients and I’ll summarize the practice.' };
    }
    const mix = o.breakdown.map((b) => `${b.status} ${b.count} (${wusd(b.aum)})`).join(', ');
    const data = [
      `AUM ${wusd(o.summary.totalAum)} across ${o.summary.totalClients} clients (${o.summary.activeClients} active).`,
      `Average funded account ${wusd(o.avgAccount)}; largest ${wusd(o.largestAccount)}.`,
      `Pipeline (prospect + onboarding): ${wusd(o.pipelineValue)} across ${o.pipelineCount}.`,
      `Status mix: ${mix}.`,
      `Top relationships: ${o.topClients.map((c) => `${c.name} ${wusd(c.accountValue)}`).join(', ') || 'none'}.`,
    ].join('\n');
    const system =
      'You are an assistant to a financial advisor. Given a snapshot of their practice (AUM, client mix, pipeline, top relationships), write a short, practical read: how the book looks, where the opportunity or risk is (e.g. concentration, pipeline), and one or two next actions. Under 140 words, plain text, no markdown headers.';
    try {
      return { brief: await generateBrief(request.currentUser!.id, 'wealth_brief', system, data) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Brief failed' });
    }
  });

  // Plain-English "add things" via Claude (Sonnet) — clients, portfolios +
  // sleeves, planning scenarios, compliance items — several at once.
  app.post('/api/wealth/command', guard, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type something to add' });
    const userId = request.currentUser!.id;
    try {
      await enforceAiLimit(userId, 'wealth_command');
      return await runWealthCommand(userId, parsed.data.note);
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not process that' });
    }
  });

  app.get('/api/wealth/clients', guard, async (request) => {
    return getClients(request.currentUser!.id);
  });

  app.post('/api/wealth/clients', guard, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A client name is required' });
    }
    const userId = request.currentUser!.id;
    await addClient(userId, parsed.data);
    return getClients(userId);
  });

  app.patch('/api/wealth/clients/:id', guard, async (request, reply) => {
    const parsed = editSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the client details and try again' });
    }
    const userId = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    try {
      await updateClient(userId, id, parsed.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update client';
      return reply.code(400).send({ error: msg });
    }
    return getClients(userId);
  });

  app.delete('/api/wealth/clients/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    const removed = await removeClient(userId, id);
    const data = await getClients(userId);
    return { ...data, removed };
  });

  // Undo a client removal.
  app.post('/api/wealth/clients/restore', guard, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore client' });
    }
    const userId = request.currentUser!.id;
    await restoreClient(userId, parsed.data);
    return getClients(userId);
  });

  // ---- Model Portfolios ----
  app.get('/api/wealth/portfolios', guard, async (request) => getPortfolios(request.currentUser!.id));

  app.post('/api/wealth/portfolios', guard, async (request, reply) => {
    const parsed = portfolioSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A portfolio name is required' });
    try {
      return await addPortfolio(request.currentUser!.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add portfolio' });
    }
  });
  app.patch('/api/wealth/portfolios/:id', guard, async (request, reply) => {
    const parsed = editPortfolioSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the portfolio details' });
    try {
      return await updatePortfolio(request.currentUser!.id, (request.params as { id: string }).id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update portfolio' });
    }
  });
  app.delete('/api/wealth/portfolios/:id', guard, async (request) =>
    removePortfolio(request.currentUser!.id, (request.params as { id: string }).id),
  );

  // ---- Allocations (sleeves within a portfolio) ----
  app.post('/api/wealth/portfolios/:id/allocations', guard, async (request, reply) => {
    const parsed = allocationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A sleeve name is required' });
    try {
      return await addAllocation(request.currentUser!.id, (request.params as { id: string }).id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add sleeve' });
    }
  });
  app.patch('/api/wealth/allocations/:id', guard, async (request, reply) => {
    const parsed = editAllocationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the sleeve details' });
    try {
      return await updateAllocation(request.currentUser!.id, (request.params as { id: string }).id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update sleeve' });
    }
  });
  app.delete('/api/wealth/allocations/:id', guard, async (request) =>
    removeAllocation(request.currentUser!.id, (request.params as { id: string }).id),
  );

  // ---- Planning (retirement projection scenarios) ----
  app.get('/api/wealth/plans', guard, async (request) => getPlans(request.currentUser!.id));

  app.post('/api/wealth/plans', guard, async (request, reply) => {
    const parsed = planSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A scenario name is required' });
    try {
      return await addPlan(request.currentUser!.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add scenario' });
    }
  });
  app.patch('/api/wealth/plans/:id', guard, async (request, reply) => {
    const parsed = editPlanSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the scenario details' });
    try {
      return await updatePlan(request.currentUser!.id, (request.params as { id: string }).id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update scenario' });
    }
  });
  app.delete('/api/wealth/plans/:id', guard, async (request) =>
    removePlan(request.currentUser!.id, (request.params as { id: string }).id),
  );

  // ---- Compliance register ----
  app.get('/api/wealth/compliance', guard, async (request) => getCompliance(request.currentUser!.id));

  app.post('/api/wealth/compliance', guard, async (request, reply) => {
    const parsed = complianceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A title is required' });
    try {
      return await addComplianceItem(request.currentUser!.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add item' });
    }
  });
  app.patch('/api/wealth/compliance/:id', guard, async (request, reply) => {
    const parsed = editComplianceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the item details' });
    try {
      return await updateComplianceItem(request.currentUser!.id, (request.params as { id: string }).id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update item' });
    }
  });
  app.delete('/api/wealth/compliance/:id', guard, async (request) =>
    removeComplianceItem(request.currentUser!.id, (request.params as { id: string }).id),
  );
}

const commandSchema = z.object({ note: z.string().trim().min(1).max(500) });

const cmplCategory = z.enum(COMPLIANCE_CATEGORIES);
const cmplStatus = z.enum(COMPLIANCE_STATUSES);
const cmplFields = {
  category: cmplCategory.optional(),
  status: cmplStatus.optional(),
  dueAt: z.number().int().nullable().optional(),
  clientId: z.string().trim().max(64).nullish(),
  notes: z.string().trim().max(2000).nullish(),
};
const complianceSchema = z.object({ title: z.string().trim().min(1).max(160), ...cmplFields });
const editComplianceSchema = z
  .object({ title: z.string().trim().min(1).max(160).optional(), ...cmplFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const ageField = z.coerce.number().int().min(0).max(120);
const dollarField = z.coerce.number().int().min(0).max(1_000_000_000);
const rateField = z.coerce.number().int().min(0).max(5000);
const planFields = {
  clientId: z.string().trim().max(64).nullish(),
  currentAge: ageField.optional(),
  retirementAge: ageField.optional(),
  endAge: ageField.optional(),
  currentSavings: dollarField.optional(),
  annualContribution: dollarField.optional(),
  returnBp: rateField.optional(),
  inflationBp: rateField.optional(),
  incomeGoal: dollarField.optional(),
};
const planSchema = z.object({ name: z.string().trim().min(1).max(120), ...planFields });
const editPlanSchema = z
  .object({ name: z.string().trim().min(1).max(120).optional(), ...planFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const risk = z.enum(PORTFOLIO_RISKS);
const assetClass = z.enum(ASSET_CLASSES);
const bp = z.coerce.number().int().min(0).max(10000);

const portfolioSchema = z.object({
  name: z.string().trim().min(1).max(120),
  risk: risk.optional(),
  notes: z.string().trim().max(2000).nullish(),
});
const editPortfolioSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    risk: risk.optional(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const allocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  assetClass: assetClass.optional(),
  targetBp: bp.optional(),
});
const editAllocationSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    assetClass: assetClass.optional(),
    targetBp: bp.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });
