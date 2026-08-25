import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingSessions, users, type TradingSessionRow } from '../db/schema.js';
import { config } from '../config.js';
import { isDemoUser } from '../demo/identity.js';
import { pushConfigured, sendToUsers } from '../notifications/push.js';
import { pushoverConfigured, sendPushoverToUsers } from '../notifications/pushover.js';
import { smsConfigured, sendSmsToUsers } from '../notifications/sms.js';
import {
  sessionAlertAudience,
  usersWithSessionAlerts,
  type SessionAlertPrefs,
} from './sessionAlertPrefs.js';
import { etNow, etDayStamp, etDowKey, scheduleForRow, parseHHMM } from './sessions.js';

// Background watch that fires a Strategy Session's notifications: a heads-up a
// set number of minutes before it opens, a buzz when it opens, and a buzz when
// it closes. Opt-in per user (see sessionAlertPrefs) and only for the events
// they enabled. Production-only, and only when a delivery channel is configured
// — mirrors the desk watch.
//
// **A session belongs to the trader who built it, and its alerts go to them
// plus anybody they copied in** (`sessionAlertAudience`). What each event is,
// when it fires and which events are on are all still the OWNER'S settings —
// a recipient is copied in, not subscribed, so there is nothing for them to
// configure and no way for them to change somebody else's routine. What they do
// keep is the ability to stop it: their own group-notifications switch is
// re-checked on every fire.
//
// Dedup is in-memory and keyed by ET calendar day, so each event fires at most
// once per session per day. The set is cleared when the ET day rolls over, so it
// never grows unbounded. A process restart may re-arm the day's remaining events
// (acceptable — a missed or duplicate heads-up is harmless, and past minutes
// won't match the firing window anyway).

type SessionEvent = 'open' | 'close' | 'preOpen';

const firedToday = new Set<string>();
let firedDay = '';

// How close (in minutes) to a target minute still counts as "now", so a briefly
// delayed or skipped tick doesn't miss the event. Combined with per-day dedup,
// this only ever fires once.
const FIRE_TOLERANCE_MIN = 1;

function withinFireWindow(nowMin: number, targetMin: number): boolean {
  const delta = nowMin - targetMin;
  return delta >= 0 && delta <= FIRE_TOLERANCE_MIN;
}

interface PendingNotification {
  userId: string;
  event: SessionEvent;
  title: string;
  body: string;
  tag: string;
}

// Build the notifications due right now for one user's sessions. Exported for
// unit testing the firing decision without a database.
export function dueForUser(
  userId: string,
  prefs: SessionAlertPrefs,
  rows: TradingSessionRow[],
  clock: { min: number; dow: number },
  dayStamp: string,
): PendingNotification[] {
  const todayKey = etDowKey(clock.dow);
  const out: PendingNotification[] = [];

  for (const row of rows) {
    if (!row.active) continue;
    const window = scheduleForRow(row)[todayKey];
    if (!window) continue; // session doesn't run today
    if (window.allDay) continue; // a 24-hour day has no intraday open/close to alert on
    const openMin = parseHHMM(window.open);
    const closeMin = parseHHMM(window.close);
    if (openMin == null || closeMin == null) continue;

    const label = row.instrument ? `${row.name} (${row.instrument})` : row.name;

    const consider = (event: SessionEvent, targetMin: number, title: string, body: string) => {
      if (targetMin < 0) return; // e.g. a heads-up that would fall on the previous day
      if (!withinFireWindow(clock.min, targetMin)) return;
      const key = `${row.id}|${event}|${dayStamp}`;
      if (firedToday.has(key)) return;
      firedToday.add(key);
      out.push({ userId, event, title, body, tag: `session-${row.id}-${event}` });
    };

    if (prefs.notifyPreOpen) {
      consider(
        'preOpen',
        openMin - prefs.preOpenLeadMin,
        'Session opening soon',
        `${label} opens in ${prefs.preOpenLeadMin} min (${window.open} ET).`,
      );
    }
    if (prefs.notifyOpen) {
      consider('open', openMin, 'Session open', `${label} is now active (${window.open}–${window.close} ET).`);
    }
    if (prefs.notifyClose) {
      consider('close', closeMin, 'Session closed', `${label} has closed (${window.close} ET).`);
    }
  }
  return out;
}

