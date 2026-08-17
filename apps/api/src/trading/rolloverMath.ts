import { etTimeLabel, parseHHMM } from './etTime.js';
import type { NotifLevel } from '../notifications/prefs.js';

// The rollover-close firing DECISION, and the plan shape it reads. Pure — no
// database, no network, no clock of its own — so the one minute a day this
// feature acts on can be exercised against fixed inputs instead of waited for.
// `rollover.ts` stores the plan and `rolloverWatch.ts` delivers the alerts;
// everything about *whether* an alert is due is here.

export type RolloverEvent = 'evaluate' | 'close' | 'recheck';
export const ROLLOVER_EVENTS: readonly RolloverEvent[] = ['evaluate', 'close', 'recheck'];

export interface RolloverEventPlan {
  on: boolean;
  at: string; // ET 'HH:MM'
  level: NotifLevel;
}

export interface RolloverPlan {
  enabled: boolean;
  evaluate: RolloverEventPlan;
  close: RolloverEventPlan;
  recheck: RolloverEventPlan;
}

// The rollover itself is 5:00 PM ET. The defaults sit either side of it: a
// half-hour warning, a quarter-hour hard stop, and a look back once it is done.
// The close alert defaults a rung louder than the other two because it is the
// only one with a deadline attached.
export const DEFAULT_ROLLOVER_PLAN: RolloverPlan = {
  enabled: false,
  evaluate: { on: true, at: '16:30', level: 'normal' },
  close: { on: true, at: '16:45', level: 'alert' },
  recheck: { on: true, at: '17:15', level: 'normal' },
};

// What a trader has on the funded book right now, and what they finished today.
// The two are separate because the three alerts ask different questions of them.
export interface FundedActivity {
  open: string[]; // instruments still open, so the alert can name them
  closedToday: number;
}

// How late a tick may be and still count as "now". Combined with per-day dedup
// this only ever widens WHICH tick fires an event, never how many times.
const FIRE_TOLERANCE_MIN = 1;

function withinFireWindow(nowMin: number, targetMin: number): boolean {
  const delta = nowMin - targetMin;
  return delta >= 0 && delta <= FIRE_TOLERANCE_MIN;
}

// "EUR/USD", "EUR/USD and GBP/USD", "EUR/USD, GBP/USD and 2 more".
function nameInstruments(list: string[]): string {
  const seen = [...new Set(list)];
  if (seen.length === 0) return '';
  if (seen.length === 1) return seen[0];
  if (seen.length === 2) return `${seen[0]} and ${seen[1]}`;
  return `${seen[0]}, ${seen[1]} and ${seen.length - 2} more`;
}

function positionCount(n: number): string {
  return n === 1 ? '1 funded position' : `${n} funded positions`;
}

export interface PendingRollover {
  userId: string;
  event: RolloverEvent;
  title: string;
  body: string;
  level: NotifLevel;
  tag: string;
}

// The alerts due for one trader at the current ET minute.
//
// `fired` is the caller's per-ET-day dedup set, passed in rather than held here
// so this stays a function of its arguments. The watch owns it and clears it
// when the day rolls over.
//
// **Evaluate and close both require something to actually be open.** That gate
// is what makes the whole feature quiet by itself — a flat day, or a weekend,
// produces nothing — and it is why the plan carries no weekday picker. Nothing
// to close is nothing to be told about.
//
// **The recheck is deliberately the exception.** By the time it is due the
// position it is about has usually been closed, so gating it on "still open"
// would silence it in precisely the case it exists for. Something closed today
// is enough.
export function dueForPlan(
  userId: string,
  plan: RolloverPlan,
  activity: FundedActivity,
  clock: { min: number },
  dayStamp: string,
  fired: Set<string>,
): PendingRollover[] {
  const out: PendingRollover[] = [];
  if (!plan.enabled) return out;
  const openCount = activity.open.length;

  const consider = (event: RolloverEvent, at: string, level: NotifLevel, title: string, body: string) => {
    const target = parseHHMM(at);
    if (target == null) return;
    if (!withinFireWindow(clock.min, target)) return;
    const key = `${userId}|${event}|${dayStamp}`;
    if (fired.has(key)) return;
    fired.add(key);
    out.push({ userId, event, title, body, level, tag: `rollover-${event}` });
  };

  if (plan.evaluate.on && openCount > 0) {
    // Names the trader's OWN close time rather than a hardcoded 5:00, so a plan
    // moved earlier still reads correctly on a lock screen.
    const by = plan.close.on ? ` Close by ${etTimeLabel(plan.close.at)}.` : '';
    consider(
      'evaluate',
      plan.evaluate.at,
      plan.evaluate.level,
      'Rollover — evaluate',
      `${positionCount(openCount)} open: ${nameInstruments(activity.open)}.${by}`,
    );
  }

  if (plan.close.on && openCount > 0) {
    consider(
      'close',
      plan.close.at,
      plan.close.level,
      'Rollover — close now',
      `${positionCount(openCount)} still open before rollover: ${nameInstruments(activity.open)}.`,
    );
  }

  if (plan.recheck.on && (openCount > 0 || activity.closedToday > 0)) {
    const body =
      activity.closedToday > 0
        ? `Rollover has passed. ${activity.closedToday === 1 ? '1 funded trade' : `${activity.closedToday} funded trades`} closed today — check what re-entry would cost.`
        : `Rollover has passed. ${positionCount(openCount)} still open.`;
    consider('recheck', plan.recheck.at, plan.recheck.level, 'Rollover — back in?', body);
  }

  return out;
}
