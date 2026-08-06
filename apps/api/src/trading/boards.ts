import crypto from 'node:crypto';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingBoards, users, type TradingBoardRow } from '../db/schema.js';
import type { BoardTileKind } from './boardTiles.js';

// Per-user Live Wall "boards" — saved drag-resize grids of chart and watchlist
// tiles ("presets"). The whole arrangement lives in one JSON blob so the grid
// can grow new tile kinds/settings without a migration each time. The route
// validates the blob's shape (see boardLayoutSchema); this module just persists
// it and keeps the "exactly one default per user" rule.

// A tile on the board. Kept intentionally permissive — the client owns the
// chart/watchlist details; the server only needs the grid geometry to be sane.
export interface BoardTile {
  id: string;
  // The kind list (and which kinds are gated) lives in boardTiles.ts.
  kind: BoardTileKind;
  x: number;
  y: number;
  w: number;
  h: number;
  // Chart tiles
  symbol?: string; // TradingView symbol, e.g. "OANDA:EURUSD"
  interval?: string; // TradingView interval, e.g. "15", "60", "D"
  style?: string; // candle style code (1 = candles, 8 = Heikin Ashi, …)
  studies?: string[]; // indicator ids, e.g. "RSI@tv-basicstudies"
  // Watchlist tiles
  symbols?: string[];
  title?: string;
  // 'scroll' (the auto-scrolling ticker tape, default) or 'static' (a stationary
  // quote list with every symbol visible at once).
  watchlistMode?: 'scroll' | 'static';
  // Positions tiles — 'list' (compact default) or 'cards' (full trading cards);
  // the '-expand' variants grow the tile vertically to fit every trade (no inner
  // scroll) instead of scrolling inside a fixed-height cell.
  positionsView?: 'list' | 'cards' | 'list-expand' | 'cards-expand';
  // News tiles — which topic subfeed to show ('all' or a NEWS_FEEDS key).
  newsFeed?: string;
  // News & Calendar tiles — lowest impact shown ('all' | 'medhigh' | 'high').
  minImpact?: 'all' | 'medhigh' | 'high';
  // Alerts tiles — which TradingView alerts to show ('active' | 'new').
  alertsFilter?: 'active' | 'new';
  // Market Data tiles — the series ids shown, in order.
  seriesIds?: string[];
  // Live-stream tiles — which channel to play, by catalog key.
  channelKey?: string;
  // Notes tiles — the scratchpad text, saved with the board.
  noteText?: string;
  // Study tiles — which study game / flashcard set to report on.
  deckId?: string;
  // Funded tiles — which funded account to report on.
  accountId?: string;
  // Clock tiles — extra IANA zones shown beside the market sessions.
  clockZones?: string[];
  // Feed-shaped tiles — how many rows before the tile scrolls.
  limit?: number;
  // To Do tiles — which section to show.
  todoSectionId?: string;
  // Trade History / closed-trade tiles — the window scored.
  range?: '7d' | '30d' | '90d' | 'all';
}

export interface BoardLayout {
  tiles: BoardTile[];
}

export interface TradingBoard {
  id: string;
  name: string;
  layout: BoardLayout;
  isDefault: boolean;
  updatedAt: number;
  /** Published to this team, or null when private. */
  sharedTeamId: string | null;
  /** Who published it. Set only on a teammate's board, for the picker. */
  sharedBy?: string;
}

export interface BoardInput {
  name?: string;
  layout?: BoardLayout;
  isDefault?: boolean;
}

const EMPTY_LAYOUT: BoardLayout = { tiles: [] };

// Parse the stored JSON defensively — a malformed blob should degrade to an
// empty board, never crash a read of the whole list.
function parseLayout(raw: string): BoardLayout {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && Array.isArray((v as BoardLayout).tiles)) {
      return v as BoardLayout;
    }
  } catch {
    // fall through
  }
  return EMPTY_LAYOUT;
}

function toBoard(row: TradingBoardRow): TradingBoard {
  return {
    id: row.id,
    name: row.name,
    layout: parseLayout(row.layout),
    isDefault: row.isDefault,
    updatedAt: row.updatedAt.getTime(),
    sharedTeamId: row.sharedTeamId ?? null,
  };
}

// A layout with everything personal taken out of it, for publishing to a team.
//
// A board is almost entirely arrangement — which tiles, where, and how each is
// configured — and none of that is private: the figures a tile shows are fetched
// by whoever is READING it, so a teammate opening a shared board sees their own
// net worth and their own trades.
//
// The notes tile is the exception, and the reason this function exists. Its text
// lives in the layout blob rather than in a table of its own, so publishing a
// board verbatim would publish the author's scratchpad along with it. The tile
// is kept (the arrangement is the point) and emptied.
function shareableLayout(layout: BoardLayout): BoardLayout {
  return {
    tiles: layout.tiles.map((t) => (t.kind === 'notes' ? { ...t, noteText: '' } : t)),
  };
}

export async function listBoards(userId: string): Promise<TradingBoard[]> {
  const rows = await db
    .select()
    .from(tradingBoards)
    .where(eq(tradingBoards.userId, userId))
    .orderBy(asc(tradingBoards.createdAt));
  return rows.map(toBoard);
}

// Ensure only `keepId` carries the default flag for this user.
async function clearOtherDefaults(userId: string, keepId: string): Promise<void> {
  const rows = await db
    .select({ id: tradingBoards.id })
    .from(tradingBoards)
    .where(and(eq(tradingBoards.userId, userId), eq(tradingBoards.isDefault, true)));
  for (const r of rows) {
    if (r.id !== keepId) {
      await db.update(tradingBoards).set({ isDefault: false }).where(eq(tradingBoards.id, r.id));
    }
  }
}

