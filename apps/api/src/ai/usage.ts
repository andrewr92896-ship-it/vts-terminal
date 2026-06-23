import crypto from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { aiUsage } from '../db/schema.js';
import { config } from '../config.js';

// Per-user AI guardrails: a per-minute burst limit (in memory) plus a monthly
// cap (counted from the ai_usage table). enforceAiLimit() is called by every
// route that hits Claude — it throws AiLimitError (mapped to HTTP 429) when a
// limit is reached, and otherwise records the call.

export class AiLimitError extends Error {
  retryAfterSec?: number;
  constructor(message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'AiLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

const RATE_WINDOW_MS = 60_000;
// userId -> recent call timestamps within the window. In-memory by design: a
// best-effort burst smoother that resets on restart (the monthly cap is the
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

export async function aiUsageThisMonth(userId: string): Promise<number> {
  const since = new Date(etMonthStartMs());
  const rows = await db
    .select({ c: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)));
  return rows[0]?.c ?? 0;
}

export interface AiUsageInfo {
  used: number;
  limit: number;
  remaining: number;
}

export async function getAiUsage(userId: string): Promise<AiUsageInfo> {
  const used = await aiUsageThisMonth(userId);
  const limit = config.AI_MONTHLY_LIMIT;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

// Throws AiLimitError if the user is over the burst or monthly limit; otherwise
// records the call and returns. Call this immediately before invoking Claude.
export async function enforceAiLimit(userId: string, kind: string): Promise<void> {
  const now = Date.now();

  const arr = (recentCalls.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= config.AI_RATE_PER_MIN) {
    const retry = Math.ceil((RATE_WINDOW_MS - (now - arr[0])) / 1000);
    throw new AiLimitError('Too many AI requests right now — give it a few seconds.', retry);
  }

  const used = await aiUsageThisMonth(userId);
  if (used >= config.AI_MONTHLY_LIMIT) {
    throw new AiLimitError('Monthly AI limit reached. It resets at the start of next month.');
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
