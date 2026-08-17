import crypto from 'node:crypto';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fundedTrades, rolloverPlans, type RolloverPlanRow } from '../db/schema.js';
import { isNotifLevel, type NotifLevel } from '../notifications/prefs.js';
import { etDayStamp, parseHHMM } from './etTime.js';
import {
  DEFAULT_ROLLOVER_PLAN,
  type FundedActivity,
  type RolloverEventPlan,
  type RolloverPlan,
} from './rolloverMath.js';

// Rollover close — the plan behind the three timed alerts a trader gets around
// the 5pm ET rollover, when a funded position cannot be left open through it.
//
// Three events, and they are three different questions:
//
//   • evaluate — "you are still holding; decide what comes off"
//   • close    — "close it now, rollover is next"
//   • recheck  — "rollover has passed; are you getting back in?"
//
// **The first two only fire when a funded position is actually open.** That gate
// is what makes the whole thing quiet by itself: a trader who is flat, or a
// weekend with nothing on, produces no alerts at all, which is why the plan
// carries no weekday picker. Nothing to close means nothing to be told about.
//
// The recheck is the exception and deliberately so — by the time it is due the
// position it is about has usually been closed, so gating it on "still open"
// would silence it in precisely the case it exists for. It fires when a funded
// trade is open OR one was closed today (see `fundedActivityFor`), which covers
// both "still holding" and "closed it for rollover".

// The plan SHAPE and the firing decision live in `rolloverMath.ts`, which is
// pure and therefore checkable offline; this module is the storage half.
export {
  DEFAULT_ROLLOVER_PLAN,
  ROLLOVER_EVENTS,
  type FundedActivity,
  type RolloverEvent,
  type RolloverEventPlan,
  type RolloverPlan,
} from './rolloverMath.js';

function coerceLevel(v: unknown, fallback: NotifLevel): NotifLevel {
  // An unrecognised level must never silence an alert somebody is relying on —
  // the same rule the trade-event ladder follows.
  return isNotifLevel(v) ? v : fallback;
}

// A time is only accepted if it parses as ET wall-clock 'HH:MM'. Anything else
// keeps the default rather than being stored as a time that can never fire.
function coerceTime(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  return parseHHMM(t) != null ? t : fallback;
}

function rowToPlan(row: RolloverPlanRow): RolloverPlan {
  return {
    enabled: row.enabled,
    evaluate: {
      on: row.evaluateOn,
      at: coerceTime(row.evaluateAt, DEFAULT_ROLLOVER_PLAN.evaluate.at),
      level: coerceLevel(row.evaluateLevel, DEFAULT_ROLLOVER_PLAN.evaluate.level),
    },
    close: {
      on: row.closeOn,
      at: coerceTime(row.closeAt, DEFAULT_ROLLOVER_PLAN.close.at),
      level: coerceLevel(row.closeLevel, DEFAULT_ROLLOVER_PLAN.close.level),
    },
    recheck: {
      on: row.recheckOn,
      at: coerceTime(row.recheckAt, DEFAULT_ROLLOVER_PLAN.recheck.at),
      level: coerceLevel(row.recheckLevel, DEFAULT_ROLLOVER_PLAN.recheck.level),
    },
  };
}

export async function getRolloverPlan(userId: string): Promise<RolloverPlan> {
  const row = (
    await db.select().from(rolloverPlans).where(eq(rolloverPlans.userId, userId)).limit(1)
  )[0];
  return row ? rowToPlan(row) : { ...DEFAULT_ROLLOVER_PLAN };
}

export interface RolloverPlanInput {
  enabled?: boolean;
  evaluate?: Partial<RolloverEventPlan>;
  close?: Partial<RolloverEventPlan>;
  recheck?: Partial<RolloverEventPlan>;
}

function mergeEvent(current: RolloverEventPlan, patch: Partial<RolloverEventPlan> | undefined): RolloverEventPlan {
  if (!patch) return current;
  return {
    on: patch.on ?? current.on,
    at: coerceTime(patch.at, current.at),
    level: coerceLevel(patch.level, current.level),
  };
}

