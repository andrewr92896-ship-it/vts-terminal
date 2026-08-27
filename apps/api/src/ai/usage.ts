import crypto from 'node:crypto';
import { and, count, eq, gte, inArray, isNull, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { aiUsage } from '../db/schema.js';
import { config } from '../config.js';

// Per-user AI guardrails: a per-minute burst limit (in memory) plus the durable
// monthly text cap counted from ai_usage. enforceAiLimit() is called by every
// route that hits Claude — it throws AiLimitError (mapped to HTTP 429) when a
// retained limit is reached, and otherwise records the call.
//
// Vision calls are deliberately metered but have no monthly product quota.
// Screenshot-to-trade is an input workflow, so a lifetime-of-the-month counter
// must not stop a trader from continuing to log legitimate trades. The shared
// burst limiter still bounds request/provider pressure across text and vision,
// and each route keeps its body-size and MIME validation.
//
// Deliberately NOT per-tier: there is no billing yet, and an allowance that
// varies by what somebody paid belongs with the thing that takes the payment.

export class AiLimitError extends Error {
  retryAfterSec?: number;
  constructor(message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'AiLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

// The four flows that send an image. Everything else — `ask`, `market_hours`,
// `todo_command` and the eleven `studies_*` kinds — is text.
//
// A kind not listed here counts as text, which is the safe default: new AI
// behavior remains monthly-capped until it is explicitly reviewed as a vision
// input workflow. Vision kinds are still recorded in ai_usage; this list only
// determines whether the durable monthly text cap applies.
export const VISION_KINDS = [
  'analyze',
  'position_screenshot',
  'funded_screenshot',
  'account_screenshot',
] as const;

export type AiUsageKind = 'text' | 'vision';

export function budgetFor(kind: string): AiUsageKind {
  return (VISION_KINDS as readonly string[]).includes(kind) ? 'vision' : 'text';
}

const RATE_WINDOW_MS = 60_000;
// userId -> recent call timestamps within the window. In-memory by design: a
// best-effort burst smoother that resets on restart (the monthly caps are the
// durable control).
const recentCalls = new Map<string, number[]>();

// UTC-midnight of the first day of the current Eastern-Time month.
function etMonthStartMs(): number {
  const ym = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()); // e.g. "2026-06"
  return Date.parse(`${ym}-01T00:00:00Z`);
}

// This user's calls in the current ET month, for one budget.
//
// Background rows carry a NULL user_id and can never be counted here: `user_id =
// ?` does not match NULL in SQL. That is what keeps a news-tagging poll from
// eating somebody's personal allowance — a property of the comparison rather
// than of an exclusion somebody has to remember to write.
export async function aiUsageThisMonth(userId: string, budget?: AiUsageKind): Promise<number> {
  const since = new Date(etMonthStartMs());
  const kinds = [...VISION_KINDS];
  const rows = await db
    .select({ c: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        gte(aiUsage.createdAt, since),
        budget === 'vision'
          ? inArray(aiUsage.kind, kinds)
          : budget === 'text'
            ? notInArray(aiUsage.kind, kinds)
            : undefined,
      ),
    );
  return rows[0]?.c ?? 0;
}

// Background AI in the current ET month — the rows with no user behind them.
export async function systemAiUsageThisMonth(): Promise<number> {
  const since = new Date(etMonthStartMs());
  const rows = await db
    .select({ c: count() })
    .from(aiUsage)
    .where(and(isNull(aiUsage.userId), gte(aiUsage.createdAt, since)));
  return rows[0]?.c ?? 0;
}

export interface AiBudget {
  used: number;
  limit: number;
  remaining: number;
}

export interface AiUsageCount {
  used: number;
}

export interface AiUsageInfo {
  // The text budget, kept flat as well so the existing "N left" counter in the
  // Ask VTS AI panel keeps working unchanged — an ordinary question spends this
  // one.
  used: number;
  limit: number;
  remaining: number;
  text: AiBudget;
  // Vision is metered for cost visibility, but it is not a monthly allowance.
  vision: AiUsageCount;
  // Background AI (news tagging, calendar explainers) this month. Admins only,
  // null for everyone else. Not a budget: nothing caps it, and it is here to be
  // seen rather than enforced.
  system: number | null;
}

function budget(used: number, limit: number): AiBudget {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function getAiUsage(userId: string, includeSystem = false): Promise<AiUsageInfo> {
  const [text, vision, system] = await Promise.all([
    aiUsageThisMonth(userId, 'text'),
    aiUsageThisMonth(userId, 'vision'),
    includeSystem ? systemAiUsageThisMonth() : Promise.resolve(null),
  ]);
  const textBudget = budget(text, config.AI_MONTHLY_LIMIT);
  return {
    ...textBudget,
    text: textBudget,
    vision: { used: vision },
    system,
  };
}

// Throws AiLimitError if the user is over the shared burst limit or, for text,
// the monthly limit; otherwise records the call and returns. Vision calls are
// recorded but never monthly-capped. Call this immediately before invoking
// Claude. The optional clock makes the real policy testable without waiting.
export async function enforceAiLimit(userId: string, kind: string, now = Date.now()): Promise<void> {

  const arr = (recentCalls.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= config.AI_RATE_PER_MIN) {
    const retry = Math.ceil((RATE_WINDOW_MS - (now - arr[0])) / 1000);
    throw new AiLimitError('Too many AI requests right now — give it a few seconds.', retry);
  }

  // Only text spends a durable monthly allowance. Vision remains classified so
  // usage reporting can count it separately, but repeated screenshot imports do
  // not turn into a product lockout later in the month.
  const which = budgetFor(kind);
  if (which === 'text') {
    const used = await aiUsageThisMonth(userId, which);
    if (used >= config.AI_MONTHLY_LIMIT) {
      throw new AiLimitError('Monthly AI limit reached. It resets at the start of next month.');
    }
  }

  arr.push(now);
  recentCalls.set(userId, arr);
  await db.insert(aiUsage).values({
    id: crypto.randomUUID(),
    userId,
    kind: kind.slice(0, 40),
    createdAt: new Date(now),
  });
}

// Record an AI call the terminal made on its own schedule — the news headline
// tagger and the calendar explainer, which run on the feed poller with no user
// behind them.
//
// **Records, never enforces.** These jobs are not capped: if one runs it should
// finish, and half-tagged output is worse than either extreme. The point is that
// the spend stops being invisible — it was roughly half the bill and appeared
// nowhere. It also never throws, for the same reason the audit writer does not:
// a metering failure must not take down the feed poll it was measuring.
export async function recordSystemAiUse(kind: string): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      id: crypto.randomUUID(),
      userId: null,
      kind: kind.slice(0, 40),
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('Could not record background AI use:', err);
  }
}
