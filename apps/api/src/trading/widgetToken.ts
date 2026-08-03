import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { widgetTokens, users, type UserRow } from '../db/schema.js';
import { getLiveWall } from './service.js';

// Read-only widget access tokens. Mirrors auth/sessions.ts: the raw token is
// shown to the user once, and only its SHA-256 hash is stored, so a DB leak
// can't be replayed. A token authenticates the mobile/home-screen widget's
// GET /api/widget/positions and nothing else — it can read the owner's own Live
// Wall (their team's open positions) but never touches broker keys or any write.

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// An owner's short handle: the part of their username/email before the "@"
// domain, so "dale@vitalis.com" -> "dale". Mirrors ownerHandle in the web
// TradeCard so a widget's parameter can be typed as the handle a user sees on
// the wall.
export function ownerHandle(owner: string): string {
  return owner.split('@')[0] || owner;
}

export interface WidgetTokenStatus {
  exists: boolean;
  createdAt: number | null;
  lastUsedAt: number | null;
}

export async function getWidgetTokenStatus(userId: string): Promise<WidgetTokenStatus> {
  const row = (
    await db.select().from(widgetTokens).where(eq(widgetTokens.userId, userId)).limit(1)
  )[0];
  if (!row) return { exists: false, createdAt: null, lastUsedAt: null };
  return {
    exists: true,
    createdAt: row.createdAt.getTime(),
    lastUsedAt: row.lastUsedAt?.getTime() ?? null,
  };
}

// Generate (or regenerate) a user's widget token, returning the raw token once.
// One row per user — regenerating replaces the stored hash, instantly killing
// any widget still holding the old token.
export async function issueWidgetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  await db
    .insert(widgetTokens)
    .values({ id: hashToken(token), userId, createdAt: now, lastUsedAt: null })
    .onConflictDoUpdate({
      target: widgetTokens.userId,
      set: { id: hashToken(token), createdAt: now, lastUsedAt: null },
    });
  return token;
}

export async function revokeWidgetToken(userId: string): Promise<void> {
  await db.delete(widgetTokens).where(eq(widgetTokens.userId, userId));
}

// Resolve a raw bearer token to its active user, or null. Touches last-used
// without blocking the request. Deactivated users are rejected.
export async function resolveWidgetToken(token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const id = hashToken(token);
  const row = (await db.select().from(widgetTokens).where(eq(widgetTokens.id, id)).limit(1))[0];
  if (!row) return null;
  const user = (await db.select().from(users).where(eq(users.id, row.userId)).limit(1))[0];
  if (!user || !user.active) return null;
  void db.update(widgetTokens).set({ lastUsedAt: new Date() }).where(eq(widgetTokens.id, id));
  return user;
}

// ---- Compact positions payload for the widget ----
// A slimmed, display-only projection of a LiveTrade — exactly the fields the
// home-screen card renders (matching the web TradeCard). No connection ids,
// broker credentials, or write handles ever leave here.
export interface WidgetPosition {
  id: string;
  instrument: string;
  side: 'long' | 'short';
  units: number;
  owner: string; // short handle
  isSelf: boolean; // this position is on the token owner's own account
  broker: string; // broker key (oanda / kraken / manual / ftp / …)
  brokerName: string;
  plannedEntry: number | null;
  entryPrice: number;
  mark: number | null; // latest price
  takeProfit: number | null;
  stopLoss: number | null;
  trailingStopLoss: number | null;
  slippage: number | null;
  unrealizedPl: number | null;
  openedAt: number | null;
  forex: {
    accountCurrency: string;
    moneyPerPip: number | null;
    pipsOpen: number | null;
    riskPips: number | null;
    riskMoney: number | null;
    rewardPips: number | null;
    rewardMoney: number | null;
    rr: number | null;
  } | null;
}

export interface WidgetPositionsPayload {
  generatedAt: number;
  // Mirrors the Live Wall's own three states (see trading/types.ts). It matters
  // more here, not less: a home-screen widget is read at a glance with no
  // surrounding screen to qualify it, so it must be able to say "your broker is
  // not being read" rather than quietly showing a sample book as if it were the
  // trader's own open positions.
  source: 'live' | 'sample' | 'unavailable';
  owner: string | null; // the filtered owner handle, or null for the whole team
  note: string | null;
  people: string[]; // distinct owner handles present, so a widget can list them
  positions: WidgetPosition[];
}

// Build the widget payload for `user`, optionally filtered to a single teammate
// by handle. Scoping is inherited from getLiveWall (the viewer only ever sees
// their own team's positions), so an `owner` filter can never reach outside it.
export async function buildWidgetPositions(
  user: UserRow,
  ownerFilter?: string | null,
): Promise<WidgetPositionsPayload> {
  const wall = await getLiveWall(user);
  const want = ownerFilter?.trim().toLowerCase() || null;
  const people = Array.from(new Set(wall.trades.map((t) => ownerHandle(t.owner)))).sort();
  const trades = want
    ? wall.trades.filter(
        (t) => ownerHandle(t.owner).toLowerCase() === want || t.owner.toLowerCase() === want,
      )
    : wall.trades;
  const positions: WidgetPosition[] = trades.map((t) => ({
    id: t.id,
    instrument: t.instrument,
    side: t.side,
    units: t.units,
    owner: ownerHandle(t.owner),
    isSelf: t.ownerId === user.id,
    broker: t.broker,
    brokerName: t.brokerName,
    plannedEntry: t.plannedEntry,
    entryPrice: t.entryPrice,
    mark: t.currentPrice,
    takeProfit: t.takeProfit,
    stopLoss: t.stopLoss,
    trailingStopLoss: t.trailingStopLoss,
    slippage: t.slippage,
    unrealizedPl: t.unrealizedPl,
    openedAt: t.openedAt,
    forex: t.forex
      ? {
          accountCurrency: t.forex.accountCurrency,
          moneyPerPip: t.forex.moneyPerPip,
          pipsOpen: t.forex.pipsOpen,
          riskPips: t.forex.risk?.pips ?? null,
          riskMoney: t.forex.risk?.money ?? null,
          rewardPips: t.forex.reward?.pips ?? null,
          rewardMoney: t.forex.reward?.money ?? null,
          rr: t.forex.rr,
        }
      : null,
  }));
  return { generatedAt: wall.generatedAt, source: wall.source, owner: want, note: wall.note, people, positions };
}
