import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  brokerConnections,
  founderTradeEvents,
  founderTradePrefs,
  founderTradeInvites,
  tradingOrders,
  users,
  type FounderFundedDecision,
  type FounderPrimaryDecision,
  type FounderTradeInviteRow,
  type FounderTradeStatus,
  type TradeSide,
  type UserRow,
} from '../db/schema.js';
import { isFounder, parseRoles } from '../auth/rbac.js';
import { featuresForUser } from '../features/service.js';
import { isDemoUser } from '../demo/identity.js';
import { NOTIF_LEVELS, type NotifLevel } from '../notifications/prefs.js';
import { DeskError, placeDeskOrder } from './orderDesk.js';
import type { AuditActor } from './credentialAudit.js';

// Founder trade coordination — one Founder invites another onto a trade, and
// the recipient authorizes their own.
//
// FOUR THINGS CARRY THIS FILE, and each is the answer to a way the workflow
// could quietly go wrong:
//
//   1. **THE DATABASE ROW IS THE WORKFLOW.** `status` is the single statement of
//      what is still owed, and the terminal's blocking modal renders from it and
//      nothing else. That is what makes an unresolved invite survive a refresh,
//      a relogin, a second tab and a deploy — and it is why a Pushover
//      acknowledgement, which never touches this table, cannot resolve anything.
//
//   2. **ELIGIBILITY IS READ FROM THE ROLES, EVERY TIME.** Nothing about who may
//      take part is stored on an invite; `assertFounder` re-reads `users.roles`
//      through the existing authorization on every call. Revoking Founder takes
//      effect at once, and there is no name, email or id anywhere in here.
//
//   3. **THE RECIPIENT'S SIZE IS THEIR OWN.** The invite snapshots the inviter's
//      size for DISPLAY and the join never reads it. An unset size is refused
//      rather than defaulted — sending an order at a number nobody chose is the
//      one failure this whole feature must not have.
//
//   4. **A JOIN IS CLAIMED BEFORE IT IS SENT.** One conditional UPDATE decides
//      which caller reaches the broker, so two tabs, a double-click and a
//      retried request cannot become two positions.

export class FounderTradeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'FounderTradeError';
  }
}

// ---- who may take part ----

export interface FounderPerson {
  userId: string;
  displayName: string;
  username: string;
}

function rolesOf(row: { roles: string | null }): boolean {
  return isFounder(parseRoles({ roles: row.roles }));
}

