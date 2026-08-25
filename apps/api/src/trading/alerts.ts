import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tradingAlerts,
  users,
  TRADE_SIDES,
  type AlertStatus,
  type TradeSide,
  type TradingAlertRow,
} from '../db/schema.js';
import { parseRoles } from '../auth/rbac.js';
import { addTrade } from './trades.js';
import { aiConfigured, analyzeTradeScreenshot, type AnalyzeResult } from '../ai/claude.js';
import { sendToTradingDesk } from '../notifications/push.js';
import { sendPushoverToDesk } from '../notifications/pushover.js';
import { scopedTraderIdsForUser } from './scope.js';

// TradingView alerts are the FTP/prop-trade replacement. The webhook is
// unauthenticated, so each alert is attributed to the owner (the earliest
// admin). The owner then pastes a screenshot and Claude analyzes it.

export interface AlertRecord {
  id: string;
  source: string;
  instrument: string | null;
  side: TradeSide | null;
  price: number | null;
  strategy: string | null;
  timeframe: string | null;
  message: string | null;
  status: AlertStatus;
  analysis: AnalyzeResult | null;
  analyzedAt: number | null;
  tradeId: string | null;
  receivedAt: number;
}

export interface AlertsData {
  alerts: AlertRecord[];
  aiConfigured: boolean;
}

function asSide(v: unknown): TradeSide | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if ((TRADE_SIDES as readonly string[]).includes(s)) return s as TradeSide;
  if (['buy', 'long', 'b'].includes(s)) return 'long';
  if (['sell', 'short', 's'].includes(s)) return 'short';
  return null;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// The owner who receives webhook alerts: the earliest-created admin.
export async function resolveOwnerId(): Promise<string | null> {
  const rows = await db.select().from(users);
  const admins = rows
    .filter((u) => u.active && parseRoles(u).includes('admin'))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return admins[0]?.id ?? null;
}

