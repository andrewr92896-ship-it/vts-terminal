import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushoverUsers, users } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import { config } from '../config.js';
import { recipientLevelsForEvent, LEVEL_PRIORITY, type NotifEvent } from './prefs.js';
import { getRepeatPrefs } from './alertPrefs.js';
import { liveReceiptRows, markResolved, newCallbackToken, recordReceipt } from './pushoverReceipts.js';
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

// A send's outcome. `receipt` is present only for a priority-2 message that
// Pushover accepted — it is the handle that lets the repeats be cancelled
// later, so losing it means an alert nobody can silence from this side.
export interface SendResult {
  status: 'ok' | 'invalid' | 'error';
  receipt?: string;
}

async function sendOne(
  userKey: string,
  msg: PushoverMessage,
  callbackUrl?: string,
): Promise<SendResult> {
  const token = config.PUSHOVER_APP_TOKEN;
  if (!token) return { status: 'error' };
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
  // Only meaningful at priority 2: Pushover POSTs here when the user
  // acknowledges on their phone, which is what keeps the terminal's own list of
  // still-sounding alerts honest.
  if (callbackUrl && msg.priority === PUSHOVER_EMERGENCY) body.set('callback', callbackUrl);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (res.ok) {
      // A priority-2 send answers with the receipt that can cancel it. Read
      // defensively — a body we cannot parse must not fail the send, it just
      // costs the ability to cancel from this side.
      if (msg.priority === PUSHOVER_EMERGENCY) {
        try {
          const json = (await res.json()) as { receipt?: unknown };
          if (typeof json.receipt === 'string' && json.receipt) {
            return { status: 'ok', receipt: json.receipt };
          }
        } catch {
          /* keep the success — the message was delivered either way */
        }
      }
      return { status: 'ok' };
    }
    // 4xx with an errors array usually means the user key is bad/disabled.
    if (res.status >= 400 && res.status < 500) return { status: 'invalid' };
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

// Where Pushover POSTs when somebody acknowledges on their phone. Returns null
// when there is no publicly reachable address — a local dev box, or a
// deployment that never set one — in which case the callback is simply omitted
// and the terminal's own Acknowledge button remains the way to clear a banner.
// Sending Pushover a localhost URL would be worse than sending none.
function callbackUrlFor(token: string): string | undefined {
  const raw = (config.PUSHOVER_CALLBACK_ORIGIN ?? config.WEB_ORIGIN ?? '').trim();
  if (!raw) return undefined;
  let origin: URL;
  try {
    origin = new URL(raw);
  } catch {
    return undefined;
  }
  if (origin.protocol !== 'https:') return undefined; // Pushover posts to public HTTPS only
  const host = origin.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return undefined;
  return `${origin.origin}/api/pushover/callback/${encodeURIComponent(token)}`;
}

// Stop a repeating alert. This is what the terminal's Acknowledge button
// ultimately calls; Pushover stops future retries, though one already in flight
// can still land. Best-effort by design — a failure here must never stop the
// row being marked answered, or the button would look broken while the phone
// went quiet anyway on expiry.
export async function cancelPushoverReceipt(receipt: string): Promise<boolean> {
  const token = config.PUSHOVER_APP_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.pushover.net/1/receipts/${encodeURIComponent(receipt)}/cancel.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Send one message to one user, applying that user's own repeat timing when the
// message is a repeating one, and recording the receipt so it can be
// acknowledged from the terminal later. The single place a priority-2 message
// is sent, which is what keeps "every repeating alert is cancellable" true by
// construction rather than by each caller remembering.
async function deliver(
  userId: string,
  userKey: string,
  msg: PushoverMessage,
  kind: string,
): Promise<SendResult['status']> {
  let out = msg;
  let token: string | null = null;
  let expiresAt: Date | null = null;

  if (msg.priority === PUSHOVER_EMERGENCY) {
    const { repeatEverySeconds, repeatForSeconds } = await getRepeatPrefs(userId);
    token = newCallbackToken();
    expiresAt = new Date(Date.now() + repeatForSeconds * 1000);
    out = {
      ...msg,
      retrySeconds: msg.retrySeconds ?? repeatEverySeconds,
      expireSeconds: msg.expireSeconds ?? repeatForSeconds,
    };
  }

  const result = await sendOne(userKey, out, token ? callbackUrlFor(token) : undefined);
  if (result.status === 'invalid') {
    await removePushoverKey(userId).catch(() => {});
    return result.status;
  }
  if (result.status === 'ok' && result.receipt && token && expiresAt) {
    await recordReceipt({
      userId,
      receipt: result.receipt,
      callbackToken: token,
      title: msg.title,
      body: msg.message,
      kind,
      expiresAt,
    }).catch(() => {
      /* best-effort: a missing row costs the Acknowledge button, never the alert */
    });
  }
  return result.status;
}

// Send to a set of users (by id), looking up each one's stored key. Prunes keys
// Pushover rejects.
export async function sendPushoverToUsers(
  userIds: string[],
  msg: PushoverMessage,
  kind = 'alert',
): Promise<void> {
  if (!pushoverConfigured() || userIds.length === 0) return;
  const rows = await db
    .select()
    .from(pushoverUsers)
    .where(inArray(pushoverUsers.userId, [...new Set(userIds)]));
  await Promise.all(rows.map((r) => deliver(r.userId, r.userKey, msg, kind)));
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
  // A trade event carries a per-recipient LEVEL as well as an on/off, so the
  // message each person gets differs in priority. That is why this cannot just
  // hand one message to sendPushoverToUsers: two people watching the same fill
  // can have asked for a silent note and a repeating alarm respectively.
  if (ownerId && event) {
    const levels = await recipientLevelsForEvent(recipients, ownerId, event);
    if (levels.size === 0) return;
    const keys = await db
      .select()
      .from(pushoverUsers)
      .where(inArray(pushoverUsers.userId, [...levels.keys()]));
    await Promise.all(
      keys.map((r) =>
        deliver(
          r.userId,
          r.userKey,
          { ...msg, priority: LEVEL_PRIORITY[levels.get(r.userId) ?? 'alert'] },
          event,
        ),
      ),
    );
    return;
  }
  await sendPushoverToUsers(recipients, msg);
}

// The two ways a test can be sent. `standard` is exactly what a real trade or
// alert notification goes out at, so a passing standard test proves the live
// path; `repeating` proves the middle-of-the-night path, which is a different
// question — it is the only level iOS lets through silent mode and Focus, and
// only once Critical Alerts is switched on in the Pushover app.
//
// 'emergency' was the old name for `repeating` and is still ACCEPTED at the
// route: the web app is a service-worker-cached PWA, so a browser running
// yesterday's bundle can still be posting the old word.
export type PushoverTestKind = 'standard' | 'repeating';

// A test SAYS it is a test, in the title, before anything else. Somebody woken
// at 3am reads the first line on a lock screen and nothing more — if that line
// is indistinguishable from a real fill they will act on it, and a notification
// system that cries wolf is worse than one that stays quiet.
export async function sendPushoverTest(userId: string, kind: PushoverTestKind = 'standard'): Promise<boolean> {
  const key = await getPushoverKey(userId);
  if (!key) return false;
  const repeating = kind === 'repeating';
  // Goes through `deliver` like every other send, so a repeating TEST uses the
  // user's own repeat timing and is recorded as a cancellable receipt. A test
  // you cannot acknowledge from the terminal would not be testing the thing the
  // terminal actually does.
  const status = await deliver(
    userId,
    key,
    {
      title: 'TEST · VTS Terminal',
      message: repeating
        ? 'This is a TEST repeating alert. Nothing has happened on your desk. It keeps repeating until you acknowledge it — in the Pushover app, or by opening the terminal.'
        // Also the message sent right after connecting a key, so it has to read
        // correctly both as a confirmation and as a test fired on demand.
        : 'This is a TEST alert — nothing has happened on your desk. Real trade and alert notifications will arrive here.',
      priority: repeating ? PUSHOVER_EMERGENCY : 1,
    },
    'test',
  );
  return status === 'ok';
}

// Acknowledge from the terminal: stop every repeating alert this user still has
// sounding. Returns how many were cleared.
//
// The row is marked answered even when Pushover's cancel call fails. That is
// deliberate — the alternative is a banner that will not clear because a network
// hiccup, which leaves the user pressing a dead button while the phone stops on
// its own at expiry anyway.
export async function acknowledgeLiveAlerts(userId: string, only?: string): Promise<number> {
  const rows = await liveReceiptRows(userId);
  const targets = only ? rows.filter((r) => r.id === only) : rows;
  if (targets.length === 0) return 0;
  await Promise.all(targets.map((r) => cancelPushoverReceipt(r.receipt).catch(() => false)));
  await markResolved(
    targets.map((r) => r.id),
    'terminal',
  );
  return targets.length;
}
