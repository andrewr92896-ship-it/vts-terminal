import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { alertChannels, type AlertChannelRow } from '../db/schema.js';

// WHICH CHANNELS CARRY WHICH KIND OF ALERT.
//
// The account switches in `alertPrefs.ts` answer "do I want to be notified at
// all"; this answers "by what". Three channels, chosen independently per kind
// of alert, because they are genuinely different tools rather than three copies
// of one:
//
//   • **app**      — the terminal's own push notification. Free, needs no
//                    credential from anybody, and reaches an installed app.
//   • **text**     — an SMS. Reaches a phone with nothing installed on it, and
//                    is the only one that works with the terminal uninstalled.
//   • **pushover** — the only one that can sound through silent mode and Focus,
//                    and the only one with a loudness ladder.
//
// **A MISSING ROW IS THE DEFAULT, AND THE DEFAULT IS WHAT THE TERMINAL DID
// BEFORE THIS MODULE EXISTED**: app on, Pushover on, text OFF. That is what made
// the whole thing invisible on deploy. Do not flip the text default — every
// message costs money and lands on a phone whether or not somebody installed
// anything, so being texted has to be asked for.

export const ALERT_CHANNELS = ['push', 'sms', 'pushover'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

// The kinds of alert a user can route separately. Each one is a thing the
// terminal sends unprompted, and each has a home on Alert Settings.
//
// `system` is the catch-all for the notices that are not trading alerts — a
// reply to a bug report, a followed channel going live. It is listed like the
// rest rather than hidden, because a channel choice that silently did not apply
// to some notifications would be worse than no choice.
export const ALERT_CATEGORIES = [
  'trade',
  'alert',
  'session',
  'rollover',
  'price',
  'note',
  'founder',
  'group',
  'system',
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export type ChannelChoice = Record<AlertChannel, boolean>;

// App push and Pushover on, text off — see the note above. This is exactly
// what every send did before this module existed, which is what made it
// invisible on deploy.
export const DEFAULT_CHANNELS: ChannelChoice = { push: true, sms: false, pushover: true };

export function isAlertCategory(v: unknown): v is AlertCategory {
  return typeof v === 'string' && (ALERT_CATEGORIES as readonly string[]).includes(v);
}

function rowToChoice(row: AlertChannelRow): ChannelChoice {
  return { push: row.channelPush, sms: row.channelSms, pushover: row.channelPushover };
}

/** One user's full routing table, filled in with the defaults. */
export async function getChannelChoices(userId: string): Promise<Record<AlertCategory, ChannelChoice>> {
  const rows = await db.select().from(alertChannels).where(eq(alertChannels.userId, userId));
  const stored = new Map(rows.map((r) => [r.category, rowToChoice(r)]));
  const out = {} as Record<AlertCategory, ChannelChoice>;
  for (const c of ALERT_CATEGORIES) out[c] = stored.get(c) ?? { ...DEFAULT_CHANNELS };
  return out;
}

/**
 * Save one category's routing.
 *
 * Every channel is written, so a save is the whole answer to one question
 * rather than a patch — the panel has all three switches on screen, and a
 * partial write would leave "off" and "not mentioned" indistinguishable.
 */
export async function setChannelChoice(
  userId: string,
  category: AlertCategory,
  choice: ChannelChoice,
): Promise<ChannelChoice> {
  const now = new Date();
  const cols = { channelPush: choice.push, channelSms: choice.sms, channelPushover: choice.pushover };
  await db
    .insert(alertChannels)
    .values({ id: crypto.randomUUID(), userId, category, ...cols, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [alertChannels.userId, alertChannels.category],
      set: { ...cols, updatedAt: now },
    });
  return choice;
}

/**
 * Narrow a set of candidate recipients to those who want THIS category on THIS
 * channel. A candidate with no stored row keeps the defaults, so this only ever
 * removes somebody who made an explicit choice.
 *
 * Applied inside each channel's own send function — the one place a message of
 * that kind leaves the server — so a caller cannot forget it, which is the same
 * rule `filterAccountAlerts` follows.
 */
export async function channelRecipients(
  userIds: string[],
  category: AlertCategory,
  channel: AlertChannel,
): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  const ids = [...new Set(userIds)];
  const rows = await db
    .select()
    .from(alertChannels)
    .where(and(eq(alertChannels.category, category), inArray(alertChannels.userId, ids)));
  const byUser = new Map(rows.map((r) => [r.userId, rowToChoice(r)]));
  return userIds.filter((id) => (byUser.get(id) ?? DEFAULT_CHANNELS)[channel]);
}