// Every account that may take part: founder-level, active, never the demo.
//
// This is the ONE place eligibility is computed, so the recipient picker, the
// invite guard and the audit read cannot disagree about who counts.
export async function eligibleFounders(): Promise<FounderPerson[]> {
  const rows = await db
    .select({
      id: users.id,
      roles: users.roles,
      displayName: users.displayName,
      username: users.username,
      active: users.active,
    })
    .from(users);
  return rows
    .filter((r) => r.active && rolesOf(r) && !isDemoUser({ username: r.username }))
    .map((r) => ({ userId: r.id, displayName: r.displayName, username: r.username }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// The recipients one Founder may invite: everybody eligible except themselves.
export async function invitableFounders(actor: UserRow): Promise<FounderPerson[]> {
  assertFounder(actor);
  return (await eligibleFounders()).filter((f) => f.userId !== actor.id);
}

// The caller must be founder-level. Read from the session user's roles, which
// the route guard has already checked — this is the second lock on the same
// door, so a service called from anywhere else still fails closed.
function assertFounder(user: UserRow): void {
  if (isDemoUser(user) || !isFounder(parseRoles(user))) {
    throw new FounderTradeError('This is a Founder-only workflow', 403);
  }
}

// A named account must still be eligible. Checked at invite time and again on
// every read, so an account that loses the role stops appearing rather than
// keeping a workflow alive through a grant that no longer exists.
async function assertEligible(userId: string): Promise<FounderPerson> {
  const found = (await eligibleFounders()).find((f) => f.userId === userId);
  if (!found) throw new FounderTradeError('That account cannot take part in Founder trades', 403);
  return found;
}

// ---- the audit timeline ----

// Append one audit row. Fire and forget: the timeline must never be what stops a
// decision being recorded or an order being placed.
function logEvent(inviteId: string, kind: string, actorUserId: string | null, detail?: string): void {
  void db
    .insert(founderTradeEvents)
    .values({
      id: crypto.randomUUID(),
      inviteId,
      actorUserId,
      kind,
      detail: detail == null ? null : detail.slice(0, 500),
      createdAt: new Date(),
    })
    .catch(() => {
      /* best-effort, like every other audit write in the terminal */
    });
}

export interface FounderTradeEvent {
  id: string;
  kind: string;
  actorUserId: string | null;
  detail: string | null;
  createdAt: number;
}

// ---- the recipient's own preferences ----

export interface FounderTradePrefs {
  /** Null is "not stated" and is never read as a size. */
  defaultUnits: number | null;
  /** Which of the recipient's own connections a joined trade goes to. */
  defaultConnectionId: string | null;
  reminderEverySeconds: number;
  reminderLevel: NotifLevel;
}

// How often an unresolved workflow may buzz, and for how long a level is
// honoured. Clamped rather than refused — a save that failed validation would
// leave somebody with reminders they did not ask for, which is the opposite of
// what setting them is for.
const MIN_REMINDER_SECONDS = 60;
const MAX_REMINDER_SECONDS = 3600;

export const DEFAULT_FOUNDER_PREFS: FounderTradePrefs = {
  defaultUnits: null,
  defaultConnectionId: null,
  reminderEverySeconds: 300,
  reminderLevel: 'repeating',
};

function toLevel(v: string): NotifLevel {
  return (NOTIF_LEVELS as readonly string[]).includes(v) ? (v as NotifLevel) : 'repeating';
}

function clampSeconds(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_FOUNDER_PREFS.reminderEverySeconds;
  return Math.min(MAX_REMINDER_SECONDS, Math.max(MIN_REMINDER_SECONDS, Math.round(v)));
}

export async function getFounderPrefs(userId: string): Promise<FounderTradePrefs> {
  const row = (
    await db.select().from(founderTradePrefs).where(eq(founderTradePrefs.userId, userId)).limit(1)
  )[0];
  if (!row) return { ...DEFAULT_FOUNDER_PREFS };
  return {
    defaultUnits: row.defaultUnits != null && row.defaultUnits > 0 ? row.defaultUnits : null,
    defaultConnectionId: row.defaultConnectionId,
    reminderEverySeconds: clampSeconds(row.reminderEverySeconds),
    reminderLevel: toLevel(row.reminderLevel),
  };
}

export interface FounderPrefsPatch {
  defaultUnits?: number | null;
  defaultConnectionId?: string | null;
  reminderEverySeconds?: number;
  reminderLevel?: NotifLevel;
}

// A PATCH, merged onto what is stored: the terminal is a service-worker-cached
// PWA, so a browser on an old bundle can post a subset — and that must never
// blank a field it does not know about.
export async function setFounderPrefs(
  user: UserRow,
  patch: FounderPrefsPatch,
): Promise<FounderTradePrefs> {
  assertFounder(user);
  const current = await getFounderPrefs(user.id);
  // A size of zero or less is not a size. Stored as null so it reads as "not
  // stated" and the join refuses rather than sending nothing.
  const units =
    patch.defaultUnits === undefined
      ? current.defaultUnits
      : patch.defaultUnits == null || !(patch.defaultUnits > 0)
        ? null
        : patch.defaultUnits;
  if (units != null && units > 100_000_000) {
    throw new FounderTradeError('That size is larger than any order the desk will send');
  }
  const connectionId =
    patch.defaultConnectionId === undefined
      ? current.defaultConnectionId
      : patch.defaultConnectionId || null;
  // A connection has to be one of the caller's own. Checked here as well as at
  // join time so a stored id can never point at somebody else's account.
  if (connectionId) await assertOwnConnection(user.id, connectionId);

  const next: FounderTradePrefs = {
    defaultUnits: units,
    defaultConnectionId: connectionId,
    reminderEverySeconds:
      patch.reminderEverySeconds === undefined
        ? current.reminderEverySeconds
        : clampSeconds(patch.reminderEverySeconds),
    reminderLevel: patch.reminderLevel === undefined ? current.reminderLevel : toLevel(patch.reminderLevel),
  };
  const now = new Date();
  await db
    .insert(founderTradePrefs)
    .values({
      userId: user.id,
      defaultUnits: next.defaultUnits,
      defaultConnectionId: next.defaultConnectionId,
      reminderEverySeconds: next.reminderEverySeconds,
      reminderLevel: next.reminderLevel,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: founderTradePrefs.userId,
      set: {
        defaultUnits: next.defaultUnits,
        defaultConnectionId: next.defaultConnectionId,
        reminderEverySeconds: next.reminderEverySeconds,
        reminderLevel: next.reminderLevel,
        updatedAt: now,
      },
    });
  return next;
}

async function assertOwnConnection(userId: string, connectionId: string): Promise<void> {
  const row = (
    await db
      .select({ id: brokerConnections.id, broker: brokerConnections.broker, active: brokerConnections.active })
      .from(brokerConnections)
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.userId, userId)))
      .limit(1)
  )[0];
  // 404 rather than 403: an id the caller does not own must not be probeable.
  if (!row) throw new FounderTradeError('That broker connection is not on your account', 404);
  if (row.broker === 'manual') {
    throw new FounderTradeError('A hand-kept book cannot place an order — pick a live broker account');
  }
}

