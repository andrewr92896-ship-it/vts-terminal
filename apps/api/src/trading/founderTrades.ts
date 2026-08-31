import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  brokerConnections,
  founderLinkedPositions,
  founderTradeEvents,
  founderTradeLinks,
  founderTradePrefs,
  founderTradeInvites,
  tradingOrders,
  users,
  type FounderLinkedPositionRow,
  type FounderPrimaryDecision,
  type FounderTargetMatch,
  type FounderTradeInviteRow,
  type FounderTradeKind,
  type FounderTradeStatus,
  type TradeSide,
  type UserRow,
} from '../db/schema.js';
import { isFounder, parseRoles } from '../auth/rbac.js';
import { sendToUsers } from '../notifications/push.js';
import { sendPushoverToUsers } from '../notifications/pushover.js';
import { featuresForUser } from '../features/service.js';
import { isDemoUser } from '../demo/identity.js';
import { LEVEL_PRIORITY, NOTIF_LEVELS, type NotifLevel } from '../notifications/prefs.js';
import {
  DeskError,
  deskInstruments,
  deskQuotes,
  listDeskAccounts,
  listDeskPositions,
  modifyDeskPosition,
  placeDeskOrder,
  type DeskPosition,
  type ModifyResult,
} from './orderDesk.js';
import { getShareConfig } from './founderTradeConfig.js';
import { forexPair } from './forex.js';
import {
  DEFAULT_PIP_ROUNDING_INCREMENT,
  MAX_PIP_ROUNDING_INCREMENT,
  MIN_PIP_ROUNDING_INCREMENT,
  sizeForAccountPct,
  sizingProblemText,
  type AccountPctSize,
  type SizingInputs,
} from './sizing.js';
import { SYSTEM, type AuditActor } from './credentialAudit.js';

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
//
//   5. **AN 'AMEND' NEVER GUESSES WHICH POSITION IT IS ABOUT.** A level-move
//      invitation carries the recipient's OWN position, resolved when it was
//      raised — from an explicit pairing first, and only failing that from a
//      single unambiguous match on instrument and direction. Two candidates
//      resolve to NONE: the invitation then says what the sender changed and
//      offers no button, which is the honest answer. Moving a stop on the wrong
//      position is the one failure this half must not have.

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

/** How a joined size is arrived at. Null in the database reads as 'units'. */
export type FounderSizeMode = 'units' | 'account_pct';

export interface FounderTradePrefs {
  /**
   * How the size is arrived at. `units` is the fixed figure below and is what
   * every setting made before this existed is; `account_pct` re-derives the size
   * at join time from the recipient's OWN account value, quote and margin rate.
   * The sender's size is not an input to either.
   */
  sizeMode: FounderSizeMode;
  /** Null is "not stated" and is never read as a size. */
  defaultUnits: number | null;
  /** The share of the recipient's own account value a joined position's margin
   *  should consume. Null is "not stated" and, like the units, is never read as
   *  a number — a join with nothing stated is refused rather than guessed. */
  sizePct: number | null;
  /** Floor the money-per-pip that percentage works out to. */
  pctRound: boolean;
  pctRoundIncrement: number;
  /** Which of the recipient's own connections a joined trade goes to. */
  defaultConnectionId: string | null;
  // ---- RECEIVING: how a trade sent to me reaches me ----
  /** How often an unresolved workflow buzzes me until I answer it. */
  reminderEverySeconds: number;
  /** How loudly. Defaults to `repeating` — it is asking somebody to act. */
  reminderLevel: NotifLevel;
  // ---- SENDING: what I hear back about a trade I sent ----
  /** Be told what the person I invited decided. */
  notifyOnResponse: boolean;
  /** How loudly. Defaults to `normal` — a note about a decision I asked for. */
  responseLevel: NotifLevel;
}

// How often an unresolved workflow may buzz, and for how long a level is
// honoured. Clamped rather than refused — a save that failed validation would
// leave somebody with reminders they did not ask for, which is the opposite of
// what setting them is for.
const MIN_REMINDER_SECONDS = 60;
const MAX_REMINDER_SECONDS = 3600;

export const DEFAULT_FOUNDER_PREFS: FounderTradePrefs = {
  sizeMode: 'units',
  defaultUnits: null,
  sizePct: null,
  pctRound: false,
  pctRoundIncrement: DEFAULT_PIP_ROUNDING_INCREMENT,
  defaultConnectionId: null,
  reminderEverySeconds: 300,
  reminderLevel: 'repeating',
  notifyOnResponse: true,
  responseLevel: 'normal',
};

function toLevel(v: string, fallback: NotifLevel = 'repeating'): NotifLevel {
  return (NOTIF_LEVELS as readonly string[]).includes(v) ? (v as NotifLevel) : fallback;
}

function clampSeconds(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_FOUNDER_PREFS.reminderEverySeconds;
  return Math.min(MAX_REMINDER_SECONDS, Math.max(MIN_REMINDER_SECONDS, Math.round(v)));
}

// Clamped rather than refused, like every other bound in this file: a save that
// bounced would leave somebody with the previous increment and nothing on screen
// saying why.
function clampIncrement(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PIP_ROUNDING_INCREMENT;
  return Number(
    Math.max(MIN_PIP_ROUNDING_INCREMENT, Math.min(MAX_PIP_ROUNDING_INCREMENT, n)).toFixed(4),
  );
}

export async function getFounderPrefs(userId: string): Promise<FounderTradePrefs> {
  const row = (
    await db.select().from(founderTradePrefs).where(eq(founderTradePrefs.userId, userId)).limit(1)
  )[0];
  if (!row) return { ...DEFAULT_FOUNDER_PREFS };
  return {
    // Anything unrecognised — including the null every pre-existing row carries
    // — reads as the fixed-units behaviour that was there before, so nobody's
    // join changed the day this column arrived.
    sizeMode: row.sizeMode === 'account_pct' ? 'account_pct' : 'units',
    defaultUnits: row.defaultUnits != null && row.defaultUnits > 0 ? row.defaultUnits : null,
    sizePct: row.sizePct != null && row.sizePct > 0 && row.sizePct <= 100 ? row.sizePct : null,
    pctRound: row.pctRound,
    pctRoundIncrement: clampIncrement(row.pctRoundIncrement),
    defaultConnectionId: row.defaultConnectionId,
    reminderEverySeconds: clampSeconds(row.reminderEverySeconds),
    reminderLevel: toLevel(row.reminderLevel),
    notifyOnResponse: row.notifyOnResponse,
    // A level nothing recognises falls back rather than silencing a note
    // somebody is relying on — the same rule the ladder follows everywhere.
    responseLevel: toLevel(row.responseLevel, 'normal'),
  };
}

export interface FounderPrefsPatch {
  sizeMode?: FounderSizeMode;
  defaultUnits?: number | null;
  sizePct?: number | null;
  pctRound?: boolean;
  pctRoundIncrement?: number;
  defaultConnectionId?: string | null;
  reminderEverySeconds?: number;
  reminderLevel?: NotifLevel;
  notifyOnResponse?: boolean;
  responseLevel?: NotifLevel;
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

  // A share of zero, of nothing, or of more than the whole account is not a
  // share. Stored as null so it reads as "not stated" and the join refuses,
  // exactly as an unset size does.
  const pct =
    patch.sizePct === undefined
      ? current.sizePct
      : patch.sizePct == null || !(patch.sizePct > 0) || patch.sizePct > 100
        ? null
        : Number(patch.sizePct.toFixed(4));

  const next: FounderTradePrefs = {
    sizeMode: patch.sizeMode === undefined ? current.sizeMode : patch.sizeMode === 'account_pct' ? 'account_pct' : 'units',
    defaultUnits: units,
    sizePct: pct,
    pctRound: patch.pctRound === undefined ? current.pctRound : !!patch.pctRound,
    pctRoundIncrement:
      patch.pctRoundIncrement === undefined
        ? current.pctRoundIncrement
        : clampIncrement(patch.pctRoundIncrement),
    defaultConnectionId: connectionId,
    reminderEverySeconds:
      patch.reminderEverySeconds === undefined
        ? current.reminderEverySeconds
        : clampSeconds(patch.reminderEverySeconds),
    reminderLevel: patch.reminderLevel === undefined ? current.reminderLevel : toLevel(patch.reminderLevel),
    notifyOnResponse:
      patch.notifyOnResponse === undefined ? current.notifyOnResponse : patch.notifyOnResponse,
    responseLevel:
      patch.responseLevel === undefined ? current.responseLevel : toLevel(patch.responseLevel, 'normal'),
  };
  const now = new Date();
  await db
    .insert(founderTradePrefs)
    .values({
      userId: user.id,
      sizeMode: next.sizeMode,
      defaultUnits: next.defaultUnits,
      sizePct: next.sizePct,
      pctRound: next.pctRound,
      pctRoundIncrement: next.pctRoundIncrement,
      defaultConnectionId: next.defaultConnectionId,
      reminderEverySeconds: next.reminderEverySeconds,
      reminderLevel: next.reminderLevel,
      notifyOnResponse: next.notifyOnResponse,
      responseLevel: next.responseLevel,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: founderTradePrefs.userId,
      set: {
        sizeMode: next.sizeMode,
        defaultUnits: next.defaultUnits,
        sizePct: next.sizePct,
        pctRound: next.pctRound,
        pctRoundIncrement: next.pctRoundIncrement,
        defaultConnectionId: next.defaultConnectionId,
        reminderEverySeconds: next.reminderEverySeconds,
        reminderLevel: next.reminderLevel,
        notifyOnResponse: next.notifyOnResponse,
        responseLevel: next.responseLevel,
        updatedAt: now,
      },
    });
  return next;
}

