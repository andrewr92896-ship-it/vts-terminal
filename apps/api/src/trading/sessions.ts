import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingSessions, type TradingSessionRow } from '../db/schema.js';

// Per-user trading-session windows with a directional bias and a per-weekday
// schedule. Status is derived from the current Eastern-Time clock. `neutral` was
// dropped from the UI; legacy rows carrying it are coerced to `both` on read.

export type SessionBias = 'bull' | 'bear' | 'both';
export type SessionStatus = 'active' | 'opening' | 'idle';

// The trading week, Monday–Friday. Weekends carry no window (the desk is dark),
// so a Sat/Sun status is always idle with the next open pointing to Monday+.
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DayWindow {
  open: string; // ET 'HH:MM'
  close: string;
}
export type WeekSchedule = Partial<Record<Weekday, DayWindow>>;

export interface StrategySession {
  id: string;
  name: string;
  instrument: string | null;
  days: WeekSchedule; // enabled weekdays with their windows
  marketHours: boolean; // true when filled from the instrument's full market hours
  timeframe: string | null;
  bias: SessionBias;
  notes: string | null;
  active: boolean;
  status: SessionStatus;
  minsToOpen: number | null; // minutes until the next open (when not active)
}

const OPENING_LEAD_MIN = 30;

// ET weekday index: 0=Sun … 6=Sat. Shared by status + the notification watch so
// both agree on "what day is it on the desk".
export function etDowKey(dow: number): Weekday | null {
  switch (dow) {
    case 1: return 'mon';
    case 2: return 'tue';
    case 3: return 'wed';
    case 4: return 'thu';
    case 5: return 'fri';
    default: return null; // weekend
  }
}

// Current Eastern-Time clock as { minutes-since-midnight, weekday index }.
export function etNow(now: Date = new Date()): { min: number; dow: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
  return { min: h * 60 + m, dow };
}

