import type { OandaConfig } from '../config.js';
import { brokerMeta } from '../config.js';
import type { LiveTrade } from '../types.js';

// OANDA v20 — open trades for a forex account.
// GET {base}/v3/accounts/{accountId}/openTrades   (Bearer token)
// Docs: https://developer.oanda.com/rest-live-v20/trade-ep/

interface OandaOrder {
  price?: string;
}
interface OandaTrade {
  id: string;
  instrument: string; // "EUR_USD"
  price: string; // average fill price
  openTime: string; // RFC3339
  currentUnits: string; // +long / -short
  unrealizedPL?: string;
  takeProfitOrder?: OandaOrder;
  stopLossOrder?: OandaOrder;
}
interface OandaOpenTradesResponse {
  trades?: OandaTrade[];
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Pure normalizer — exported so it can be unit-tested against recorded JSON
// without any network access.
export function mapOandaTrades(json: OandaOpenTradesResponse): LiveTrade[] {
  const name = brokerMeta('oanda').name;
  return (json.trades ?? []).map((t) => {
    const units = num(t.currentUnits) ?? 0;
    const entry = num(t.price) ?? 0;
    return {
      id: `oanda:${t.id}`,
      connectionId: '', // set by the service when aggregating per connection
      broker: 'oanda' as const,
      brokerName: name,
      instrument: t.instrument.replace('_', '/'),
      side: units >= 0 ? ('long' as const) : ('short' as const),
      units: Math.abs(units),
      plannedEntry: null,
      entryPrice: entry,
      currentPrice: null, // openTrades does not include the live mark
      takeProfit: num(t.takeProfitOrder?.price),
      stopLoss: num(t.stopLossOrder?.price),
      slippage: null,
      unrealizedPl: num(t.unrealizedPL),
      strategy: null,
      timeframe: null,
      openedAt: t.openTime ? Date.parse(t.openTime) || null : null,
    };
  });
}

export async function fetchOandaTrades(cfg: OandaConfig): Promise<LiveTrade[]> {
  const res = await fetch(`${cfg.base}/v3/accounts/${cfg.accountId}/openTrades`, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`OANDA responded ${res.status}`);
  }
  const json = (await res.json()) as OandaOpenTradesResponse;
  return mapOandaTrades(json);
}
