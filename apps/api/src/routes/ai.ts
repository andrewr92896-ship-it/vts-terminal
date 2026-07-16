import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireWorkspace } from '../auth/middleware.js';
import { canAccessWorkspace, parseRoles, type WorkspaceKey } from '../auth/rbac.js';
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
    'It bundles several workspaces: Trading, Studies (Series 65), a To-Do list, Vitalis Wealth Management, and Personal Finance.',
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
  // Free-form question. Large enough to carry the surrounding question/term
  // context the client prepends so the answer stays on-topic.
  ask: z.string().trim().min(1).max(2000).optional(),
  // Multi-turn chat: the running conversation for a back-and-forth with the
  // tutor. The client carries the question/term context in the first message.
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(40)
    .optional(),
}).refine((v) => v.explain || v.ask || v.messages, { message: 'Provide a question to explain or ask' });

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
    // Only adopt a workspace persona the caller can actually access, so a user
    // cannot target a workspace they do not have by passing its key.
    const wsKey = parsed.data.workspace;
    const ws =
      wsKey && wsKey in WORKSPACE_GUIDE && canAccessWorkspace(parseRoles(user), wsKey as WorkspaceKey)
        ? wsKey
        : undefined;
    try {
      await enforceAiLimit(user.id, 'ask');
      const text = await chatClaude(parsed.data.messages, systemPrompt(ws, user.displayName));
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
    // A running chat takes precedence; otherwise build a single user turn from
    // the structured "explain" request or the free-form "ask".
    let messages: { role: 'user' | 'assistant'; content: string }[];
    if (parsed.data.messages) {
      messages = parsed.data.messages;
    } else {
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
      messages = [{ role: 'user', content: prompt }];
    }
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_tutor');
      return { reply: await chatClaude(messages, TUTOR_SYSTEM) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

}
