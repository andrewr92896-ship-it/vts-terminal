import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingBoards, type TradingBoardRow } from '../db/schema.js';

// Per-user Live Wall "boards" — saved drag-resize grids of chart and watchlist
// tiles ("presets"). The whole arrangement lives in one JSON blob so the grid
// can grow new tile kinds/settings without a migration each time. The route
// validates the blob's shape (see boardLayoutSchema); this module just persists
// it and keeps the "exactly one default per user" rule.

// A tile on the board. Kept intentionally permissive — the client owns the
// chart/watchlist details; the server only needs the grid geometry to be sane.
export interface BoardTile {
  id: string;
  kind: 'chart' | 'watchlist' | 'positions' | 'news' | 'calendar' | 'alerts' | 'metrics';
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
