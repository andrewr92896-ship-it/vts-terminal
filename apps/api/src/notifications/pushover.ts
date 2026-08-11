import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushoverUsers, users } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import { config } from '../config.js';
import { recipientsWantingEvent, type NotifEvent } from './prefs.js';
import { entitledUserIds } from '../memberships/service.js';

// Pushover delivery for trade/alert notifications with a custom, attention-
// grabbing sound (the whole reason we use it over plain web push: Pushover lets
// the recipient pick — or upload — the sound, and supports high/emergency
// priority that can break through silent mode). One application token is shared
// (PUSHOVER_APP_TOKEN); each trader connects their own user key.
//
// Everything is best-effort: a send failure never throws into the alert/trade
// path. An invalid user key is pruned so a stale connection stops being retried.

const API_URL = 'https://api.pushover.net/1/messages.json';

export function pushoverConfigured(): boolean {
  return !!config.PUSHOVER_APP_TOKEN;
}

// A Pushover user key is 30 url-safe chars. Loose validation so a paste error is
// caught before we store it; Pushover itself is the source of truth.
export function isLikelyUserKey(v: string): boolean {
  return /^[A-Za-z0-9]{30}$/.test(v.trim());
}

export async function savePushoverKey(userId: string, userKey: string): Promise<void> {
  const key = userKey.trim();
  const now = new Date();
  await db
    .insert(pushoverUsers)
    .values({ userId, userKey: key, createdAt: now })
    .onConflictDoUpdate({ target: pushoverUsers.userId, set: { userKey: key } });
}

export async function removePushoverKey(userId: string): Promise<void> {
  await db.delete(pushoverUsers).where(eq(pushoverUsers.userId, userId));
}

export async function getPushoverKey(userId: string): Promise<string | null> {
  const row = (
    await db.select().from(pushoverUsers).where(eq(pushoverUsers.userId, userId)).limit(1)
  )[0];
  return row?.userKey ?? null;
}

// Emergency priority repeats until the recipient acknowledges it, and Pushover
// REFUSES a priority-2 message that does not carry both `retry` and `expire`.
// Its own bounds: retry at least 30s, expire at most 10800s (3 hours).
export const PUSHOVER_EMERGENCY = 2;
const RETRY_MIN_SECONDS = 30;
const EXPIRE_MAX_SECONDS = 10800;
// What an unacknowledged EMERGENCY TEST costs the user. Deliberately short: a
// test exists to prove the setup works, so a couple of minutes of repeats
// demonstrates it, and nobody is left with a phone that nags for three hours
// because they sent a test and put the phone down.
const TEST_RETRY_SECONDS = 30;
const TEST_EXPIRE_SECONDS = 120;

export interface PushoverMessage {
  title: string;
  message: string;
  // 'cashregister', 'siren', a custom uploaded sound name, etc. Omit to let the
  // recipient's per-app sound choice in the Pushover app apply.
  sound?: string;
  // -2..2. 1 = high (bypass Pushover's quiet hours), 2 = emergency (repeat
  // until acknowledged). Default 0.
  //
  // Worth knowing before reaching for 2: on iPhone, EMERGENCY is the only level
  // Apple lets override silent mode and Focus, and only once the recipient has
  // switched Critical Alerts on in the Pushover app. A priority-1 message is
  // still an ordinary notification that Do Not Disturb silences.
  priority?: number;
  // Only meaningful at priority 2; defaulted below when omitted.
  retrySeconds?: number;
  expireSeconds?: number;
  url?: string;
  urlTitle?: string;
}

async function sendOne(userKey: string, msg: PushoverMessage): Promise<'ok' | 'invalid' | 'error'> {
  const token = config.PUSHOVER_APP_TOKEN;
  if (!token) return 'error';
  const body = new URLSearchParams({
    token,
    user: userKey,
    title: msg.title,
    message: msg.message,
  });
  const sound = msg.sound ?? config.PUSHOVER_SOUND;
  if (sound) body.set('sound', sound);
  if (msg.priority != null) body.set('priority', String(msg.priority));
  // Supplied unconditionally at priority 2 — Pushover rejects the message
  // outright without them, so a caller forgetting one must not become a silent
  // non-delivery.
  if (msg.priority === PUSHOVER_EMERGENCY) {
    const retry = Math.max(RETRY_MIN_SECONDS, Math.round(msg.retrySeconds ?? TEST_RETRY_SECONDS));
    const expire = Math.min(EXPIRE_MAX_SECONDS, Math.max(retry, Math.round(msg.expireSeconds ?? TEST_EXPIRE_SECONDS)));
    body.set('retry', String(retry));
    body.set('expire', String(expire));
  }
  if (msg.url) body.set('url', msg.url);
  if (msg.urlTitle) body.set('url_title', msg.urlTitle);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (res.ok) return 'ok';
    // 4xx with an errors array usually means the user key is bad/disabled.
    if (res.status >= 400 && res.status < 500) return 'invalid';
    return 'error';
  } catch {
    return 'error';
  }
}

