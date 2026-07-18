import type { UserRow } from '../db/schema.js';
import { BROKER_META, brokerMeta } from './config.js';
import { fetchOandaTrades, fetchOandaPrices } from './brokers/oanda.js';
import { fetchKrakenPositions } from './brokers/kraken.js';
import { getManualTrades } from './manual.js';
import { getDeskFundedOpenPositions } from './funded.js';
import { scopedTraderIds } from './scope.js';
import { sampleLiveTrades } from './sample.js';
import { computeForex, forexPair } from './forex.js';
import { reconcile } from './history.js';
import {
  getAllActiveDecrypted,
  recordConnectionStatus,
  type OwnedConnection,
  type KrakenCreds,
  type OandaCreds,
} from './connections.js';
import { isDemoUser } from '../demo/identity.js';
import { getDeskSettings } from './settings.js';
import { designationsFor } from '../badges/designations.js';
import { pushConfigured } from '../notifications/push.js';
import { pushoverConfigured } from '../notifications/pushover.js';
import { config } from '../config.js';
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

// Tag each position with its owner's designation (Chief Strategist / Chief
// Analyst), when they hold one, so the wall can colour it. Mutates in place and
// returns the same array for chaining.
async function withDesignations(trades: LiveTrade[]): Promise<LiveTrade[]> {
  const designations = await designationsFor(trades.map((t) => t.ownerId));
  for (const t of trades) t.designation = designations.get(t.ownerId) ?? null;
  return trades;
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

// Normalize an instrument symbol for matching across notations ("EUR/USD",
// "eur_usd", "EURUSD" all collapse to the same key).
function normSym(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Open funded/prop positions (FTP etc.) rendered as Live Wall trades, marked
// against the desk's OANDA price. These carry no connectionId, so the reconcile
// step never persists them — keeping them off the Trade Log, History, and Live
// Brokers capital while still showing live P/L on the wall. Best-effort: if no
// OANDA connection is available (or a symbol isn't priceable) the position still
// shows with its fill, just without a live mark.
async function loadFundedLiveTrades(conns: OwnedConnection[], scopeIds: Set<string>): Promise<LiveTrade[]> {
  const positions = await getDeskFundedOpenPositions(scopeIds);
  if (positions.length === 0) return [];

  const marks = new Map<string, number>();
  const oanda = conns.find((c) => c.broker === 'oanda');
  if (oanda) {
    const cr = oanda.creds as OandaCreds;
    const base = cr.env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
    try {
      const priced = await fetchOandaPrices(
        { token: cr.token, accountId: cr.accountId, base },
        positions.map((p) => p.instrument),
      );
      for (const [inst, mid] of priced) marks.set(normSym(inst), mid);
    } catch {
      /* leave marks empty — positions still render with their fill price */
    }
  }

  return positions.map((p) => {
    const mark = marks.get(normSym(p.instrument)) ?? null;
    // FTP/Match-Trader reports forex size in LOTS (e.g. 0.50), but the pip-money
    // math needs raw currency units (1 standard lot = 100,000). A forex size of
    // 100 or less is a lot count, not raw units (nobody holds 0.5 units of a
    // pair), so scale it up; larger values are already in units. Non-forex sizes
    // are left as-is (they get no pip-money anyway).
    const isForex = forexPair(p.instrument) != null;
    const units = isForex && p.units > 0 && p.units <= 100 ? p.units * 100_000 : p.units;
    const trade: LiveTrade = {
      id: `funded:${p.id}`,
      connectionId: '', // no broker connection → never reconciled into History/Trade Log
      ownerId: p.userId,
      owner: p.owner,
      broker: 'ftp',
      brokerName: p.platform || 'Funded Trading Plus',
      instrument: p.instrument,
      side: p.side,
      units,
      plannedEntry: null,
      entryPrice: p.entryPrice,
      currentPrice: mark,
      takeProfit: null,
      stopLoss: null,
      trailingStopLoss: null,
      slippage: null,
      unrealizedPl: null,
      strategy: null,
      timeframe: null,
      openedAt: p.openedAt,
      forex: null,
    };
    const forex = computeForex(trade, 'USD');
    trade.forex = forex;
    // Derive open P/L from the pip math once we have a mark (forex only; other
    // instruments keep a null P/L rather than guess a contract size).
    trade.unrealizedPl =
      forex && forex.pipsOpen != null && forex.moneyPerPip != null
        ? Number((forex.pipsOpen * forex.moneyPerPip).toFixed(2))
        : null;
    return trade;
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
  // Anyone reaching this route holds a trading role (the workspace guard enforces
  // it), so balances are open to them in full — no separate viewBrokerage grant.
  // What they see is scoped to their team below.
  const canSeeBalances = true;
  const generatedAt = Date.now();
  const { breakEvenPct, breakEvenMode, breakEvenAmount, breakEvenOverrides } = await getDeskSettings();

  // Trade data is scoped to the viewer's team (or just the viewer, if they have
  // no team) — never the whole install. Only that team's active connections are
  // loaded, so the wall shows only the team's open positions, each tagged with
  // its owner. The public demo is sandboxed: it never reaches real connections,
  // so it falls through to the sample feed below.
  const scopeIds = await scopedTraderIds(user);
  const conns = isDemoUser(user) ? [] : await getAllActiveDecrypted(scopeIds);

  // Open funded positions, marked against the team's OANDA price. Kept separate
  // from the broker feed so they never reconcile into the Trade Log / History /
  // Live Brokers capital. Scoped to the same team; demo users never see them.
  const fundedLive = isDemoUser(user) ? [] : await loadFundedLiveTrades(conns, scopeIds);

  // No connection anywhere on the desk → show the sample feed so the wall is
  // never blank. The sample is attributed to the viewer.
  if (conns.length === 0) {
    const sample = sampleLiveTrades(generatedAt).map((t) => ({
      ...t,
      ownerId: user.id,
      owner: user.username,
    }));
    const trades = await withDesignations(
      gateBalances(
        enrichForex(withSlippage([...sample, ...fundedLive]), 'USD'),
        canSeeBalances,
      ).sort(newestFirst),
    );
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
      breakEvenPct,
      breakEvenMode,
      breakEvenAmount,
      breakEvenOverrides,
    };
  }

  // Pull every active connection in parallel and merge.
  const { brokers, raw: loaded } = await loadDesk(conns);

  // Backfill missing marks on hand-entered manual positions from the rest of the
  // desk's open trades, so their P/L and pip math render like any other.
  const raw = fillManualMarks(loaded);

  // Reconcile open positions → History before display, keyed per owner so each
  // teammate's positions feed their own History (not the viewer's). Never let
  // bookkeeping blank the wall.
  const withSlip = withSlippage(raw);
  await reconcilePerOwner(conns, brokers, withSlip);

  // Fold funded/prop positions in only after reconcile, so they show on the wall
  // but never land in tradingPositions (Trade Log / History / Live Brokers).
  const trades = await withDesignations(
    gateBalances([...withSlip, ...fundedLive], canSeeBalances).sort(newestFirst),
  );
  const failed = brokers.filter((b) => !b.ok);
  const note = failed.length > 0 ? `Couldn't reach: ${failed.map((b) => b.name).join(', ')}.` : null;

  return { source: 'live', generatedAt, canSeeBalances, brokers, trades, note, breakEvenPct, breakEvenMode, breakEvenAmount, breakEvenOverrides };
}

// Fan out to every active connection and merge their open positions, recording
// per-connection health. Shared by the Live Wall render and the background
// desk watch.
async function loadDesk(conns: OwnedConnection[]): Promise<{ brokers: BrokerLiveResult[]; raw: LiveTrade[] }> {
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
  return { brokers, raw };
}

// Reconcile open positions → History per owner, so each teammate's positions
// feed their own History. The "responded" set is per connection so a connection
// that errored this cycle can never trigger false closures. This is also where
// trade open/close push notifications fire (inside reconcile).
async function reconcilePerOwner(
  conns: OwnedConnection[],
  brokers: BrokerLiveResult[],
  withSlip: LiveTrade[],
): Promise<void> {
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
  const ownerNameById = new Map(conns.map((c) => [c.ownerId, c.owner]));
  for (const ownerId of new Set(conns.map((c) => c.ownerId))) {
    const ownerTrades = withSlip.filter((t) => t.ownerId === ownerId);
    try {
      await reconcile(ownerId, okByOwner.get(ownerId) ?? new Set<string>(), ownerTrades, ownerNameById.get(ownerId));
    } catch {
      /* ignore — bookkeeping must never throw into the caller */
    }
  }
}

// Reconcile the whole desk with no viewer present. This is what makes trade
// open/close push notifications fire when nobody has the Live Wall open — the
// background watch calls it on an interval. Cheap when there are no connections.
export async function reconcileDeskPositions(): Promise<void> {
  const conns = await getAllActiveDecrypted();
  if (conns.length === 0) return;
  const { brokers, raw } = await loadDesk(conns);
  const withSlip = withSlippage(fillManualMarks(raw));
  await reconcilePerOwner(conns, brokers, withSlip);
}

// Poll cadence for the background trade watch — keeps the latency on a "trade
// opened/closed" buzz low (matches the client Live Wall's 10s refresh) without
// hammering broker rate limits. Override with DESK_WATCH_SECONDS if a broker
// needs a gentler cadence.
const DESK_WATCH_MS = Math.max(5, Number(process.env.DESK_WATCH_SECONDS) || 10) * 1000;

// Poll broker positions in the background so trade open/close notifications fire
// even when no client has the Live Wall open. Production-only, and only when
// push is actually configured (no point spending broker API quota otherwise).
// Best-effort: every tick is try/caught and never keeps the process alive.
export function startDeskWatch(): void {
  if (!config.isProd || (!pushConfigured() && !pushoverConfigured())) return;
  const tick = () => {
    void reconcileDeskPositions().catch((err) => console.error('Desk watch error:', err));
  };
  setTimeout(tick, 8 * 1000);
  const timer = setInterval(tick, DESK_WATCH_MS);
  timer.unref?.();
}