// Returns the venue, which is how the join knows how many protective orders it
// may attach without paying for a broker round trip to find out.
async function assertOwnConnection(userId: string, connectionId: string): Promise<string> {
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
  return row.broker;
}

// ---- the invite ----

export interface FounderInviteView {
  id: string;
  status: FounderTradeStatus;
  /**
   * What this invitation is about: a trade the sender opened, or a stop/target
   * they moved on one they are already in.
   */
  kind: FounderTradeKind;
  /** A drill. Real in every respect, and everything the recipient sees says so. */
  isTest: boolean;
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
  completedAt: number | null;
  createdAt: number;
  /** The recipient's own configured size, so the modal can state it up front. */
  recipientUnits: number | null;
  /** Whether a JOIN is being sent right now (from this or another tab). */
  sending: boolean;
  // ---- 'amend' only ----
  /** The levels the sender's position was on BEFORE the change, so the
   *  recipient reads what MOVED rather than only where it landed. */
  prevStopLoss: number | null;
  prevTakeProfit: number | null;
  /**
   * Whether the recipient's own position was found, and how.
   *
   * **THE POSITION'S ID IS DELIBERATELY NOT ON THIS VIEW.** The apply route
   * reads it from the row it stored; nothing the client sends chooses which
   * position an order reaches, exactly as nothing it sends chooses the size.
   * `targetMatch` is here because the recipient should be told whether their
   * position was paired or merely matched on instrument before they press.
   */
  hasTarget: boolean;
  targetMatch: FounderTargetMatch | null;
  /** The account that position sits on, named so the recipient can see it is
   *  the one they expect. */
  targetAccount: string | null;
}

function shape(
  row: FounderTradeInviteRow,
  people: Map<string, FounderPerson>,
  viewerId: string,
  recipientUnits: number | null,
  accounts?: Map<string, string>,
): FounderInviteView {
  const unknown = (id: string): FounderPerson => ({ userId: id, displayName: 'A Founder', username: '' });
  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    isTest: row.isTest,
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
    completedAt: row.completedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    recipientUnits,
    sending: isClaimLive(row),
    prevStopLoss: row.prevStopLoss,
    prevTakeProfit: row.prevTakeProfit,
    hasTarget: !!row.targetTradeId,
    targetMatch: row.targetMatch ?? null,
    targetAccount:
      row.targetConnectionId == null ? null : accounts?.get(row.targetConnectionId) ?? null,
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
  /** Raise it as a drill. Changes nothing about the workflow, only that every
   *  surface the recipient meets says it is a test. */
  isTest?: boolean;
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
  // Inviting yourself is meaningless for a real trade — you are already in it.
  // For a TEST it is exactly the point: the drill exists to show you what
  // receiving one feels like, so it is addressed to the person running it.
  if (input.recipientUserId === inviter.id && !input.isTest) {
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
    isTest: !!input.isTest,
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
  if (input.isTest) logEvent(id, 'invite.test', inviter.id, 'Raised as a test of the workflow');
  logEvent(
    id,
    'invite.created',
    inviter.id,
    `${order.instrument} ${order.side}${order.stopLoss == null ? ' · no stop' : ` · stop ${order.stopLoss}`}`,
  );
  const full = (await db.select().from(founderTradeInvites).where(eq(founderTradeInvites.id, id)).limit(1))[0]!;
  return shape(full, await peopleFor([full]), inviter.id, await unitsOf(input.recipientUserId));
}

// ---- telling the sender what was decided ----

// The SEND side of the workflow's notifications: the person who sent a trade
// hears what the person they sent it to decided.
//
// Fire and forget, and never a reminder — it is a note about a decision that has
// already been made, so there is nothing outstanding to nag anybody about. It
// defaults to `normal` for the same reason: the receive side breaks through
// silent mode because it is asking somebody to act, and this is not.
//
// Deliberately the INVITER only. A test is addressed to the person who ran it,
// so this would be them telling themselves what they just pressed — skipped, or
// every drill would buzz its own operator twice.
async function notifyInviterOfResponse(
  invite: FounderTradeInviteRow,
  what: string,
): Promise<void> {
  try {
    if (invite.isTest && invite.inviterUserId === invite.recipientUserId) return;
    const prefs = await getFounderPrefs(invite.inviterUserId);
    if (!prefs.notifyOnResponse) return;
    const [who] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, invite.recipientUserId))
      .limit(1);
    const name = who?.displayName ?? 'A Founder';
    const dir = invite.side === 'long' ? 'BUY' : 'SELL';
    const title = `${invite.isTest ? 'TEST · ' : ''}${name} ${what}`;
    const body = `${invite.instrument} ${dir}`;
    await sendToUsers([invite.inviterUserId], { title, body, url: '/?screen=tradedesk' }).catch(() => {});
    await sendPushoverToUsers(
      [invite.inviterUserId],
      { title, message: body, priority: LEVEL_PRIORITY[prefs.responseLevel] },
      'founder_trade_response',
    ).catch(() => {});
  } catch (err) {
    // A note about a decision must never be what stops the decision being
    // recorded.
    console.error('Founder response notification failed:', err);
  }
}

// ---- links: whose trades reach whom ----

/** One direction of one link, and what travels along it. */
export interface FounderLinkView {
  person: FounderPerson;
  /** A fill raises an invitation to open the same trade. */
  entries: boolean;
  /** A stop or target moved on an open position raises an invitation to move
   *  the same level on the other end's own position. */
  amends: boolean;
}

export interface FounderLinks {
  /** Founders my trades are sent to. */
  sending: FounderLinkView[];
  /** Founders whose trades are sent to me. */
  receiving: FounderLinkView[];
}

/** Which half of a link is being changed. Both false removes the link. */
export interface FounderLinkPatch {
  entries?: boolean;
  amends?: boolean;
}

/** What a link may carry, as the one list every read and write agrees on. */
export type FounderLinkChannel = 'entries' | 'amends';

// Every link this Founder is part of, in both directions.
//
// The two lists are what the panel draws: "your trades go to" and "you receive
// trades from". A link appears on BOTH parties' screens, which is what stops
// anybody sending — or receiving — through something they cannot see.
export async function getFounderLinks(user: UserRow): Promise<FounderLinks> {
  assertFounder(user);
  const rows = await db
    .select()
    .from(founderTradeLinks)
    .where(or(eq(founderTradeLinks.senderUserId, user.id), eq(founderTradeLinks.recipientUserId, user.id)));
  // Eligibility is re-read rather than trusted from the stored id, so somebody
  // who has lost the role drops out of both lists instead of lingering as a link
  // that silently does nothing.
  const eligible = new Map((await eligibleFounders()).map((f) => [f.userId, f]));
  const sending: FounderLinkView[] = [];
  const receiving: FounderLinkView[] = [];
  for (const r of rows) {
    const view = (person: FounderPerson): FounderLinkView => ({
      person,
      entries: r.sendEntries,
      amends: r.sendAmends,
    });
    if (r.senderUserId === user.id) {
      const p = eligible.get(r.recipientUserId);
      if (p) sending.push(view(p));
    } else {
      const p = eligible.get(r.senderUserId);
      if (p) receiving.push(view(p));
    }
  }
  const byName = (a: FounderLinkView, b: FounderLinkView) =>
    a.person.displayName.localeCompare(b.person.displayName);
  return { sending: sending.sort(byName), receiving: receiving.sort(byName) };
}

