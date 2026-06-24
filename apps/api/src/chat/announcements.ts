import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { announcements, chatMessages, users, type AnnouncementRow } from '../db/schema.js';
import { parseRoles } from '../auth/rbac.js';

// Announcements are a separate, admin-managed broadcast list shown to every
// signed-in user. seedWelcome seeds a little starter content (chat + a couple
// of announcements) authored by the earliest active admin, idempotently.

export interface AnnouncementView {
  id: string;
  author: string;
  title: string;
  body: string;
  createdAt: number;
}

const MAX_TITLE = 120;
const MAX_BODY = 4000;

function toView(row: AnnouncementRow): AnnouncementView {
  return {
    id: row.id,
    author: row.author,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listAnnouncements(): Promise<AnnouncementView[]> {
  const rows = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt), desc(announcements.id));
  return rows.map(toView);
}

export async function addAnnouncement(
  user: { id: string; displayName: string },
  title: string,
  body: string,
): Promise<AnnouncementView[]> {
  const t = title.trim();
  const b = body.trim();
  if (!t) throw new Error('A title is required');
  if (!b) throw new Error('A message is required');
  await db.insert(announcements).values({
    id: crypto.randomUUID(),
    userId: user.id,
    author: user.displayName,
    title: t.slice(0, MAX_TITLE),
    body: b.slice(0, MAX_BODY),
    createdAt: new Date(),
  });
  return listAnnouncements();
}

// The timestamp (ms) of the newest announcement, or 0 when there are none.
export async function latestAnnouncementAt(): Promise<number> {
  const rows = await db
    .select({ createdAt: announcements.createdAt })
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(1);
  return rows[0]?.createdAt ? rows[0].createdAt.getTime() : 0;
}

export async function removeAnnouncement(id: string): Promise<AnnouncementView[]> {
  await db.delete(announcements).where(eq(announcements.id, id));
  return listAnnouncements();
}

// The earliest active admin, used as the author of seeded content. Mirrors
// resolveOwnerId() in trading/alerts.ts.
async function resolveOwner(): Promise<{ id: string; displayName: string } | null> {
  const rows = await db.select().from(users);
  const admins = rows
    .filter((u) => u.active && parseRoles(u).includes('admin'))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const owner = admins[0];
  return owner ? { id: owner.id, displayName: owner.displayName } : null;
}

async function seedChannel(
  channel: 'trading' | 'general',
  owner: { id: string; displayName: string },
  bodies: string[],
): Promise<void> {
  const existing = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.channel, channel))
    .limit(1);
  if (existing.length > 0) return;
  // Space the seeded timestamps so they keep their intended order.
  const base = Date.now() - bodies.length * 60_000;
  for (let i = 0; i < bodies.length; i++) {
    await db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      channel,
      userId: owner.id,
      author: owner.displayName,
      body: bodies[i],
      createdAt: new Date(base + i * 60_000),
    });
  }
}

// Idempotent starter content. Only fills a channel/list that is empty, so it is
// safe to run on every boot.
export async function seedWelcome(): Promise<void> {
  const owner = await resolveOwner();
  if (!owner) return;

  await seedChannel('trading', owner, [
    'Welcome to the trading desk channel. Use this space to share setups, levels, and trade ideas with the team.',
    'A quick reminder to keep risk in check and trade your plan. Post your bias for the session here before the open.',
    'Questions about the platform or a connection are welcome too. We are all here to help each other improve.',
  ]);

  await seedChannel('general', owner, [
    'Welcome to the VTS Portal general channel. This is the place for company news, casual conversation, and anything that does not fit a specific workspace.',
    'Feel free to introduce yourself and let the team know what you are working on this week.',
  ]);

  const existing = await db.select({ id: announcements.id }).from(announcements).limit(1);
  if (existing.length === 0) {
    const base = Date.now() - 2 * 60_000;
    await db.insert(announcements).values({
      id: crypto.randomUUID(),
      userId: owner.id,
      author: owner.displayName,
      title: 'Welcome to the VTS Portal',
      body: 'Thanks for joining the team workspace. Use the channels to stay in sync, and watch this announcements board for important updates from the desk.',
      createdAt: new Date(base),
    });
    await db.insert(announcements).values({
      id: crypto.randomUUID(),
      userId: owner.id,
      author: owner.displayName,
      title: 'How announcements work',
      body: 'Admins can post and remove announcements here. Everyone on the team can read them, so this is the right place for policy changes, schedules, and desk-wide notices.',
      createdAt: new Date(base + 60_000),
    });
  }
}