// ---- the invite ----

export interface FounderInviteView {
  id: string;
  status: FounderTradeStatus;
  inviter: FounderPerson;
  recipient: FounderPerson;
  isRecipient: boolean;
  instrument: string;
  side: TradeSide;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** The inviter's size, for display only — never what the recipient trades. */
  inviterUnits: number | null;
  primaryDecision: FounderPrimaryDecision | null;
  primaryDecidedAt: number | null;
  primaryFillPrice: number | null;
  primaryUnits: number | null;
  primaryError: string | null;
  fundedDecision: FounderFundedDecision | null;
  fundedDecidedAt: number | null;
  hasProof: boolean;
  proofUploadedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  /** The recipient's own configured size, so the modal can state it up front. */
  recipientUnits: number | null;
  /** Whether a JOIN is being sent right now (from this or another tab). */
  sending: boolean;
}

function shape(
  row: FounderTradeInviteRow,
  people: Map<string, FounderPerson>,
  viewerId: string,
  recipientUnits: number | null,
): FounderInviteView {
  const unknown = (id: string): FounderPerson => ({ userId: id, displayName: 'A Founder', username: '' });
  return {
    id: row.id,
    status: row.status,
    inviter: people.get(row.inviterUserId) ?? unknown(row.inviterUserId),
    recipient: people.get(row.recipientUserId) ?? unknown(row.recipientUserId),
    isRecipient: row.recipientUserId === viewerId,
    instrument: row.instrument,
    side: row.side,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    inviterUnits: row.inviterUnits,
    primaryDecision: row.primaryDecision ?? null,
    primaryDecidedAt: row.primaryDecidedAt?.getTime() ?? null,
    primaryFillPrice: row.primaryFillPrice,
    primaryUnits: row.primaryUnits,
    primaryError: row.primaryError,
    fundedDecision: row.fundedDecision ?? null,
    fundedDecidedAt: row.fundedDecidedAt?.getTime() ?? null,
    hasProof: !!row.proofImage,
    proofUploadedAt: row.proofUploadedAt?.getTime() ?? null,
    completedAt: row.completedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    recipientUnits,
    sending: isClaimLive(row),
  };
}

// How long a JOIN may hold its claim. Long enough for a slow broker round trip,
// short enough that a crashed request does not strand the workflow.
const CLAIM_WINDOW_MS = 120_000;

function isClaimLive(row: FounderTradeInviteRow): boolean {
  return !!row.claimToken && !!row.claimedAt && Date.now() - row.claimedAt.getTime() < CLAIM_WINDOW_MS;
}

async function peopleFor(rows: FounderTradeInviteRow[]): Promise<Map<string, FounderPerson>> {
  const ids = [...new Set(rows.flatMap((r) => [r.inviterUserId, r.recipientUserId]))];
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(
    found.map((u) => [u.id, { userId: u.id, displayName: u.displayName, username: u.username }]),
  );
}

// ---- the recipient's own tradeable accounts ----

export interface FounderAccount {
  connectionId: string;
  label: string;
  broker: string;
  env: string | null;
}

// The caller's own live broker connections, for the "which account" picker.
//
// Read straight from the connection rows rather than through the desk's own
// accounts endpoint, deliberately: this has to work on the blocking modal, which
// a Founder can meet on any screen in the terminal, and the desk's endpoint sits
// behind guards of its own. Nothing here decrypts a credential — it is the
// label, the venue and the id, which is all a picker needs.
export async function founderAccounts(userId: string): Promise<FounderAccount[]> {
  const rows = await db
    .select({
      id: brokerConnections.id,
      label: brokerConnections.label,
      broker: brokerConnections.broker,
      summary: brokerConnections.summary,
      active: brokerConnections.active,
    })
    .from(brokerConnections)
    .where(eq(brokerConnections.userId, userId));
  return rows
    .filter((r) => r.active && r.broker !== 'manual')
    .map((r) => ({
      connectionId: r.id,
      label: r.label,
      broker: r.broker,
      env: r.summary?.toLowerCase().includes('live') ? 'live' : r.summary ? 'practice' : null,
    }));
}

