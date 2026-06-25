import type { UserRow } from '../db/schema.js';
import { BROKER_META, brokerMeta } from './config.js';
import { fetchOandaTrades } from './brokers/oanda.js';
import { fetchKrakenPositions } from './brokers/kraken.js';
import { getManualTrades } from './manual.js';
import { sampleLiveTrades } from './sample.js';
import { computeForex } from './forex.js';
import { reconcile } from './history.js';
import {
  getAllActiveDecrypted,
  recordConnectionStatus,
  type OwnedConnection,
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

// Optionally strip open P/L (an account balance) from the wall. The trading desk
// now shares balances team-wide, so callers pass canSeeBalances=true; the helper
// stays general in case a future surface needs to withhold them. The forex pip
// money (per-pip value and risk/reward) is position math, not an account
// balance, so it is never stripped; the client still respects the on-screen
// privacy and Hide-$ toggles.
function gateBalances(trades: LiveTrade[], canSeeBalances: boolean): LiveTrade[] {
  if (canSeeBalances) return trades;
  return trades.map((t) => ({ ...t, unrealizedPl: null }));
}

// Attach forex pip math to any currency-pair trades that do not already have it
// (the OANDA connector sets its own; the sample feed does not). Non-forex trades
// get forex: null.
function enrichForex(trades: LiveTrade[], accountCurrency: string): LiveTrade[] {
  return trades.map((t) => (t.forex !== undefined ? t : { ...t, forex: computeForex(t, accountCurrency) }));
}

// Manual positions are entered by hand on a funded account with no API, so they
// often have no live mark. When a manual trade is missing its current price,
// borrow the mark from another open position on the same instrument elsewhere on
// the desk (preferring a broker-streamed price over another hand-entered one) so
// its pip math and open P/L still compute against the same price the rest of the
// desk sees. Manual positions are assumed to be USD-account for the pip math.
function fillManualMarks(trades: LiveTrade[]): LiveTrade[] {
  const marks = new Map<string, { price: number; fromManual: boolean }>();
  for (const t of trades) {
    if (t.currentPrice == null) continue;
    const key = t.instrument.toUpperCase();
    const fromManual = t.broker === 'manual';
    const existing = marks.get(key);
    // Broker-streamed marks win over hand-entered ones for the same instrument.
    if (!existing || (existing.fromManual && !fromManual)) {
      marks.set(key, { price: t.currentPrice, fromManual });
    }
  }
  return trades.map((t) => {
    if (t.broker !== 'manual' || t.currentPrice != null) return t;
    const mark = marks.get(t.instrument.toUpperCase());
    if (!mark) return t;
    const filled: LiveTrade = { ...t, currentPrice: mark.price };
    const forex = computeForex(filled, 'USD');
    filled.forex = forex;
    // Derive open P/L from the pip math once we have a mark (forex pairs only;
    // other instruments keep a null P/L rather than guess a contract size).
    filled.unrealizedPl =
      forex && forex.pipsOpen != null && forex.moneyPerPip != null
        ? Number((forex.pipsOpen * forex.moneyPerPip).toFixed(2))
        : t.unrealizedPl;
    return filled;
  });
}

// Fetch open positions for a single broker connection. Never throws — a failed
// connection just reports ok:false so one bad connection can't blank the wall.
// Trade ids are re-keyed with the connection id so two accounts on the same
// broker can't collide.
async function loadConnection(
  c: OwnedConnection,
): Promise<{ result: BrokerLiveResult; trades: LiveTrade[] }> {
  const meta = brokerMeta(c.broker);
  const base: BrokerLiveResult = {
    connectionId: c.id,
    ownerId: c.ownerId,
    owner: c.owner,
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
    } else if (c.broker === 'manual') {
      trades = await getManualTrades(c.id);
    } else {
      const cr = c.creds as KrakenCreds;
      trades = await fetchKrakenPositions({ apiKey: cr.apiKey, apiSecret: cr.apiSecret });
    }
    trades = trades.map((t) => ({
      ...t,
      id: `${c.id}:${t.id}`,
      connectionId: c.id,
      brokerName: c.label,
      ownerId: c.ownerId,
      owner: c.owner,
    }));
    return { result: { ...base, ok: true, count: trades.length }, trades };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Fetch failed';
    return { result: { ...base, ok: false, error }, trades: [] };
  }
}

export async function getLiveWall(user: UserRow): Promise<LiveWall> {
  // The trading desk is a shared team: anyone reaching this route already holds
  // a trading role (the workspace guard enforces it), so balances are open to
  // them in full — no separate viewBrokerage grant required.
  const canSeeBalances = true;
  const generatedAt = Date.now();

  // Every active connection across the trading team — not just this user's — so
  // the wall shows the whole desk's open positions, each tagged with its owner.
  const conns = await getAllActiveDecrypted();

  // No connection anywhere on the desk → show the sample feed so the wall is
  // never blank. The sample is attributed to the viewer.
  if (conns.length === 0) {
    const sample = sampleLiveTrades(generatedAt).map((t) => ({
      ...t,
      ownerId: user.id,
      owner: user.username,
    }));
    const trades = gateBalances(enrichForex(withSlippage(sample), 'USD'), canSeeBalances).sort(newestFirst);
    const brokers: BrokerLiveResult[] = BROKER_META.map((m) => ({
      connectionId: `sample-${m.key}`,
      ownerId: user.id,
      owner: user.username,
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
      note: 'Sample data — add a broker connection to stream the desk’s live positions.',
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

  // Backfill missing marks on hand-entered manual positions from the rest of the
  // desk's open trades, so their P/L and pip math render like any other.
  raw = fillManualMarks(raw);

  // Reconcile open positions → History before display, keyed per owner so each
  // teammate's positions feed their own History (not the viewer's). The
  // "responded" guard is per connection. Never let bookkeeping blank the wall.
  const withSlip = withSlippage(raw);
  const connOwner = new Map(conns.map((c) => [c.id, c.ownerId]));
  const okByOwner = new Map<string, Set<string>>();
  for (const b of brokers) {
    if (!b.ok) continue;
    const ownerId = connOwner.get(b.connectionId);
    if (!ownerId) continue;
    const set = okByOwner.get(ownerId) ?? new Set<string>();
    set.add(b.connectionId);
    okByOwner.set(ownerId, set);
  }
  // Every owner with an active connection this cycle (so vanished positions are
  // closed even when an owner currently has zero open trades).
  for (const ownerId of new Set(conns.map((c) => c.ownerId))) {
    const ownerTrades = withSlip.filter((t) => t.ownerId === ownerId);
    try {
      await reconcile(ownerId, okByOwner.get(ownerId) ?? new Set<string>(), ownerTrades);
    } catch {
      /* ignore — the Live Wall must still render */
    }
  }

  const trades = gateBalances(withSlip, canSeeBalances).sort(newestFirst);
  const failed = brokers.filter((b) => !b.ok);
  const note = failed.length > 0 ? `Couldn't reach: ${failed.map((b) => b.name).join(', ')}.` : null;

  return { source: 'live', generatedAt, canSeeBalances, brokers, trades, note };
}
