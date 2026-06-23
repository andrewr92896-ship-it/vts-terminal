import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingSessions, SESSION_BIASES, type SessionBias, type TradingSessionRow } from '../db/schema.js';

// Per-user trading-session windows with bull/bear playbooks. Status is derived
// from the current Eastern-Time clock.

export type SessionStatus = 'active' | 'opening' | 'idle';

export interface StrategySession {
  id: string;
  name: string;
  instrument: string | null;
  openTime: string;
  closeTime: string;
  timeframe: string | null;
  bias: SessionBias;
  bullPlan: string | null;
  bearPlan: string | null;
  notes: string | null;
  active: boolean;
  status: SessionStatus;
  minsToOpen: number | null; // minutes until the next open (when not active)
}

const OPENING_LEAD_MIN = 30;

function nowEtMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Is minute t inside [a, b)? Handles windows that wrap past midnight.
function inWindow(t: number, a: number, b: number): boolean {
  a = ((a % 1440) + 1440) % 1440;
  b = ((b % 1440) + 1440) % 1440;
  if (a === b) return false;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

function computeStatus(row: TradingSessionRow, nowMin: number): { status: SessionStatus; minsToOpen: number | null } {
  if (!row.active) return { status: 'idle', minsToOpen: null };
  const open = parseHHMM(row.openTime);
  const close = parseHHMM(row.closeTime);
  if (open == null || close == null) return { status: 'idle', minsToOpen: null };
  if (inWindow(nowMin, open, close)) return { status: 'active', minsToOpen: null };
  if (inWindow(nowMin, open - OPENING_LEAD_MIN, open)) return { status: 'opening', minsToOpen: ((open - nowMin) % 1440 + 1440) % 1440 };
  return { status: 'idle', minsToOpen: ((open - nowMin) % 1440 + 1440) % 1440 };
}

function isBias(v: unknown): v is SessionBias {
  return typeof v === 'string' && (SESSION_BIASES as readonly string[]).includes(v);
}
function clean(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function cleanTime(v: string | undefined, fallback: string): string {
  if (v == null) return fallback;
  return parseHHMM(v) != null ? v.trim() : fallback;
}

function toSession(row: TradingSessionRow, nowMin: number): StrategySession {
  const { status, minsToOpen } = computeStatus(row, nowMin);
  return {
    id: row.id,
    name: row.name,
    instrument: row.instrument,
    openTime: row.openTime,
    closeTime: row.closeTime,
    timeframe: row.timeframe,
    bias: isBias(row.bias) ? row.bias : 'neutral',
    bullPlan: row.bullPlan,
    bearPlan: row.bearPlan,
    notes: row.notes,
    active: row.active,
    status,
    minsToOpen,
  };
}

const RANK: Record<SessionStatus, number> = { active: 0, opening: 1, idle: 2 };

export async function listSessions(userId: string): Promise<StrategySession[]> {
  const rows = await db.select().from(tradingSessions).where(eq(tradingSessions.userId, userId));
  const nowMin = nowEtMinutes();
  return rows
    .map((r) => toSession(r, nowMin))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || (parseHHMM(a.openTime) ?? 0) - (parseHHMM(b.openTime) ?? 0));
}

export interface SessionInput {
  name?: string;
  instrument?: string | null;
  openTime?: string;
  closeTime?: string;
  timeframe?: string | null;
  bias?: SessionBias;
  bullPlan?: string | null;
  bearPlan?: string | null;
  notes?: string | null;
  active?: boolean;
}

export async function addSession(userId: string, input: SessionInput): Promise<StrategySession[]> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('A name is required');
  const now = new Date();
  await db.insert(tradingSessions).values({
    id: crypto.randomUUID(),
    userId,
    name: name.slice(0, 80),
    instrument: clean(input.instrument, 40),
    openTime: cleanTime(input.openTime, '09:30'),
    closeTime: cleanTime(input.closeTime, '11:00'),
    timeframe: clean(input.timeframe, 16),
    bias: isBias(input.bias) ? input.bias : 'neutral',
    bullPlan: clean(input.bullPlan, 2000),
    bearPlan: clean(input.bearPlan, 2000),
    notes: clean(input.notes, 2000),
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return listSessions(userId);
}

export async function updateSession(userId: string, id: string, input: SessionInput): Promise<StrategySession[]> {
  const patch: Partial<typeof tradingSessions.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('A name is required');
    patch.name = n.slice(0, 80);
  }
  if (input.instrument !== undefined) patch.instrument = clean(input.instrument, 40);
  if (input.openTime !== undefined) patch.openTime = cleanTime(input.openTime, '09:30');
  if (input.closeTime !== undefined) patch.closeTime = cleanTime(input.closeTime, '11:00');
  if (input.timeframe !== undefined) patch.timeframe = clean(input.timeframe, 16);
  if (input.bias !== undefined && isBias(input.bias)) patch.bias = input.bias;
  if (input.bullPlan !== undefined) patch.bullPlan = clean(input.bullPlan, 2000);
  if (input.bearPlan !== undefined) patch.bearPlan = clean(input.bearPlan, 2000);
  if (input.notes !== undefined) patch.notes = clean(input.notes, 2000);
  if (input.active !== undefined) patch.active = input.active;
  await db.update(tradingSessions).set(patch).where(and(eq(tradingSessions.id, id), eq(tradingSessions.userId, userId)));
  return listSessions(userId);
}

export async function removeSession(userId: string, id: string): Promise<StrategySession[]> {
  await db.delete(tradingSessions).where(and(eq(tradingSessions.id, id), eq(tradingSessions.userId, userId)));
  return listSessions(userId);
}
