import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingPositions } from '../db/schema.js';
import { getAllActiveDecrypted, type ConnectionScope, type OandaCreds } from './connections.js';
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
//
// It is also the CORRECTOR for what reconcile recorded. Reconcile can only
// estimate how a trade ended: it stamps the last mark it polled before the
// position vanished from the feed, which is a bid/ask midpoint and so never a
// price that actually filled, plus the last open P/L it saw. The broker's own
// closed-trade record is authoritative, so where the two disagree the numbers
// below win.

function oandaBase(env: OandaCreds['env']): string {
  return env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
}

// Reconcile stores a position under the id the Live Wall gave it, and the desk
// loader namespaces that id by connection so two accounts on the same broker can
// never collide: `loadConnection` (service.ts) re-keys the `oanda:<tradeId>` that
// mapOandaTrades produced into `<connectionId>:oanda:<tradeId>`. The backfill
// writes that SAME key, so reconcile can match a backfilled row against the live
// feed, and so the trade id can be read back out of either writer's rows.
//
// The key is not by itself what dedupes the two writers: a trade id only means
// something against the OANDA ACCOUNT that issued it, and one account can sit
// behind more than one connection row. `differentAccount` below is the dedupe
// boundary; this is the storage shape.
//
// This used to build the un-namespaced `oanda:<tradeId>` — reading mapOandaTrades
// and missing the re-key one layer up — so it never matched a reconcile row and
// every trade the live poll had already captured got a second, phantom row.
// Migration 0077 merged and removed those, but keep the two key builders in step:
// if the Live Wall's keying changes, this must change with it.
function keyFor(connectionId: string, tradeId: string): string {
  return `${connectionId}:oanda:${tradeId}`;
}

// Which OANDA ACCOUNT a connection points at — the thing trade ids are actually
// numbered against. Two connection rows can name the same account (the usual way
// is reconnecting after a credential reset by ADDING a connection instead of
// editing the dead one), and when they do they carry the same trades under the
// same ids.
function accountKey(cr: OandaCreds): string {
  return `${cr.env}:${cr.accountId}`;
}

// Can we say, positively, that this stored row belongs to a DIFFERENT OANDA
// account than the one being imported?
//
// Only a row on a connection whose credentials we hold this pass can be
// attributed at all; an inactive, deleted or out-of-scope connection resolves to
// nothing. Unattributed means UNKNOWN, and unknown must dedupe — the alternative
// is importing a trade the desk already holds, which double-counts it in the
// trade count and the P/L.
//
// This used to compare the connection ROW id, which reads as the same test and
// is not: it treats every connection as its own account, so a second connection
// to one account re-imported that account's entire closed-trade page. That is
// what duplicated the desk's July trades after the 2026-08-02 credential reset,
// and migration 0113 cleaned them up. Erring the other way costs a backfilled
// row only when an owner runs two accounts whose trade ids collide AND one of
// those connections is no longer readable — a missing row, which the trader can
// see, rather than a phantom one, which scores.
function differentAccount(
  accounts: Map<string, string>,
  connectionId: string | null,
  account: string,
): boolean {
  if (!connectionId) return false;
  const other = accounts.get(connectionId);
  return other != null && other !== account;
}

const OANDA_KEY_PART = 'oanda:';

// The OANDA trade id inside a position key. Tolerates the legacy un-namespaced
// shape as well as the current one, so a row written before migration 0077 (or
// by an older build racing the deploy) still dedupes. Null when the key is not
// an OANDA position at all (kraken/manual/funded), which never matches here.
// Exported so the `db:verify-positions` check reads keys the same way this does.
export function oandaTradeId(key: string): string | null {
  const at = key.indexOf(OANDA_KEY_PART);
  if (at === -1) return null;
  return key.slice(at + OANDA_KEY_PART.length) || null;
}

// Prices and P/L are reals that round-trip through the DB, so compare them with
// the same small tolerance reconcile uses for stop/target moves rather than on
// exact equality — otherwise last-bit noise would rewrite every row every pass.
function sameNum(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 1e-9;
}

// Don't hammer OANDA on every desk read: a connection is re-pulled at most once
// per this window. The 500-trade page is the same each time until something
// closes, so a few minutes of staleness on old history costs nothing.
const BACKFILL_MIN_INTERVAL_MS = Math.max(60, Number(process.env.BACKFILL_INTERVAL_SECONDS) || 300) * 1000;
const lastRunByConn = new Map<string, number>();

