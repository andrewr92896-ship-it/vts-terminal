import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { isDemoUser } from '../demo/identity.js';
import { sendToUsers } from './push.js';
import { sendPushoverToUsers, PUSHOVER_EMERGENCY } from './pushover.js';
import { sendSmsToUsers } from './sms.js';
import { recipientsAcceptingGroupAlerts } from './alertPrefs.js';

// "Nudge my group" — one person in a private group buzzing the others in it,
// either everybody or a few people they pick.
//
// **There is deliberately no message.** The notification says who sent it and
// nothing more (owner instruction, 2026-08). A free-text field on a push that
// reaches other people's phones is a different feature with a different set of
// problems — moderation, abuse, and, on a trading desk, somebody sending what
// reads as instructions to trade. The sender's name is the whole payload, and
// the meaning is "look at the terminal", which is what a nudge is for.
//
// The sender picks only WHO and HOW LOUD.

export type GroupAlertKind = 'standard' | 'repeating';

export interface GroupAlertResult {
  // How many people it actually reached, so the sender is told the truth rather
  // than a cheerful "sent!" when everybody has group alerts switched off.
  recipients: number;
}

export class GroupAlertError extends Error {}

// One nudge per sender per minute. Not a policy question so much as a property
// of what this is: a repeating alert that ignores silent mode, fired at other
// people's phones by pressing a button. Without a cooldown a slip of the finger
// — or a bad actor on a shared desk — is a siren nobody can stop from their
// side. In memory, per process, like the AI burst limit: a restart handing out
// a fresh allowance costs nothing here.
const COOLDOWN_MS = 60_000;
const lastSent = new Map<string, number>();

export function cooldownRemainingMs(senderId: string, now = Date.now()): number {
  const at = lastSent.get(senderId);
  if (at == null) return 0;
  return Math.max(0, COOLDOWN_MS - (now - at));
}

/** Test seam — the cooldown is process state, so a check run needs to clear it. */
export function resetGroupAlertCooldown(senderId?: string): void {
  if (senderId) lastSent.delete(senderId);
  else lastSent.clear();
}

export async function sendGroupAlert(
  sender: { id: string; teamId: string | null; displayName: string; username: string },
  kind: GroupAlertKind,
  // Who to reach. Empty or absent = everybody else in the group, which is what
  // the button did before picking people was possible.
  targetIds: string[] = [],
): Promise<GroupAlertResult> {
  if (!sender.teamId) throw new GroupAlertError('You are not in a group.');

  const wait = cooldownRemainingMs(sender.id);
  if (wait > 0) {
    throw new GroupAlertError(
      `Wait ${Math.ceil(wait / 1000)}s before sending your group another notification.`,
    );
  }

  // Everybody else on the group. Active accounts only, and never the demo —
  // which cannot be on a real group anyway, but the guard costs nothing and the
  // demo must never receive a real person's nudge.
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(eq(users.teamId, sender.teamId), ne(users.id, sender.id), eq(users.active, true)));

  const inGroup = rows.filter((r) => !isDemoUser({ username: r.username })).map((r) => r.id);

  // Narrowing to specific people is done against the group we just read, so an
  // id that is not in it reaches nobody — the picker cannot become a way to
  // buzz an arbitrary account. A selection that resolves to NOBODY is refused
  // rather than quietly falling back to everyone: silently widening "just Dale"
  // into "the whole desk" is the worst possible reading of an ambiguous input.
  let candidates = inGroup;
  if (targetIds.length > 0) {
    const wanted = new Set(targetIds);
    candidates = inGroup.filter((id) => wanted.has(id));
    if (candidates.length === 0) {
      throw new GroupAlertError('Those people are not in your group.');
    }
  }

  // Both switches: somebody who silenced their account has silenced this too.
  // Applied to a picked person as well — being named individually does not
  // override somebody's decision not to be buzzed.
  const recipients = await recipientsAcceptingGroupAlerts(candidates);

  // The cooldown is stamped even when nobody is reachable. Otherwise "nobody
  // has it switched on" would be an unlimited retry loop against the send path.
  lastSent.set(sender.id, Date.now());
  if (recipients.length === 0) return { recipients: 0 };

  const who = sender.displayName?.trim() || sender.username;
  const title = `${who} · VTS Terminal`;
  const body = `${who} sent you a notification.`;

  // Both channels, like every other notification here. Web push has no
  // loudness of its own, so `kind` only changes what Pushover does.
  //
  // `sendToUsers`, NOT `sendToTradingDesk`: that one additionally requires the
  // recipient to have the Advanced Trading opt-in, and a private group is not
  // the trading desk — somebody in your group who never turned the desk on
  // should still be reachable.
  void sendToUsers(
    recipients,
    { title, body, url: '/?screen=my_team', tag: `vts-group-${sender.id}` },
    { category: 'group' },
  ).catch(() => {});
  void sendPushoverToUsers(
    recipients,
    {
      title,
      message: body,
      priority: kind === 'repeating' ? PUSHOVER_EMERGENCY : 1,
    },
    'group',
    { category: 'group' },
  ).catch(() => {});
  // And a text, for whoever routed group notifications there. `kind` does not
  // reach it: a text has no loudness and cannot repeat, so a `repeating` nudge
  // sends exactly one message — which is the right answer, not a limitation.
  // A siren that also billed per repeat would be a slip of the finger nobody
  // could stop from their side.
  void sendSmsToUsers(recipients, { title, body }, { category: 'group' }).catch(() => {});

  return { recipients: recipients.length };
}
