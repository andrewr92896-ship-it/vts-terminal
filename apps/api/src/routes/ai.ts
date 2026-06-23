import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireWorkspace } from '../auth/middleware.js';
import { aiConfigured, chatClaude } from '../ai/claude.js';
import { AiLimitError, enforceAiLimit, getAiUsage } from '../ai/usage.js';
import { generateQuiz } from '../ai/quiz.js';
import { canAccessWorkspace, isWorkspaceReadOnly, parseRoles, type WorkspaceKey } from '../auth/rbac.js';
import { runFinanceCommand } from '../finance/parser.js';
import { runWealthCommand } from '../wealth/parser.js';
import { runKiaCommand } from '../kia/command.js';
import { runTradeCommand } from '../trading/tradeParser.js';

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
  workspace: z.string().max(40).optional(),
});

// Per-workspace guidance so the assistant behaves like a focused helper for
// whatever area the user is in. Keyed by workspace key (see web access.ts).
const WORKSPACE_GUIDE: Record<string, { label: string; guide: string }> = {
  trading: {
    label: 'Trading',
    guide:
      'Help with live broker positions, the trade log and slippage, strategy sessions, the prop-firm (FTP) challenge metrics (profit target, daily and trailing drawdown), market news, and trade journaling. Be precise and risk-aware; emphasize protecting drawdown buffers. This is not personalized investment advice.',
  },
  kia: {
    label: 'Kia Sales',
    guide:
      'Help a Kia salesperson with deals, commission and pay-plan math, pace to their monthly unit goal, Google-review targets, and Kia product/process questions. Be practical and floor-ready.',
  },
  finance: {
    label: 'Personal Finance',
    guide:
      'Help with personal finances — take-home across jobs and businesses, monthly expenses and bills, FTP payout scaling, and net worth. Be encouraging but honest, and suggest concrete next steps.',
  },
  wealth: {
    label: 'Vitalis Wealth',
    guide:
      'Help run the advisory practice: client book, model portfolios and allocations, retirement planning scenarios, and RIA compliance recordkeeping. This is practice-management help, not personalized investment advice for the user.',
  },
  studies: {
    label: 'Studies',
    guide:
      'Help the user study for the Series 65 (Uniform Investment Adviser Law Exam): explain concepts clearly, give memory hooks, and quiz them when asked.',
  },
  todo: {
    label: 'To-Do',
    guide:
      'Help organize tasks and routines. Mention they can also use the "Ask Claude / command" bar on the To-Do screen to add, check, or remove tasks directly.',
  },
};

// Short, friendly context so the assistant knows what app it lives in, plus
// focused guidance for the current workspace.
function systemPrompt(workspaceKey: string | undefined, displayName: string): string {
  const ws = workspaceKey ? WORKSPACE_GUIDE[workspaceKey] : undefined;
  return [
    'You are the built-in assistant inside VTS Portal — a private dark "pro-terminal" web app for Andrew and a few invited users.',
    'It bundles several workspaces: Trading, Kia Sales, Studies (Series 65), a To-Do list, Vitalis Wealth Management, and Personal Finance.',
    ws ? `The user is currently in the ${ws.label} workspace. ${ws.guide}` : '',
    `You are talking to ${displayName}.`,
    'Be concise, practical, and direct. You do not have live access to their data; if they ask for specific numbers, point them to the relevant screen. Use plain text (no markdown headers).',
  ]
    .filter(Boolean)
    .join(' ');
}

const TUTOR_SYSTEM = [
  'You are a patient Series 65 (Uniform Investment Adviser Law Exam) tutor.',
  'Explain clearly and concisely for an exam candidate: the key concept, why the correct answer is right and the tempting wrong ones are wrong, and a short memory hook when it helps.',
  'Keep it under 160 words. Plain text, no markdown headers.',
].join(' ');

const tutorSchema = z.object({
  explain: z
    .object({
      stem: z.string().trim().min(1).max(1500),
      options: z.array(z.object({ label: z.string().max(2), text: z.string().max(600) })).max(8),
      answer: z.string().trim().max(2),
      topic: z.string().trim().max(60).optional(),
    })
    .optional(),
  ask: z.string().trim().min(1).max(500).optional(),
}).refine((v) => v.explain || v.ask, { message: 'Provide a question to explain or ask' });