// Whether this account can actually send an order today.
//
// Advanced Trading is an OPT-IN carrying the acknowledgement that the terminal
// places real orders with the trader's own broker, and joining a Founder trade
// is exactly that. So the opt-in is required here as it is everywhere else —
// being founder-level is authority to take part, not consent to trade. The
// terminal says so on the modal rather than failing at the press, and DECLINING
// stays available either way, so an account without the desk is never stranded
// on an invitation it cannot answer.
export async function canSendOrders(user: UserRow): Promise<boolean> {
  // Exactly what `requireWorkspace('trading')` asks, since that is the guard
  // every other write on the desk sits behind.
  return (await featuresForUser(user)).advancedTrading;
}

export interface CreateInviteInput {
  recipientUserId: string;
  /** The inviter's own order-journal row id (from the fill they just placed). */
  sourceOrderId: string;
}

// Raise an invite from a trade the inviter has just placed.
//
// The snapshot is read from the inviter's OWN order journal rather than from
// anything the client sends, so an invite can only ever describe a trade the
// terminal actually placed for them, at the levels it actually sent.
export async function createInvite(
  inviter: UserRow,
  input: CreateInviteInput,
): Promise<FounderInviteView> {
  assertFounder(inviter);
  if (input.recipientUserId === inviter.id) {
    throw new FounderTradeError('You cannot invite yourself to your own trade');
  }
  await assertEligible(inviter.id);
  await assertEligible(input.recipientUserId);

  const order = (
    await db
      .select()
      .from(tradingOrders)
      .where(and(eq(tradingOrders.id, input.sourceOrderId), eq(tradingOrders.userId, inviter.id)))
      .limit(1)
  )[0];
  // 404 rather than 403 so another trader's order id cannot be probed for.
  if (!order) throw new FounderTradeError('That trade is not on your order journal', 404);
  if (order.kind !== 'entry' || order.status === 'rejected') {
    throw new FounderTradeError('Only a placed entry can be shared with another Founder');
  }
  if (!order.side) throw new FounderTradeError('That order has no direction to share');

  // The duplicate-invite guard. One trade raises one invite per recipient — a
  // retried request or a second click returns what already exists rather than
  // raising a second modal about one trade.
  const existing = (
    await db
      .select()
      .from(founderTradeInvites)
      .where(
        and(
          eq(founderTradeInvites.sourceRef, order.id),
          eq(founderTradeInvites.recipientUserId, input.recipientUserId),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    logEvent(existing.id, 'invite.duplicate_suppressed', inviter.id, 'A repeat invite for this trade was folded into the existing one');
    return shape(existing, await peopleFor([existing]), inviter.id, await unitsOf(existing.recipientUserId));
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const row = {
    id,
    inviterUserId: inviter.id,
    recipientUserId: input.recipientUserId,
    sourceRef: order.id,
    sourceConnectionId: order.connectionId,
    sourceTradeId: order.brokerTradeId,
    instrument: order.instrument,
    side: order.side,
    entryPrice: order.fillPrice ?? order.requestedPrice,
    stopLoss: order.stopLoss,
    takeProfit: order.takeProfit,
    inviterUnits: order.units,
    status: 'primary_pending' as const,
    notifyCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(founderTradeInvites).values(row);
  } catch {
    // Lost a race with a simultaneous create — the unique index did its job, so
    // read back the winner rather than reporting a failure for a duplicate.
    const winner = (
      await db
        .select()
        .from(founderTradeInvites)
        .where(
          and(
            eq(founderTradeInvites.sourceRef, order.id),
            eq(founderTradeInvites.recipientUserId, input.recipientUserId),
          ),
        )
        .limit(1)
    )[0];
    if (!winner) throw new FounderTradeError('The invitation could not be created', 500);
    return shape(winner, await peopleFor([winner]), inviter.id, await unitsOf(winner.recipientUserId));
  }

  logEvent(id, 'source_trade.placed', inviter.id, `${order.instrument} ${order.side} · order ${order.id}`);
  logEvent(
    id,
    'invite.created',
    inviter.id,
    `${order.instrument} ${order.side}${order.stopLoss == null ? ' · no stop' : ` · stop ${order.stopLoss}`}`,
  );
  const full = (await db.select().from(founderTradeInvites).where(eq(founderTradeInvites.id, id)).limit(1))[0]!;
  return shape(full, await peopleFor([full]), inviter.id, await unitsOf(input.recipientUserId));
}

async function unitsOf(userId: string): Promise<number | null> {
  return (await getFounderPrefs(userId)).defaultUnits;
}

// ---- reading ----

// Whether a status still owes the recipient an action. The one definition, read
// by the modal, the reminder watch and the completion check alike.
export function isUnresolved(status: FounderTradeStatus): boolean {
  return status !== 'complete';
}

const UNRESOLVED: FounderTradeStatus[] = ['primary_pending', 'funded_pending', 'proof_pending'];

// Everything still waiting on this recipient, OLDEST FIRST.
//
// The queue is deliberate: several invites can be pending at once and none may
// be discarded, so they are worked through in the order they arrived and the
// modal says how many are behind the one on screen.
export async function pendingForRecipient(user: UserRow): Promise<FounderInviteView[]> {
  if (isDemoUser(user) || !isFounder(parseRoles(user))) return [];
  const rows = await db
    .select()
    .from(founderTradeInvites)
    .where(
      and(
        eq(founderTradeInvites.recipientUserId, user.id),
        inArray(founderTradeInvites.status, UNRESOLVED),
      ),
    )
    .orderBy(asc(founderTradeInvites.createdAt));
  if (rows.length === 0) return [];
  const people = await peopleFor(rows);
  const units = await unitsOf(user.id);
  return rows.map((r) => shape(r, people, user.id, units));
}

// The invites this Founder sent or received, newest first — the history behind
// the workflow, for the desk panel.
export async function listInvites(user: UserRow, limit = 30): Promise<FounderInviteView[]> {
  assertFounder(user);
  const rows = await db
    .select()
    .from(founderTradeInvites)
    .where(
      or(eq(founderTradeInvites.inviterUserId, user.id), eq(founderTradeInvites.recipientUserId, user.id)),
    )
    .orderBy(desc(founderTradeInvites.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
  const people = await peopleFor(rows);
  const units = await unitsOf(user.id);
  return rows.map((r) => shape(r, people, user.id, units));
}

// One invite, with its audit timeline.
//
// Readable by the two parties and nobody else — not a teammate, not a plain
// admin, not another Founder. An id that is not the caller's answers 404, so a
// guessed workflow id cannot be used to find out somebody else's trade.
export async function getInvite(
  user: UserRow,
  id: string,
): Promise<{ invite: FounderInviteView; events: FounderTradeEvent[] }> {
  const row = await loadForParty(user, id);
  const events = await db
    .select()
    .from(founderTradeEvents)
    .where(eq(founderTradeEvents.inviteId, id))
    .orderBy(asc(founderTradeEvents.createdAt));
  return {
    invite: shape(row, await peopleFor([row]), user.id, await unitsOf(row.recipientUserId)),
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      actorUserId: e.actorUserId,
      detail: e.detail,
      createdAt: e.createdAt.getTime(),
    })),
  };
}

// The funded screenshot. Same two-party rule as the timeline: the recipient owns
// it, and the inviter is the one it exists to prove the trade to.
export async function getProofImage(user: UserRow, id: string): Promise<string> {
  const row = await loadForParty(user, id);
  if (!row.proofImage) throw new FounderTradeError('No screenshot has been uploaded for this trade', 404);
  return row.proofImage;
}

async function loadForParty(user: UserRow, id: string): Promise<FounderTradeInviteRow> {
  assertFounder(user);
  const row = (
    await db.select().from(founderTradeInvites).where(eq(founderTradeInvites.id, id)).limit(1)
  )[0];
  if (!row || (row.inviterUserId !== user.id && row.recipientUserId !== user.id)) {
    throw new FounderTradeError('That trade invitation is not available on your account', 404);
  }
  return row;
}

// The recipient's own row, for a write. Anything but the recipient is a 404 —
// the inviter may READ a workflow and may never decide it.
async function loadForRecipient(user: UserRow, id: string): Promise<FounderTradeInviteRow> {
  assertFounder(user);
  const row = (
    await db
      .select()
      .from(founderTradeInvites)
      .where(and(eq(founderTradeInvites.id, id), eq(founderTradeInvites.recipientUserId, user.id)))
      .limit(1)
  )[0];
  if (!row) throw new FounderTradeError('That trade invitation is not available on your account', 404);
  return row;
}

async function reload(user: UserRow, id: string): Promise<FounderInviteView> {
  const row = (
    await db.select().from(founderTradeInvites).where(eq(founderTradeInvites.id, id)).limit(1)
  )[0]!;
  return shape(row, await peopleFor([row]), user.id, await unitsOf(row.recipientUserId));
}

// ---- the primary decision ----

// Take the workflow past its primary decision. Advancing to the funded question
// is what BOTH answers do: declining the primary trade is not declining the
// funded one, and treating it as though it were would silently drop half of what
// the recipient was asked.
async function advanceToFunded(
  id: string,
  decision: FounderPrimaryDecision,
  extra: Partial<FounderTradeInviteRow> = {},
): Promise<void> {
  const now = new Date();
  await db
    .update(founderTradeInvites)
    .set({
      status: 'funded_pending',
      primaryDecision: decision,
      primaryDecidedAt: now,
      claimToken: null,
      claimedAt: null,
      // A new reminder cycle starts for the funded question rather than
      // inheriting the primary one's pacing.
      lastNotifiedAt: null,
      notifyCount: 0,
      updatedAt: now,
      ...extra,
    })
    .where(eq(founderTradeInvites.id, id));
}

export async function declinePrimary(user: UserRow, id: string): Promise<FounderInviteView> {
  const row = await loadForRecipient(user, id);
  // Already past this step (another tab answered first) — report the current
  // state rather than an error, so both tabs converge on the same screen.
  if (row.status !== 'primary_pending') return reload(user, id);
  if (isClaimLive(row)) {
    throw new FounderTradeError('A JOIN is being sent for this trade right now', 409, 'IN_FLIGHT');
  }
  await advanceToFunded(id, 'declined', { primaryError: null });
  logEvent(id, 'primary.declined', user.id, 'The recipient did not join the primary trade');
  return reload(user, id);
}

// Join the trade. The recipient pressing JOIN is the authorization for this one
// order and nothing else.
export async function joinPrimary(
  user: UserRow,
  id: string,
  actor: AuditActor,
): Promise<FounderInviteView> {
  const row = await loadForRecipient(user, id);
  if (row.status !== 'primary_pending') return reload(user, id);

  // Everything is validated BEFORE the claim is taken, so a refusal costs
  // nothing, leaves the workflow exactly where it was, and can be retried at
  // once rather than waiting out a claim window.
  //
  // A refusal here is still AUDITED. It is a press the recipient made and did
  // not get an order out of, which is precisely the kind of thing somebody
  // reconstructing "why was this trade not taken?" needs to see — and it is
  // bounded by being a person pressing a button.
  const prefs = await getFounderPrefs(user.id);
  try {
    if (!(await canSendOrders(user))) {
      throw new FounderTradeError(
        'Turn Advanced Trading on in My Terminal ▸ Premium Features before joining — it is where the terminal asks you to acknowledge that it places real orders with your own broker',
        403,
        'NO_DESK',
      );
    }
    if (prefs.defaultUnits == null || !(prefs.defaultUnits > 0)) {
      throw new FounderTradeError(
        'Set your own position size before joining — nothing is copied from the trade you were invited to',
        400,
        'NO_SIZE',
      );
    }
    if (!prefs.defaultConnectionId) {
      throw new FounderTradeError(
        'Choose which of your broker accounts a joined trade goes to',
        400,
        'NO_ACCOUNT',
      );
    }
    await assertOwnConnection(user.id, prefs.defaultConnectionId);
  } catch (e) {
    logEvent(id, 'primary.join_refused', user.id, e instanceof Error ? e.message : 'Refused before sending');
    throw e;
  }

  // THE CLAIM. One conditional UPDATE decides which caller reaches the broker:
  // whoever the row was still unclaimed for. A second tab, a double-click and a
  // retried HTTP request all lose it and are told so, rather than each sending
  // their own order.
  const token = crypto.randomUUID();
  const now = new Date();
  const stale = new Date(Date.now() - CLAIM_WINDOW_MS);
  const claimed = await db
    .update(founderTradeInvites)
    .set({ claimToken: token, claimedAt: now, updatedAt: now })
    .where(
      and(
        eq(founderTradeInvites.id, id),
        eq(founderTradeInvites.status, 'primary_pending'),
        isNull(founderTradeInvites.primaryDecision),
        or(isNull(founderTradeInvites.claimToken), sql`${founderTradeInvites.claimedAt} < ${stale.getTime()}`),
      ),
    );
  if (claimed.rowsAffected === 0) {
    // Either somebody else is mid-send, or the decision has already been made.
    const fresh = await loadForRecipient(user, id);
    if (fresh.status !== 'primary_pending') return reload(user, id);
    logEvent(id, 'primary.duplicate_blocked', user.id, 'A second JOIN arrived while one was already being sent');
    throw new FounderTradeError(
      'This trade is already being sent — give it a moment rather than sending it twice',
      409,
      'IN_FLIGHT',
    );
  }
  // A CLAIM TAKEN OVER FROM A STALE ONE DOES NOT GO STRAIGHT TO THE BROKER.
  //
  // A claim only survives its window when a previous attempt never reported back
  // at all — the process died, or the request is still hanging — and in the
  // second case that attempt may yet reach the broker. Sending now could
  // therefore be the second order rather than the first. So the takeover
  // RELEASES the claim, says so on the row, and refuses once: the next press
  // finds a clean row and goes through normally, and the recipient has been told
  // to look at their account first. A failed attempt that reported back clears
  // its own claim in the catch below, so the ordinary retry is unaffected.
  if (row.claimToken && row.claimedAt) {
    const warning =
      'Your last attempt never finished, so it may or may not have reached your broker. Check your account, then press JOIN again.';
    const releasedAt = new Date();
    await db
      .update(founderTradeInvites)
      .set({ claimToken: null, claimedAt: null, primaryError: warning, updatedAt: releasedAt })
      .where(eq(founderTradeInvites.id, id));
    logEvent(id, 'primary.claim_recovered', null, 'A previous JOIN did not report back; its claim was released unsent');
    throw new FounderTradeError(warning, 409, 'CLAIM_RECOVERED');
  }

  logEvent(
    id,
    'primary.join_submitted',
    user.id,
    `${row.instrument} ${row.side} · ${prefs.defaultUnits} units · own account`,
  );

  try {
    const res = await placeDeskOrder(
      user,
      {
        connectionId: prefs.defaultConnectionId!,
        instrument: row.instrument,
        side: row.side,
        // The recipient's OWN size. The inviter's is on the row for display and
        // is deliberately not read here.
        units: prefs.defaultUnits,
        type: 'market',
        price: null,
        // The inviter's initial stop, as an absolute level on the same
        // instrument. The take profit is deliberately not copied — what was
        // asked for is the instrument, the direction and the stop.
        stopLoss: row.stopLoss ?? null,
        takeProfit: null,
      },
      actor,
    );
    await advanceToFunded(id, 'joined', {
      primaryOrderRef: res.orderRecordId,
      primaryFillPrice: res.fillPrice,
      primaryUnits: res.units ?? prefs.defaultUnits,
      primaryConnectionId: prefs.defaultConnectionId,

      primaryError: null,
    });
    logEvent(
      id,
      'primary.joined',
      user.id,
      `${res.status} · ${res.units ?? prefs.defaultUnits} units${res.fillPrice == null ? '' : ` at ${res.fillPrice}`}`,
    );
    return reload(user, id);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The order could not be placed';
    // The workflow stays exactly where it was — still owed a primary decision —
    // with the reason on the row so it is on screen when the recipient returns.
    const failedAt = new Date();
    await db
      .update(founderTradeInvites)
      .set({ claimToken: null, claimedAt: null, primaryError: message.slice(0, 300), updatedAt: failedAt })
      .where(eq(founderTradeInvites.id, id));
    logEvent(id, 'primary.join_failed', user.id, message);
    throw new FounderTradeError(
      message,
      e instanceof DeskError ? e.status : 502,
      (e instanceof DeskError ? e.code : undefined) ?? undefined,
    );
  }
}

// ---- the funded decision ----

export async function setFundedDecision(
  user: UserRow,
  id: string,
  decision: FounderFundedDecision,
): Promise<FounderInviteView> {
  const row = await loadForRecipient(user, id);
  if (row.status === 'complete') return reload(user, id);
  if (row.status === 'primary_pending') {
    throw new FounderTradeError('Answer the trade invitation first', 409, 'PRIMARY_PENDING');
  }
  // Already answered (a second tab, a retried request) — converge rather than
  // letting the second press overwrite the first with a different answer.
  if (row.fundedDecision) return reload(user, id);

  const now = new Date();
  const next: FounderTradeStatus = decision === 'yes' ? 'proof_pending' : 'complete';
  const updated = await db
    .update(founderTradeInvites)
    .set({
      fundedDecision: decision,
      fundedDecidedAt: now,
      status: next,
      // 'no' ends the workflow here. 'yes' does NOT: the screenshot is what
      // completes that branch, so the reminders keep going and a fresh cycle
      // starts for them.
      completedAt: next === 'complete' ? now : null,
      lastNotifiedAt: null,
      notifyCount: 0,
      updatedAt: now,
    })
    .where(
      and(
        eq(founderTradeInvites.id, id),
        eq(founderTradeInvites.status, 'funded_pending'),
        isNull(founderTradeInvites.fundedDecision),
      ),
    );
  if (updated.rowsAffected === 0) return reload(user, id);

  logEvent(
    id,
    decision === 'yes' ? 'funded.accepted' : 'funded.declined',
    user.id,
    decision === 'yes'
      ? 'The recipient is placing this on their funded account — a screenshot is now required'
      : 'The recipient is not placing this on their funded account',
  );
  if (decision === 'yes') logEvent(id, 'proof.requested', null, 'Screenshot verification required');
  else logEvent(id, 'workflow.completed', user.id, 'Completed without a funded trade');
  return reload(user, id);
}

// ---- the funded screenshot ----

// What a stored screenshot may weigh. The client scales before it uploads, so
// this is the runaway-input guard rather than the working limit.
const MAX_PROOF_CHARS = 4_000_000;
const PROOF_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

// The screenshot is what completes the funded branch — not the YES that
// preceded it. That is the whole point of this step: pressing YES is a statement
// of intent, and reminders go on until there is proof the trade was placed.
export async function uploadProof(user: UserRow, id: string, dataUrl: string): Promise<FounderInviteView> {
  const row = await loadForRecipient(user, id);
  if (row.status === 'complete') return reload(user, id);
  if (row.status !== 'proof_pending') {
    throw new FounderTradeError('This trade is not waiting on a screenshot', 409);
  }
  const image = dataUrl.trim();
  if (!PROOF_PATTERN.test(image)) {
    throw new FounderTradeError('That does not look like an image — upload a screenshot of the funded trade');
  }
  if (image.length > MAX_PROOF_CHARS) {
    throw new FounderTradeError('That screenshot is too large — try a smaller image');
  }

  const now = new Date();
  const updated = await db
    .update(founderTradeInvites)
    .set({
      proofImage: image,
      proofUploadedAt: now,
      status: 'complete',
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(founderTradeInvites.id, id), eq(founderTradeInvites.status, 'proof_pending')));
  // Lost the race to another tab's upload. The first screenshot stands — a
  // completed verification is not overwritten by a second one arriving late.
  if (updated.rowsAffected === 0) return reload(user, id);

  logEvent(id, 'proof.uploaded', user.id, `Screenshot saved (${Math.round(image.length / 1024)} KB)`);
  logEvent(id, 'workflow.completed', user.id, 'Funded trade verified');
  return reload(user, id);
}

// ---- the reminder watch's half ----

export interface DueReminder {
  id: string;
  recipientUserId: string;
  inviterName: string;
  instrument: string;
  side: TradeSide;
  status: FounderTradeStatus;
  level: NotifLevel;
  notifyCount: number;
}

// How long reminders keep going on one unresolved workflow. The modal stays
// forever — the workflow is server-state and does not expire — but the phone
// stops, because an alert that has repeated for a day is no longer telling
// anybody anything they do not know.
export const REMINDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Everything owed a reminder right now. Pure read plus the pacing decision; the
// watch owns the delivery, exactly as priceAlertWatch sits beside priceAlerts.
export async function dueReminders(now = new Date()): Promise<DueReminder[]> {
  const rows = await db
    .select()
    .from(founderTradeInvites)
    .where(inArray(founderTradeInvites.status, UNRESOLVED));
  if (rows.length === 0) return [];

  // Eligibility is re-read here too: an account that has lost the Founder role
  // stops being buzzed about a workflow it can no longer reach.
  const eligible = new Set((await eligibleFounders()).map((f) => f.userId));
  const people = await peopleFor(rows);
  const prefs = new Map<string, FounderTradePrefs>();
  for (const uid of new Set(rows.map((r) => r.recipientUserId))) {
    prefs.set(uid, await getFounderPrefs(uid));
  }

  const due: DueReminder[] = [];
  for (const row of rows) {
    if (!eligible.has(row.recipientUserId)) continue;
    // Don't buzz about a step that is being answered this second.
    if (isClaimLive(row)) continue;
    if (now.getTime() - row.createdAt.getTime() > REMINDER_MAX_AGE_MS) continue;
    const p = prefs.get(row.recipientUserId) ?? DEFAULT_FOUNDER_PREFS;
    const last = row.lastNotifiedAt?.getTime() ?? 0;
    if (now.getTime() - last < p.reminderEverySeconds * 1000) continue;
    due.push({
      id: row.id,
      recipientUserId: row.recipientUserId,
      inviterName: people.get(row.inviterUserId)?.displayName ?? 'A Founder',
      instrument: row.instrument,
      side: row.side,
      status: row.status,
      level: p.reminderLevel,
      notifyCount: row.notifyCount,
    });
  }
  return due;
}

// Record that a reminder went out. Conditional on the status it was sent for, so
// a notification racing a decision cannot re-stamp a workflow that has moved on.
export async function markNotified(id: string, status: FounderTradeStatus): Promise<void> {
  const now = new Date();
  await db
    .update(founderTradeInvites)
    .set({
      lastNotifiedAt: now,
      notifyCount: sql`${founderTradeInvites.notifyCount} + 1`,
      updatedAt: now,
    })
    .where(and(eq(founderTradeInvites.id, id), eq(founderTradeInvites.status, status)));
  logEvent(id, 'reminder.sent', null, `Reminder for ${status}`);
}
