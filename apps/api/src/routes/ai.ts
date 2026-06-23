import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireWorkspace } from '../auth/middleware.js';
import { aiConfigured, chatClaude } from '../ai/claude.js';

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
  workspace: z.string().max(40).optional(),
});

// Short, friendly context so the assistant knows what app it lives in.
function systemPrompt(workspace: string | undefined, displayName: string): string {
  return [
    'You are the built-in assistant inside VTS Portal — a private dark "pro-terminal" web app for Andrew and a few invited users.',
    'It bundles several workspaces: Trading (live broker positions, trade log, alerts, history, prop-firm challenge metrics), Kia Sales (a car-salesperson commission tracker), Studies (a Series 65 study game), a To-Do list, Vitalis Wealth Management, and Personal Finance (earnings, expenses, net worth).',
    workspace ? `The user is currently in the "${workspace}" workspace.` : '',
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
      const text = await chatClaude(parsed.data.messages, systemPrompt(parsed.data.workspace, user.displayName));
      return { reply: text };
    } catch (err) {
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
      return { reply: await chatClaude(parsed.data.messages, KIA_SYSTEM) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });
}
