import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingPositions } from '../db/schema.js';
import { getAllActiveDecrypted, type OandaCreds } from './connections.js';
import { fetchOandaClosedTradeRows } from './brokers/oanda.js';

// Why this exists:
// -----------------
// The Trade Log / History are built entirely from `tradingPositions`, which is
// written only by the Live Wall reconcile (history.ts): a trade is recorded
// when a live poll sees it OPEN, and marked closed when it later vanishes from
// the feed. That means a trade only ever lands in the desk history if the
// poller happened to be watching while it was open. Trades that opened and
// closed between polls — or entirely while nobody had the Live Wall open and
// the background desk-watch wasn't running (it's prod-only and gated on push
// being configured) — are never captured, even though OANDA has them on record.
//
// This module closes that gap by ingesting OANDA's authoritative closed-trade
// history (up to its 500-trade page) directly into `tradingPositions`, deduped
// against whatever reconcile already captured. It writes rows straight to the
// closed state, so it never fires the open/close push notifications reconcile
// does — a backfill must not buzz phones about trades from days ago.

function oandaBase(env: OandaCreds['env']): string {
  return env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
}

// Reconcile keys an OANDA position as `oanda:<tradeId>` (see mapOandaTrades), so
// a backfilled closed trade using the same key dedups naturally against a row
// reconcile may already hold for that trade — whether it's still open or already
// closed. Keeping the key identical is what makes the two writers safe to mix.
function keyFor(tradeId: string): string {
  return `oanda:${tradeId}`;
}

// Don't hammer OANDA on every desk read: a connection is re-pulled at most once
// per this window. The 500-trade page is the same each time until something
// closes, so a few minutes of staleness on old history costs nothing.
const BACKFILL_MIN_INTERVAL_MS = Math.max(60, Number(process.env.BACKFILL_INTERVAL_SECONDS) || 300) * 1000;
const lastRunByConn = new Map<string, number>();

// Ingest OANDA closed trades for the given team scope (or the whole install when
// omitted) into `tradingPositions`, inserting only trades not already recorded.
// Best-effort per connection: a broker error on one account never blocks the
// others or throws to the caller. Returns how many new rows were inserted.
export async function backfillClosedTrades(scopeIds?: Set<string>): Promise<number> {
  const conns = (await getAllActiveDecrypted(scopeIds)).filter((c) => c.broker === 'oanda');
  if (conns.length === 0) return 0;

  const now = Date.now();
  let inserted = 0;
  for (const c of conns) {
    const last = lastRunByConn.get(c.id);
    if (last != null && now - last < BACKFILL_MIN_INTERVAL_MS) continue;
    lastRunByConn.set(c.id, now);
    try {
      const cr = c.creds as OandaCreds;
      const cfg = { token: cr.token, accountId: cr.accountId, base: oandaBase(cr.env) };
      const rows = await fetchOandaClosedTradeRows(cfg);
      if (rows.length === 0) continue;

      // Honour the connection's "count trades since" cutoff: a trade that opened
      // before it belongs to an earlier phase the trader has excluded, so it must
      // never be imported (otherwise deleting it just lets a later pass re-add it).
      const cutoff = c.historyStartAt;
      const eligible =
        cutoff == null ? rows : rows.filter((r) => (r.openedAtMs ?? r.closeTimeMs) >= cutoff);
      if (eligible.length === 0) continue;

      // Every key we already hold for this owner (any status), so we skip trades
      // reconcile captured live and never insert the same trade twice.
      const existing = await db
        .select({ key: tradingPositions.key })
        .from(tradingPositions)
        .where(eq(tradingPositions.userId, c.ownerId));
      const known = new Set(existing.map((r) => r.key));

      const fresh = eligible.filter((r) => !known.has(keyFor(r.tradeId)));
      if (fresh.length === 0) continue;

      const stamp = new Date();
      await db.insert(tradingPositions).values(
        fresh.map((r) => ({
          id: crypto.randomUUID(),
          userId: c.ownerId,
          key: keyFor(r.tradeId),
          connectionId: c.id,
          broker: 'oanda',
          instrument: r.instrument,
          side: r.side,
          units: r.units,
          plannedEntry: null,
          entryPrice: r.entryPrice,
          takeProfit: null,
          stopLoss: null,
          trailingStopLoss: null,
          currentPrice: null,
          unrealizedPl: null,
          exitPrice: r.exitPrice,
          realizedPl: r.realizedPl,
          strategy: null,
          timeframe: null,
          status: 'closed' as const,
          openedAt: r.openedAtMs != null ? new Date(r.openedAtMs) : null,
          // A backfilled trade was never "seen live", so anchor its bookkeeping
          // timestamps to when it actually closed rather than now.
          firstSeenAt: new Date(r.closeTimeMs),
          lastSeenAt: stamp,
          closedAt: new Date(r.closeTimeMs),
        })),
      );
      inserted += fresh.length;
    } catch {
      // Broker/network/parse failure on this account — leave it for the next
      // pass. Roll its throttle back so a transient error retries promptly.
      lastRunByConn.delete(c.id);
    }
  }
  return inserted;
}
