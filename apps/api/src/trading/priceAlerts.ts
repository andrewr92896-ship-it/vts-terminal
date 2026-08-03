import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  priceAlerts,
  type PriceAlertRow,
  type PriceAlertCondition,
  type PriceAlertRepeat,
  type PriceAlertSide,
} from '../db/schema.js';
import { fetchOandaPrices } from './brokers/oanda.js';
import { fetchCryptoPrices, isCryptoInstrument } from './brokers/crypto.js';
import { resolveOandaPricingConfig } from './priceSource.js';

// User-authored price alerts: "notify me when EUR/USD crosses 1.1000". Personal
// (owned by the creator, fired only to them), evaluated server-side by the
// price-alert watch. This module owns the data + the pure decision logic; the
// watch (priceAlertWatch.ts) owns the polling and delivery.

export interface PriceAlert {
  id: string;
  symbol: string; // TradingView form, e.g. "OANDA:EURUSD"
  condition: PriceAlertCondition;
  threshold: number;
  repeat: PriceAlertRepeat;
  note: string | null;
  active: boolean;
  lastSide: PriceAlertSide | null;
  lastPrice: number | null;
  lastFiredAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PriceAlertInput {
  symbol: string;
  condition: PriceAlertCondition;
  threshold: number;
  repeat?: PriceAlertRepeat;
  note?: string | null;
}

export interface PriceAlertPatch {
  symbol?: string;
  condition?: PriceAlertCondition;
  threshold?: number;
  repeat?: PriceAlertRepeat;
  note?: string | null;
  active?: boolean;
}

// A TradingView symbol reduced to the pricing/display instrument ("EUR/USD",
// "BTC/USDT") that fetchLivePrices expects. Strips an exchange prefix
// ("OANDA:EURUSD" → "EURUSD", "BINANCE:BTCUSDT" → "BTCUSDT"), then splits a bare
// pair on a trailing quote currency. Stablecoin quotes (USDT/USDC) are listed
// first so "BTCUSDT" splits before the plain "USD" rule. Pure and exported for
// unit testing.
const QUOTE_CURRENCIES = ['USDT', 'USDC', 'USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD'];
export function toPricingInstrument(symbol: string): string {
  let s = symbol.trim().toUpperCase().replace(/\s+/g, '');
  const colon = s.lastIndexOf(':');
  if (colon >= 0) s = s.slice(colon + 1); // drop "OANDA:", "FX:", etc.
  if (s.includes('_')) return s.replace('_', '/');
  if (s.includes('/')) return s;
  for (const q of QUOTE_CURRENCIES) {
    if (s.length > q.length && s.endsWith(q)) return `${s.slice(0, s.length - q.length)}/${q}`;
  }
  return s; // leave as-is; may simply not be priceable
}

// Which side of the threshold a price sits on.
export function sideOf(price: number, threshold: number): PriceAlertSide {
  return price >= threshold ? 'above' : 'below';
}

// Whether a rule fires given the previously-observed side and the new price. A
// rule fires only on a genuine directional CROSS through the threshold:
//   - `above`: was below, now at/above  → crossed up
//   - `below`: was above, now below     → crossed down
// A null prevSide (never observed / just created) never fires — the watch records
// the side first, so a level already passed at creation time stays quiet until it
// is crossed afresh. Pure and exported for unit testing.
export function shouldFire(
  prevSide: PriceAlertSide | null,
  price: number,
  alert: { condition: PriceAlertCondition; threshold: number },
): boolean {
  if (prevSide == null) return false;
  const cur = sideOf(price, alert.threshold);
  if (cur === prevSide) return false; // no cross this tick
  return cur === alert.condition;
}

function rowToPublic(row: PriceAlertRow): PriceAlert {
  return {
    id: row.id,
    symbol: row.symbol,
    condition: row.condition,
    threshold: row.threshold,
    repeat: row.repeat,
    note: row.note,
    active: row.active,
    lastSide: row.lastSide ?? null,
    lastPrice: row.lastPrice,
    lastFiredAt: row.lastFiredAt ? row.lastFiredAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function listPriceAlerts(userId: string): Promise<PriceAlert[]> {
  const rows = await db
    .select()
    .from(priceAlerts)
    .where(eq(priceAlerts.userId, userId))
    .orderBy(desc(priceAlerts.createdAt));
  return rows.map(rowToPublic);
}

// Look up the live mark for an instrument, distinguishing "no source at all"
// (return { sourced:false }) from "priced" / "source exists but symbol is
// unpriceable". Used to arm a new alert against the current price and to reject
// symbols we can't follow. Crypto has a keyless feed, so it's always sourced;
// forex/metals/indices need the install's own OANDA pricing account. A trader's
// personal connection is deliberately never used for this — see priceSource.ts.
async function markFor(pricingInstrument: string): Promise<{ sourced: boolean; price: number | null }> {
  if (isCryptoInstrument(pricingInstrument)) {
    const marks = await fetchCryptoPrices([pricingInstrument]);
    return { sourced: true, price: marks.get(pricingInstrument) ?? null };
  }
  const cfg = await resolveOandaPricingConfig();
  if (!cfg) return { sourced: false, price: null };
  const marks = await fetchOandaPrices(cfg, [pricingInstrument]).catch(() => new Map<string, number>());
  return { sourced: true, price: marks.get(pricingInstrument) ?? null };
}

export async function createPriceAlert(userId: string, input: PriceAlertInput): Promise<PriceAlert> {
  const symbol = input.symbol.trim().slice(0, 40);
  if (!symbol) throw new Error('A symbol is required');
  const threshold = input.threshold;
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Enter a price above 0');
  const note = input.note?.trim().slice(0, 120) || null;
  const repeat: PriceAlertRepeat = input.repeat === 'always' ? 'always' : 'once';

  // Arm against the current price so an alert created for a level price has
  // already passed doesn't fire on the very next tick. When no OANDA source is
  // configured we accept the rule and arm on the watch's first observation.
  const pricing = toPricingInstrument(symbol);
  const { sourced, price } = await markFor(pricing);
  if (sourced && price == null) {
    throw new Error(
      `We can't price "${symbol}" yet — price alerts support forex, metals, indices and major crypto.`,
    );
  }
  const lastSide: PriceAlertSide | null = price != null ? sideOf(price, threshold) : null;

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(priceAlerts).values({
    id,
    userId,
    symbol,
    condition: input.condition,
    threshold,
    repeat,
    note,
    active: true,
    lastSide,
    lastPrice: price,
    lastFiredAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const row = (await db.select().from(priceAlerts).where(eq(priceAlerts.id, id)).limit(1))[0];
  return rowToPublic(row);
}

export async function updatePriceAlert(
  userId: string,
  id: string,
  patch: PriceAlertPatch,
): Promise<PriceAlert> {
  const existing = (
    await db
      .select()
      .from(priceAlerts)
      .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Alert not found');

  const set: Partial<PriceAlertRow> = { updatedAt: new Date() };
  if (patch.symbol !== undefined) {
    const s = patch.symbol.trim().slice(0, 40);
    if (!s) throw new Error('A symbol is required');
    set.symbol = s;
  }
  if (patch.condition !== undefined) set.condition = patch.condition;
  if (patch.threshold !== undefined) {
    if (!Number.isFinite(patch.threshold) || patch.threshold <= 0) throw new Error('Enter a price above 0');
    set.threshold = patch.threshold;
  }
  if (patch.repeat !== undefined) set.repeat = patch.repeat;
  if (patch.note !== undefined) set.note = patch.note?.trim().slice(0, 120) || null;
  if (patch.active !== undefined) set.active = patch.active;

  // Any change to what the rule watches (symbol or level) re-arms it: clear the
  // observed side so it only fires on a fresh cross of the new target.
  const retargeted =
    (set.symbol !== undefined && set.symbol !== existing.symbol) ||
    (set.threshold !== undefined && set.threshold !== existing.threshold);
  if (retargeted) {
    set.lastSide = null;
    set.lastPrice = null;
  }

  await db
    .update(priceAlerts)
    .set(set)
    .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
  const row = (await db.select().from(priceAlerts).where(eq(priceAlerts.id, id)).limit(1))[0];
  return rowToPublic(row);
}

export async function deletePriceAlert(userId: string, id: string): Promise<void> {
  await db.delete(priceAlerts).where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
}

// Every active rule across the install — the watch inspects these each tick.
export async function activePriceAlerts(): Promise<PriceAlertRow[]> {
  return db.select().from(priceAlerts).where(eq(priceAlerts.active, true));
}
