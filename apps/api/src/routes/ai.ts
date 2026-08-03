import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireWorkspace, requirePremium } from '../auth/middleware.js';
import { canAccessWorkspace, isAdmin, parseRoles, type WorkspaceKey } from '../auth/rbac.js';
import { featuresForUser } from '../features/service.js';
import { aiConfigured, chatClaude } from '../ai/claude.js';
import { getPrompt, withStyle } from '../ai/prompts.js';
import { AiLimitError, enforceAiLimit, getAiUsage } from '../ai/usage.js';

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
  workspace: z.string().max(40).optional(),
});

// The label shown for each workspace the Ask Claude persona can adopt, plus the
// prompt id whose (admin-editable) text carries that workspace's guidance. Only
// the live workspaces are here; the guidance strings live in ai/prompts.ts
// so an admin can edit them from Admin ▸ AI Instructions.
const WORKSPACE_GUIDE: Record<string, { label: string; promptId: string }> = {
  trading: { label: 'Trading', promptId: 'ws.trading' },
  studies: { label: 'Studies', promptId: 'ws.studies' },
};

// Short, friendly context so the assistant knows what app it lives in, plus
// focused guidance for the current workspace. The base persona and each
// workspace's guidance are admin-editable (ai/prompts.ts); "{workspace}" and
// "{name}" in the base persona are filled in here, and the terminal-wide response
// style is composed on last.
async function systemPrompt(workspaceKey: string | undefined, displayName: string): Promise<string> {
  const ws = workspaceKey ? WORKSPACE_GUIDE[workspaceKey] : undefined;
  const base = await getPrompt('global');
  const guide = ws ? await getPrompt(ws.promptId) : '';
  const workspaceText = ws && guide ? `The user is currently in the ${ws.label} workspace. ${guide}` : '';
  const persona = base
    .replace(/\{workspace\}/g, workspaceText)
    .replace(/\{name\}/g, displayName)
    // Collapse any double spaces left when a placeholder resolved to empty.
    .replace(/\s{2,}/g, ' ')
    .trim();
  return withStyle(persona);
}

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
  // Current user's AI usage against the two monthly caps (for the UI to show).
  //
  // An admin additionally gets `system` — what the terminal spent on its own
  // schedule tagging news and explaining calendar releases. That spend used to
  // be recorded nowhere at all, so the usage figure covered roughly half the
  // real bill. It is reported to admins only and is not a budget: nothing caps
  // the background jobs, and this exists so the number can be seen.
  app.get('/api/ai/usage', { preHandler: requireAuth }, async (request) => {
    return getAiUsage(request.currentUser!.id, isAdmin(parseRoles(request.currentUser!)));
  });

  // Ask VTS AI — paid. Customer support is deliberately NOT on this guard (see
  // routes/support.ts and routes/feedback.ts): a user who cannot reach help is a
  // user who cannot tell you their payment failed, so the complaints channel can
  // never sit behind the thing being complained about.
  app.post('/api/ai/ask', { preHandler: [requireAuth, requirePremium('ai')] }, async (request, reply) => {
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
    // Trading is opt-in, so "can access" is a feature question as well as a role
    // one — otherwise a user who has not turned the desk on could still ask for
    // the desk persona by passing its key.
    const wsAllowed =
      wsKey === 'trading'
        ? (await featuresForUser(user)).advancedTrading
        : canAccessWorkspace(parseRoles(user), wsKey as WorkspaceKey);
    const ws = wsKey && wsKey in WORKSPACE_GUIDE && wsAllowed ? wsKey : undefined;
    try {
      await enforceAiLimit(user.id, 'ask');
      const text = await chatClaude(parsed.data.messages, await systemPrompt(ws, user.displayName));
      return { reply: text };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

  // Study tutor — explain a question or answer a study question.
  app.post('/api/ai/tutor', { preHandler: [requireWorkspace('studies'), requirePremium('ai')] }, async (request, reply) => {
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
      return { reply: await chatClaude(messages, await withStyle(await getPrompt('tutor'))) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

}
