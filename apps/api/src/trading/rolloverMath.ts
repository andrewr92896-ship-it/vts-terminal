import { etTimeLabel, parseHHMM } from './etTime.js';
import type { NotifLevel } from '../notifications/prefs.js';

// The rollover-close firing DECISION, and the plan shape it reads. Pure — no
// database, no network, no clock of its own — so the one minute a day this
// feature acts on can be exercised against fixed inputs instead of waited for.
// `rollover.ts` stores the plan and `rolloverWatch.ts` delivers the alerts;
// everything about *whether* an alert is due is here.

export type RolloverEvent = 'evaluate' | 'close' | 'recheck';
export const ROLLOVER_EVENTS: readonly RolloverEvent[] = ['evaluate', 'close', 'recheck'];

// WHICH KINDS OF OPEN TRADE THE PLAN IS ABOUT.
//
// Three, because that is how many ways a position can exist on this desk and
// they are genuinely different things to be reminded about:
//
//   • funded — a prop-firm position, hand-kept from a screenshot. The original
//              reason this feature exists: it cannot be held through rollover.
//   • broker — a live position at a connected broker (OANDA, Kraken).
//   • manual — a hand-kept book with no broker behind it.
//
// Adding a fourth is an entry here and a case in the activity read; nothing
// else in the plan, the decision or the storage knows how many there are.
export const OPEN_KINDS = ['funded', 'broker', 'manual'] as const;
export type OpenKind = (typeof OPEN_KINDS)[number];

// What the gate did when it was hard-coded, and therefore what every plan
// stored before this was configurable means.
export const DEFAULT_OPEN_KINDS: OpenKind[] = ['funded'];

export function isOpenKind(v: unknown): v is OpenKind {
  return typeof v === 'string' && (OPEN_KINDS as readonly string[]).includes(v);
}

export interface RolloverEventPlan {
  on: boolean;
  at: string; // ET 'HH:MM'
  level: NotifLevel;
  // Whether the event needs a trade to actually be open before it fires.
  //
  // **ON is what makes the routine quiet by itself** — a flat day, or a weekend
  // with nothing on, produces no alerts at all, which is why the plan carries
  // no weekday picker. OFF makes it a plain daily reminder at its time,
  // whatever the book looks like, which is what somebody who wants telling to
  // *check* rather than telling to *close* is asking for.
  requireOpen: boolean;
}

export interface RolloverPlan {
  enabled: boolean;
  // Which kinds of open trade count, for every event that requires one. One
  // list for the plan rather than one per event: "what am I asking about" is a
  // single answer, and three copies of it is three things to keep in step.
  //
  // **An empty list is refused in the service rather than stored**, because it
  // would silently mean "nothing can ever satisfy the gate" — a routine that
  // looks switched on and never fires.
  openKinds: OpenKind[];
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
  openKinds: [...DEFAULT_OPEN_KINDS],
  evaluate: { on: true, at: '16:30', level: 'normal', requireOpen: true },
  close: { on: true, at: '16:45', level: 'alert', requireOpen: true },
  // The recheck's gate is loose by default for the reason it always was: by the
  // time it is due the position it is about has usually been closed, so
  // requiring one still open would silence it in precisely the case it exists
  // for. It still needs SOMETHING to have happened — open now, or closed today
  // — which is not a setting.
  recheck: { on: true, at: '17:15', level: 'normal', requireOpen: false },
};

// What a trader has open right now, and what they finished today. The two are
// separate because the three alerts ask different questions of them.
//
// `open` is keyed BY KIND so the decision can answer "is a funded position
// open" and "is anything open" from one read — the plan's `openKinds` narrows
// it rather than the query being re-run per plan.
export interface OpenActivity {
  open: Record<OpenKind, string[]>; // instruments still open, so the alert can name them
  // Funded trades closed today. Deliberately funded-only and deliberately not
  // widened with `openKinds`: it exists for the re-entry question, which is a
  // prop-firm question — a broker position closed today needed no rollover
  // decision, so counting it would fire a "back in?" alert about a trade that
  // was never taken off for rollover.
  closedToday: number;
}

/** Every kind empty — what a flat trader looks like. */
export function emptyActivity(): OpenActivity {
  return { open: { funded: [], broker: [], manual: [] }, closedToday: 0 };
}

