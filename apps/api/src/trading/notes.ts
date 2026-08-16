import crypto from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tradingNotes,
  tradingPositions,
  users,
  type NoteDirection,
  type NoteKind,
  type NoteOutcome,
  type NoteSettler,
  type NoteVisibility,
  type TradingNoteRow,
} from '../db/schema.js';
import { visibleTraderIds, type Viewer } from './scope.js';
import { normInstr } from './outcome.js';

// Trading Notes — a trader's own predictions and observations.
//
// This module owns the data, the visibility boundary and the pure decision
// logic. Automatic settlement against the price feed lives next door in
// noteSettle.ts, which owns the polling; the two are split the same way
// priceAlerts.ts and priceAlertWatch.ts are.
//
// THREE RULES CARRY THE WHOLE FEATURE, and each of them is the difference
// between a record and a diary:
//
//  1. A PUBLISHED CALL IS FROZEN. Sharing a prediction with the group stamps
//     `lockedAt`, and a window that has opened locks the call whether or not it
//     was ever shared. Afterwards only the reflection may be written. A track
//     record that can be edited after the fact is not a track record — the same
//     reason a published study package locks its content.
//
//  2. NOBODY SEES ANOTHER PERSON'S CALL BEFORE THE WINDOW OPENS. Otherwise
//     whoever writes second is anchoring on whoever wrote first, and the week
//     measures nothing. It costs one clause in the read query, and it is what
//     separates this from a comment thread.
//
//  3. A CALL THAT COULD NOT BE SETTLED IS NEVER SCORED AS WRONG. `unsettleable`
//     is a real outcome and is excluded from the hit rate, reported on its own.
//     Same rule as the Live Wall's `unavailable` source, Investments'
//     `unpricedCount` and Market Data's `sample: true`: a thing that could not
//     be measured must never be reported as a measured one.

// A runaway-input guard, not a product limit.
const MAX_PER_WEEK = 50;

const MAX_TITLE = 200;
const MAX_BODY = 4000;
const MAX_REFLECTION = 4000;

// ---- Eastern-Time week bucketing ----
//
// A trading week is an Eastern concept, like every other day bucket in the
// terminal (History's grouping, the trade code, the funded daily roll). The week
// key is computed here and STORED, never derived per reader: derived, a call
// would move between weeks when somebody changed their display zone, and two
// people in one group would be looking at different boards.

function etCivil(at: Date): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

// How far Eastern Time sits from UTC at a given instant, in ms (negative).
// Read from Intl rather than hardcoded so it is DST-correct by construction.
function etOffsetMs(at: Date): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? '0');
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return asUtc - at.getTime();
}

// An absolute instant from an Eastern wall-clock date and time. Composed rather
// than offset from "now" — `now + 4h` drifts across a DST boundary, which is the
// trap etClock.ts exists to close on the web side. Two passes because the offset
// itself depends on the instant being resolved.
export function etInstant(y: number, mo: number, d: number, hh: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, hh, mi);
  let ms = guess - etOffsetMs(new Date(guess));
  ms = guess - etOffsetMs(new Date(ms));
  return ms;
}