export async function createBoard(userId: string, input: BoardInput): Promise<TradingBoard> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('A name is required');
  // The very first board a user saves becomes their default automatically.
  const existing = await db.select({ id: tradingBoards.id }).from(tradingBoards).where(eq(tradingBoards.userId, userId));
  const makeDefault = input.isDefault ?? existing.length === 0;
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(tradingBoards).values({
    id,
    userId,
    name: name.slice(0, 80),
    layout: JSON.stringify(input.layout ?? EMPTY_LAYOUT),
    isDefault: makeDefault,
    createdAt: now,
    updatedAt: now,
  });
  if (makeDefault) await clearOtherDefaults(userId, id);
  const [row] = await db.select().from(tradingBoards).where(eq(tradingBoards.id, id));
  return toBoard(row);
}

export async function updateBoard(userId: string, id: string, input: BoardInput): Promise<TradingBoard> {
  const patch: Partial<typeof tradingBoards.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('A name is required');
    patch.name = n.slice(0, 80);
  }
  if (input.layout !== undefined) patch.layout = JSON.stringify(input.layout);
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
  await db.update(tradingBoards).set(patch).where(and(eq(tradingBoards.id, id), eq(tradingBoards.userId, userId)));
  if (input.isDefault === true) await clearOtherDefaults(userId, id);
  const [row] = await db
    .select()
    .from(tradingBoards)
    .where(and(eq(tradingBoards.id, id), eq(tradingBoards.userId, userId)));
  if (!row) throw new Error('Board not found');
  return toBoard(row);
}

// The layouts this user's teammates have published.
//
// Deliberately excludes the reader's own — those are already in their list, and
// showing a board twice under two headings is how somebody ends up editing the
// copy they did not mean to.
export async function listTeamBoards(userId: string, teamId: string | null): Promise<TradingBoard[]> {
  if (!teamId) return [];
  const rows = await db
    .select({ board: tradingBoards, author: users.displayName, username: users.username })
    .from(tradingBoards)
    .innerJoin(users, eq(users.id, tradingBoards.userId))
    .where(and(eq(tradingBoards.sharedTeamId, teamId), ne(tradingBoards.userId, userId)))
    .orderBy(asc(tradingBoards.name));
  return rows.map((r) => ({
    ...toBoard(r.board),
    // A shared board is never the reader's default — that flag belongs to the
    // author's own list and means nothing here.
    isDefault: false,
    sharedBy: r.author || r.username,
  }));
}

// Publish this board to the caller's team, or take it back.
//
// **One shared board per person**, enforced by unsharing their others: the
// picker is a menu, and a five-person team each publishing four layouts turns it
// into a directory. One each keeps it a short, useful list and needs no new
// permission concept — anyone on the team may publish, because an arrangement
// carries no data and the cap is what bounds the clutter.
export async function shareBoard(
  userId: string,
  id: string,
  teamId: string | null,
  shared: boolean,
): Promise<void> {
  const [row] = await db
    .select()
    .from(tradingBoards)
    .where(and(eq(tradingBoards.id, id), eq(tradingBoards.userId, userId)));
  if (!row) throw new Error('Board not found');
  if (!shared) {
    await db.update(tradingBoards).set({ sharedTeamId: null }).where(eq(tradingBoards.id, id));
    return;
  }
  if (!teamId) throw new Error('You are not on a team yet');
  // Strip the author's notes before it becomes visible to anyone else.
  await db
    .update(tradingBoards)
    .set({ sharedTeamId: null })
    .where(and(eq(tradingBoards.userId, userId), eq(tradingBoards.sharedTeamId, teamId)));
  await db
    .update(tradingBoards)
    .set({ sharedTeamId: teamId, layout: JSON.stringify(shareableLayout(parseLayout(row.layout))) })
    .where(eq(tradingBoards.id, id));
}

// Take a copy of a teammate's published layout into your own boards.
//
// A copy rather than a reference, deliberately: once it is yours you rearrange
// it freely, and the author editing theirs afterwards does not reach into your
// board. It is the same reason "Save as new" exists.
export async function copyTeamBoard(
  userId: string,
  teamId: string | null,
  sourceId: string,
): Promise<TradingBoard> {
  if (!teamId) throw new Error('You are not on a team yet');
  const [row] = await db
    .select()
    .from(tradingBoards)
    .where(and(eq(tradingBoards.id, sourceId), eq(tradingBoards.sharedTeamId, teamId)));
  // Scoped on the team, so a board id from another desk cannot be copied by
  // guessing it — the row simply does not match.
  if (!row) throw new Error('That layout is not shared with your team');
  return createBoard(userId, {
    name: row.name.slice(0, 70),
    layout: shareableLayout(parseLayout(row.layout)),
  });
}

export async function removeBoard(userId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(tradingBoards)
    .where(and(eq(tradingBoards.id, id), eq(tradingBoards.userId, userId)));
  if (!row) return;
  await db.delete(tradingBoards).where(and(eq(tradingBoards.id, id), eq(tradingBoards.userId, userId)));
  // If we removed the default, promote the oldest remaining board so the user
  // always lands on a board next time.
  if (row.isDefault) {
    const [next] = await db
      .select({ id: tradingBoards.id })
      .from(tradingBoards)
      .where(eq(tradingBoards.userId, userId))
      .orderBy(asc(tradingBoards.createdAt))
      .limit(1);
    if (next) await db.update(tradingBoards).set({ isDefault: true }).where(eq(tradingBoards.id, next.id));
  }
}