// One pass: fire any session notifications due at the current ET minute.
export async function tickSessionWatch(now: Date = new Date()): Promise<void> {
  const optedIn = await usersWithSessionAlerts();
  if (optedIn.length === 0) return;

  const dayStamp = etDayStamp(now);
  if (dayStamp !== firedDay) {
    firedToday.clear();
    firedDay = dayStamp;
  }

  const clock = etNow(now);
  const prefsByUser = new Map(optedIn.map((o) => [o.userId, o.prefs]));

  // Drop demo accounts — they never get real notifications.
  const userRows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, [...prefsByUser.keys()]));
  const realUserIds = userRows.filter((u) => !isDemoUser({ username: u.username })).map((u) => u.id);
  if (realUserIds.length === 0) return;

  const sessionRows = await db
    .select()
    .from(tradingSessions)
    .where(and(inArray(tradingSessions.userId, realUserIds), eq(tradingSessions.active, true)));
  if (sessionRows.length === 0) return;

  const byUser = new Map<string, TradingSessionRow[]>();
  for (const r of sessionRows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  const pending: PendingNotification[] = [];
  for (const [userId, rows] of byUser) {
    const prefs = prefsByUser.get(userId);
    if (!prefs) continue;
    pending.push(...dueForUser(userId, prefs, rows, clock, dayStamp));
  }

  if (pending.length === 0) return;

  // Who each owner's alerts reach. Read once for every owner with something due
  // rather than per notification — a trader with three sessions opening on the
  // same minute resolves one audience, not three.
  const owners = [...new Set(pending.map((n) => n.userId))];
  const audience = await sessionAlertAudience(owners);
  const ownerNames = new Map(
    (
      await db
        .select({ id: users.id, username: users.username, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, owners))
    ).map((u) => [u.id, u.displayName?.trim() || u.username]),
  );

  // **A COPIED-IN RECIPIENT IS TOLD WHOSE SESSION IT IS; THE OWNER IS NOT.**
  // "Dale's Method is now active" reads perfectly to Dale and is a puzzle to
  // anybody else, who has no way to know which of four people on the desk it
  // belongs to — and a session name is whatever its author typed, so it cannot
  // be relied on to carry that. So the body is composed twice: unchanged for
  // the owner, prefixed with the owner's name for everybody else. That matches
  // how a trade notification already names the trader.
  await Promise.all(
    pending.map(async (n) => {
      const to = audience.get(n.userId) ?? [n.userId];
      const others = to.filter((id) => id !== n.userId);
      const who = ownerNames.get(n.userId);
      const send = async (ids: string[], body: string) => {
        if (ids.length === 0) return;
        await sendToUsers(ids, { title: n.title, body, url: '/', tag: n.tag }, { category: 'session' }).catch(
          () => {},
        );
        await sendPushoverToUsers(
          ids,
          { title: n.title, message: body, priority: 0 },
          'session',
          { category: 'session' },
        ).catch(() => {});
        await sendSmsToUsers(ids, { title: n.title, body }, { category: 'session' }).catch(() => {});
      };
      await send([n.userId], n.body);
      await send(others, who ? `${who} · ${n.body}` : n.body);
    }),
  );
}

// Cadence: sample twice a minute so a target minute is never missed (per-day
// dedup keeps it to one fire). Overridable with SESSION_WATCH_SECONDS.
const SESSION_WATCH_MS = Math.max(10, Number(process.env.SESSION_WATCH_SECONDS) || 30) * 1000;

// Start the background session-notification watch. Production-only and only when
// a delivery channel is configured (no point polling otherwise).
export function startSessionWatch(): void {
  if (!config.isProd || (!pushConfigured() && !pushoverConfigured() && !smsConfigured())) return;
  const tick = () => {
    void tickSessionWatch().catch((err) => console.error('Session watch error:', err));
  };
  setTimeout(tick, 12 * 1000);
  const timer = setInterval(tick, SESSION_WATCH_MS);
  timer.unref?.();
}