// ISO-8601 week stamp ('2026-W34'), Monday-based, in Eastern Time.
export function etWeekKey(at: Date = new Date()): string {
  const { y, m, d } = etCivil(at);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // ISO weeks belong to the year containing their Thursday.
  const dow = dt.getUTCDay() || 7; // Mon=1 … Sun=7
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const isoYear = dt.getUTCFullYear();
  const week = Math.ceil(((dt.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function isWeekKey(s: string): boolean {
  return /^\d{4}-W\d{2}$/.test(s);
}

// The Monday of a week key, as a UTC civil date (no zone meaning of its own —
// it is only ever read back through etInstant or formatted as a date).
function mondayOf(weekKey: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return mondayOf(etWeekKey());
  const [, yStr, wStr] = m;
  // Jan 4 is always in ISO week 1.
  const jan4 = new Date(Date.UTC(Number(yStr), 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const week1Monday = jan4.getTime() - (dow - 1) * 86_400_000;
  return new Date(week1Monday + (Number(wStr) - 1) * 7 * 86_400_000);
}

// Move a week key by whole weeks. Used by the screen's week navigation, so the
// client never has to know how a week is numbered.
export function shiftWeekKey(weekKey: string, delta: number): string {
  const mon = mondayOf(weekKey);
  return etWeekKey(new Date(mon.getTime() + delta * 7 * 86_400_000 + 12 * 3_600_000));
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// The Monday and Friday of a week, as plain ET date strings for display.
export function weekRange(weekKey: string): { startsOn: string; endsOn: string } {
  const mon = mondayOf(weekKey);
  return { startsOn: ymd(mon), endsOn: ymd(new Date(mon.getTime() + 4 * 86_400_000)) };
}

// The default window for a weekly call: it opens at the Monday cash open and
// settles at the Friday close, both Eastern. A call written after the open gets
// no blind period — which is correct, and is why the reveal is derived from the
// window rather than from when the note was written.
export function defaultWindow(weekKey: string): { opensAt: number; deadlineAt: number } {
  const mon = mondayOf(weekKey);
  const fri = new Date(mon.getTime() + 4 * 86_400_000);
  return {
    opensAt: etInstant(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate(), 9, 30),
    deadlineAt: etInstant(fri.getUTCFullYear(), fri.getUTCMonth() + 1, fri.getUTCDate(), 16, 0),
  };
}

// ---- The view ----

// What the trader is still owed on a note. One field with three states rather
// than a pair of booleans, so the screen can group them the way the
// Administrator Log does: red for open, green for done, nothing for a note that
// asks nothing of anyone.
export type NoteAwaiting = 'settle' | 'reflect';

export interface TradingNote {
  id: string;
  ownerId: string;
  owner: string;
  isMine: boolean;
  kind: NoteKind;
  visibility: NoteVisibility;
  title: string;
  body: string | null;
  instrument: string | null;
  direction: NoteDirection | null;
  targetPrice: number | null;
  confidence: number | null;
  weekKey: string;
  windowOpensAt: number | null;
  deadlineAt: number | null;
  openPrice: number | null;
  /** The call can no longer be edited — shared, or its window has opened. */
  locked: boolean;
  /** The window has opened, so the call is readable by the group. */
  revealed: boolean;
  /** Structured enough for the price feed to settle it without being asked. */
  autoSettles: boolean;
  outcome: NoteOutcome | null;
  settledAt: number | null;
  settledBy: NoteSettler | null;
  settlePrice: number | null;
  settleNote: string | null;
  reflection: string | null;
  reflectedAt: number | null;
  awaiting: NoteAwaiting | null;
  createdAt: number;
  updatedAt: number;
}

// A call the terminal can grade on its own: an instrument, a direction, and
// something to measure against — either a level the trader named, or the mark
// the call was made at. Without a reference there is nothing to compare to, and
// guessing one would invent the very number the outcome turns on.
export function autoSettles(row: {
  kind: NoteKind;
  instrument: string | null;
  direction: NoteDirection | null;
  targetPrice: number | null;
  openPrice: number | null;
}): boolean {
  if (row.kind !== 'prediction') return false;
  if (!row.instrument || !row.direction) return false;
  return row.targetPrice != null || row.openPrice != null;
}

// Whether the call is frozen. Shared is frozen; a window that has opened is
// frozen whether or not it was ever shared — the trade week has started, and a
// call rewritten mid-week is not the call that was made.
export function isLocked(row: { lockedAt: Date | null; windowOpensAt: Date | null }, now: number): boolean {
  if (row.lockedAt != null) return true;
  return row.windowOpensAt != null && row.windowOpensAt.getTime() <= now;
}

function awaitingFor(row: TradingNoteRow, now: number): NoteAwaiting | null {
  if (row.outcome != null) return row.reflection ? null : 'reflect';
  if (row.kind !== 'prediction') return null;
  if (row.deadlineAt != null && row.deadlineAt.getTime() <= now) return 'settle';
  return null;
}

function toView(row: TradingNoteRow, owner: string, viewerId: string, now: number): TradingNote {
  return {
    id: row.id,
    ownerId: row.userId,
    owner,
    isMine: row.userId === viewerId,
    kind: row.kind,
    visibility: row.visibility,
    title: row.title,
    body: row.body,
    instrument: row.instrument,
    direction: row.direction,
    targetPrice: row.targetPrice,
    confidence: row.confidence,
    weekKey: row.weekKey,
    windowOpensAt: row.windowOpensAt?.getTime() ?? null,
    deadlineAt: row.deadlineAt?.getTime() ?? null,
    openPrice: row.openPrice,
    locked: isLocked(row, now),
    revealed: row.windowOpensAt == null || row.windowOpensAt.getTime() <= now,
    autoSettles: autoSettles(row),
    outcome: row.outcome,
    settledAt: row.settledAt?.getTime() ?? null,
    settledBy: row.settledBy,
    settlePrice: row.settlePrice,
    settleNote: row.settleNote,
    reflection: row.reflection,
    reflectedAt: row.reflectedAt?.getTime() ?? null,
    awaiting: awaitingFor(row, now),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export class NoteError extends Error {}

// ---- Reading ----

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.displayName || r.username]));
}

// Every note the viewer may read, from a set of owners.
//
// The blind-reveal clause is the `or(...)` below: somebody ELSE's note is
// readable only once its window has opened. Your own is always readable — you
// wrote it, and hiding it from its author would make the composer unusable.
async function readable(viewer: Viewer, where: ReturnType<typeof and>[], now: number) {
  const ids = [...(await visibleTraderIds(viewer))];
  return db
    .select()
    .from(tradingNotes)
    .where(
      and(
        inArray(tradingNotes.userId, ids),
        or(
          eq(tradingNotes.userId, viewer.id),
          and(
            eq(tradingNotes.visibility, 'group'),
            or(isNull(tradingNotes.windowOpensAt), lte(tradingNotes.windowOpensAt, new Date(now))),
          ),
        ),
        ...where,
      ),
    )
    .orderBy(desc(tradingNotes.createdAt));
}

export interface NoteWeek {
  weekKey: string;
  startsOn: string;
  endsOn: string;
  prevWeek: string;
  nextWeek: string;
  isCurrent: boolean;
  notes: TradingNote[];
}

// One week's board: the viewer's own notes plus every revealed group note from
// the traders they can see.
export async function getWeek(viewer: Viewer, weekKey?: string): Promise<NoteWeek> {
  const now = Date.now();
  const key = weekKey && isWeekKey(weekKey) ? weekKey : etWeekKey(new Date(now));
  const rows = await readable(viewer, [eq(tradingNotes.weekKey, key)], now);
  const names = await ownerNames([...new Set(rows.map((r) => r.userId))]);
  const range = weekRange(key);
  return {
    weekKey: key,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    prevWeek: shiftWeekKey(key, -1),
    nextWeek: shiftWeekKey(key, 1),
    isCurrent: key === etWeekKey(new Date(now)),
    notes: rows.map((r) => toView(r, names.get(r.userId) ?? 'Unknown', viewer.id, now)),
  };
}

// Everything of the viewer's OWN that is still owed an answer: a prediction past
// its deadline with no outcome, or a settled one with no reflection.
//
// Deliberately self-only. Another person's unfinished reflection is not the
// viewer's to chase, and a queue of other people's open items is a nag rather
// than a tool.
export async function getQueue(viewer: Viewer): Promise<TradingNote[]> {
  const now = Date.now();
  const rows = await db
    .select()
    .from(tradingNotes)
    .where(
      and(
        eq(tradingNotes.userId, viewer.id),
        eq(tradingNotes.kind, 'prediction'),
        or(
          and(isNull(tradingNotes.outcome), lte(tradingNotes.deadlineAt, new Date(now))),
          and(sql`${tradingNotes.outcome} is not null`, isNull(tradingNotes.reflection)),
        ),
      ),
    )
    .orderBy(asc(tradingNotes.deadlineAt));
  const names = await ownerNames([viewer.id]);
  return rows.map((r) => toView(r, names.get(viewer.id) ?? 'You', viewer.id, now));
}

// The most recent observations the viewer may read, newest first.
export async function getObservations(viewer: Viewer, limit = 60): Promise<TradingNote[]> {
  const now = Date.now();
  const rows = await readable(viewer, [eq(tradingNotes.kind, 'observation')], now);
  const names = await ownerNames([...new Set(rows.map((r) => r.userId))]);
  return rows.slice(0, limit).map((r) => toView(r, names.get(r.userId) ?? 'Unknown', viewer.id, now));
}

// ---- Calibration ----
//
// What a confidence level ASSERTS, so the table can put it beside what actually
// happened. Coarse on purpose: the whole value of the table is having enough
// calls in each bucket for the comparison to mean anything.
export const CONFIDENCE_STATED: Record<number, number> = { 1: 55, 2: 65, 3: 75, 4: 85, 5: 95 };

export interface CalibrationRow {
  level: number;
  stated: number;
  calls: number;
  hits: number;
}

export interface NoteStats {
  /** Calls with a verdict that counts — hits plus misses, and nothing else. */
  scored: number;
  hits: number;
  misses: number;
  /** Reported separately and NEVER scored. See rule 3 at the top of this file. */
  partial: number;
  unsettleable: number;
  /** Predictions still running or still owed a verdict. */
  open: number;
  /** Null when nothing has been scored — never 0, which reads as "all wrong". */
  hitRate: number | null;
  calibration: CalibrationRow[];
}

// The viewer's OWN record. Deliberately not computed for anybody else: a
// forward-looking accuracy figure attached to a named person is the raw material
// for an implied track record, which is a long way from what this product is.
// The group board shows what everybody CALLED and how it settled; how often you
// personally are right is yours.
export async function getStats(viewer: Viewer): Promise<NoteStats> {
  const rows = await db
    .select()
    .from(tradingNotes)
    .where(and(eq(tradingNotes.userId, viewer.id), eq(tradingNotes.kind, 'prediction')));

  const stats: NoteStats = {
    scored: 0,
    hits: 0,
    misses: 0,
    partial: 0,
    unsettleable: 0,
    open: 0,
    hitRate: null,
    calibration: [],
  };
  const buckets = new Map<number, { calls: number; hits: number }>();

  for (const r of rows) {
    if (r.outcome == null) {
      stats.open += 1;
      continue;
    }
    if (r.outcome === 'partial') {
      stats.partial += 1;
      continue;
    }
    if (r.outcome === 'unsettleable') {
      stats.unsettleable += 1;
      continue;
    }
    const hit = r.outcome === 'hit';
    stats.scored += 1;
    if (hit) stats.hits += 1;
    else stats.misses += 1;
    if (r.confidence != null && CONFIDENCE_STATED[r.confidence] != null) {
      const b = buckets.get(r.confidence) ?? { calls: 0, hits: 0 };
      b.calls += 1;
      if (hit) b.hits += 1;
      buckets.set(r.confidence, b);
    }
  }

  if (stats.scored > 0) stats.hitRate = (stats.hits / stats.scored) * 100;
  stats.calibration = [...buckets.entries()]
    .map(([level, b]) => ({ level, stated: CONFIDENCE_STATED[level], calls: b.calls, hits: b.hits }))
    .sort((a, b) => a.level - b.level);
  return stats;
}

// ---- Did you trade your own call? ----

export interface NoteTradeLink {
  noteId: string;
  trades: number;
  longs: number;
  shorts: number;
  /** Null when none of the matched trades has closed yet. */
  realizedPl: number | null;
  /** True when any matched trade ran against the direction that was called. */
  againstCall: boolean;
}

// What the trader actually did in the instrument they called, inside the window
// they called it for. This is the reading nothing else gives you: the gap
// between what somebody said and what they put money on.
//
// Self-only, and computed from the viewer's OWN positions. Whether a teammate
// backed their own call is a fair question and a separate decision — widening it
// would put one person's trade data on another person's screen through a route
// that is not the Live Wall's, so it stays closed until it is asked for.
export async function getTradeLinks(viewer: Viewer, notes: TradingNote[]): Promise<NoteTradeLink[]> {
  const mine = notes.filter(
    (n) => n.isMine && n.kind === 'prediction' && n.instrument && n.windowOpensAt != null && n.deadlineAt != null,
  );
  if (mine.length === 0) return [];

  const from = Math.min(...mine.map((n) => n.windowOpensAt!));
  const to = Math.max(...mine.map((n) => n.deadlineAt!));
  const rows = await db
    .select({
      instrument: tradingPositions.instrument,
      side: tradingPositions.side,
      realizedPl: tradingPositions.realizedPl,
      openedAt: tradingPositions.openedAt,
    })
    .from(tradingPositions)
    .where(
      and(
        eq(tradingPositions.userId, viewer.id),
        isNull(tradingPositions.deletedAt),
        gte(tradingPositions.openedAt, new Date(from)),
        lte(tradingPositions.openedAt, new Date(to)),
      ),
    );

  return mine.map((n) => {
    const key = normInstr(n.instrument!);
    const hit = rows.filter(
      (r) =>
        normInstr(r.instrument) === key &&
        r.openedAt != null &&
        r.openedAt.getTime() >= n.windowOpensAt! &&
        r.openedAt.getTime() <= n.deadlineAt!,
    );
    const longs = hit.filter((r) => r.side === 'long').length;
    const shorts = hit.length - longs;
    const closed = hit.filter((r) => r.realizedPl != null);
    return {
      noteId: n.id,
      trades: hit.length,
      longs,
      shorts,
      realizedPl: closed.length > 0 ? closed.reduce((a, r) => a + (r.realizedPl ?? 0), 0) : null,
      // "Called up and sold it" is the single most useful thing this can say, so
      // it is stated rather than left for the reader to work out from two counts.
      againstCall: n.direction === 'up' ? shorts > 0 : n.direction === 'down' ? longs > 0 : false,
    };
  });
}

// ---- Writing ----

export interface NoteInput {
  kind: NoteKind;
  title: string;
  body?: string | null;
  visibility?: NoteVisibility;
  instrument?: string | null;
  direction?: NoteDirection | null;
  targetPrice?: number | null;
  confidence?: number | null;
  weekKey?: string;
  windowOpensAt?: number | null;
  deadlineAt?: number | null;
}

export type NotePatch = Partial<NoteInput>;

function clean(s: string | null | undefined, max: number): string | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  return t.slice(0, max);
}

async function loadOwn(userId: string, id: string): Promise<TradingNoteRow> {
  const row = (
    await db
      .select()
      .from(tradingNotes)
      .where(and(eq(tradingNotes.id, id), eq(tradingNotes.userId, userId)))
      .limit(1)
  )[0];
  // 404-shaped rather than 403: an id the caller does not own must not be
  // distinguishable from one that does not exist, or it can be probed for.
  if (!row) throw new NoteError('Note not found.');
  return row;
}

export async function createNote(userId: string, input: NoteInput): Promise<TradingNote> {
  const now = Date.now();
  const title = clean(input.title, MAX_TITLE);
  if (!title) throw new NoteError('A note needs a title.');

  const weekKey = input.weekKey && isWeekKey(input.weekKey) ? input.weekKey : etWeekKey(new Date(now));

  const count = (
    await db
      .select({ n: sql<number>`count(*)` })
      .from(tradingNotes)
      .where(and(eq(tradingNotes.userId, userId), eq(tradingNotes.weekKey, weekKey)))
  )[0]?.n;
  if ((count ?? 0) >= MAX_PER_WEEK) throw new NoteError(`That is ${MAX_PER_WEEK} notes in one week already.`);

  const isPrediction = input.kind === 'prediction';
  const win = defaultWindow(weekKey);
  const windowOpensAt = isPrediction ? (input.windowOpensAt ?? win.opensAt) : null;
  const deadlineAt = isPrediction ? (input.deadlineAt ?? win.deadlineAt) : null;
  if (isPrediction && deadlineAt != null && windowOpensAt != null && deadlineAt <= windowOpensAt) {
    throw new NoteError('A prediction has to settle after its window opens.');
  }

  const confidence =
    input.confidence != null && input.confidence >= 1 && input.confidence <= 5
      ? Math.round(input.confidence)
      : null;

  const visibility: NoteVisibility = input.visibility === 'group' ? 'group' : 'private';

  const row: TradingNoteRow = {
    id: crypto.randomUUID(),
    userId,
    kind: isPrediction ? 'prediction' : 'observation',
    visibility,
    title,
    body: clean(input.body, MAX_BODY),
    instrument: clean(input.instrument, 40),
    direction: isPrediction ? (input.direction ?? null) : null,
    targetPrice: isPrediction && input.targetPrice != null ? input.targetPrice : null,
    confidence: isPrediction ? confidence : null,
    weekKey,
    windowOpensAt: windowOpensAt != null ? new Date(windowOpensAt) : null,
    deadlineAt: deadlineAt != null ? new Date(deadlineAt) : null,
    openPrice: null,
    // Sharing at creation locks immediately: it is out there, so it is a call.
    lockedAt: visibility === 'group' && isPrediction ? new Date(now) : null,
    outcome: null,
    settledAt: null,
    settledBy: null,
    settlePrice: null,
    settleNote: null,
    reflection: null,
    reflectedAt: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };

  await db.insert(tradingNotes).values(row);
  const names = await ownerNames([userId]);
  return toView(row, names.get(userId) ?? 'You', userId, now);
}

export async function updateNote(userId: string, id: string, patch: NotePatch): Promise<TradingNote> {
  const now = Date.now();
  const row = await loadOwn(userId, id);

  // Rule 1. Everything below this line is the call itself, and the call is what
  // must not change once it is out. The reflection has its own path.
  if (row.kind === 'prediction' && isLocked(row, now)) {
    throw new NoteError('This call is locked. You can still add a reflection to it.');
  }

  const next: Partial<TradingNoteRow> = { updatedAt: new Date(now) };
  if (patch.title !== undefined) {
    const t = clean(patch.title, MAX_TITLE);
    if (!t) throw new NoteError('A note needs a title.');
    next.title = t;
  }
  if (patch.body !== undefined) next.body = clean(patch.body, MAX_BODY);
  if (patch.instrument !== undefined) next.instrument = clean(patch.instrument, 40);
  if (patch.direction !== undefined && row.kind === 'prediction') next.direction = patch.direction ?? null;
  if (patch.targetPrice !== undefined && row.kind === 'prediction') next.targetPrice = patch.targetPrice ?? null;
  if (patch.confidence !== undefined && row.kind === 'prediction') {
    next.confidence =
      patch.confidence != null && patch.confidence >= 1 && patch.confidence <= 5
        ? Math.round(patch.confidence)
        : null;
  }
  if (patch.deadlineAt !== undefined && row.kind === 'prediction') {
    next.deadlineAt = patch.deadlineAt != null ? new Date(patch.deadlineAt) : null;
  }
  if (patch.windowOpensAt !== undefined && row.kind === 'prediction') {
    next.windowOpensAt = patch.windowOpensAt != null ? new Date(patch.windowOpensAt) : null;
  }

  await db.update(tradingNotes).set(next).where(eq(tradingNotes.id, id));
  const names = await ownerNames([userId]);
  return toView({ ...row, ...next } as TradingNoteRow, names.get(userId) ?? 'You', userId, now);
}

// Share with the group, or take it back off the board.
//
// Sharing a prediction LOCKS it, and taking it back does not unlock it: you can
// stop showing a call, but you cannot un-make one that other people have read.
export async function setVisibility(
  userId: string,
  id: string,
  visibility: NoteVisibility,
): Promise<TradingNote> {
  const now = Date.now();
  const row = await loadOwn(userId, id);
  const next: Partial<TradingNoteRow> = { visibility, updatedAt: new Date(now) };
  if (visibility === 'group' && row.kind === 'prediction' && row.lockedAt == null) {
    next.lockedAt = new Date(now);
  }
  await db.update(tradingNotes).set(next).where(eq(tradingNotes.id, id));
  const names = await ownerNames([userId]);
  return toView({ ...row, ...next } as TradingNoteRow, names.get(userId) ?? 'You', userId, now);
}

// Settle a call by hand. This is how a freeform prediction — one with no
// instrument and direction for the feed to grade — gets its verdict, and the
// only way `partial` is ever reached.
export async function settleNote(
  userId: string,
  id: string,
  outcome: NoteOutcome,
  reflection?: string | null,
): Promise<TradingNote> {
  const now = Date.now();
  const row = await loadOwn(userId, id);
  if (row.kind !== 'prediction') throw new NoteError('Only a prediction is settled.');
  // Settling twice would let a verdict be revised after the fact, which is the
  // same hole rule 1 closes on the call itself.
  if (row.outcome != null) throw new NoteError('That call is already settled.');

  const text = clean(reflection, MAX_REFLECTION);
  const next: Partial<TradingNoteRow> = {
    outcome,
    settledAt: new Date(now),
    settledBy: 'self',
    updatedAt: new Date(now),
    ...(text ? { reflection: text, reflectedAt: new Date(now) } : {}),
  };
  await db.update(tradingNotes).set(next).where(eq(tradingNotes.id, id));
  const names = await ownerNames([userId]);
  return toView({ ...row, ...next } as TradingNoteRow, names.get(userId) ?? 'You', userId, now);
}

// Write (or rewrite) the reflection. Deliberately the ONE thing that stays
// editable on a locked call: looking back at a call is a thing you do more than
// once, and nothing about the record depends on the reflection being fixed.
export async function reflectOnNote(userId: string, id: string, reflection: string): Promise<TradingNote> {
  const now = Date.now();
  const row = await loadOwn(userId, id);
  const text = clean(reflection, MAX_REFLECTION);
  const next: Partial<TradingNoteRow> = {
    reflection: text,
    reflectedAt: text ? new Date(now) : null,
    updatedAt: new Date(now),
  };
  await db.update(tradingNotes).set(next).where(eq(tradingNotes.id, id));
  const names = await ownerNames([userId]);
  return toView({ ...row, ...next } as TradingNoteRow, names.get(userId) ?? 'You', userId, now);
}

export async function removeNote(userId: string, id: string): Promise<void> {
  await loadOwn(userId, id);
  await db.delete(tradingNotes).where(and(eq(tradingNotes.id, id), eq(tradingNotes.userId, userId)));
}
