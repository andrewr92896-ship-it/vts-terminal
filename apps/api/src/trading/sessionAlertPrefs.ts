import crypto from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  sessionAlertPrefs,
  sessionAlertRecipients,
  users,
  type SessionAlertPrefRow,
} from '../db/schema.js';
import { isDemoUser } from '../demo/identity.js';
import { recipientsAcceptingGroupAlerts } from '../notifications/alertPrefs.js';

// A user's Strategy Session notification preferences: buzz me when one of my
// sessions opens, when it closes, and/or a set number of minutes before it
// opens. One row per user; a user with no row has everything off (opt-in). Read
// by the Alert Settings UI and the background session watch.
//
// **WHO GETS THEM IS A SEPARATE QUESTION FROM WHETHER THEY FIRE**, and the two
// are stored apart for that reason. The prefs row above says what the OWNER has
// switched on for their own sessions; `session_alert_recipients` says who else
// is copied in. An empty recipient list is the owner alone, which is what the
// feature did before anybody could be added.
//
// The owner is never a row in that table. They are the baseline rather than an
// entry, which is what stops "remove everyone" quietly meaning "silence my own
// sessions" — the one mistake a picker like this could make that the trader
// would not notice until a session opened without them.

export interface SessionAlertPrefs {
  notifyOpen: boolean;
  notifyClose: boolean;
  notifyPreOpen: boolean;
  preOpenLeadMin: number; // minutes before open for the heads-up (1–240)
}

export const DEFAULT_SESSION_ALERT_PREFS: SessionAlertPrefs = {
  notifyOpen: false,
  notifyClose: false,
  notifyPreOpen: false,
  preOpenLeadMin: 30,
};

function rowToPrefs(row: SessionAlertPrefRow): SessionAlertPrefs {
  return {
    notifyOpen: row.notifyOpen,
    notifyClose: row.notifyClose,
    notifyPreOpen: row.notifyPreOpen,
    preOpenLeadMin: row.preOpenLeadMin,
  };
}

export async function getSessionAlertPrefs(userId: string): Promise<SessionAlertPrefs> {
  const row = (
    await db.select().from(sessionAlertPrefs).where(eq(sessionAlertPrefs.userId, userId)).limit(1)
  )[0];
  return row ? rowToPrefs(row) : { ...DEFAULT_SESSION_ALERT_PREFS };
}

export async function setSessionAlertPrefs(
  userId: string,
  prefs: SessionAlertPrefs,
): Promise<SessionAlertPrefs> {
  const lead = Math.max(1, Math.min(240, Math.round(prefs.preOpenLeadMin) || 30));
  const now = new Date();
  await db
    .insert(sessionAlertPrefs)
    .values({
      id: crypto.randomUUID(),
      userId,
      notifyOpen: prefs.notifyOpen,
      notifyClose: prefs.notifyClose,
      notifyPreOpen: prefs.notifyPreOpen,
      preOpenLeadMin: lead,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sessionAlertPrefs.userId,
      set: {
        notifyOpen: prefs.notifyOpen,
        notifyClose: prefs.notifyClose,
        notifyPreOpen: prefs.notifyPreOpen,
        preOpenLeadMin: lead,
        updatedAt: now,
      },
    });
  return { ...prefs, preOpenLeadMin: lead };
}

// Every user who has opted into at least one session notification. The watch
// uses this to know whose sessions to inspect each tick.
export async function usersWithSessionAlerts(): Promise<
  { userId: string; prefs: SessionAlertPrefs }[]
> {
  const rows = await db.select().from(sessionAlertPrefs);
  return rows
    .map((r) => ({ userId: r.userId, prefs: rowToPrefs(r) }))
    .filter((r) => r.prefs.notifyOpen || r.prefs.notifyClose || r.prefs.notifyPreOpen);
}

// ---------------------------------------------------------------------------
// Who else gets a trader's session alerts
// ---------------------------------------------------------------------------

// A person who may be copied in, as the picker renders them.
export interface SessionAlertRecipient {
  id: string;
  name: string;
  /** Stored as a recipient of the owner's sessions. */
  on: boolean;
  /**
   * They have group notifications switched off, so nothing reaches them
   * whatever this list says.
   *
   * **Shown rather than hidden**, and the row stays selectable: their switch is
   * a decision they made and can undo, and an owner who cannot see why somebody
   * never hears a session opening would file it as a bug. It is the same rule
   * the group nudge follows when it reports how many people it actually reached
   * rather than a cheerful "sent".
   */
  optedOut: boolean;
}

// A runaway-input guard rather than a licence question, like the funded book's
// own cap. A private group is a handful of people.
const MAX_RECIPIENTS = 24;

