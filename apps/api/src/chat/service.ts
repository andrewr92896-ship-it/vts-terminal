import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatMessages, users, type ChatMessageRow } from '../db/schema.js';
import { parseRoles, parseBadges, type RoleKey } from '../auth/rbac.js';

// The Team Chat: one private conversation per trading team. Every message is
// stamped with the sender's team id (users.team_id at send time) and channel
// 'team', so a desk only ever sees its own teammates' messages — it never fans
// out across teams. The author's display name is denormalized onto each row so
// the feed reads correctly after a later rename; the avatar is joined live from
// the users table so a new profile picture shows immediately.

export const TEAM_CHANNEL = 'team';

export interface ChatMessageView {
  id: string;
  author: string;
  avatar: string | null; // sender's current profile picture (data URL), or null
  // The sender's current roles + assigned badge keys, joined live so their
  // recognition icons render next to the name (matches the rest of the app).
  roles: RoleKey[];
  badges: string[];
  body: string;
  createdAt: number;
  mine: boolean; // true when the current user wrote it
}

const MAX_BODY = 1000;

function toView(
  row: Pick<ChatMessageRow, 'id' | 'author' | 'body' | 'createdAt' | 'userId'> & {
    avatar: string | null;
    roles: string | null;
    badges: string | null;
  },
  currentUserId: string,
): ChatMessageView {
  return {
    id: row.id,
    author: row.author,
    avatar: row.avatar,
    roles: parseRoles({ roles: row.roles }),
    badges: parseBadges({ badges: row.badges }),
    body: row.body,
    createdAt: row.createdAt.getTime(),
    mine: row.userId === currentUserId,
  };
}

// The most recent `limit` team messages, oldest-first for display. Scoped to the
// caller's team; a user with no team gets an empty feed.
export async function listTeamMessages(
  teamId: string | null,
  currentUserId: string,
  limit = 100,
): Promise<ChatMessageView[]> {
  if (!teamId) return [];
  const rows = await db
    .select({
      id: chatMessages.id,
      author: chatMessages.author,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      userId: chatMessages.userId,
      avatar: users.avatar,
      roles: users.roles,
      badges: users.badges,
    })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(and(eq(chatMessages.channel, TEAM_CHANNEL), eq(chatMessages.teamId, teamId)))
    // id as a secondary key gives a stable order when two messages share a ms.
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  // Newest-first from the query; reverse so the client renders oldest-first.
  return rows.reverse().map((r) =>
    toView({ ...r, avatar: r.avatar ?? null, roles: r.roles ?? null, badges: r.badges ?? null }, currentUserId),
  );
}

// The timestamp (ms) of the most recent team message for the given team, or 0
// when there are none. Drives the notifications unread indicator.
export async function latestTeamMessageAt(teamId: string | null): Promise<number> {
  if (!teamId) return 0;
  const rows = await db
    .select({ createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.channel, TEAM_CHANNEL), eq(chatMessages.teamId, teamId)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return rows[0]?.createdAt ? rows[0].createdAt.getTime() : 0;
}

export async function postTeamMessage(
  user: { id: string; displayName: string; teamId: string | null },
  body: string,
): Promise<ChatMessageView[]> {
  if (!user.teamId) throw new Error('You are not on a trading team yet');
  const text = body.trim();
  if (!text) throw new Error('A message is required');
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    channel: TEAM_CHANNEL,
    teamId: user.teamId,
    userId: user.id,
    author: user.displayName,
    body: text.slice(0, MAX_BODY),
    createdAt: new Date(),
  });
  return listTeamMessages(user.teamId, user.id);
}

// Thrown when a user tries to delete a message that is not theirs (and they are
// not an admin), so the route can answer 403 rather than 400.
export class ChatForbiddenError extends Error {}

// Delete a single team message. The author can delete their own; an admin can
// delete any within the team. Returns the refreshed feed.
export async function deleteTeamMessage(
  teamId: string | null,
  id: string,
  user: { id: string; isAdmin: boolean },
): Promise<ChatMessageView[]> {
  if (!teamId) throw new Error('You are not on a trading team yet');
  const row = (
    await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.id, id), eq(chatMessages.teamId, teamId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Message not found');
  if (row.userId !== user.id && !user.isAdmin) {
    throw new ChatForbiddenError('You can only delete your own messages');
  }
  await db.delete(chatMessages).where(eq(chatMessages.id, id));
  return listTeamMessages(teamId, user.id);
}

// ---- Administrator chat ----
//
// One install-wide room for founders, software developers and admins — the third
// tab in the corner chat bubble, beside Team chat and Support.
//
// Deliberately NOT team-scoped, which is the whole difference from the team
// chat above: administration is not a desk activity, and an admin on one team
// needs to reach an admin on another. So these rows carry `teamId: null` and are
// found by channel alone. That also means the existing table needed no migration
// — `teamId` was already nullable for the legacy channels.
//
// Eligibility is a ROLE question and is checked in the route (isAdmin), never
// here: this module does not decide who is an administrator.
export const ADMIN_CHANNEL = 'admin';

export async function listAdminMessages(
  currentUserId: string,
  limit = 100,
): Promise<ChatMessageView[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      author: chatMessages.author,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      userId: chatMessages.userId,
      avatar: users.avatar,
      roles: users.roles,
      badges: users.badges,
    })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(eq(chatMessages.channel, ADMIN_CHANNEL))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  return rows.reverse().map((r) =>
    toView({ ...r, avatar: r.avatar ?? null, roles: r.roles ?? null, badges: r.badges ?? null }, currentUserId),
  );
}

export async function latestAdminMessageAt(): Promise<number> {
  const rows = await db
    .select({ createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(eq(chatMessages.channel, ADMIN_CHANNEL))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return rows[0]?.createdAt ? rows[0].createdAt.getTime() : 0;
}

export async function postAdminMessage(
  user: { id: string; displayName: string },
  body: string,
): Promise<ChatMessageView[]> {
  const text = body.trim();
  if (!text) throw new Error('A message is required');
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    channel: ADMIN_CHANNEL,
    teamId: null,
    userId: user.id,
    author: user.displayName,
    body: text.slice(0, MAX_BODY),
    createdAt: new Date(),
  });
  return listAdminMessages(user.id);
}

// The author deletes their own; a founder-level user can delete any. A plain
// admin deliberately cannot remove a colleague's message — this room is where
// administrative decisions get discussed, so the record of it should not be
// editable by everyone standing in it.
export async function deleteAdminMessage(
  id: string,
  user: { id: string; isFounder: boolean },
): Promise<ChatMessageView[]> {
  const row = (
    await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.id, id), eq(chatMessages.channel, ADMIN_CHANNEL)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Message not found');
  if (row.userId !== user.id && !user.isFounder) {
    throw new ChatForbiddenError('You can only delete your own messages');
  }
  await db.delete(chatMessages).where(eq(chatMessages.id, id));
  return listAdminMessages(user.id);
}