// Switch one direction on or off.
//
// **EITHER PARTY MAY DO IT.** Wanting somebody's trades sent to you should not
// depend on getting them to change a setting on their own device, and being
// able to stop your own trades going out should never depend on the other
// person either. So the caller must be one of the two, and which one they are
// does not matter.
export async function setFounderLink(
  actor: UserRow,
  senderUserId: string,
  recipientUserId: string,
  patch: FounderLinkPatch,
): Promise<FounderLinks> {
  assertFounder(actor);
  if (actor.id !== senderUserId && actor.id !== recipientUserId) {
    // 403 rather than 404: both ids are people the caller can already see in
    // the picker, so there is nothing to conceal — what is refused is arranging
    // a link between two OTHER people.
    throw new FounderTradeError('You can only change a link you are part of', 403);
  }
  if (senderUserId === recipientUserId) {
    throw new FounderTradeError('A trade cannot be sent to the person who placed it');
  }
  await assertEligible(senderUserId);
  await assertEligible(recipientUserId);

  const where = and(
    eq(founderTradeLinks.senderUserId, senderUserId),
    eq(founderTradeLinks.recipientUserId, recipientUserId),
  );
  const existing = (await db.select().from(founderTradeLinks).where(where).limit(1))[0] ?? null;

  // A PATCH over what is stored, so a browser on an old service-worker-cached
  // bundle changing one switch never silently resets the other. A link that does
  // not exist yet starts from both off, so `{amends: true}` creates a link that
  // carries level-moves and nothing else — which is the whole point of the two
  // being independent.
  const entries = patch.entries ?? existing?.sendEntries ?? false;
  const amends = patch.amends ?? existing?.sendAmends ?? false;

  // **BOTH OFF IS NOT A STATE.** The row is the link, so the last switch going
  // off removes it — which keeps "a disabled link and no link are the same
  // fact", the property this table was built on.
  if (!entries && !amends) {
    if (existing) await db.delete(founderTradeLinks).where(where);
    return getFounderLinks(actor);
  }
  if (existing) {
    await db.update(founderTradeLinks).set({ sendEntries: entries, sendAmends: amends }).where(where);
    return getFounderLinks(actor);
  }
  await db
    .insert(founderTradeLinks)
    .values({
      id: crypto.randomUUID(),
      senderUserId,
      recipientUserId,
      sendEntries: entries,
      sendAmends: amends,
      createdByUserId: actor.id,
      createdAt: new Date(),
    })
    // The unique index makes this idempotent under a race: whoever lost simply
    // set the same values a moment earlier.
    .onConflictDoUpdate({
      target: [founderTradeLinks.senderUserId, founderTradeLinks.recipientUserId],
      set: { sendEntries: entries, sendAmends: amends },
    });
  return getFounderLinks(actor);
}

// Who this sender's trades go to, for ONE channel. The single read behind both
// `autoInviteAfterFill` and `autoAmendAfterModify`, so a link's two switches are
// honoured in exactly one place.
async function recipientsFor(senderUserId: string, channel: FounderLinkChannel): Promise<string[]> {
  const rows = await db
    .select({
      recipientUserId: founderTradeLinks.recipientUserId,
      entries: founderTradeLinks.sendEntries,
      amends: founderTradeLinks.sendAmends,
    })
    .from(founderTradeLinks)
    .where(eq(founderTradeLinks.senderUserId, senderUserId));
  return rows
    .filter((r) => (channel === 'entries' ? r.entries : r.amends))
    .map((r) => r.recipientUserId);
}

// ---- the test drill ----

// Pairs to reach for first when placing a test. Deliberately liquid majors and
// deliberately NOT EUR/USD (owner instruction) — a test should not land on the
// pair a real position is most likely already open on, where a stray extra
// position is hardest to spot.
const TEST_PAIR_PREFERENCE = ['GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'USD_CHF', 'NZD_USD'];
const EXCLUDED_TEST_PAIR = 'EUR_USD';

// How far the test's protective levels sit from the market, in pips. Far enough
// that a normal spread cannot trigger them the moment the order lands, close
// enough that the test position is plainly a test.
const TEST_STOP_PIPS = 30;
const TEST_TARGET_PIPS = 60;

export interface FounderTestPlan {
  instrument: string;
  displayName: string;
  units: number;
  side: TradeSide;
  bid: number | null;
  ask: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  accountLabel: string;
  recipientName: string;
}

// Work out exactly what a test would place, WITHOUT placing it — so the button
// can state the pair, the size and the levels before anything is sent. A test
// that puts a real order on somebody's account has to say what it is about to do
// first.
export async function planFounderTest(user: UserRow, actor: AuditActor): Promise<FounderTestPlan> {
  assertFounder(user);
  if (!(await canSendOrders(user))) {
    throw new FounderTradeError(
      'Turn Advanced Trading on in My Terminal ▸ Premium Features before running a test — it places a real order',
      403,
      'NO_DESK',
    );
  }
  const prefs = await getFounderPrefs(user.id);
  if (!prefs.defaultConnectionId) {
    throw new FounderTradeError('Choose which of your broker accounts the test goes to', 400, 'NO_ACCOUNT');
  }
  // THE TEST COMES TO YOU (owner instruction, 2026-08). The point of the drill
  // is to feel the receiving end — the notification, the modal, the join — so it
  // is addressed to whoever ran it. Nobody else is woken up to test the system,
  // and no second person has to be set up before it can be tried.
  await assertOwnConnection(user.id, prefs.defaultConnectionId);

  // A genuine currency pair the account can actually trade, at the venue's own
  // minimum size. Never EUR/USD.
  const specs = await deskInstruments(user.id, prefs.defaultConnectionId, actor);
  const forex = specs.filter(
    (sp) => sp.type === 'CURRENCY' && sp.tradeable && sp.symbol.toUpperCase() !== EXCLUDED_TEST_PAIR,
  );
  if (forex.length === 0) {
    throw new FounderTradeError(
      'This account has no forex pair available to test on right now',
      409,
      'NO_TEST_INSTRUMENT',
    );
  }
  const spec =
    TEST_PAIR_PREFERENCE.map((sym) => forex.find((f) => f.symbol.toUpperCase() === sym)).find(Boolean) ??
    forex[0];

  const [quote] = await deskQuotes(user.id, prefs.defaultConnectionId, [spec!.instrument], actor).catch(
    () => [],
  );
  // The levels are derived from the price the order will actually pay, exactly
  // as the ticket derives them, and rounded to what the venue will accept.
  const side: TradeSide = 'long';
  const reference = quote?.ask ?? null;
  const pip = spec!.pipSize > 0 ? spec!.pipSize : 0.0001;
  const round = (v: number) => {
    const f = Math.pow(10, Math.max(0, Math.min(10, spec!.displayPrecision)));
    return Math.round(v * f) / f;
  };
  return {
    instrument: spec!.instrument,
    displayName: spec!.displayName,
    units: spec!.minimumTradeSize,
    side,
    bid: quote?.bid ?? null,
    ask: quote?.ask ?? null,
    stopLoss: reference == null ? null : round(reference - TEST_STOP_PIPS * pip),
    takeProfit: reference == null ? null : round(reference + TEST_TARGET_PIPS * pip),
    accountLabel: (await founderAccounts(user.id)).find((a) => a.connectionId === prefs.defaultConnectionId)
      ?.label ?? 'your account',
    recipientName: user.displayName,
  };
}

// Run the drill: place a real minimum-size order and raise a TEST invitation
// from it.
//
// **IT IS A REAL TRADE, AND THAT IS THE POINT.** A simulation that stops short
// of the broker proves nothing about the part most likely to be wrong — the
// order path, the levels, the journal row the invitation is built from. It is
// bounded instead: the venue's own minimum size, a liquid pair, and never
// EUR/USD.
//
// **AND EVERY SURFACE THE RECIPIENT MEETS SAYS IT IS A TEST**, because a drill
// indistinguishable from a real fill gets acted on at 3am — the rule every other
// test in the terminal follows.
export async function runFounderTest(
  user: UserRow,
  actor: AuditActor,
): Promise<{ invite: FounderInviteView; plan: FounderTestPlan }> {
  const plan = await planFounderTest(user, actor);
  const prefs = await getFounderPrefs(user.id);
  const share = await getShareConfig();

  let res;
  try {
    res = await placeDeskOrder(
      user,
      {
        connectionId: prefs.defaultConnectionId!,
        instrument: plan.instrument,
        side: plan.side,
        units: plan.units,
        type: 'market',
        price: null,
        // The test carries the levels the group has chosen to share, so the
        // drill exercises the copying rather than only the notification.
        stopLoss: share.copyStopLoss ? plan.stopLoss : null,
        takeProfit: share.copyTakeProfit ? plan.takeProfit : null,
      },
      actor,
    );
  } catch (e) {
    throw new FounderTradeError(
      e instanceof Error ? e.message : 'The test order could not be placed',
      e instanceof DeskError ? e.status : 502,
      (e instanceof DeskError ? e.code : undefined) ?? undefined,
    );
  }
  // A resting order is not a position, so there would be nothing to join — the
  // same rule auto-send follows. A market order on a liquid major fills, so this
  // is the guard rather than the expected path.
  if (res.status !== 'filled') {
    throw new FounderTradeError(
      'The test order is still working rather than filled, so nothing was sent. Close it on the desk and try again when the market is open.',
      409,
      'TEST_NOT_FILLED',
    );
  }

  const invite = await createInvite(user, {
    // Addressed to the person running it, so the invitation, the notification
    // and the modal all arrive on their own screen.
    recipientUserId: user.id,
    sourceOrderId: res.orderRecordId,
    isTest: true,
  });
  return { invite, plan };
}

// ---- auto-send ----

// Raise an invitation automatically, because the trader has asked for every
// trade they place to go to one other Founder.
//
// **IT FIRES ON A FILL, AND DELIBERATELY NOT ON A RESTING ORDER.** A limit or
// stop entry that has not triggered is not a trade anybody is in yet, and the
// recipient joins at MARKET — so inviting them off an untriggered order would
// put them in at a price the inviter has not paid, against a stop set for a
// different entry, possibly in the middle of the night. Waiting until there is
// an actual position is the whole safety property here.
//
// Everything about it fails QUIETLY. It is a side effect of somebody else's
// order going in, so a founder-trade problem must never surface as an order
// error or delay the fill being reported — the trader would have no idea what
// the message was about, on the one screen where that matters most.
export async function autoInviteAfterFill(
  inviter: UserRow,
  sourceOrderId: string,
  status: 'filled' | 'accepted',
): Promise<FounderInviteView[]> {
  try {
    if (status !== 'filled') return [];
    if (isDemoUser(inviter) || !isFounder(parseRoles(inviter))) return [];
    const recipients = await recipientsFor(inviter.id, 'entries');
    if (recipients.length === 0) return [];
    // Eligibility is re-read here rather than trusted from the stored link, so a
    // recipient who has lost the role simply stops receiving trades.
    const eligible = new Set((await eligibleFounders()).map((f) => f.userId));

    const raised: FounderInviteView[] = [];
    for (const recipientUserId of recipients) {
      if (!eligible.has(recipientUserId)) continue;
      try {
        // createInvite carries the duplicate guard, so a retried request or a
        // second fill reported twice still raises one invitation each.
        const invite = await createInvite(inviter, { recipientUserId, sourceOrderId });
        // Recorded so the timeline says an invitation was sent by a standing
        // link rather than by somebody deciding in the moment — the two read
        // very differently when reconstructing what happened.
        logEvent(invite.id, 'invite.auto_sent', null, 'Sent by a standing Founder trade link');
        raised.push(invite);
      } catch (err) {
        // One recipient failing must not stop the others being invited.
        console.error('Founder auto-send to one recipient failed:', err);
      }
    }
    return raised;
  } catch (err) {
    console.error('Founder auto-send failed:', err);
    return [];
  }
}

// ---- linked positions ----
//
// Two Founders' positions, paired: "your EUR/USD buy and mine are the same
// trade". A join pairs them by itself; two Founders who each placed the trade
// independently pair theirs by hand. The pairing is what turns a level-move into
// a one-press decision instead of a guess, and what draws the LINKED marker on a
// position tile.

export interface PositionRef {
  userId: string;
  connectionId: string;
  tradeId: string;
}

/** The pair, with the lexicographically smaller user id always on side A.
 *  Pairing A with B and B with A is then one row rather than two that could
 *  later disagree, and the unique index is what enforces it. */
function canonicalPair(x: PositionRef, y: PositionRef): [PositionRef, PositionRef] {
  return x.userId <= y.userId ? [x, y] : [y, x];
}

/** Instruments arrive spelled two ways — "EUR/USD" from the wall and "EUR_USD"
 *  from a venue — so anything comparing them has to normalise first. The same
 *  reason `normSym` exists for the hand-kept position marks. */
function normInstrument(v: string): string {
  return v.trim().toUpperCase().replace(/[/_-]/g, '');
}

// Record a pairing. Idempotent: pairing two positions that are already paired is
// a no-op rather than a second row.
export async function pairPositions(input: {
  a: PositionRef;
  b: PositionRef;
  instrument: string;
  side: TradeSide;
  source: 'join' | 'manual';
  inviteId?: string | null;
  createdByUserId: string | null;
}): Promise<void> {
  const [a, b] = canonicalPair(input.a, input.b);
  await db
    .insert(founderLinkedPositions)
    .values({
      id: crypto.randomUUID(),
      aUserId: a.userId,
      aConnectionId: a.connectionId,
      aTradeId: a.tradeId,
      bUserId: b.userId,
      bConnectionId: b.connectionId,
      bTradeId: b.tradeId,
      instrument: input.instrument,
      side: input.side,
      source: input.source,
      inviteId: input.inviteId ?? null,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

export interface PositionLinkView {
  id: string;
  /** The other Founder in the pair. */
  person: FounderPerson;
  /** The VIEWER'S own side of the pair — which of their positions is linked. */
  connectionId: string;
  tradeId: string;
  /** The other end's position, so the panel can name it. */
  theirTradeId: string;
  instrument: string;
  side: TradeSide;
  source: string;
  createdAt: number;
}

function pairView(row: FounderLinkedPositionRow, viewerId: string, people: Map<string, FounderPerson>) {
  const mine = row.aUserId === viewerId;
  const otherId = mine ? row.bUserId : row.aUserId;
  return {
    id: row.id,
    person: people.get(otherId) ?? { userId: otherId, displayName: 'A Founder', username: '' },
    connectionId: mine ? row.aConnectionId : row.bConnectionId,
    tradeId: mine ? row.aTradeId : row.bTradeId,
    theirTradeId: mine ? row.bTradeId : row.aTradeId,
    instrument: row.instrument,
    side: row.side,
    source: row.source,
    createdAt: row.createdAt.getTime(),
  };
}

// Every pairing this Founder is part of, either side.
export async function listPositionLinks(user: UserRow): Promise<PositionLinkView[]> {
  assertFounder(user);
  const rows = await db
    .select()
    .from(founderLinkedPositions)
    .where(
      or(eq(founderLinkedPositions.aUserId, user.id), eq(founderLinkedPositions.bUserId, user.id)),
    )
    .orderBy(desc(founderLinkedPositions.createdAt));
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.aUserId, r.bUserId]))];
  const found = await db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  const people = new Map(
    found.map((u) => [u.id, { userId: u.id, displayName: u.displayName, username: u.username }]),
  );
  return rows.map((r) => pairView(r, user.id, people));
}

