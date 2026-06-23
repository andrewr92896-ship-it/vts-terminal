import type { UserRow } from '../db/schema.js';
import { BROKER_META, brokerMeta } from './config.js';
import { fetchOandaTrades } from './brokers/oanda.js';
import { fetchKrakenPositions } from './brokers/kraken.js';
import { sampleLiveTrades } from './sample.js';
import { reconcile } from './history.js';
import {
  getActiveDecrypted,
  recordConnectionStatus,
  type DecryptedConnection,
  type KrakenCreds,
  type OandaCreds,
} from './connections.js';
import type { BrokerLiveResult, LiveTrade, LiveWall } from './types.js';

// Compute slippage once, centrally: the actual fill minus the planned/alert
// price. Null when there was no planned entry to compare to.
function withSlippage(trades: LiveTrade[]): LiveTrade[] {
  return trades.map((t) =>
    t.plannedEntry == null
      ? t
      : { ...t, slippage: Number((t.entryPrice - t.plannedEntry).toFixed(8)) },
  );
}

function newestFirst(a: LiveTrade, b: LiveTrade): number {
  return (b.openedAt ?? -Infinity) - (a.openedAt ?? -Infinity);
}

// Hide P/L (a balance detail) from anyone without the viewBrokerage grant.
function gateBalances(trades: LiveTrade[], canSeeBalances: boolean): LiveTrade[] {
  if (canSeeBalances) return trades;
  return trades.map((t) => ({ ...t, unrealizedPl: null }));
}

// Fetch open positions for a single broker connection. Never throws — a failed
// connection just reports ok:false so one bad connection can't blank the wall.
// Trade ids are re-keyed with the connection id so two accounts on the same
// broker can't collide.
async function loadConnection(
  c: DecryptedConnection,
): Promise<{ result: BrokerLiveResult; trades: LiveTrade[] }> {
  const meta = brokerMeta(c.broker);
  const base: BrokerLiveResult = {
    connectionId: c.id,
    broker: c.broker,
    name: c.label,
    platform: meta.platform,
    kind: meta.kind,
    configured: true,
    ok: false,
    error: null,
    count: 0,
  };

  try {
    let trades: LiveTrade[] = [];
    if (c.broker === 'oanda') {
      const cr = c.creds as OandaCreds;
      const apiBase =
        cr.env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
      trades = await fetchOandaTrades({ token: cr.token, accountId: cr.accountId, base: apiBase });
    } else {
      const cr = c.creds as KrakenCreds;
      trades = await fetchKrakenPositions({ apiKey: cr.apiKey, apiSecret: cr.apiSecret });
    }
    trades = trades.map((t) => ({ ...t, id: `${c.id}:${t.id}`, connectionId: c.id, brokerName: c.label }));
    return { result: { ...base, ok: true, count: trades.length }, trades };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Fetch failed';
    return { result: { ...base, ok: false, error }, trades: [] };
  }
}

export async function getLiveWall(user: UserRow): Promise<LiveWall> {
  const canSeeBalances = !!user.viewBrokerage;
  const generatedAt = Date.now();

  const conns = await getActiveDecrypted(user.id);

  // No connection yet → show the sample feed so the wall is never blank.
  if (conns.length === 0) {
    const trades = gateBalances(withSlippage(sampleLiveTrades(generatedAt)), canSeeBalances).sort(
      newestFirst,
    );
    const brokers: BrokerLiveResult[] = BROKER_META.map((m) => ({
      connectionId: `sample-${m.key}`,
      broker: m.key,
      name: m.name,
      platform: m.platform,
      kind: m.kind,
      configured: false,
      ok: false,
      error: 'No connection',
      count: trades.filter((t) => t.broker === m.key).length,
    }));
    return {
      source: 'sample',
      generatedAt,
      canSeeBalances,
      brokers,
      trades,
      note: 'Sample data — add a broker connection to stream your live positions.',
    };
  }

  // Pull every active connection in parallel and merge.
  const settled = await Promise.allSettled(conns.map((c) => loadConnection(c)));
  const brokers: BrokerLiveResult[] = [];
  let raw: LiveTrade[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      brokers.push(s.value.result);
      raw = raw.concat(s.value.trades);
    }
  }

  // Persist per-connection health (drives the status dots). Best-effort.
  await Promise.allSettled(brokers.map((b) => recordConnectionStatus(b.connectionId, b.ok, b.error)));

  // Reconcile open positions → History before gating P/L for display. Keyed by
  // the calling user (each trader owns their connections), using the ungated
  // broker P/L. The "responded" guard is per connection. Never let bookkeeping
  // blank the wall.
  const withSlip = withSlippage(raw);
  const okSources = new Set(brokers.filter((b) => b.ok).map((b) => b.connectionId));
  try {
    await reconcile(user.id, okSources, withSlip);
  } catch {
    /* ignore — the Live Wall must still render */
  }

  const trades = gateBalances(withSlip, canSeeBalances).sort(newestFirst);
  const failed = brokers.filter((b) => !b.ok);
  const note = failed.length > 0 ? `Couldn't reach: ${failed.map((b) => b.name).join(', ')}.` : null;

  return { source: 'live', generatedAt, canSeeBalances, brokers, trades, note };
}