// Ingest OANDA closed trades for the given scope into `tradingPositions`:
// inserting trades not already recorded, and correcting the fills of ones
// reconcile only estimated. Best-effort per connection — a broker error on one
// account never blocks the others or throws to the caller. Returns how many rows
// were written (inserted + corrected).
//
// The scope is required rather than defaulted: a viewer-facing read passes their
// team, and only the background pass says `ALL_USERS`. Each connection writes to
// its own owner's history either way, so the wide read surfaces nothing to
// anybody — but it decrypts every credential on the install, which is a thing to
// state rather than to inherit from an empty argument list.
export async function backfillClosedTrades(scope: ConnectionScope): Promise<number> {
  const conns = (await getAllActiveDecrypted(scope, { purpose: 'backfill' })).filter(
    (c) => c.broker === 'oanda',
  );
  if (conns.length === 0) return 0;

  // Every OANDA account we can attribute this pass, by connection row. Built
  // once, from the credentials already decrypted above, so establishing account
  // identity costs no extra decryption and no extra audit rows.
  const accounts = new Map<string, string>();
  for (const c of conns) {
    const cr = c.creds as OandaCreds;
    if (cr?.accountId) accounts.set(c.id, accountKey(cr));
  }

  const now = Date.now();
  let inserted = 0;
  let corrected = 0;
  for (const c of conns) {
    const last = lastRunByConn.get(c.id);
    if (last != null && now - last < BACKFILL_MIN_INTERVAL_MS) continue;
    lastRunByConn.set(c.id, now);
    try {
      const cr = c.creds as OandaCreds;
      const account = accountKey(cr);
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

      // Every row we already hold for this OANDA ACCOUNT (any status), indexed
      // by trade id, so we never insert a trade reconcile captured live.
      // Soft-deleted rows are indexed too: they must still block a re-import (a
      // trade the trader deleted never comes back), though they are never
      // corrected below.
      const existing = await db
        .select({
          id: tradingPositions.id,
          key: tradingPositions.key,
          connectionId: tradingPositions.connectionId,
          status: tradingPositions.status,
          entryPrice: tradingPositions.entryPrice,
          exitPrice: tradingPositions.exitPrice,
          realizedPl: tradingPositions.realizedPl,
          units: tradingPositions.units,
          closedAt: tradingPositions.closedAt,
          deletedAt: tradingPositions.deletedAt,
        })
        .from(tradingPositions)
        .where(eq(tradingPositions.userId, c.ownerId));
      const known = new Map<string, (typeof existing)[number]>();
      for (const r of existing) {
        if (differentAccount(accounts, r.connectionId, account)) continue;
        const tradeId = oandaTradeId(r.key);
        if (tradeId) known.set(tradeId, r);
      }

      // Replace reconcile's estimated exit with the broker's real one wherever
      // the two disagree. Only already-closed, live rows are touched: an open row
      // is left for reconcile to close so its "trade closed" push still fires,
      // and a deleted row stays deleted.
      for (const r of eligible) {
        const row = known.get(r.tradeId);
        if (!row || row.deletedAt != null || row.status !== 'closed') continue;
        const closedAtMs = row.closedAt ? row.closedAt.getTime() : null;
        const matches =
          sameNum(row.exitPrice, r.exitPrice) &&
          sameNum(row.realizedPl, r.realizedPl) &&
          sameNum(row.entryPrice, r.entryPrice) &&
          sameNum(row.units, r.units) &&
          closedAtMs === r.closeTimeMs;
        if (matches) continue;
        await db
          .update(tradingPositions)
          .set({
            entryPrice: r.entryPrice,
            exitPrice: r.exitPrice,
            realizedPl: r.realizedPl,
            // Size at open — reconcile stores whatever was left at the last poll,
            // which understates a position that was closed in parts.
            units: r.units,
            closedAt: new Date(r.closeTimeMs),
          })
          .where(eq(tradingPositions.id, row.id));
        corrected += 1;
      }

      const fresh = eligible.filter((r) => !known.has(r.tradeId));
      if (fresh.length === 0) continue;

      const stamp = new Date();
      await db.insert(tradingPositions).values(
        fresh.map((r) => ({
          id: crypto.randomUUID(),
          userId: c.ownerId,
          key: keyFor(c.id, r.tradeId),
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
  return inserted + corrected;
}
