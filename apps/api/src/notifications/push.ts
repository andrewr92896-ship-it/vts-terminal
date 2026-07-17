import crypto from 'node:crypto';
import webpush from 'web-push';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushSubscriptions, users } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import { config } from '../config.js';

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
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!configured || userIds.length === 0) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, [...new Set(userIds)]));
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

// Send a trading notification to a team (everyone who can access the Trading
// workspace and has a subscription), optionally excluding one user (e.g. the
// trader who caused the event). `scopeIds` restricts recipients to one team so a
// fill/alert only reaches the owner's teammates — trade info never fans out
// across teams. Omit it only for genuinely install-wide notices. Demo never notified.
export async function sendToTradingDesk(
  payload: PushPayload,
  excludeUserId?: string,
  scopeIds?: Set<string>,
): Promise<void> {
  if (!configured) return;
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
  await sendToUsers([...recipients], payload);
}

// Used by tests / a manual "send test" so a user can confirm a device works.
export async function sendTest(userId: string): Promise<void> {
  await sendToUsers([userId], {
    title: 'VTS Portal',
    body: 'Phone alerts are on. You’ll get a buzz when trades and alerts fire.',
    url: '/',
    tag: 'vts-test',
  });
}