/**
 * The pairings that apply to a set of the viewer's own positions, keyed by the
 * venue trade id. What the Live Wall stamps its LINKED marker from.
 *
 * Takes the ids rather than reading everything so a wall poll costs one bounded
 * query, and returns a Map because the wall stamps hundreds of rows.
 */
export async function linksForPositions(
  viewerId: string,
  tradeIds: string[],
): Promise<Map<string, PositionLinkView[]>> {
  const out = new Map<string, PositionLinkView[]>();
  if (tradeIds.length === 0) return out;
  const rows = await db
    .select()
    .from(founderLinkedPositions)
    .where(
      or(
        and(eq(founderLinkedPositions.aUserId, viewerId), inArray(founderLinkedPositions.aTradeId, tradeIds)),
        and(eq(founderLinkedPositions.bUserId, viewerId), inArray(founderLinkedPositions.bTradeId, tradeIds)),
      ),
    );
  if (rows.length === 0) return out;
  const ids = [...new Set(rows.flatMap((r) => [r.aUserId, r.bUserId]))];
  const found = await db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  const people = new Map(
    found.map((u) => [u.id, { userId: u.id, displayName: u.displayName, username: u.username }]),
  );
  for (const r of rows) {
    const view = pairView(r, viewerId, people);
    const list = out.get(view.tradeId) ?? [];
    list.push(view);
    out.set(view.tradeId, list);
  }
  return out;
}

/**
 * Pair two positions by hand.
 *
 * **THE CASE THIS EXISTS FOR:** the invitation came, it was not joined, and the
 * trade was placed separately anyway — or both Founders reached the same trade
 * independently. Without a pairing a later level-move falls back to matching on
 * instrument, which is a guess; with one it is exact.
 *
 * Both positions are checked to be OPEN and to be the instrument and direction
 * they are claimed to be, read from each account rather than taken from the
 * request — a pairing built on what a client asserted is a pairing that could
 * later move a stop on a position nobody meant.
 */
