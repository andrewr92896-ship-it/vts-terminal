import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireWorkspace, requirePremium } from '../auth/middleware.js';
import { canAccessWorkspace, isAdmin, parseRoles, type WorkspaceKey } from '../auth/rbac.js';
import { hasEntitlement } from '../memberships/service.js';
import {
  FEATURE_LABELS,
  FEATURE_TIER,
  TIER_LABELS,
  type PremiumFeature,
} from '../memberships/tiers.js';
import { featuresForUser } from '../features/service.js';
import { aiConfigured, chatClaude } from '../ai/claude.js';
import { getPrompt } from '../ai/prompts.js';
import { checkRefusal, withGuardrails } from '../ai/guardrails.js';
import {
  AiTimeoutError,
  activeTimeout,
  disputeViolation,
  enforceAiTimeout,
  recordViolation,
} from '../ai/violations.js';
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
  return withGuardrails(persona);
}

const tutorSchema = z.object({
  // The learner pressed the canned opener ("Break this down" / "More Details")
  // rather than typing something. It only reaches the cheaper Premium tier when
  // it is what it claims to be — one opening turn, see `neededForTutor` below.
  seed: z.boolean().optional(),
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

// Which tier a tutor request costs. The study tutor is split across two paid
// features (owner decision, 2026-08): the **one-tap breakdown** of the question
// already on screen is Premium, and **typing your own question** — the opener as
// well as every follow-up — is Max.
//
// The split is enforced on the SHAPE of the request, not on the client's word for
// it. `explain` is the structured form whose prompt this file composes, so there
// is no user text in it at all; `seed` is the canned opener, and it only counts
// as one when it really is an opening turn. Anything else — free-form `ask`, a
// running conversation, a `seed` flag on a thread already underway — is the Max
// half. So the worst a hand-rolled request can buy is a single canned-shaped
// turn, which is what the tier it claims already pays for.
function neededForTutor(body: z.infer<typeof tutorSchema>): PremiumFeature {
  if (body.explain) return 'studyExplain';
  if (body.seed && !body.ask && (body.messages?.length ?? 0) <= 1) return 'studyExplain';
  return 'studyAsk';
}

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
      // Timeout BEFORE the spend: the point of pausing somebody is not to make
      // the call. 423 rather than 429 so the client can tell "you are paused for
      // breaking a rule" from "you have used your monthly allowance" — they need
      // completely different things said to them.
      await enforceAiTimeout(user.id);
      await enforceAiLimit(user.id, 'ask');
      const raw = await chatClaude(parsed.data.messages, await systemPrompt(ws, user.displayName));
      const { reply: text, refused } = checkRefusal(raw);
      if (!refused) return { reply: text };
      const v = await recordViolation({
        userId: user.id,
        surface: 'ask',
        messages: parsed.data.messages,
        reply: text,
      });
      // The refusal itself still reaches the user — they asked a question and the
      // assistant answered it, however unwelcome the answer. `guardrail` is what
      // the panel uses to draw the warning card beneath it.
      return {
        reply: text,
        guardrail: {
          violationId: v.id,
          timedOut: v.timedOut,
          timeoutUntil: v.timeoutUntil,
        },
      };
    } catch (err) {
      if (err instanceof AiTimeoutError) {
        return reply.code(423).send({ error: 'AI access is paused', timeoutUntil: err.until });
      }
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

  // Study tutor — explain a question or answer a study question.
  //
  // Gated by REQUEST SHAPE inside the handler rather than by a preHandler, the
  // same way `/api/support/message` gates by intake kind: one endpoint serves
  // both halves of the tutor and they sit on different tiers. See
  // `neededForTutor` above for which is which.
  app.post('/api/ai/tutor', { preHandler: [requireWorkspace('studies')] }, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = tutorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Provide a question to explain or ask' });
    }
    const needed = neededForTutor(parsed.data);
    if (!(await hasEntitlement(request.currentUser!, needed))) {
      // 402, not 403: the client turns this into an upgrade prompt, while a 403
      // would tell a would-be customer they are forbidden from the thing they
      // would have paid for.
      return reply.code(402).send({
        error: `${FEATURE_LABELS[needed]} needs a ${TIER_LABELS[FEATURE_TIER[needed]]} membership`,
        upgrade: { feature: needed, requiredTier: FEATURE_TIER[needed] },
      });
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
      await enforceAiTimeout(request.currentUser!.id);
      await enforceAiLimit(request.currentUser!.id, 'studies_tutor');
      const raw = await chatClaude(messages, await withGuardrails(await getPrompt('tutor')));
      const { reply: text, refused } = checkRefusal(raw);
      if (!refused) return { reply: text };
      const v = await recordViolation({
        userId: request.currentUser!.id,
        surface: 'tutor',
        messages,
        reply: text,
      });
      return {
        reply: text,
        guardrail: { violationId: v.id, timedOut: v.timedOut, timeoutUntil: v.timeoutUntil },
      };
    } catch (err) {
      if (err instanceof AiTimeoutError) {
        return reply.code(423).send({ error: 'AI access is paused', timeoutUntil: err.until });
      }
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'AI request failed' });
    }
  });

  // The user pressing "I think the AI made a mistake" on a warning.
  //
  // Scoped to their own violations by the service; there is no parameter that
  // widens it. It flags the row for a human and does not lift the timeout —
  // see disputeViolation for why both halves of that are deliberate.
  app.post('/api/ai/guardrail/:id/dispute', { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = z
      .object({ note: z.string().trim().max(1000).optional() })
      .safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid note' });
    const ok = await disputeViolation(request.currentUser!.id, id, parsed.data.note ?? null);
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  // The caller's own AI standing, so the panel can draw the paused state on load
  // rather than only after a rejected send.
  app.get('/api/ai/guardrail/status', { preHandler: requireAuth }, async (request) => {
    return { timeoutUntil: await activeTimeout(request.currentUser!.id) };
  });
}
