import { inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { config } from '../config.js';
import { isDemoUser } from '../demo/identity.js';
import { pushConfigured, sendToUsers } from '../notifications/push.js';
import { pushoverConfigured, sendPushoverToUsers } from '../notifications/pushover.js';
import { smsConfigured, sendSmsToUsers } from '../notifications/sms.js';
import { LEVEL_PRIORITY } from '../notifications/prefs.js';
import { etDayStamp, etNow } from './etTime.js';
import { activeRolloverPlans, openActivityFor } from './rollover.js';
import { dueForPlan, type PendingRollover } from './rolloverMath.js';

// Background watch that fires a trader's OWN rollover-close alerts. Personal
// throughout: each notification goes to the one account whose plan produced it,
// like the session and price-alert watches beside it. Production-only, and only
// when push or Pushover is configured.
//
// Dedup is in-memory and keyed by ET calendar day, so each event fires at most
// once per day. The set is cleared when the day rolls over, so it never grows.
// A restart mid-afternoon may re-arm the day's remaining events, which is the
// same trade the session watch makes and is harmless here for the same reason:
// past minutes no longer match the firing window, and the recheck's own gate is
// read from the database rather than from this set.

const firedToday = new Set<string>();
let firedDay = '';

// One pass: fire any rollover alerts due at the current ET minute.
export async function tickRolloverWatch(now: Date = new Date()): Promise<void> {
  const plans = await activeRolloverPlans();
  if (plans.length === 0) return;

  const dayStamp = etDayStamp(now);
  if (dayStamp !== firedDay) {
    firedToday.clear();
    firedDay = dayStamp;
  }

  const clock = etNow(now);
  const planByUser = new Map(plans.map((p) => [p.userId, p.plan]));

  // Drop demo accounts — they never get real notifications.
  const userRows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, [...planByUser.keys()]));
  const realUserIds = userRows.filter((u) => !isDemoUser({ username: u.username })).map((u) => u.id);
  if (realUserIds.length === 0) return;

  const activity = await openActivityFor(realUserIds, now);

  const pending: PendingRollover[] = [];
  for (const userId of realUserIds) {
    const plan = planByUser.get(userId);
    const act = activity.get(userId);
    if (!plan || !act) continue;
    pending.push(...dueForPlan(userId, plan, act, clock, dayStamp, firedToday));
  }
  if (pending.length === 0) return;

  // Deliver: each alert goes only to its own owner. The Pushover priority comes
  // from the event's own level, so a `repeating` close alert picks up the
  // trader's repeat timing and its Acknowledge button through `deliver` — the
  // one place a priority-2 message is sent. Web push has no equivalent of a
  // level, so it is sent unchanged, exactly as the trade events do it.
  await Promise.all(
    pending.map(async (n) => {
      const url = n.event === 'recheck' ? '/?screen=prop' : '/?screen=live';
      await sendToUsers(
        [n.userId],
        { title: n.title, body: n.body, url, tag: n.tag },
        { category: 'rollover' },
      ).catch(() => {});
      await sendPushoverToUsers(
        [n.userId],
        {
          title: n.title,
          message: n.body,
          priority: LEVEL_PRIORITY[n.level],
          url,
          urlTitle: 'Open the desk',
        },
        'rollover',
        { category: 'rollover' },
      ).catch(() => {});
      // A text as well, for whoever routed rollover alerts there. It carries no
      // level — an SMS is an SMS — so a `repeating` close alert still sends one
      // message rather than becoming a per-retry bill.
      await sendSmsToUsers([n.userId], { title: n.title, body: n.body }, { category: 'rollover' }).catch(
        () => {},
      );
    }),
  );
}

// Cadence: sample twice a minute so a target minute is never missed (per-day
// dedup keeps it to one fire). Shares SESSION_WATCH_SECONDS — both watches are
// doing the same thing, waking on an ET minute.
const ROLLOVER_WATCH_MS = Math.max(10, Number(process.env.SESSION_WATCH_SECONDS) || 30) * 1000;

// Start the background rollover watch. Production-only and only when a delivery
// channel is configured (no point polling otherwise).
export function startRolloverWatch(): void {
  if (!config.isProd || (!pushConfigured() && !pushoverConfigured() && !smsConfigured())) return;
  const tick = () => {
    void tickRolloverWatch().catch((err) => console.error('Rollover watch error:', err));
  };
  setTimeout(tick, 14 * 1000);
  const timer = setInterval(tick, ROLLOVER_WATCH_MS);
  timer.unref?.();
}