// Store an inbound TradingView alert. `body` is whatever the webhook received
// (an object from JSON, or { message } for a plain-text alert). Returns the new
// alert id, or null if there is no owner to attribute it to.
export async function ingestAlert(body: Record<string, unknown>, rawPayload: string): Promise<string | null> {
  const ownerId = await resolveOwnerId();
  if (!ownerId) return null;

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(tradingAlerts).values({
    id,
    userId: ownerId,
    source: 'tradingview',
    instrument: str(body.instrument ?? body.ticker ?? body.symbol, 40),
    side: asSide(body.side ?? body.action ?? body.order),
    price: asNum(body.price ?? body.close ?? body.entry),
    strategy: str(body.strategy ?? body.setup, 80),
    timeframe: str(body.timeframe ?? body.interval ?? body.tf, 16),
    message: str(body.message ?? body.comment ?? body.text, 2000),
    payload: rawPayload.slice(0, 8000),
    status: 'new',
    analysis: null,
    analyzedAt: null,
    tradeId: null,
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Buzz every subscribed trading phone that a fresh alert landed. Best-effort —
  // the webhook must return 200 fast and never fail on a push hiccup.
  const instrument = str(body.instrument ?? body.ticker ?? body.symbol, 40) ?? 'Alert';
  const side = asSide(body.side ?? body.action ?? body.order);
  const price = asNum(body.price ?? body.close ?? body.entry);
  const parts = [side ? side.toUpperCase() : null, price != null ? `@ ${price}` : null].filter(Boolean);
  const summary = parts.length ? parts.join(' ') : 'New TradingView alert';
  // Only the alert owner's team is notified — trade signals never fan out past it.
  //
  // Deliberately the UNFILTERED team set (scopedTraderIdsForUser, not
  // visibleTraderIds): an alert is a team-wide signal, not a report of anyone's
  // book, so a teammate running in private mode must still receive it. Private
  // mode hides what you are trading; it does not stop the desk talking to you.
  const teamIds = await scopedTraderIdsForUser(ownerId);
  // Alerts are a team-wide signal, not one trader's action, so they carry no
  // per-trader event and bypass the per-user event prefs.
  void sendToTradingDesk({
    title: `Alert · ${instrument}`,
    body: summary,
    url: '/?screen=alerts',
    tag: 'vts-alert',
  }, { category: 'alert', scopeIds: teamIds }).catch(() => {});
  void sendPushoverToDesk({
    title: `Alert · ${instrument}`,
    message: summary,
    priority: 1, // high — alerts are time-sensitive
    url: '/?screen=alerts',
    urlTitle: 'Open the desk',
  }, { category: 'alert', scopeIds: teamIds }).catch(() => {});

  return id;
}

function toRecord(row: TradingAlertRow): AlertRecord {
  let analysis: AnalyzeResult | null = null;
  if (row.analysis) {
    try {
      analysis = JSON.parse(row.analysis) as AnalyzeResult;
    } catch {
      analysis = null;
    }
  }
  return {
    id: row.id,
    source: row.source,
    instrument: row.instrument,
    side: (row.side as TradeSide | null) ?? null,
    price: row.price,
    strategy: row.strategy,
    timeframe: row.timeframe,
    message: row.message,
    status: row.status as AlertStatus,
    analysis,
    analyzedAt: row.analyzedAt ? row.analyzedAt.getTime() : null,
    tradeId: row.tradeId,
    receivedAt: row.receivedAt.getTime(),
  };
}

export async function getAlerts(ownerId: string): Promise<AlertsData> {
  const rows = await db
    .select()
    .from(tradingAlerts)
    .where(eq(tradingAlerts.userId, ownerId))
    .orderBy(desc(tradingAlerts.receivedAt));
  return { alerts: rows.map(toRecord), aiConfigured: aiConfigured() };
}

// A tiny desk-wide signal the trading clients poll so they can chime when a new
// TradingView alert arrives. Every inbound alert is attributed to the single
// owner, so the latest receivedAt across the whole table is the desk-wide
// latest. That is why a teammate who owns no alerts of their own still gets a
// real signal and hears the sound.
export interface AlertSignal {
  lastAlertAt: number | null;
  alertCount: number;
}

export async function getAlertSignal(): Promise<AlertSignal> {
  // Only inbound TradingView alerts drive the desk-wide chime. User-authored
  // price alerts (source 'price-alert') are personal — they buzz their own owner
  // and show in that owner's feed, but must not sound every terminal on the desk.
  const rows = await db
    .select({ receivedAt: tradingAlerts.receivedAt })
    .from(tradingAlerts)
    .where(eq(tradingAlerts.source, 'tradingview'))
    .orderBy(desc(tradingAlerts.receivedAt));
  return {
    lastAlertAt: rows[0]?.receivedAt ? rows[0].receivedAt.getTime() : null,
    alertCount: rows.length,
  };
}

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

// Analyze an alert's screenshot with Opus 4.8, store the result, and auto-create
// a Trade Log entry from the alert + analysis.
export async function analyzeAlert(
  ownerId: string,
  alertId: string,
  imageBase64: string,
  mediaType: ImageMediaType,
): Promise<AlertsData> {
  const row = (
    await db
      .select()
      .from(tradingAlerts)
      .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Alert not found');

  const result = await analyzeTradeScreenshot(imageBase64, mediaType, {
    instrument: row.instrument,
    side: row.side,
    price: row.price,
    strategy: row.strategy,
    timeframe: row.timeframe,
    message: row.message,
  });

  // Build a Trade Log entry: planned entry from the alert, fill/exit from the
  // analysis where Claude could read them.
  const p = result.parsed;
  const side: TradeSide = p && p.side !== 'unknown' ? p.side : (row.side as TradeSide | null) ?? 'long';
  const plannedEntry = row.price ?? p?.plannedEntry ?? null;
  const entryPrice = p?.actualFill ?? row.price ?? 0;
  const exitPrice = p?.exit ?? null;
  const tradeId = await addTrade(ownerId, {
    broker: 'ftp',
    instrument: row.instrument ?? p?.instrument ?? 'Unknown',
    side,
    status: exitPrice != null ? 'closed' : 'open',
    plannedEntry,
    entryPrice,
    exitPrice,
    strategy: row.strategy,
    timeframe: row.timeframe,
    notes: p?.summary ?? result.raw.slice(0, 1000),
    openedAt: row.receivedAt.getTime(),
  });

  await db
    .update(tradingAlerts)
    .set({
      status: 'analyzed',
      analysis: JSON.stringify(result),
      analyzedAt: new Date(),
      tradeId,
      updatedAt: new Date(),
    })
    .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)));

  return getAlerts(ownerId);
}

export async function dismissAlert(ownerId: string, alertId: string): Promise<AlertsData> {
  await db
    .update(tradingAlerts)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)));
  return getAlerts(ownerId);
}
