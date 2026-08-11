import crypto from 'node:crypto';
import webpush from 'web-push';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushSubscriptions, users } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import { config } from '../config.js';
import { recipientsWantingEvent, type NotifEvent } from './prefs.js';
import { filterAccountAlerts } from './alertPrefs.js';

// Web Push (VAPID) delivery for phone notifications. Everything is best-effort:
// a failed send never throws into the caller (an alert or a trade event must
// still complete). Dead subscriptions (the push service says they're gone) are
// pruned automatically.

let configured = false;
if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
    configured = true;
  } catch (err) {
    console.error('Invalid VAPID configuration — push disabled:', err);
  }
}

export function pushConfigured(): boolean {
  return configured;
}

export function vapidPublicKey(): string | null {
  return configured ? config.VAPID_PUBLIC_KEY ?? null : null;
}

export interface PushPayload {
  title: string;
  body: string;
  // Where to deep-link when the notification is tapped (e.g. '/?screen=alerts').
  url?: string;
  // Collapses notifications that share a tag so a stream of trade updates does
  // not stack into dozens of banners.
  tag?: string;
}

// Save (or refresh) one device's subscription for a user. Endpoints are unique,
// so re-subscribing the same device updates its keys and owner rather than
// duplicating.
export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(pushSubscriptions)
    .values({
      id: crypto.randomUUID(),
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function hasSubscription(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// Send a payload to every device of the given users. No-op when push is not
// configured or no users are given. Prunes subscriptions the push service has
// expired (HTTP 404/410).
export async function sendToUsers(
  userIds: string[],
  payload: PushPayload,
  opts: { ignoreAccountSwitch?: boolean } = {},
): Promise<void> {
  if (!configured || userIds.length === 0) return;
  // The account-level master switch. Applied here, at the one place every web
  // push leaves the server, so a caller cannot forget it. `ignoreAccountSwitch`
  // exists for the test button alone — see sendTest.
  const ids = opts.ignoreAccountSwitch ? userIds : await filterAccountAlerts(userIds);
  if (ids.length === 0) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, [...new Set(ids)]));
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          // Trade/alert notifications are time-sensitive: ask the push service
          // (APNs/FCM) to deliver immediately rather than batch for power
          // saving, and drop it after 5 minutes if the device is unreachable
          // (a stale fill alert is just noise).
          { urgency: 'high', TTL: 300 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription is gone (app uninstalled, permission revoked) — prune it.
          await removeSubscription(s.endpoint).catch(() => {});
        } else {
          console.error('Push send failed:', status ?? err);
        }
      }
    }),
  );
}

// Options for a desk send. `scopeIds` restricts recipients to one team so a
// fill/alert only reaches the owner's teammates — trade info never fans out
// across teams; omit it only for genuinely install-wide notices. `excludeUserId`
// drops one recipient (e.g. the trader who caused the event). When both
// `ownerId` and `event` are given, each remaining recipient is further filtered
// by their per-user notification preference for that trader + event; omit them
// for notices that carry no per-trader event (e.g. TradingView alerts).
export interface DeskSendOpts {
  excludeUserId?: string;
  scopeIds?: Set<string>;
  ownerId?: string;
  event?: NotifEvent;
}

// Send a trading notification to a team (everyone who can access the Trading
// workspace and has a subscription). Demo never notified.
export async function sendToTradingDesk(payload: PushPayload, opts: DeskSendOpts = {}): Promise<void> {
  if (!configured) return;
  const { excludeUserId, scopeIds, ownerId, event } = opts;
  const rows = await db
    .select({ id: users.id, roles: users.roles, username: users.username })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId));
  const recipients = new Set<string>();
  for (const r of rows) {
    if (r.id === excludeUserId) continue;
    if (scopeIds && !scopeIds.has(r.id)) continue; // only the owner's team
    if (isDemoUser({ username: r.username })) continue;
    if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) continue;
    recipients.add(r.id);
  }
  let ids = [...recipients];
  // Honour each recipient's per-trader event preference when this is a per-trader
  // trade event; a recipient with no stored pref keeps the default (on).
  if (ownerId && event) ids = await recipientsWantingEvent(ids, ownerId, event);
  await sendToUsers(ids, payload);
}

// Used by tests / a manual "send test" so a user can confirm a device works.
export async function sendTest(userId: string): Promise<void> {
  // Says TEST in the title, before anything else. A lock-screen glance shows the
  // first line and little more — if that line reads like a real fill, somebody
  // acts on a trade that never happened.
  //
  // Deliberately ignores the account master switch: a test is a direct request
  // made in the moment, and a test that silently does nothing is
  // indistinguishable from a broken setup — which is the exact failure the test
  // exists to detect.
  await sendToUsers(
    [userId],
    {
      title: 'TEST · VTS Terminal',
      body: 'This is a test alert. Nothing has happened on your desk — phone alerts are working.',
      url: '/',
      tag: 'vts-test',
    },
    { ignoreAccountSwitch: true },
  );
}
