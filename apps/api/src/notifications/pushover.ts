import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushoverUsers, users } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import { config } from '../config.js';

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

export interface PushoverMessage {
  title: string;
  message: string;
  // 'cashregister', 'siren', a custom uploaded sound name, etc. Omit to let the
  // recipient's per-app sound choice in the Pushover app apply.
  sound?: string;
  // -2..2. 1 = high (bypass quiet hours), 2 = emergency (repeat until acked —
  // needs retry/expire, not used here). Default 0.
  priority?: number;
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

// Send to every trading-desk user who has connected Pushover (excludes the
// demo). The trader who caused the event can be excluded if desired.
export async function sendPushoverToDesk(msg: PushoverMessage, excludeUserId?: string): Promise<void> {
  if (!pushoverConfigured()) return;
  const rows = await db
    .select({ id: users.id, roles: users.roles, username: users.username })
    .from(pushoverUsers)
    .innerJoin(users, eq(users.id, pushoverUsers.userId));
  const recipients: string[] = [];
  for (const r of rows) {
    if (r.id === excludeUserId) continue;
    if (isDemoUser({ username: r.username })) continue;
    if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) continue;
    recipients.push(r.id);
  }
  await sendPushoverToUsers(recipients, msg);
}

export async function sendPushoverTest(userId: string): Promise<boolean> {
  const key = await getPushoverKey(userId);
  if (!key) return false;
  const result = await sendOne(key, {
    title: 'VTS Portal',
    message: 'Pushover is connected. Trades and alerts will buzz here — set the sound in the Pushover app.',
    priority: 1,
  });
  if (result === 'invalid') await removePushoverKey(userId).catch(() => {});
  return result === 'ok';
}
