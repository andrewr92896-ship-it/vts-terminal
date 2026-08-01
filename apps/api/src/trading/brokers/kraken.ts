import type { KrakenConfig } from '../config.js';
import { brokerMeta } from '../config.js';
import { displayAsset, krakenPrivate } from './krakenClient.js';
import type { LiveTrade } from '../types.js';

// Kraken — the *read* side: open margin positions.
// POST https://api.kraken.com/0/private/OpenPositions   (API-Key + API-Sign)
// Docs: https://docs.kraken.com/rest/#tag/Account-Data/operation/getOpenPositions
//
// Signing, the shared nonce and error decoding live in brokers/krakenClient.ts;
// placing orders lives in brokers/krakenOrders.ts. This file stays read-only.
//
// Note what this endpoint does and does not cover: OpenPositions reports **margin**
// positions only. A spot buy is a balance, not a position, so it never appears
// here — the desk reads spot holdings separately (trading/deskBrokers.ts).

interface KrakenPosition {
  pair: string; // "XXBTZUSD"
  type: 'buy' | 'sell';
  vol: string; // volume (base units)
  cost: string; // cost in quote currency
  net?: string; // unrealized P/L
  time?: number; // unix seconds
}
interface KrakenResponse {
  error?: string[];
  result?: Record<string, KrakenPosition>;
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Tidy Kraken's internal asset codes (XXBTZUSD -> BTC/USD) for display. Best
// effort: Kraken prefixes legacy assets with X/Z and uses XBT for BTC. The
// per-asset mapping is shared with the desk (krakenClient.displayAsset) so a
// position reads the same on the Live Wall as it does on the Trade Desk.
export function prettyKrakenPair(pair: string): string {
  if (pair.length === 8) {
    return `${displayAsset(pair.slice(0, 4))}/${displayAsset(pair.slice(4))}`;
  }
  return pair;
}

// Pure normalizer — exported for unit tests against recorded JSON.
export function mapKrakenPositions(json: KrakenResponse): LiveTrade[] {
  if (json.error && json.error.length) {
    throw new Error(`Kraken error: ${json.error.join(', ')}`);
  }
  const name = brokerMeta('kraken').name;
  const result = json.result ?? {};
  return Object.entries(result).map(([txid, p]) => {
    const vol = num(p.vol) ?? 0;
    const cost = num(p.cost) ?? 0;
    // Kraken reports cost (quote) and volume (base); average price ≈ cost / vol.
    const entry = vol > 0 ? cost / vol : 0;
    return {
      id: `kraken:${txid}`,
      connectionId: '', // set by the service when aggregating per connection
      ownerId: '', // set by the service from the connection's owner
      owner: '',
      broker: 'kraken' as const,
      brokerName: name,
      instrument: prettyKrakenPair(p.pair),
      side: p.type === 'buy' ? ('long' as const) : ('short' as const),
      units: Math.abs(vol),
      plannedEntry: null,
      entryPrice: entry,
      currentPrice: null,
      takeProfit: null,
      stopLoss: null,
      trailingStopLoss: null,
      slippage: null,
      unrealizedPl: num(p.net),
      strategy: null,
      timeframe: null,
      openedAt: p.time ? p.time * 1000 : null,
    };
  });
}

export async function fetchKrakenPositions(cfg: KrakenConfig): Promise<LiveTrade[]> {
  const result = await krakenPrivate<Record<string, KrakenPosition>>(cfg, 'OpenPositions');
  return mapKrakenPositions({ result });
}