const actSchema = z.object({
  workspace: z.enum(['finance', 'wealth', 'kia', 'trading']),
  message: z.string().trim().min(1).max(600),
});

const quizSchema = z.object({
  topic: z.string().trim().max(60).optional(),
  count: z.coerce.number().int().min(1).max(10).optional(),
});

const KIA_SYSTEM = [
  'You are a Kia product expert helping a salesperson on the floor at a Kia dealership.',
  'Answer questions about Kia models, trims, specs, towing and payload, EV range and charging, MPG, key features, incentives, and basic troubleshooting — accurately and concisely, the way you would brief a salesperson before they walk back to a customer.',
  'Exact figures vary by model year and trim. When you are not certain of an exact number, say so, give the typical range, and suggest confirming on the window sticker or kia.com.',
  'Use plain text — short paragraphs or simple bullet lines, no markdown headers.',
].join(' ');

export async function aiRoutes(app: FastifyInstance) {
  // Current user's AI usage against the monthly cap (for the UI to show).
  app.get('/api/ai/usage', { preHandler: requireAuth }, async (request) => {
    return getAiUsage(request.currentUser!.id);
  });

  app.post('/api/ai/ask', { preHandler: requireAuth }, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request' });
    }
    const user = request.currentUser!;
    try {
      await enforceAiLimit(user.id, 'ask');
      const text = await chatClaude(parsed.data.messages, systemPrompt(parsed.data.workspace, user.displayName));
      return { reply: text };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

  // Series 65 study tutor — explain a question or answer a study question.
  app.post('/api/ai/tutor', { preHandler: requireWorkspace('studies') }, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = tutorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Provide a question to explain or ask' });
    }
    let prompt: string;
    if (parsed.data.explain) {
      const e = parsed.data.explain;
      const opts = e.options.map((o) => `${o.label}) ${o.text}`).join('\n');
      prompt = [
        e.topic ? `Topic: ${e.topic}.` : '',
        `Question: ${e.stem}`,
        `Options:\n${opts}`,
        `The correct answer is ${e.answer}.`,
        'Explain why that answer is correct and why the others are wrong.',
      ].filter(Boolean).join('\n');
    } else {
      prompt = parsed.data.ask!;
    }
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_tutor');
      return { reply: await chatClaude([{ role: 'user', content: prompt }], TUTOR_SYSTEM) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

  // Let the global Ask Claude panel take actions: route an add/log message to
  // the right workspace parser. Enforces the same per-workspace access and AI
  // limits as that workspace's own command bar.
  app.post('/api/ai/act', { preHandler: requireAuth }, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const parsed = actSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing to do' });
    const user = request.currentUser!;
    const ws = parsed.data.workspace as WorkspaceKey;
    const roles = parseRoles(user);
    if (!canAccessWorkspace(roles, ws)) return reply.code(403).send({ error: 'No access to that workspace' });
    if (isWorkspaceReadOnly(roles, ws)) return reply.code(403).send({ error: 'You have read-only access here' });
    const kind = { finance: 'finance_command', wealth: 'wealth_command', kia: 'kia_command', trading: 'trade_log' }[parsed.data.workspace];
    try {
      await enforceAiLimit(user.id, kind);
      const msg = parsed.data.message;
      const r =
        parsed.data.workspace === 'finance' ? await runFinanceCommand(user.id, msg)
        : parsed.data.workspace === 'wealth' ? await runWealthCommand(user.id, msg)
        : parsed.data.workspace === 'kia' ? await runKiaCommand(user.id, msg)
        : await runTradeCommand(user.id, msg, !!user.viewBrokerage);
      return { reply: r.reply, applied: r.applied, skipped: r.skipped };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Action failed' });
    }
  });

  // Series 65 practice-quiz generator — fresh AI-written questions on a topic.
  app.post('/api/ai/quiz', { preHandler: requireWorkspace('studies') }, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = quizSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Pick a topic and number of questions' });
    }
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_quiz');
      return await generateQuiz(parsed.data.topic, parsed.data.count ?? 5);
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

  // Kia Product Knowledge — same Sonnet model, a vehicle-expert persona.
  app.post('/api/ai/kia', { preHandler: requireWorkspace('kia') }, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request' });
    }
    try {
      await enforceAiLimit(request.currentUser!.id, 'kia');
      return { reply: await chatClaude(parsed.data.messages, KIA_SYSTEM) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });
}
