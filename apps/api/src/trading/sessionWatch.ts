import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingSessions, users, type TradingSessionRow } from '../db/schema.js';
import { config } from '../config.js';
import { isDemoUser } from '../demo/identity.js';
import { pushConfigured, sendToUsers } from '../notifications/push.js';
import { pushoverConfigured, sendPushoverToUsers } from '../notifications/pushover.js';
import { usersWithSessionAlerts, type SessionAlertPrefs } from './sessionAlertPrefs.js';
import { etNow, etDayStamp, etDowKey, scheduleForRow, parseHHMM } from './sessions.js';

// Background watch that fires a user's OWN Strategy Session notifications: a
// heads-up a set number of minutes before a session opens, a buzz when it opens,
// and a buzz when it closes. Opt-in per user (see sessionAlertPrefs) and only
// for the events they enabled. Production-only, and only when push or Pushover
// is configured — mirrors the desk watch.
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
  if (!todayKey) return []; // weekend — no weekday window
  const out: PendingNotification[] = [];

  for (const row of rows) {
    if (!row.active) continue;
    const window = scheduleForRow(row)[todayKey];
    if (!window) continue;
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

  // Deliver: each notification goes only to its own owner, via push + Pushover.
  await Promise.all(
    pending.map(async (n) => {
      const payload = { title: n.title, body: n.body, url: '/', tag: n.tag };
      await sendToUsers([n.userId], payload).catch(() => {});
      await sendPushoverToUsers([n.userId], { title: n.title, message: n.body, priority: 0 }).catch(() => {});
    }),
  );
}

// Cadence: sample twice a minute so a target minute is never missed (per-day
// dedup keeps it to one fire). Overridable with SESSION_WATCH_SECONDS.
const SESSION_WATCH_MS = Math.max(10, Number(process.env.SESSION_WATCH_SECONDS) || 30) * 1000;

// Start the background session-notification watch. Production-only and only when
// a delivery channel is configured (no point polling otherwise).
export function startSessionWatch(): void {
  if (!config.isProd || (!pushConfigured() && !pushoverConfigured())) return;
  const tick = () => {
    void tickSessionWatch().catch((err) => console.error('Session watch error:', err));
  };
  setTimeout(tick, 12 * 1000);
  const timer = setInterval(tick, SESSION_WATCH_MS);
  timer.unref?.();
}