// Save the plan, merging onto whatever is stored so a partial save leaves the
// rest alone — the web app is a service-worker-cached PWA, and a browser on an
// old bundle posting a subset must not reset the events it does not know about.
export async function setRolloverPlan(userId: string, input: RolloverPlanInput): Promise<RolloverPlan> {
  const current = await getRolloverPlan(userId);
  const next: RolloverPlan = {
    enabled: input.enabled ?? current.enabled,
    evaluate: mergeEvent(current.evaluate, input.evaluate),
    close: mergeEvent(current.close, input.close),
    recheck: mergeEvent(current.recheck, input.recheck),
  };
  const now = new Date();
  await db
    .insert(rolloverPlans)
    .values({
      id: crypto.randomUUID(),
      userId,
      enabled: next.enabled,
      evaluateOn: next.evaluate.on,
      evaluateAt: next.evaluate.at,
      evaluateLevel: next.evaluate.level,
      closeOn: next.close.on,
      closeAt: next.close.at,
      closeLevel: next.close.level,
      recheckOn: next.recheck.on,
      recheckAt: next.recheck.at,
      recheckLevel: next.recheck.level,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: rolloverPlans.userId,
      set: {
        enabled: next.enabled,
        evaluateOn: next.evaluate.on,
        evaluateAt: next.evaluate.at,
        evaluateLevel: next.evaluate.level,
        closeOn: next.close.on,
        closeAt: next.close.at,
        closeLevel: next.close.level,
        recheckOn: next.recheck.on,
        recheckAt: next.recheck.at,
        recheckLevel: next.recheck.level,
        updatedAt: now,
      },
    });
  return next;
}

// Every plan switched on, for the watch. A plan with the master switch off is
// not read at all, so a paused routine costs nothing per tick.
export async function activeRolloverPlans(): Promise<{ userId: string; plan: RolloverPlan }[]> {
  const rows = await db.select().from(rolloverPlans).where(eq(rolloverPlans.enabled, true));
  return rows
    .map((r) => ({ userId: r.userId, plan: rowToPlan(r) }))
    .filter((r) => r.plan.evaluate.on || r.plan.close.on || r.plan.recheck.on);
}

// What each trader has on the funded book right now, and what they finished
// today. `FundedActivity` is declared in rolloverMath.ts, beside the decision
// that reads it.

// A funded trade closed "today" is one whose close stamp falls in the same
// EASTERN calendar day as now, matched on the day stamp itself rather than on a
// midnight instant. A trading day is an Eastern concept here exactly as it is
// for History's day buckets, and comparing stamps needs no zone arithmetic to
// get wrong across a DST change.
export async function fundedActivityFor(
  userIds: string[],
  now: Date = new Date(),
): Promise<Map<string, FundedActivity>> {
  const out = new Map<string, FundedActivity>();
  if (userIds.length === 0) return out;
  for (const id of userIds) out.set(id, { open: [], closedToday: 0 });

  const openRows = await db
    .select({ userId: fundedTrades.userId, instrument: fundedTrades.instrument })
    .from(fundedTrades)
    .where(
      and(
        inArray(fundedTrades.userId, userIds),
        eq(fundedTrades.status, 'open'),
        isNull(fundedTrades.exitPrice),
      ),
    );
  for (const r of openRows) out.get(r.userId)?.open.push(r.instrument);

  // A day's worth of slack on the query, then the exact ET-day test in JS. The
  // window only bounds how many rows are read; it never decides what counts.
  const since = new Date(now.getTime() - 36 * 3_600_000);
  const today = etDayStamp(now);
  const closedRows = await db
    .select({ userId: fundedTrades.userId, closedAt: fundedTrades.closedAt })
    .from(fundedTrades)
    .where(
      and(
        inArray(fundedTrades.userId, userIds),
        eq(fundedTrades.status, 'closed'),
        gt(fundedTrades.closedAt, since),
      ),
    );
  for (const r of closedRows) {
    if (!r.closedAt) continue;
    if (etDayStamp(r.closedAt) !== today) continue;
    const a = out.get(r.userId);
    if (a) a.closedToday += 1;
  }

  return out;
}