// Send to a set of users (by id), looking up each one's stored key. Prunes keys
// Pushover rejects.
export async function sendPushoverToUsers(userIds: string[], msg: PushoverMessage): Promise<void> {
  if (!pushoverConfigured() || userIds.length === 0) return;
  const rows = await db
    .select()
    .from(pushoverUsers)
    .where(inArray(pushoverUsers.userId, [...new Set(userIds)]));
  await Promise.all(
    rows.map(async (r) => {
      const result = await sendOne(r.userKey, msg);
      if (result === 'invalid') await removePushoverKey(r.userId).catch(() => {});
    }),
  );
}

// Options mirror the Web Push `sendToTradingDesk` — see DeskSendOpts there.
export interface PushoverDeskOpts {
  excludeUserId?: string;
  scopeIds?: Set<string>;
  ownerId?: string;
  event?: NotifEvent;
}

// Send to every trading-desk user who has connected Pushover (excludes the
// demo). The trader who caused the event can be excluded if desired, and a
// per-trader trade event is filtered by each recipient's notification prefs.
export async function sendPushoverToDesk(msg: PushoverMessage, opts: PushoverDeskOpts = {}): Promise<void> {
  if (!pushoverConfigured()) return;
  const { excludeUserId, scopeIds, ownerId, event } = opts;
  const rows = await db
    .select({ id: users.id, roles: users.roles, username: users.username })
    .from(pushoverUsers)
    .innerJoin(users, eq(users.id, pushoverUsers.userId));
  // Pushover is Max, because it runs on a credential the user handed over. That
  // is checked here as well as on the connect route so a membership that LAPSES
  // stops the key being used, rather than the key quietly working forever
  // because it was connected while they were paying. Their row is left alone —
  // it comes back with the tier.
  const entitled = await entitledUserIds(rows, 'pushover');
  const recipients: string[] = [];
  for (const r of rows) {
    if (r.id === excludeUserId) continue;
    if (scopeIds && !scopeIds.has(r.id)) continue; // only the owner's team
    if (isDemoUser({ username: r.username })) continue;
    if (!entitled.has(r.id)) continue;
    if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) continue;
    recipients.push(r.id);
  }
  let ids = recipients;
  if (ownerId && event) ids = await recipientsWantingEvent(ids, ownerId, event);
  await sendPushoverToUsers(ids, msg);
}

// The two ways a test can be sent. `standard` is exactly what a real trade or
// alert notification goes out at, so a passing standard test proves the live
// path; `emergency` proves the middle-of-the-night path, which is a different
// question — it is the only level iOS lets through silent mode and Focus, and
// only once Critical Alerts is switched on in the Pushover app.
export type PushoverTestKind = 'standard' | 'emergency';

// A test SAYS it is a test, in the title, before anything else. Somebody woken
// at 3am reads the first line on a lock screen and nothing more — if that line
// is indistinguishable from a real fill they will act on it, and a notification
// system that cries wolf is worse than one that stays quiet.
export async function sendPushoverTest(userId: string, kind: PushoverTestKind = 'standard'): Promise<boolean> {
  const key = await getPushoverKey(userId);
  if (!key) return false;
  const emergency = kind === 'emergency';
  const result = await sendOne(key, {
    title: 'TEST · VTS Terminal',
    message: emergency
      ? 'This is a TEST emergency alert. Nothing has happened on your desk. It will keep repeating for about 2 minutes until you acknowledge it in the Pushover app.'
      // Also the message sent right after connecting a key, so it has to read
      // correctly both as a confirmation and as a test fired on demand.
      : 'This is a TEST alert — nothing has happened on your desk. Real trade and alert notifications will arrive here.',
    priority: emergency ? PUSHOVER_EMERGENCY : 1,
  });
  if (result === 'invalid') await removePushoverKey(userId).catch(() => {});
  return result === 'ok';
}