export async function linkPositions(
  actor: UserRow,
  input: { withUserId: string; myTradeId: string; theirTradeId: string },
  auditActor: AuditActor,
): Promise<PositionLinkView[]> {
  assertFounder(actor);
  if (input.withUserId === actor.id) {
    throw new FounderTradeError('A position cannot be linked to itself');
  }
  const other = await assertEligible(input.withUserId);

  const [mine, theirs] = await Promise.all([
    listDeskPositions(actor.id, { purpose: 'desk_read', actor: auditActor }),
    // Their book is read on the terminal's own initiative rather than because
    // they asked for it, so it is recorded as background polling with a null
    // actor — the convention every other read of somebody else's account here
    // follows.
    listDeskPositions(input.withUserId, { purpose: 'wall_read', actor: SYSTEM }),
  ]);
  const a = mine.find((p) => p.tradeId === input.myTradeId);
  const b = theirs.find((p) => p.tradeId === input.theirTradeId);
  if (!a) throw new FounderTradeError('That position is not open on your account', 404);
  if (!b) throw new FounderTradeError(`That position is not open on ${other.displayName}'s account`, 404);
  if (normInstrument(a.instrument) !== normInstrument(b.instrument)) {
    throw new FounderTradeError('Those two positions are in different instruments');
  }
  // Direction is checked as well as instrument: a long and a short in the same
  // pair are opposite trades, and copying one's stop onto the other would put it
  // on the wrong side of the market every time.
  if (a.side !== b.side) {
    throw new FounderTradeError('Those two positions are in opposite directions');
  }

  await pairPositions({
    a: { userId: actor.id, connectionId: a.connectionId, tradeId: a.tradeId },
    b: { userId: input.withUserId, connectionId: b.connectionId, tradeId: b.tradeId },
    instrument: a.instrument,
    side: a.side,
    source: 'manual',
    createdByUserId: actor.id,
  });
  return listPositionLinks(actor);
}

/**
 * Break a pairing. **Either party may**, like the links themselves: being able
 * to stop your own position being reached must never depend on the other person.
 */
export async function unlinkPositions(actor: UserRow, id: string): Promise<PositionLinkView[]> {
  assertFounder(actor);
  const row = (
    await db.select().from(founderLinkedPositions).where(eq(founderLinkedPositions.id, id)).limit(1)
  )[0];
  // 404 rather than 403, so a guessed id cannot be probed for.
  if (!row || (row.aUserId !== actor.id && row.bUserId !== actor.id)) {
    throw new FounderTradeError('That link is not on your account', 404);
  }
  await db.delete(founderLinkedPositions).where(eq(founderLinkedPositions.id, id));
  return listPositionLinks(actor);
}

/** Both sides' open positions, for the pairing picker. */
export async function pairablePositions(
  actor: UserRow,
  withUserId: string,
  auditActor: AuditActor,
): Promise<{ mine: DeskPosition[]; theirs: DeskPosition[] }> {
  assertFounder(actor);
  await assertEligible(withUserId);
  if (withUserId === actor.id) return { mine: [], theirs: [] };
  const [mine, theirs] = await Promise.all([
    listDeskPositions(actor.id, { purpose: 'desk_read', actor: auditActor }),
    listDeskPositions(withUserId, { purpose: 'wall_read', actor: SYSTEM }),
  ]);
  return { mine, theirs };
}

// ---- level-move invitations ----

/**
 * Which of the recipient's own positions a level-move applies to.
 *
 * **TWO WAYS, IN ORDER, AND NEITHER OF THEM GUESSES.**
 *
 *   1. An explicit PAIRING — the recipient joined this trade, or somebody paired
 *      the two positions by hand. Exact.
 *   2. Failing that, the recipient's open positions in the same instrument and
 *      direction. **Exactly one is a match; two or more is NONE.** An ambiguous
 *      book is the case where picking would be picking at random, and moving a
 *      stop on the wrong position is the one failure this must not have. The
 *      invitation is still raised — the recipient is told what the sender
 *      changed — it simply offers no button.
 *
 * `targetMatch` travels to the recipient so they know which of the two answered,
 * because "we are provably in the same trade" and "you have one position that
 * looks like it" are different degrees of confidence and they should see which.
 */
async function resolveAmendTarget(
  recipientUserId: string,
  source: PositionRef,
  instrument: string,
  side: TradeSide,
): Promise<{ connectionId: string; tradeId: string; match: FounderTargetMatch } | null> {
  const paired = await db
    .select()
    .from(founderLinkedPositions)
    .where(
      or(
        and(
          eq(founderLinkedPositions.aUserId, source.userId),
          eq(founderLinkedPositions.aTradeId, source.tradeId),
          eq(founderLinkedPositions.bUserId, recipientUserId),
        ),
        and(
          eq(founderLinkedPositions.bUserId, source.userId),
          eq(founderLinkedPositions.bTradeId, source.tradeId),
          eq(founderLinkedPositions.aUserId, recipientUserId),
        ),
      ),
    )
    .limit(1);
  const row = paired[0];
  if (row) {
    const mine = row.aUserId === recipientUserId;
    return {
      connectionId: mine ? row.aConnectionId : row.bConnectionId,
      tradeId: mine ? row.aTradeId : row.bTradeId,
      match: 'chain',
    };
  }

  const open = await listDeskPositions(recipientUserId, { purpose: 'wall_read', actor: SYSTEM }).catch(
    (): DeskPosition[] => [],
  );
  const found = pickInstrumentMatch(open, instrument, side);
  return found && { connectionId: found.connectionId, tradeId: found.tradeId, match: 'instrument' };
}

/**
 * The one position in this book that could BE the trade, or nothing.
 *
 * **EXACTLY ONE IS A MATCH; TWO OR MORE IS NONE.** That is the whole rule, and
 * it is pulled out as a pure function precisely so it can be checked without a
 * broker — the ambiguity case is the one that matters most here and it is
 * unreachable from any test that has to read a real account.
 *
 * Instruments arrive spelled two ways ("EUR/USD" from the wall, "EUR_USD" from a
 * venue), so both sides are normalised. Direction is matched as well: a long and
 * a short in the same pair are opposite trades, and copying one's stop onto the
 * other puts it on the wrong side of the market every time.
 */