/** The instruments open in any of the kinds this plan asks about. */
export function openFor(activity: OpenActivity, kinds: OpenKind[]): string[] {
  const out: string[] = [];
  for (const k of kinds) out.push(...(activity.open[k] ?? []));
  return out;
}

// How a set of kinds reads in an alert body. One kind names itself ("funded
// position"); several read as a plain "position", because "funded or broker
// position" on a lock screen is noise — the instruments beside it are what the
// trader actually needs.
export function positionWord(kinds: OpenKind[]): string {
  if (kinds.length !== 1) return 'position';
  return kinds[0] === 'funded' ? 'funded position' : kinds[0] === 'broker' ? 'broker position' : 'position';
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

function positionCount(n: number, word: string): string {
  return n === 1 ? `1 ${word}` : `${n} ${word}s`;
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
// **`requireOpen` IS THE GATE, AND IT IS NOW THE TRADER'S TO SET.** With it on,
// the event only fires while a trade of a kind named in `plan.openKinds` is
// actually open — which is what makes the whole routine quiet by itself on a
// flat day, and why the plan carries no weekday picker. With it off, the event
// is a plain reminder at its time.
//
// The defaults reproduce exactly what was hard-coded before any of this was
// configurable: funded positions only, evaluate and close gated, the recheck
// not. The recheck additionally keeps its own floor — open now OR closed today
// — because an alert asking "are you getting back in?" is about something that
// happened, and firing it on a day nothing did would be noise every evening.
export function dueForPlan(
  userId: string,
  plan: RolloverPlan,
  activity: OpenActivity,
  clock: { min: number },
  dayStamp: string,
  fired: Set<string>,
): PendingRollover[] {
  const out: PendingRollover[] = [];
  if (!plan.enabled) return out;

  const kinds = plan.openKinds.length > 0 ? plan.openKinds : DEFAULT_OPEN_KINDS;
  const openList = openFor(activity, kinds);
  const openCount = openList.length;
  const word = positionWord(kinds);

  const consider = (event: RolloverEvent, at: string, level: NotifLevel, title: string, body: string) => {
    const target = parseHHMM(at);
    if (target == null) return;
    if (!withinFireWindow(clock.min, target)) return;
    const key = `${userId}|${event}|${dayStamp}`;
    if (fired.has(key)) return;
    fired.add(key);
    out.push({ userId, event, title, body, level, tag: `rollover-${event}` });
  };

  // What an event says when it is NOT gated on something being open and nothing
  // is: it still has to say something useful, and "0 positions open" is the
  // truth rather than a filler. A gated event never reaches this.
  const openLine = () =>
    openCount > 0
      ? `${positionCount(openCount, word)} open: ${nameInstruments(openList)}.`
      : `Nothing open right now.`;

  if (plan.evaluate.on && (!plan.evaluate.requireOpen || openCount > 0)) {
    // Names the trader's OWN close time rather than a hardcoded 5:00, so a plan
    // moved earlier still reads correctly on a lock screen.
    const by = plan.close.on ? ` Close by ${etTimeLabel(plan.close.at)}.` : '';
    consider('evaluate', plan.evaluate.at, plan.evaluate.level, 'Rollover — evaluate', `${openLine()}${by}`);
  }

  if (plan.close.on && (!plan.close.requireOpen || openCount > 0)) {
    consider(
      'close',
      plan.close.at,
      plan.close.level,
      'Rollover — close now',
      openCount > 0
        ? `${positionCount(openCount, word)} still open before rollover: ${nameInstruments(openList)}.`
        : 'Rollover is next. Nothing is open.',
    );
  }

  // The recheck's own floor, above whatever `requireOpen` says. With the switch
  // ON it behaves like the other two and needs something open; with it off it
  // still needs something to have happened today, which is what stops a "back
  // in?" alert arriving every evening of a week nobody traded.
  const recheckHasSubject = plan.recheck.requireOpen
    ? openCount > 0
    : openCount > 0 || activity.closedToday > 0;
  if (plan.recheck.on && recheckHasSubject) {
    const body =
      activity.closedToday > 0
        ? `Rollover has passed. ${activity.closedToday === 1 ? '1 funded trade' : `${activity.closedToday} funded trades`} closed today — check what re-entry would cost.`
        : `Rollover has passed. ${positionCount(openCount, word)} still open.`;
    consider('recheck', plan.recheck.at, plan.recheck.level, 'Rollover — back in?', body);
  }

  return out;
}
