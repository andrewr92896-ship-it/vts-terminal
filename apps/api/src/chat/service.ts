import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatMessages, type ChatMessageRow } from '../db/schema.js';

// A shared desk chat with two channels. 'trading' is gated to the Trading
// workspace (enforced in the route); 'general' is open to any signed-in user.
// The author's display name is denormalized onto each row so the feed reads
// correctly even after a later rename.

export type ChatChannel = 'trading' | 'general';

export interface ChatMessageView {
  id: string;
  channel: ChatChannel;
  author: string;
  body: string;
  createdAt: number;
  mine: boolean; // true when the current user wrote it
}

const MAX_BODY = 1000;

function toView(row: ChatMessageRow, currentUserId: string): ChatMessageView {
  return {
    id: row.id,
    channel: row.channel as ChatChannel,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt.getTime(),
    mine: row.userId === currentUserId,
  };
}

// The most recent `limit` messages, returned oldest-first for display.
export async function listMessages(
  channel: ChatChannel,
  currentUserId: string,
  limit = 100,
): Promise<ChatMessageView[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.channel, channel))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  // Newest-first from the query; reverse so the client renders oldest-first.
  return rows.reverse().map((r) => toView(r, currentUserId));
}

export async function postMessage(
  channel: ChatChannel,
  user: { id: string; displayName: string },
  body: string,
): Promise<ChatMessageView[]> {
  const text = body.trim();
  if (!text) throw new Error('A message is required');
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    channel,
    userId: user.id,
    author: user.displayName,
    body: text.slice(0, MAX_BODY),
    createdAt: new Date(),
  });
  return listMessages(channel, user.id);
}