/**
 * Everybody the owner may copy in: the other active, non-demo members of their
 * private group. Somebody on no group gets an empty list, and the panel says so
 * — there is nobody to pick, which is the honest answer rather than an error.
 *
 * **Resolved from the group at request time, never from the stored rows.** A
 * recipient who leaves the group, or is deactivated, drops out of everybody's
 * picker on the next read with nothing to clean up.
 */
export async function sessionAlertCandidates(
  ownerId: string,
  teamId: string | null,
): Promise<SessionAlertRecipient[]> {
  if (!teamId) return [];
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.teamId, teamId), ne(users.id, ownerId), eq(users.active, true)));
  const inGroup = rows.filter((r) => !isDemoUser({ username: r.username }));
  if (inGroup.length === 0) return [];

  const stored = new Set(
    (
      await db
        .select({ id: sessionAlertRecipients.recipientUserId })
        .from(sessionAlertRecipients)
        .where(eq(sessionAlertRecipients.ownerUserId, ownerId))
    ).map((r) => r.id),
  );
  const accepting = new Set(await recipientsAcceptingGroupAlerts(inGroup.map((r) => r.id)));

  return inGroup
    .map((r) => ({
      id: r.id,
      name: r.displayName?.trim() || r.username,
      on: stored.has(r.id),
      optedOut: !accepting.has(r.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Replace the owner's recipient list.
 *
 * **Narrowed against the group we just read**, so an id that is not in it is
 * dropped rather than stored — the picker cannot become a way to send somebody
 * on another desk a stream of session alerts. That is the same enforcement the
 * group nudge makes, and for the same reason: the list is a request, and the
 * boundary is checked where the request is served.
 */
export async function setSessionAlertRecipients(
  ownerId: string,
  teamId: string | null,
  recipientIds: string[],
): Promise<SessionAlertRecipient[]> {
  const candidates = await sessionAlertCandidates(ownerId, teamId);
  const allowed = new Set(candidates.map((c) => c.id));
  const wanted = [...new Set(recipientIds)].filter((id) => allowed.has(id)).slice(0, MAX_RECIPIENTS);

  const now = new Date();
  await db.delete(sessionAlertRecipients).where(eq(sessionAlertRecipients.ownerUserId, ownerId));
  if (wanted.length > 0) {
    await db.insert(sessionAlertRecipients).values(
      wanted.map((recipientUserId) => ({
        id: crypto.randomUUID(),
        ownerUserId: ownerId,
        recipientUserId,
        createdAt: now,
      })),
    );
  }
  return candidates.map((c) => ({ ...c, on: wanted.includes(c.id) }));
}

/**
 * Who a fired session alert actually goes to: the owner, plus anybody they
 * copied in who is STILL in their group and still accepts group notifications.
 *
 * **Both of those are re-checked here rather than trusted from the row**, which
 * is what makes revoking effortless: leaving the group, or switching group
 * notifications off, stops the alerts without either person editing anything.
 * The owner is always included — their own sessions are not a group alert, and
 * their own `groupAlerts` switch is about other people buzzing them, so it must
 * never silence a notification they set up for themselves.
 */
export async function sessionAlertAudience(
  ownerIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const id of ownerIds) out.set(id, [id]);
  if (ownerIds.length === 0) return out;

  const rows = await db
    .select({
      ownerId: sessionAlertRecipients.ownerUserId,
      recipientId: sessionAlertRecipients.recipientUserId,
    })
    .from(sessionAlertRecipients)
    .where(inArray(sessionAlertRecipients.ownerUserId, ownerIds));
  if (rows.length === 0) return out;

  // One read of the group memberships involved, then the consent filter over
  // every named recipient at once — two queries however many owners are being
  // ticked, rather than two per owner.
  const ids = [...new Set([...ownerIds, ...rows.map((r) => r.recipientId)])];
  const people = await db
    .select({ id: users.id, teamId: users.teamId, active: users.active, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  const byId = new Map(people.map((p) => [p.id, p]));
  const accepting = new Set(
    await recipientsAcceptingGroupAlerts(people.filter((p) => !ownerIds.includes(p.id)).map((p) => p.id)),
  );

  for (const r of rows) {
    const owner = byId.get(r.ownerId);
    const recipient = byId.get(r.recipientId);
    if (!owner?.teamId || !recipient) continue;
    if (!recipient.active) continue;
    if (isDemoUser({ username: recipient.username })) continue;
    // Still on the owner's group — the check that makes a stale row harmless.
    if (recipient.teamId !== owner.teamId) continue;
    if (!accepting.has(recipient.id)) continue;
    out.get(r.ownerId)?.push(recipient.id);
  }
  return out;
}
