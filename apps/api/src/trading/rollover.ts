import crypto from 'node:crypto';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  fundedTrades,
  manualPositions,
  tradingPositions,
  rolloverPlans,
  type RolloverPlanRow,
} from '../db/schema.js';
import { isNotifLevel, type NotifLevel } from '../notifications/prefs.js';
import { etDayStamp, parseHHMM } from './etTime.js';
import {
  DEFAULT_OPEN_KINDS,
  DEFAULT_ROLLOVER_PLAN,
  emptyActivity,
  isOpenKind,
  type OpenActivity,
  type OpenKind,
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
// **EACH EVENT SAYS WHETHER IT NEEDS A TRADE OPEN, AND THE PLAN SAYS WHICH
// KINDS COUNT.** Both were hard-coded — evaluate and close required an open
// FUNDED position, the recheck required nothing — and the defaults still are
// exactly that, so no stored plan changed meaning. What is new is that a trader
// can say "remind me at 4:30 whatever I'm holding", or "count my broker book
// too", instead of being told what the question is.
//
// A gated event is what makes the whole routine quiet by itself: a trader who is
// flat, or a weekend with nothing on, produces no alerts at all, which is why
// the plan carries no weekday picker. Nothing to close means nothing to be told
// about.
//
// The recheck keeps a floor of its own above that switch: with its gate off it
// still needs something open OR something closed today (see `openActivityFor`),
// which covers "still holding" and "closed it for rollover" without firing
// every evening of a week nobody traded.

// The plan SHAPE and the firing decision live in `rolloverMath.ts`, which is
// pure and therefore checkable offline; this module is the storage half.
export {
  DEFAULT_OPEN_KINDS,
  DEFAULT_ROLLOVER_PLAN,
  OPEN_KINDS,
  ROLLOVER_EVENTS,
  type OpenActivity,
  type OpenKind,
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

// Which kinds of open trade the plan asks about, read back off the stored
// comma-separated column.
//
// **An empty or unrecognisable value falls back to 'funded'** rather than to
// nothing: an empty set would mean "no trade can ever satisfy the gate", so a
// routine that reads as switched on would silently never fire. Falling back to
// what it always meant is the safe direction.
function coerceOpenKinds(raw: unknown): OpenKind[] {
  if (typeof raw !== 'string') return [...DEFAULT_OPEN_KINDS];
  const kinds = raw
    .split(',')
    .map((k) => k.trim())
    .filter(isOpenKind);
  const unique = [...new Set(kinds)];
  return unique.length > 0 ? unique : [...DEFAULT_OPEN_KINDS];
}

function rowToPlan(row: RolloverPlanRow): RolloverPlan {
  return {
    enabled: row.enabled,
    openKinds: coerceOpenKinds(row.openKinds),
    evaluate: {
      on: row.evaluateOn,
      at: coerceTime(row.evaluateAt, DEFAULT_ROLLOVER_PLAN.evaluate.at),
      level: coerceLevel(row.evaluateLevel, DEFAULT_ROLLOVER_PLAN.evaluate.level),
      requireOpen: row.evaluateRequireOpen,
    },
    close: {
      on: row.closeOn,
      at: coerceTime(row.closeAt, DEFAULT_ROLLOVER_PLAN.close.at),
      level: coerceLevel(row.closeLevel, DEFAULT_ROLLOVER_PLAN.close.level),
      requireOpen: row.closeRequireOpen,
    },
    recheck: {
      on: row.recheckOn,
      at: coerceTime(row.recheckAt, DEFAULT_ROLLOVER_PLAN.recheck.at),
      level: coerceLevel(row.recheckLevel, DEFAULT_ROLLOVER_PLAN.recheck.level),
      requireOpen: row.recheckRequireOpen,
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
  openKinds?: OpenKind[];
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
    requireOpen: patch.requireOpen ?? current.requireOpen,
  };
}

// Save the plan, merging onto whatever is stored so a partial save leaves the
// rest alone — the web app is a service-worker-cached PWA, and a browser on an
// old bundle posting a subset must not reset the events it does not know about.
export async function setRolloverPlan(userId: string, input: RolloverPlanInput): Promise<RolloverPlan> {
  const current = await getRolloverPlan(userId);
  const next: RolloverPlan = {
    enabled: input.enabled ?? current.enabled,
    // **AN EMPTY LIST IS READ AS "NOT SUPPLIED", NOT AS "NOTHING COUNTS".**
    // Stored, it would be a gate no trade could ever satisfy — a routine that
    // reads as switched on and silently never fires. So it keeps what is
    // already stored, exactly as an unparseable time does. (The picker will not
    // let the last kind be unticked either; this is the server half of that.)
    //
    // Note `??` is not enough on its own: an empty array is not nullish, so the
    // length has to be tested.
    openKinds: coerceOpenKinds(
      (input.openKinds && input.openKinds.length > 0 ? input.openKinds : current.openKinds).join(','),
    ),
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
      openKinds: next.openKinds.join(','),
      evaluateOn: next.evaluate.on,
      evaluateAt: next.evaluate.at,
      evaluateLevel: next.evaluate.level,
      evaluateRequireOpen: next.evaluate.requireOpen,
      closeOn: next.close.on,
      closeAt: next.close.at,
      closeLevel: next.close.level,
      closeRequireOpen: next.close.requireOpen,
      recheckOn: next.recheck.on,
      recheckAt: next.recheck.at,
      recheckLevel: next.recheck.level,
      recheckRequireOpen: next.recheck.requireOpen,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: rolloverPlans.userId,
      set: {
        enabled: next.enabled,
        openKinds: next.openKinds.join(','),
        evaluateOn: next.evaluate.on,
        evaluateAt: next.evaluate.at,
        evaluateLevel: next.evaluate.level,
        evaluateRequireOpen: next.evaluate.requireOpen,
        closeOn: next.close.on,
        closeAt: next.close.at,
        closeLevel: next.close.level,
        closeRequireOpen: next.close.requireOpen,
        recheckOn: next.recheck.on,
        recheckAt: next.recheck.at,
        recheckLevel: next.recheck.level,
        recheckRequireOpen: next.recheck.requireOpen,
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

// What each trader has OPEN right now, per kind, and what they finished today.
//
// Three reads rather than one because the three kinds live in three tables and
// always have: a funded position is hand-kept from a screenshot, a broker
// position is reconciled from a live connection, and a manual one is typed into
// a book with no broker behind it. Nothing here joins them — the decision picks
// the kinds it was asked about.
//
// It reads every kind whether or not any plan asks for it. That is deliberate:
// one pass serves every trader on the install, whose plans differ, and three
// bounded queries over open rows is cheaper than choosing per plan and running
// them repeatedly.
//
// A funded trade closed "today" is one whose close stamp falls in the same
// EASTERN calendar day as now, matched on the day stamp itself rather than on a
// midnight instant. A trading day is an Eastern concept here exactly as it is
// for History's day buckets, and comparing stamps needs no zone arithmetic to
// get wrong across a DST change.
export async function openActivityFor(
  userIds: string[],
  now: Date = new Date(),
): Promise<Map<string, OpenActivity>> {
  const out = new Map<string, OpenActivity>();
  if (userIds.length === 0) return out;
  for (const id of userIds) out.set(id, emptyActivity());

  // ---- funded ----
  const fundedOpen = await db
    .select({ userId: fundedTrades.userId, instrument: fundedTrades.instrument })
    .from(fundedTrades)
    .where(
      and(
        inArray(fundedTrades.userId, userIds),
        eq(fundedTrades.status, 'open'),
        isNull(fundedTrades.exitPrice),
      ),
    );
  for (const r of fundedOpen) out.get(r.userId)?.open.funded.push(r.instrument);

  // ---- broker ----
  // Soft-deleted rows are excluded: a trade the trader removed by hand is not
  // something to be reminded to close, and the Trade Log already treats it as
  // gone. Same rule the backfill follows.
  const brokerOpen = await db
    .select({ userId: tradingPositions.userId, instrument: tradingPositions.instrument })
    .from(tradingPositions)
    .where(
      and(
        inArray(tradingPositions.userId, userIds),
        eq(tradingPositions.status, 'open'),
        isNull(tradingPositions.deletedAt),
      ),
    );
  for (const r of brokerOpen) out.get(r.userId)?.open.broker.push(r.instrument);

  // ---- manual ----
  // `manual_positions` holds only open positions — closing one moves it into
  // the trade history — so there is no status to filter on.
  const manualOpen = await db
    .select({ userId: manualPositions.userId, instrument: manualPositions.instrument })
    .from(manualPositions)
    .where(inArray(manualPositions.userId, userIds));
  for (const r of manualOpen) out.get(r.userId)?.open.manual.push(r.instrument);

  // ---- closed today (funded only — see the note on OpenActivity) ----
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