// A stable ET calendar-day stamp ('YYYY-MM-DD'), used by the notification watch
// to fire each per-day event at most once.
export function etDayStamp(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function parseHHMM(s: string): number | null {
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

function isBias(v: unknown): v is SessionBias {
  return v === 'bull' || v === 'bear' || v === 'both';
}
function coerceBias(v: unknown): SessionBias {
  return isBias(v) ? v : 'both'; // legacy 'neutral' (or anything odd) → both
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

// Coerce arbitrary input into a clean WeekSchedule: only mon–fri keys, each with
// a valid HH:MM open and close. Days that don't parse are dropped.
export function cleanSchedule(input: unknown): WeekSchedule {
  const out: WeekSchedule = {};
  if (!input || typeof input !== 'object') return out;
  const obj = input as Record<string, unknown>;
  for (const day of WEEKDAYS) {
    const raw = obj[day];
    if (!raw || typeof raw !== 'object') continue;
    const w = raw as Record<string, unknown>;
    const open = typeof w.open === 'string' ? w.open.trim() : '';
    const close = typeof w.close === 'string' ? w.close.trim() : '';
    if (parseHHMM(open) == null || parseHHMM(close) == null) continue;
    out[day] = { open, close };
  }
  return out;
}

// The effective schedule for a row: its stored per-day windows, or — for legacy
// rows with none — the representative open/close applied to every weekday.
export function scheduleForRow(row: TradingSessionRow): WeekSchedule {
  let parsed: WeekSchedule = {};
  if (row.days) {
    try {
      parsed = cleanSchedule(JSON.parse(row.days));
    } catch {
      parsed = {};
    }
  }
  if (Object.keys(parsed).length > 0) return parsed;
  // Legacy fallback: a single window meant every trading day.
  const open = row.openTime;
  const close = row.closeTime;
  const out: WeekSchedule = {};
  for (const day of WEEKDAYS) out[day] = { open, close };
  return out;
}

// Minutes from `now` until the next enabled day's open, scanning up to a week
// ahead (so a session whose only window already passed today points to next
// week). Null when the schedule has no valid window at all.
function nextOpenMins(sched: WeekSchedule, dow: number, nowMin: number): number | null {
  for (let d = 0; d <= 7; d++) {
    const key = etDowKey((dow + d) % 7);
    if (!key) continue;
    const w = sched[key];
    if (!w) continue;
    const openMin = parseHHMM(w.open);
    if (openMin == null) continue;
    const start = d * 1440 + openMin;
    if (start > nowMin) return start - nowMin;
  }
  return null;
}

export function computeStatus(
  row: TradingSessionRow,
  clock: { min: number; dow: number },
): { status: SessionStatus; minsToOpen: number | null } {
  if (!row.active) return { status: 'idle', minsToOpen: null };
  const sched = scheduleForRow(row);
  const todayKey = etDowKey(clock.dow);
  const today = todayKey ? sched[todayKey] : undefined;
  if (today) {
    const open = parseHHMM(today.open);
    const close = parseHHMM(today.close);
    if (open != null && close != null) {
      if (inWindow(clock.min, open, close)) return { status: 'active', minsToOpen: null };
      if (inWindow(clock.min, open - OPENING_LEAD_MIN, open)) {
        return { status: 'opening', minsToOpen: ((open - clock.min) % 1440 + 1440) % 1440 };
      }
    }
  }
  return { status: 'idle', minsToOpen: nextOpenMins(sched, clock.dow, clock.min) };
}

// The representative single window (earliest enabled day) for a schedule, kept
// in open_time/close_time so legacy readers and the fallback still work.
function representativeWindow(sched: WeekSchedule): { open: string; close: string } | null {
  for (const day of WEEKDAYS) {
    const w = sched[day];
    if (w) return { open: w.open, close: w.close };
  }
  return null;
}

function toSession(row: TradingSessionRow, clock: { min: number; dow: number }): StrategySession {
  const { status, minsToOpen } = computeStatus(row, clock);
  return {
    id: row.id,
    name: row.name,
    instrument: row.instrument,
    days: scheduleForRow(row),
    marketHours: row.marketHours,
    timeframe: row.timeframe,
    bias: coerceBias(row.bias),
    notes: row.notes,
    active: row.active,
    status,
    minsToOpen,
  };
}

const RANK: Record<SessionStatus, number> = { active: 0, opening: 1, idle: 2 };

export async function listSessions(userId: string): Promise<StrategySession[]> {
  const rows = await db.select().from(tradingSessions).where(eq(tradingSessions.userId, userId));
  const clock = etNow();
  const openMinOf = (s: StrategySession) => {
    const w = representativeWindow(s.days);
    return w ? parseHHMM(w.open) ?? 0 : 0;
  };
  return rows
    .map((r) => toSession(r, clock))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || openMinOf(a) - openMinOf(b));
}

export interface SessionInput {
  name?: string;
  instrument?: string | null;
  // Values may be null (a day the client cleared) — cleanSchedule drops those.
  days?: Partial<Record<Weekday, DayWindow | null>>;
  marketHours?: boolean;
  timeframe?: string | null;
  bias?: SessionBias;
  notes?: string | null;
  active?: boolean;
}

// Serialize a schedule to the stored JSON, plus the representative window that
// backfills open_time/close_time (falling back to the classic default).
function scheduleColumns(sched: WeekSchedule): { days: string | null; openTime: string; closeTime: string } {
  const days = Object.keys(sched).length ? JSON.stringify(sched) : null;
  const rep = representativeWindow(sched);
  return { days, openTime: rep?.open ?? '09:30', closeTime: rep?.close ?? '11:00' };
}

export async function addSession(userId: string, input: SessionInput): Promise<StrategySession[]> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('A name is required');
  const sched = cleanSchedule(input.days);
  const cols = scheduleColumns(sched);
  const now = new Date();
  await db.insert(tradingSessions).values({
    id: crypto.randomUUID(),
    userId,
    name: name.slice(0, 80),
    instrument: clean(input.instrument, 40),
    openTime: cols.openTime,
    closeTime: cols.closeTime,
    days: cols.days,
    marketHours: input.marketHours ?? false,
    timeframe: clean(input.timeframe, 16),
    bias: coerceBias(input.bias),
    bullPlan: null,
    bearPlan: null,
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
  if (input.days !== undefined) {
    const cols = scheduleColumns(cleanSchedule(input.days));
    patch.days = cols.days;
    patch.openTime = cols.openTime;
    patch.closeTime = cols.closeTime;
  }
  if (input.marketHours !== undefined) patch.marketHours = input.marketHours;
  if (input.timeframe !== undefined) patch.timeframe = clean(input.timeframe, 16);
  if (input.bias !== undefined && isBias(input.bias)) patch.bias = input.bias;
  if (input.notes !== undefined) patch.notes = clean(input.notes, 2000);
  if (input.active !== undefined) patch.active = input.active;
  await db.update(tradingSessions).set(patch).where(and(eq(tradingSessions.id, id), eq(tradingSessions.userId, userId)));
  return listSessions(userId);
}

export async function removeSession(userId: string, id: string): Promise<StrategySession[]> {
  await db.delete(tradingSessions).where(and(eq(tradingSessions.id, id), eq(tradingSessions.userId, userId)));
  return listSessions(userId);
}
