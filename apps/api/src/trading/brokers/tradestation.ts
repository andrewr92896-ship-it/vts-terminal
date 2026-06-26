import type { TradeStationConfig } from '../config.js';
import { brokerMeta } from '../config.js';
import type { LiveTrade } from '../types.js';

// TradeStation — brokerage positions.
// 1) Exchange the long-lived refresh token for an access token.
// 2) GET {base}/v3/brokerage/accounts/{accountIds}/positions   (Bearer token)
// Docs: https://api.tradestation.com/docs/

interface TsPosition {
  PositionID?: string;
  Symbol: string;
  Quantity: string; // signed; negative = short
  AveragePrice: string;
  Last?: string;
  LongShort?: 'Long' | 'Short';
  UnrealizedProfitLoss?: string;
  Timestamp?: string;
}
interface TsPositionsResponse {
  Positions?: TsPosition[];
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Pure normalizer — exported for unit tests against recorded JSON.
export function mapTradeStationPositions(json: TsPositionsResponse): LiveTrade[] {
  const name = brokerMeta('tradestation').name;
  return (json.Positions ?? []).map((p, i) => {
    const qty = num(p.Quantity) ?? 0;
    const side = p.LongShort ? (p.LongShort === 'Long' ? 'long' : 'short') : qty >= 0 ? 'long' : 'short';
    return {
      id: `tradestation:${p.PositionID ?? `${p.Symbol}-${i}`}`,
      connectionId: '', // set by the service when aggregating per connection
      ownerId: '', // set by the service from the connection's owner
      owner: '',
      broker: 'tradestation' as const,
      brokerName: name,
      instrument: p.Symbol,
      side: side as 'long' | 'short',
      units: Math.abs(qty),
      plannedEntry: null,
      entryPrice: num(p.AveragePrice) ?? 0,
      currentPrice: num(p.Last),
      takeProfit: null,
      stopLoss: null,
      trailingStopLoss: null,
      slippage: null,
      unrealizedPl: num(p.UnrealizedProfitLoss),
      strategy: null,
      timeframe: null,
      openedAt: p.Timestamp ? Date.parse(p.Timestamp) || null : null,
    };
  });
}

async function accessToken(cfg: TradeStationConfig): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
  }).toString();
  const res = await fetch(`${cfg.signinBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`TradeStation auth responded ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('TradeStation auth returned no access token');
  }
  return json.access_token;
}

export async function fetchTradeStationPositions(cfg: TradeStationConfig): Promise<LiveTrade[]> {
  const token = await accessToken(cfg);
  const res = await fetch(`${cfg.base}/v3/brokerage/accounts/${cfg.accountIds}/positions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`TradeStation responded ${res.status}`);
  }
  const json = (await res.json()) as TsPositionsResponse;
  return mapTradeStationPositions(json);
}
