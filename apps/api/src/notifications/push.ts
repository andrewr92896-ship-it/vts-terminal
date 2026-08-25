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
import { channelRecipients, type AlertCategory } from './channels.js';

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

// What a send needs to know beyond the payload.
//
// **`category` is REQUIRED, deliberately.** It is what the recipient's channel
// routing is read against, and an optional one would be the thing you get by
// forgetting to pass anything — so a new notification would quietly ignore
// everybody's "don't send me this on the app" and there would be nothing to
// catch it. Required makes the next one a compile error, which is the same
// argument that made `canAccessWorkspace`'s features argument required.
export interface SendOpts {
  category: AlertCategory;
  // The test button only. A test is a direct request made in the moment, and
  // one that silently does nothing is indistinguishable from a broken setup —
  // which is the exact failure a test exists to detect.
  ignoreAccountSwitch?: boolean;
  ignoreChannelChoice?: boolean;
}

// Send a payload to every device of the given users. No-op when push is not
// configured or no users are given. Prunes subscriptions the push service has
// expired (HTTP 404/410).
export async function sendToUsers(
  userIds: string[],
  payload: PushPayload,
  opts: SendOpts,
): Promise<void> {
  if (!configured || userIds.length === 0) return;
  // Two filters, both applied here at the one place every web push leaves the
  // server, so a caller cannot forget either.
  //
  //   • the account-level master switch;
  //   • whether this recipient wants THIS KIND of alert on the app channel at
  //     all — the routing table in channels.ts.
  //
  // `ignoreAccountSwitch` exists for the test button alone — see sendTest.
  let ids = opts.ignoreAccountSwitch ? userIds : await filterAccountAlerts(userIds);
  if (!opts.ignoreChannelChoice) ids = await channelRecipients(ids, opts.category, 'push');
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
  // Which kind of alert this is, for the recipient's channel routing. Required
  // for the same reason it is on SendOpts.
  category: AlertCategory;
  excludeUserId?: string;
  scopeIds?: Set<string>;
  ownerId?: string;
  event?: NotifEvent;
}

// Send a trading notification to a team (everyone who can access the Trading
// workspace and has a subscription). Demo never notified.
export async function sendToTradingDesk(payload: PushPayload, opts: DeskSendOpts): Promise<void> {
  if (!configured) return;
  const { excludeUserId, scopeIds, ownerId, event, category } = opts;
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
  await sendToUsers(ids, payload, { category });
}

// The default body of a test, when the sender did not write one.
export const DEFAULT_TEST_BODY =
  'This is a test alert. Nothing has happened on your desk — phone alerts are working.';

// Used by tests / a manual "send test" so a user can confirm a device works.
//
// `message` is the sender's own wording, which is the point of letting them
// write one: a test that reads exactly like the alert they are setting up is
// the only way to see how it will actually land on a lock screen at 3am.
//
// **THE TITLE IS NOT THEIRS TO WRITE.** It stays 'TEST · VTS Terminal', because
// a lock-screen glance shows the first line and little more — and a test that
// could be titled like a real fill is one somebody acts on. What a custom
// message changes is the body underneath.
export async function sendTest(userId: string, message?: string): Promise<void> {
  // Deliberately ignores the account master switch and the channel routing: a
  // test is a direct request made in the moment, and one that silently does
  // nothing is indistinguishable from a broken setup — which is the exact
  // failure the test exists to detect.
  await sendToUsers(
    [userId],
    {
      title: 'TEST · VTS Terminal',
      body: message?.trim() || DEFAULT_TEST_BODY,
      url: '/',
      tag: 'vts-test',
    },
    { category: 'system', ignoreAccountSwitch: true, ignoreChannelChoice: true },
  );
}
