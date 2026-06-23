import type { UserRow } from '../db/schema.js';
import {
  BROKER_META,
  anyBrokerConfigured,
  ftpConfig,
  isBrokerConfigured,
  krakenConfig,
  oandaConfig,
  tradeStationConfig,
} from './config.js';
import { fetchOandaTrades } from './brokers/oanda.js';
import { fetchKrakenPositions } from './brokers/kraken.js';
import { fetchTradeStationPositions } from './brokers/tradestation.js';
import { fetchFtpPositions } from './brokers/ftp.js';
import { sampleLiveTrades } from './sample.js';
import { reconcile } from './history.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';
import type { BrokerKey, BrokerLiveResult, LiveTrade, LiveWall } from './types.js';

// Compute slippage once, centrally: the actual fill minus the planned/alert
// price (in price terms). Null when there was no planned entry to compare to.
function withSlippage(trades: LiveTrade[]): LiveTrade[] {
  return trades.map((t) =>
    t.plannedEntry == null
      ? t
      : { ...t, slippage: Number((t.entryPrice - t.plannedEntry).toFixed(8)) },
  );
}

// Most recent first; trades without an open time sort to the bottom.
function newestFirst(a: LiveTrade, b: LiveTrade): number {
  return (b.openedAt ?? -Infinity) - (a.openedAt ?? -Infinity);
}

// Fetch open trades for a single broker, returning the per-broker result and
// its trades. Never throws — a failed or unconfigured broker just reports
// ok:false so one broker being down can't blank the whole wall.
async function loadBroker(
  key: BrokerKey,
): Promise<{ result: BrokerLiveResult; trades: LiveTrade[] }> {
  const meta = BROKER_META.find((b) => b.key === key)!;
  const base: BrokerLiveResult = {
    broker: key,
    name: meta.name,
    platform: meta.platform,
    kind: meta.kind,
    configured: isBrokerConfigured(key),
    ok: false,
    error: null,
    count: 0,
  };

  if (!base.configured) {
    return { result: { ...base, error: 'Not configured' }, trades: [] };
  }

  try {
    let trades: LiveTrade[] = [];
    switch (key) {
      case 'oanda':
        trades = await fetchOandaTrades(oandaConfig()!);
        break;
      case 'kraken':
        trades = await fetchKrakenPositions(krakenConfig()!);
        break;
      case 'tradestation':
        trades = await fetchTradeStationPositions(tradeStationConfig()!);
        break;
      case 'ftp':
        trades = await fetchFtpPositions(ftpConfig()!);
        break;
    }
    return { result: { ...base, ok: true, count: trades.length }, trades };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Fetch failed';
    return { result: { ...base, ok: false, error }, trades: [] };
  }
}

// Hide P/L (a balance detail) from anyone without the viewBrokerage grant.
function gateBalances(trades: LiveTrade[], canSeeBalances: boolean): LiveTrade[] {
  if (canSeeBalances) return trades;
  return trades.map((t) => ({ ...t, unrealizedPl: null }));
}

export async function getLiveWall(user: UserRow): Promise<LiveWall> {
  const canSeeBalances = !!user.viewBrokerage;
  const generatedAt = Date.now();

  // No broker connected yet → show the sample feed so the wall is never blank.
  if (!anyBrokerConfigured()) {
    const trades = gateBalances(withSlippage(sampleLiveTrades(generatedAt)), canSeeBalances).sort(
      newestFirst,
    );
    const brokers: BrokerLiveResult[] = BROKER_META.map((m) => ({
      broker: m.key,
      name: m.name,
      platform: m.platform,
      kind: m.kind,
      configured: false,
      ok: false,
      error: 'Not configured',
      count: trades.filter((t) => t.broker === m.key).length,
    }));
    return {
      source: 'sample',
      generatedAt,
      canSeeBalances,
      brokers,
      trades,
      note: 'Sample data — connect a broker (add API keys) to stream your live positions.',
    };
  }

  // At least one broker is configured: pull from every configured broker in
  // parallel and merge. loadBroker never rejects, so allSettled is belt-and-
  // braces only.
  const settled = await Promise.allSettled(BROKER_META.map((m) => loadBroker(m.key)));
  const brokers: BrokerLiveResult[] = [];
  let trades: LiveTrade[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      brokers.push(s.value.result);
      trades = trades.concat(s.value.trades);
    }
  }

  // Reconcile open positions → History before gating P/L for display. Only the
  // account owner (an admin) drives this, so each closure is recorded once and
  // against the real, ungated broker P/L. Never let a bookkeeping hiccup blank
  // the wall.
  const withSlip = withSlippage(trades);
  if (isAdmin(parseRoles(user))) {
    const okBrokers = new Set(brokers.filter((b) => b.ok).map((b) => b.broker));
    try {
      await reconcile(user.id, okBrokers, withSlip);
    } catch {
      /* ignore — the Live Wall must still render */
    }
  }

  trades = gateBalances(withSlip, canSeeBalances).sort(newestFirst);
  const failed = brokers.filter((b) => b.configured && !b.ok);
  const note =
    failed.length > 0
      ? `Couldn't reach: ${failed.map((b) => b.name).join(', ')}.`
      : null;

  return { source: 'live', generatedAt, canSeeBalances, brokers, trades, note };
}