export function pickInstrumentMatch<T extends { instrument: string; side: TradeSide }>(
  open: T[],
  instrument: string,
  side: TradeSide,
): T | null {
  const wanted = normInstrument(instrument);
  const candidates = open.filter((p) => normInstrument(p.instrument) === wanted && p.side === side);
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Raise a level-move invitation, because the sender has a standing link asking
 * for their stop and target changes to reach somebody.
 *
 * **A MOVE OR AN ADD, NEVER A REMOVAL** (owner request, 2026-08 — "whenever that
 * individual moves or adds a stop loss or take profit"). Taking a level OFF is
 * deliberately not sent: one press that strips the protection from somebody
 * else's live position is a different risk from one press that tightens it, and
 * it is not what was asked for. A removal still happens on the sender's own
 * account exactly as before; it simply raises nothing.
 *
 * Everything about it fails QUIETLY, exactly as `autoInviteAfterFill` does: it
 * is a side effect of somebody else's amend going through, so a founder-trade
 * problem must never surface as an error on the amend or delay it.
 */
export async function autoAmendAfterModify(
  sender: UserRow,
  result: ModifyResult,
  connectionId: string,
  tradeId: string,
): Promise<FounderInviteView[]> {
  try {
    if (isDemoUser(sender) || !isFounder(parseRoles(sender))) return [];
    // The venue did not report the position, so there is no direction to send
    // and no previous level to say what moved. Nothing is invented from it.
    if (!result.side) return [];
    const movedStop = result.changedStopLoss && result.stopLoss != null;
    const movedTarget = result.changedTakeProfit && result.takeProfit != null;
    if (!movedStop && !movedTarget) return [];
    // A level re-sent at the value it already had is not a move.
    const realStop = movedStop && result.stopLoss !== result.previousStopLoss;
    const realTarget = movedTarget && result.takeProfit !== result.previousTakeProfit;
    if (!realStop && !realTarget) return [];

    const recipients = await recipientsFor(sender.id, 'amends');
    if (recipients.length === 0) return [];
    const eligible = new Set((await eligibleFounders()).map((f) => f.userId));

    const raised: FounderInviteView[] = [];
    for (const recipientUserId of recipients) {
      if (!eligible.has(recipientUserId)) continue;
      try {
        const target = await resolveAmendTarget(
          recipientUserId,
          { userId: sender.id, connectionId, tradeId },
          result.instrument,
          result.side,
        );
        const invite = await createAmendInvite(sender, {
          recipientUserId,
          sourceOrderId: result.orderRecordId,
          connectionId,
          tradeId,
          result,
          side: result.side,
          stopLoss: realStop ? result.stopLoss : null,
          takeProfit: realTarget ? result.takeProfit : null,
          target,
        });
        if (invite) raised.push(invite);
      } catch (err) {
        // One recipient failing must not stop the others being told.
        console.error('Founder level-move to one recipient failed:', err);
      }
    }
    return raised;
  } catch (err) {
    console.error('Founder level-move send failed:', err);
    return [];
  }
}

async function createAmendInvite(
  sender: UserRow,
  input: {
    recipientUserId: string;
    sourceOrderId: string;
    connectionId: string;
    tradeId: string;
    result: ModifyResult;
    side: TradeSide;
    stopLoss: number | null;
    takeProfit: number | null;
    target: { connectionId: string; tradeId: string; match: FounderTargetMatch } | null;
  },
): Promise<FounderInviteView | null> {
  const { result } = input;

  // Suppress a repeat of a move that is already sitting unanswered on the
  // recipient's screen. An amend is a deliberate press and each one writes its
  // own journal row, so `sourceRef` cannot dedupe them the way it does for an
  // entry — two saves of the same levels seconds apart would otherwise queue two
  // identical modals.
  const open = await db
    .select()
    .from(founderTradeInvites)
    .where(
      and(
        eq(founderTradeInvites.recipientUserId, input.recipientUserId),
        eq(founderTradeInvites.inviterUserId, sender.id),
        eq(founderTradeInvites.kind, 'amend'),
        eq(founderTradeInvites.status, 'primary_pending'),
      ),
    );
  const duplicate = open.find(
    (r) =>
      r.sourceTradeId === input.tradeId &&
      r.stopLoss === input.stopLoss &&
      r.takeProfit === input.takeProfit,
  );
  if (duplicate) {
    logEvent(
      duplicate.id,
      'invite.duplicate_suppressed',
      sender.id,
      'The same level change was sent again while this one was still unanswered',
    );
    return null;
  }

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(founderTradeInvites).values({
    id,
    inviterUserId: sender.id,
    recipientUserId: input.recipientUserId,
    sourceRef: input.sourceOrderId,
    sourceConnectionId: input.connectionId,
    sourceTradeId: input.tradeId,
    kind: 'amend',
    instrument: result.instrument,
    side: input.side,
    entryPrice: result.entryPrice,
    // The levels AS THEY NOW STAND on the sender's position, and what they were
    // before — the recipient reads the move rather than a bare new number.
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    prevStopLoss: result.previousStopLoss,
    prevTakeProfit: result.previousTakeProfit,
    inviterUnits: result.units,
    targetConnectionId: input.target?.connectionId ?? null,
    targetTradeId: input.target?.tradeId ?? null,
    targetMatch: input.target?.match ?? null,
    isTest: false,
    status: 'primary_pending',
    notifyCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  const moved = [
    input.stopLoss == null ? null : `stop ${result.previousStopLoss ?? '—'} → ${input.stopLoss}`,
    input.takeProfit == null ? null : `target ${result.previousTakeProfit ?? '—'} → ${input.takeProfit}`,
  ]
    .filter(Boolean)
    .join(' · ');
  logEvent(id, 'amend.created', sender.id, `${result.instrument} ${input.side} · ${moved}`);
  logEvent(id, 'invite.auto_sent', null, 'Sent by a standing Founder trade link');
  if (input.target) {
    logEvent(
      id,
      'amend.target_resolved',
      null,
      input.target.match === 'chain'
        ? 'Applies to the linked position on the recipient\'s account'
        : 'Matched the recipient\'s only open position in this instrument and direction',
    );
  } else {
    logEvent(
      id,
      'amend.target_unresolved',
      null,
      'No linked position and no single instrument match, so no change can be applied in one press',
    );
  }
  const full = (
    await db.select().from(founderTradeInvites).where(eq(founderTradeInvites.id, id)).limit(1)
  )[0]!;
  return shape(full, await peopleFor([full]), sender.id, await unitsOf(input.recipientUserId));
}

// The fixed size a recipient has stated, for display on an invitation. A
// percentage-sized join has no fixed size to show — the modal reads the mode and
// says what the share is instead, which is the honest thing to print: the units
// are not known until the moment the order goes out.
async function unitsOf(userId: string): Promise<number | null> {
  const prefs = await getFounderPrefs(userId);
  return prefs.sizeMode === 'account_pct' ? null : prefs.defaultUnits;
}

// ---- the size a join actually goes out at ----
//
// **NEVER THE SENDER'S.** The invitation carries the inviter's size for display
// and nothing here reads it; the size comes from the recipient's own stored
// intent, applied to the recipient's own account. That was already true of the
// fixed size and stays true of the percentage — which, if anything, makes it
// harder to get wrong, since the figure is derived from the joiner's own NAV.

export interface JoinSize {
  units: number;
  /** For the timeline: how this size was arrived at. */
  detail: string;
  /** The whole working, when a percentage produced the size. */
  sized: AccountPctSize | null;
}

// The pairs a size PREVIEW is priced against, in order of preference. A preview
// is not an order, so unlike the test drill there is no reason to avoid EUR/USD
// — it is the pair most desks read a size against, and the panel names whichever
// one it used.
const PREVIEW_PAIR_PREFERENCE = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD'];

// Everything the sizing module needs, read from the recipient's OWN account,
// instrument and quote at the moment it is asked for. Three existing desk reads
// and no new broker code.
async function sizingInputsFor(
  user: UserRow,
  connectionId: string,
  instrument: string,
  side: TradeSide,
  actor: AuditActor,
): Promise<{ inputs: SizingInputs; instrument: string; currency: string }> {
  const accounts = await listDeskAccounts(user.id, actor);
  const account = accounts.find((a) => a.connectionId === connectionId);
  if (!account) {
    throw new FounderTradeError('That broker connection is not available on your account', 404);
  }
  const specs = await deskInstruments(user.id, connectionId, actor);
  const wanted = instrument.trim().toUpperCase();
  const spec =
    specs.find((sp) => sp.instrument.toUpperCase() === wanted || sp.symbol.toUpperCase() === wanted.replace('/', '_')) ??
    null;
  if (!spec) {
    throw new FounderTradeError(`${instrument} is not tradeable on your account`, 400, 'NO_INSTRUMENT');
  }
  const [quote] = await deskQuotes(user.id, connectionId, [spec.instrument], actor).catch(() => []);
  return {
    instrument: spec.instrument,
    currency: account.currency,
    inputs: {
      spec,
      // The side of the book this order would actually pay, exactly as the
      // ticket sizes from — a join is always a market order.
      price: (side === 'long' ? quote?.ask ?? quote?.bid : quote?.bid ?? quote?.ask) ?? null,
      factor: quote?.quoteHomeFactor ?? null,
      // A pip on a genuine currency pair, one whole point on everything else.
      // The same single test (`forexPair`) the rest of the desk scores by.
      step: forexPair(spec.instrument) ? (spec.pipSize > 0 ? spec.pipSize : 0.0001) : 1,
      accountValue: account.nav,
      spot: account.spot,
    },
  };
}

/**
 * The size THIS recipient's join goes out at, worked out now rather than read
 * off anything stored.
 *
 * A fixed-units setting answers immediately. A percentage is re-derived from the
 * account value, the quote and the venue's own margin requirement in force at
 * this moment — which is the whole point of storing the share rather than the
 * size — and refuses rather than guessing when any of those is missing.
 */
/**
 * Whether a size has been STATED at all, in whichever mode is in force.
 *
 * Kept separate from resolving one because a percentage cannot be resolved
 * without first knowing which account it is a share of — so this is what runs
 * before the account check, keeping "set a size" ahead of "choose an account"
 * for somebody who has set up neither.
 */
function assertSizeStated(prefs: FounderTradePrefs): void {
  if (prefs.sizeMode === 'account_pct') {
    if (prefs.sizePct == null || !(prefs.sizePct > 0)) {
      throw new FounderTradeError(
        'Set the share of your account a joined trade should use — nothing is copied from the trade you were invited to',
        400,
        'NO_SIZE',
      );
    }
    return;
  }
  if (prefs.defaultUnits == null || !(prefs.defaultUnits > 0)) {
    throw new FounderTradeError(
      'Set your own position size before joining — nothing is copied from the trade you were invited to',
      400,
      'NO_SIZE',
    );
  }
}

export async function resolveJoinSize(
  user: UserRow,
  prefs: FounderTradePrefs,
  connectionId: string,
  instrument: string,
  side: TradeSide,
  actor: AuditActor,
): Promise<JoinSize> {
  assertSizeStated(prefs);
  if (prefs.sizeMode !== 'account_pct') {
    const units = prefs.defaultUnits!;
    return { units, detail: `${units} units`, sized: null };
  }
  const { inputs } = await sizingInputsFor(user, connectionId, instrument, side, actor);
  // Non-null by `assertSizeStated` above; TypeScript cannot see through the
  // assertion, and re-testing here would make it look like the check is optional.
  const pct = prefs.sizePct!;
  const sized = sizeForAccountPct(pct, inputs, {
    enabled: prefs.pctRound,
    increment: prefs.pctRoundIncrement,
  });
  if (sized.problem != null || sized.units == null) {
    throw new FounderTradeError(
      sizingProblemText(sized.problem ?? 'no-quote', {
        spot: inputs.spot,
        minimumTradeSize: inputs.spec?.minimumTradeSize ?? null,
        increment: prefs.pctRound ? prefs.pctRoundIncrement.toFixed(2) : undefined,
      }),
      409,
      'SIZE_UNAVAILABLE',
    );
  }
  return {
    units: sized.units,
    detail:
      `${sized.units} units · ${pct}% of account value` +
      `${sized.actualPct == null ? '' : ` (${sized.actualPct.toFixed(1)}% actual)`}` +
      `${sized.rounded ? ` · rounded to ${prefs.pctRoundIncrement}/pip` : ''}`,
    sized,
  };
}

export interface FounderSizePreview {
  mode: FounderSizeMode;
  /** The pair the preview was priced against. */
  instrument: string | null;
  accountLabel: string | null;
  currency: string;
  accountValue: number | null;
  targetPct: number | null;
  units: number | null;
  perStep: number | null;
  cost: number | null;
  actualPct: number | null;
  rounded: boolean;
  /** Plain-language reason there is nothing to preview. */
  problem: string | null;
}

/**
 * What a join would currently be sized at, WITHOUT joining anything.
 *
 * **Informational only.** Nothing here is stored: the percentage stays the
 * saved intent, and the units below it are only what that share comes to right
 * now, on the pair this was priced against.
 */
export async function previewJoinSize(user: UserRow, actor: AuditActor): Promise<FounderSizePreview> {
  assertFounder(user);
  const prefs = await getFounderPrefs(user.id);
  const base: FounderSizePreview = {
    mode: prefs.sizeMode,
    instrument: null,
    accountLabel: null,
    currency: 'USD',
    accountValue: null,
    targetPct: prefs.sizePct,
    units: null,
    perStep: null,
    cost: null,
    actualPct: null,
    rounded: false,
    problem: null,
  };
  if (prefs.sizeMode !== 'account_pct') return base;
  if (prefs.sizePct == null) return { ...base, problem: 'Set the share of your account to use' };
  if (!prefs.defaultConnectionId) {
    return { ...base, problem: 'Choose which of your broker accounts a joined trade goes to' };
  }
  try {
    await assertOwnConnection(user.id, prefs.defaultConnectionId);
    const specs = await deskInstruments(user.id, prefs.defaultConnectionId, actor);
    const tradeable = specs.filter((sp) => sp.tradeable);
    const spec =
      PREVIEW_PAIR_PREFERENCE.map((sym) => tradeable.find((f) => f.symbol.toUpperCase() === sym)).find(Boolean) ??
      tradeable[0];
    if (!spec) return { ...base, problem: 'This account has nothing tradeable to price a size against' };
    const { inputs, currency, instrument } = await sizingInputsFor(
      user,
      prefs.defaultConnectionId,
      spec.instrument,
      'long',
      actor,
    );
    const sized = sizeForAccountPct(prefs.sizePct, inputs, {
      enabled: prefs.pctRound,
      increment: prefs.pctRoundIncrement,
    });
    const accountLabel =
      (await founderAccounts(user.id)).find((a) => a.connectionId === prefs.defaultConnectionId)?.label ?? null;
    return {
      ...base,
      instrument,
      accountLabel,
      currency,
      accountValue: inputs.accountValue,
      units: sized.units,
      perStep: sized.perStep,
      cost: sized.cost,
      actualPct: sized.actualPct,
      rounded: sized.rounded,
      problem:
        sized.problem == null
          ? null
          : sizingProblemText(sized.problem, {
              spot: inputs.spot,
              minimumTradeSize: inputs.spec?.minimumTradeSize ?? null,
              increment: prefs.pctRound ? prefs.pctRoundIncrement.toFixed(2) : undefined,
            }),
    };
  } catch (e) {
    // A preview must never be what stops somebody using the screen it sits on.
    return { ...base, problem: e instanceof Error ? e.message : 'That could not be priced right now' };
  }
}

// ---- reading ----

// Whether a status still owes the recipient an action. The one definition, read
// by the modal, the reminder watch and the completion check alike.
export function isUnresolved(status: FounderTradeStatus): boolean {
  return status !== 'complete';
}

// The one list of statuses that still owe the recipient something. Since the
// funded question left this workflow (owner decision, 2026-08) there is exactly
// one of them, and it is kept as a list rather than folded into an equality
// because the modal queue, the reminder watch and the pending read all read it.
const UNRESOLVED: FounderTradeStatus[] = ['primary_pending'];

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
  // Name the account a level move would reach. Read from the connection rows
  // (no credential, no broker call) and only when something on the queue
  // actually needs it — the modal polls this every few seconds on every screen
  // in the terminal, and the quiet case is the overwhelmingly common one.
  const accounts = rows.some((r) => r.targetConnectionId)
    ? new Map((await founderAccounts(user.id)).map((a) => [a.connectionId, a.label]))
    : undefined;
  return rows.map((r) => shape(r, people, user.id, units, accounts));
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

// Answering IS finishing (owner decision, 2026-08).
//
// This used to advance to a funded question — "are you also placing this at the
// prop firm?" — and then to a screenshot. Both are gone from this workflow: a
// trade invitation is now one question with two answers, and either one ends it.
// **Nothing about the funded book, the Funded Trades screen or any funded route
// changed**; what was removed is this workflow's demand that the recipient
// answer for it before the invitation would close.
//
// The funded columns are left on the row as the archive of what was decided
// while the step existed, and migration 0139 completed every workflow that was
// still standing on one of the two removed steps — an unresolved row keeps a
// blocking modal up and a phone repeating, so leaving them would have stranded
// somebody in a workflow with no exit.
async function completeInvite(
  id: string,
  decision: FounderPrimaryDecision,
  extra: Partial<FounderTradeInviteRow> = {},
): Promise<void> {
  const now = new Date();
  await db
    .update(founderTradeInvites)
    .set({
      status: 'complete',
      primaryDecision: decision,
      primaryDecidedAt: now,
      completedAt: now,
      claimToken: null,
      claimedAt: null,
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
    throw new FounderTradeError(
      row.kind === 'amend'
        ? 'A change is being sent for this position right now'
        : 'A JOIN is being sent for this trade right now',
      409,
      'IN_FLIGHT',
    );
  }
  const amend = row.kind === 'amend';
  await completeInvite(id, 'declined', { primaryError: null });
  logEvent(
    id,
    amend ? 'amend.dismissed' : 'primary.declined',
    user.id,
    amend ? 'The recipient left their own levels as they were' : 'The recipient did not join the trade',
  );
  logEvent(id, 'workflow.completed', user.id, amend ? 'Completed without changing anything' : 'Completed without joining');
  void notifyInviterOfResponse(row, amend ? 'left their levels as they were' : 'did not join your trade');
  return reload(user, id);
}

// Apply the sender's level change to the recipient's OWN position.
//
// **THE POSITION IS THE ONE STORED ON THE ROW, NOT ONE THE CLIENT NAMES.** It
// was resolved when the invitation was raised — from an explicit pairing, or
// from a single unambiguous instrument match — and nothing in the request can
// redirect it. That is the same rule the size follows on an entry: the press
// authorizes one action, and which action it is was settled by the server.
//
// **ONLY THE LEVELS THAT MOVED TRAVEL.** A stop that the sender did not touch is
// left `undefined` rather than sent, so applying a target change never cancels
// and re-places the recipient's stop at the broker — the same rule the position
// editor already follows.
//
// **IT CALLS THE SERVICE, NOT THE ROUTE**, which is what stops a chain from
// ping-ponging: the recipient's own amend does not fan back out over their
// links. `autoAmendAfterModify` is wired to the HTTP route, and this is not it.
async function applyAmendImpl(
  user: UserRow,
  row: FounderTradeInviteRow,
  actor: AuditActor,
): Promise<FounderInviteView> {
  const id = row.id;
  // Validated BEFORE the claim, so a refusal costs nothing and can be retried at
  // once — and is audited either way, because a press that produced no change is
  // exactly what somebody reconstructing "why was this stop not moved?" needs.
  try {
    if (!row.targetTradeId || !row.targetConnectionId) {
      throw new FounderTradeError(
        'There is no position of yours to apply this to. Link your position to theirs from the trade card, then ask them to send it again.',
        409,
        'NO_TARGET',
      );
    }
    if (!(await canSendOrders(user))) {
      throw new FounderTradeError(
        'Turn Advanced Trading on in My Terminal ▸ Premium Features before changing a live position',
        403,
        'NO_DESK',
      );
    }
    await assertOwnConnection(user.id, row.targetConnectionId);
  } catch (e) {
    logEvent(id, 'amend.apply_refused', user.id, e instanceof Error ? e.message : 'Refused before sending');
    throw e;
  }

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
    const fresh = await loadForRecipient(user, id);
    if (fresh.status !== 'primary_pending') return reload(user, id);
    logEvent(id, 'amend.duplicate_blocked', user.id, 'A second apply arrived while one was already being sent');
    throw new FounderTradeError(
      'This change is already being sent — give it a moment rather than sending it twice',
      409,
      'IN_FLIGHT',
    );
  }
  // A claim taken over from a stale one may be the second attempt rather than
  // the first, so it is released unsent and refused once — the same rule a JOIN
  // follows, for the same reason.
  if (row.claimToken && row.claimedAt) {
    const warning =
      'Your last attempt never finished, so it may or may not have reached your broker. Check the position, then press again.';
    await db
      .update(founderTradeInvites)
      .set({ claimToken: null, claimedAt: null, primaryError: warning, updatedAt: new Date() })
      .where(eq(founderTradeInvites.id, id));
    logEvent(id, 'amend.claim_recovered', null, 'A previous apply did not report back; its claim was released unsent');
    throw new FounderTradeError(warning, 409, 'CLAIM_RECOVERED');
  }

  const levels = {
    ...(row.stopLoss == null ? {} : { stopLoss: row.stopLoss }),
    ...(row.takeProfit == null ? {} : { takeProfit: row.takeProfit }),
  };
  logEvent(
    id,
    'amend.apply_submitted',
    user.id,
    `${row.instrument} ${row.side} · ${row.stopLoss == null ? '' : `stop ${row.stopLoss} `}${row.takeProfit == null ? '' : `target ${row.takeProfit}`}`.trim(),
  );

  try {
    await modifyDeskPosition(
      user,
      {
        connectionId: row.targetConnectionId!,
        tradeId: row.targetTradeId!,
        instrument: row.instrument,
        ...levels,
      },
      actor,
    );
    await completeInvite(id, 'joined', { primaryError: null });
    logEvent(id, 'amend.applied', user.id, 'The change was applied to their own position');
    logEvent(id, 'workflow.completed', user.id, 'Completed on applying the change');
    void notifyInviterOfResponse(row, 'moved their levels to match');
    return reload(user, id);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The change could not be applied';
    // The workflow stays exactly where it was, with the reason on the row so it
    // is on screen when the recipient comes back to it. The refusal that lands
    // here most often is the terminal's own: a level that would trigger the
    // moment it was set, which is worth reading rather than retrying.
    await db
      .update(founderTradeInvites)
      .set({ claimToken: null, claimedAt: null, primaryError: message.slice(0, 300), updatedAt: new Date() })
      .where(eq(founderTradeInvites.id, id));
    logEvent(id, 'amend.apply_failed', user.id, message);
    throw new FounderTradeError(
      message,
      e instanceof DeskError ? e.status : 502,
      (e instanceof DeskError ? e.code : undefined) ?? undefined,
    );
  }
}

// Join the trade, or apply the level change. The recipient pressing the button
// is the authorization for this one action and nothing else.
//
// **ONE ENTRY POINT FOR BOTH KINDS, DELIBERATELY.** An 'entry' sends an order and
// an 'amend' moves a level, which are different acts — but everything around
// them is identical: the same claim that stops two tabs both reaching the
// broker, the same refusal audit, the same completion, the same reminder
// pacing, the same modal and the same route. A second decision endpoint would be
// a second place for all of that to drift.
export async function joinPrimary(
  user: UserRow,
  id: string,
  actor: AuditActor,
): Promise<FounderInviteView> {
  const row = await loadForRecipient(user, id);
  if (row.status !== 'primary_pending') return reload(user, id);
  if (row.kind === 'amend') return applyAmendImpl(user, row, actor);

  // Everything is validated BEFORE the claim is taken, so a refusal costs
  // nothing, leaves the workflow exactly where it was, and can be retried at
  // once rather than waiting out a claim window.
  //
  // A refusal here is still AUDITED. It is a press the recipient made and did
  // not get an order out of, which is precisely the kind of thing somebody
  // reconstructing "why was this trade not taken?" needs to see — and it is
  // bounded by being a person pressing a button.
  const prefs = await getFounderPrefs(user.id);
  let venue = '';
  let size: JoinSize;
  try {
    if (!(await canSendOrders(user))) {
      throw new FounderTradeError(
        'Turn Advanced Trading on in My Terminal ▸ Premium Features before joining — it is where the terminal asks you to acknowledge that it places real orders with your own broker',
        403,
        'NO_DESK',
      );
    }
    // Whether a size has been stated at all is asked BEFORE the account, so
    // somebody who has set up neither is told about the size first — the order
    // this refused in before a percentage could need the account to resolve.
    assertSizeStated(prefs);
    if (!prefs.defaultConnectionId) {
      throw new FounderTradeError(
        'Choose which of your broker accounts a joined trade goes to',
        400,
        'NO_ACCOUNT',
      );
    }
    venue = await assertOwnConnection(user.id, prefs.defaultConnectionId);
    // THE SIZE IS RESOLVED HERE, BEFORE THE CLAIM. A percentage is re-derived
    // from this account's value, this quote and this venue's own margin rate
    // moments before the order goes out — a stored unit count would be whatever
    // the account was worth when the setting was saved. Resolving before the
    // claim also means a refusal costs nothing and can be retried at once.
    size = await resolveJoinSize(user, prefs, prefs.defaultConnectionId, row.instrument, row.side, actor);
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

  // WHICH LEVELS TRAVEL is the group's rule, not this trader's — read from the
  // one install-wide setting so an invitation means the same thing whoever sent
  // it. Both are absolute levels on the same instrument, so they carry across
  // unchanged; only the size is ever the joiner's own.
  const share = await getShareConfig();
  let stopLoss = share.copyStopLoss ? row.stopLoss ?? null : null;
  let takeProfit = share.copyTakeProfit ? row.takeProfit ?? null : null;

  // A spot venue attaches exactly ONE protective order to an entry, so a ticket
  // carrying both is refused outright. Rather than dead-end a half-asleep join
  // with a message about placing the other by hand, the STOP is kept — it is the
  // one that bounds the loss — and the target is dropped with a note on the
  // timeline saying so. Never the other way round.
  let droppedTarget = false;
  if (venue === 'kraken' && stopLoss != null && takeProfit != null) {
    takeProfit = null;
    droppedTarget = true;
  }

  logEvent(
    id,
    'primary.join_submitted',
    user.id,
    `${row.instrument} ${row.side} · ${size.detail} · own account` +
      `${stopLoss == null ? ' · no stop' : ` · stop ${stopLoss}`}` +
      `${takeProfit == null ? '' : ` · target ${takeProfit}`}`,
  );
  if (droppedTarget) {
    logEvent(
      id,
      'primary.target_dropped',
      null,
      'This account attaches one protective order to an entry, so the stop was sent and the target was not',
    );
  }

  try {
    const res = await placeDeskOrder(
      user,
      {
        connectionId: prefs.defaultConnectionId!,
        instrument: row.instrument,
        side: row.side,
        // The recipient's OWN size, resolved above. The inviter's is on the row
        // for display and is deliberately not read here.
        units: size.units,
        type: 'market',
        price: null,
        // The inviter's own levels, as resolved above.
        stopLoss,
        takeProfit,
      },
      actor,
    );
    await completeInvite(id, 'joined', {
      primaryOrderRef: res.orderRecordId,
      primaryFillPrice: res.fillPrice,
      primaryUnits: res.units ?? size.units,
      primaryConnectionId: prefs.defaultConnectionId,

      primaryError: null,
    });
    logEvent(
      id,
      'primary.joined',
      user.id,
      `${res.status} · ${res.units ?? size.units} units${res.fillPrice == null ? '' : ` at ${res.fillPrice}`}`,
    );
    logEvent(id, 'workflow.completed', user.id, 'Completed on joining');
    // PAIR THE TWO POSITIONS. This is what makes a later level-move a one-press
    // decision rather than a guess: the sender moves their stop and the terminal
    // knows exactly which of the recipient's positions is the same trade.
    //
    // Fire and forget, like the timeline: a pairing that could not be written
    // must never turn a placed order into a reported failure. A join with
    // nothing to pair (a resting order, or a venue that reports no position id)
    // simply records nothing, and the two can still be paired by hand.
    if (res.tradeId && row.sourceTradeId && row.sourceConnectionId) {
      void pairPositions({
        a: {
          userId: row.inviterUserId,
          connectionId: row.sourceConnectionId,
          tradeId: row.sourceTradeId,
        },
        b: { userId: user.id, connectionId: prefs.defaultConnectionId!, tradeId: res.tradeId },
        instrument: row.instrument,
        side: row.side,
        source: 'join',
        inviteId: id,
        createdByUserId: user.id,
      }).catch(() => {});
    }
    void notifyInviterOfResponse(row, 'joined your trade');
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

// ---- the reminder watch's half ----

export interface DueReminder {
  id: string;
  recipientUserId: string;
  inviterName: string;
  instrument: string;
  side: TradeSide;
  /** What it is asking for. A trade invitation and a level move want different
   *  words on a lock screen. */
  kind: FounderTradeKind;
  /** An 'amend': the levels being asked for, so the notification can say what
   *  moved without the recipient opening anything. */
  stopLoss: number | null;
  takeProfit: number | null;
  status: FounderTradeStatus;
  level: NotifLevel;
  notifyCount: number;
  /** A drill — the notification says so, in the title, before anything else. */
  isTest: boolean;
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
      kind: row.kind,
      stopLoss: row.stopLoss,
      takeProfit: row.takeProfit,
      status: row.status,
      level: p.reminderLevel,
      notifyCount: row.notifyCount,
      isTest: row.isTest,
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
