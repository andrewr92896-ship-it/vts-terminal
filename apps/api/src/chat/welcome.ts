import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatMessages } from '../db/schema.js';
import { getSetting, getSettingOr } from '../settings/service.js';
import { TEAM_CHANNEL } from './service.js';

// The "default first team-chat message": the welcome note seeded as the very
// first message in a trading team's chat, so a brand-new team lands in a channel
// that already greets them instead of an empty box. Admins can reword it from
// Admin ▸ Teams; the override is stored in app_settings under this key, and a
// missing/blank override falls back to the shipped default below (so a reset
// always restores this wording).

export const TEAM_CHAT_WELCOME_KEY = 'teamchat.welcome';

export const DEFAULT_TEAM_CHAT_WELCOME =
  'Welcome to the team chat. This channel is just for you and your trading team — share setups, levels, and trade ideas here.';

// Whether an admin has overridden the welcome message (a row exists).
export async function teamChatWelcomeOverride(): Promise<string | null> {
  return getSetting(TEAM_CHAT_WELCOME_KEY);
}

// The effective welcome message: the admin's override if set, else the default.
export async function getTeamChatWelcome(): Promise<string> {
  return getSettingOr(TEAM_CHAT_WELCOME_KEY, DEFAULT_TEAM_CHAT_WELCOME);
}

// Seed a team's chat with the configured welcome message as its first message,
// authored by `author`. No-op when the team already has any messages, so it is
// safe to call on every team creation. Best-effort: callers should not let a
// seeding failure block creating the team.
export async function seedTeamChatWelcome(
  teamId: string,
  author: { id: string; displayName: string },
): Promise<void> {
  const existing = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.channel, TEAM_CHANNEL), eq(chatMessages.teamId, teamId)))
    .limit(1);
  if (existing.length > 0) return;
  const body = (await getTeamChatWelcome()).trim();
  if (!body) return;
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    channel: TEAM_CHANNEL,
    teamId,
    userId: author.id,
    author: author.displayName,
    body,
    createdAt: new Date(),
  });
}
