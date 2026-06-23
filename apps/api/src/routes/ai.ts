import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireWorkspace } from '../auth/middleware.js';
import { aiConfigured, chatClaude } from '../ai/claude.js';
import { AiLimitError, enforceAiLimit, getAiUsage } from '../ai/usage.js';

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
