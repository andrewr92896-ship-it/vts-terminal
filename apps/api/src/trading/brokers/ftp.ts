import type { FtpConfig } from '../config.js';
import { brokerMeta } from '../config.js';
import type { LiveTrade } from '../types.js';

// Funded Trading Plus (Match-Trader gateway).
//
// Match-Trader is white-labeled per prop firm, so there is no single public
// endpoint we can hard-code — the gateway base URL is configurable (FTP_API_URL)
// and the bearer token is the firm-issued API token. This connector expects the
// gateway to return open positions in the Match-Trader shape below; if a given
// firm differs, only this mapper needs to change.
// GET {baseUrl}/mtr-api/open-positions   (Bearer token)

interface MtPosition {
  id?: string;
  symbol: string; // "EURUSD"
  side?: string; // "BUY" | "SELL"
  volume?: string | number; // lots
  openPrice?: string | number;
  currentPrice?: string | number;
  takeProfit?: string | number;
  stopLoss?: string | number;
  trailingStopLoss?: string | number; // trailing-stop trigger price, when the gateway reports one
  trailingStop?: string | number; // some gateways name it this
  profit?: string | number; // open P/L
  openTime?: string | number; // RFC3339 or ms epoch
}
interface MtOpenPositionsResponse {
  positions?: MtPosition[];
}

function num(v: string | number | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Format a Match-Trader symbol (EURUSD) as a readable pair (EUR/USD) when it
// looks like a 6-letter forex pair; otherwise leave it untouched.
export function prettyMtSymbol(symbol: string): string {
  if (/^[A-Za-z]{6}$/.test(symbol)) {
    return `${symbol.slice(0, 3).toUpperCase()}/${symbol.slice(3).toUpperCase()}`;
  }
  return symbol;
}

function parseTime(v: string | number | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const asNum = Number(v);
  if (Number.isFinite(asNum)) return asNum;
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? null : parsed;
}

// Pure normalizer — exported for unit tests against recorded JSON.
export function mapFtpPositions(json: MtOpenPositionsResponse): LiveTrade[] {
  const name = brokerMeta('ftp').name;
  return (json.positions ?? []).map((p, i) => ({
    id: `ftp:${p.id ?? `${p.symbol}-${i}`}`,
    connectionId: '', // set by the service when aggregating per connection
    ownerId: '', // set by the service from the connection's owner
    owner: '',
    broker: 'ftp' as const,
    brokerName: name,
    instrument: prettyMtSymbol(p.symbol),
    side: (p.side ?? '').toUpperCase() === 'SELL' ? ('short' as const) : ('long' as const),
    units: Math.abs(num(p.volume) ?? 0),
    plannedEntry: null,
    entryPrice: num(p.openPrice) ?? 0,
    currentPrice: num(p.currentPrice),
    takeProfit: num(p.takeProfit),
    stopLoss: num(p.stopLoss),
    trailingStopLoss: num(p.trailingStopLoss ?? p.trailingStop),
    slippage: null,
    unrealizedPl: num(p.profit),
    strategy: null,
    timeframe: null,
    openedAt: parseTime(p.openTime),
  }));
}

export async function fetchFtpPositions(cfg: FtpConfig): Promise<LiveTrade[]> {
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.token}` };
  if (cfg.accountId) headers['Account-Id'] = cfg.accountId;
  const res = await fetch(`${cfg.baseUrl}/mtr-api/open-positions`, { headers });
  if (!res.ok) {
    throw new Error(`FTP gateway responded ${res.status}`);
  }
  const json = (await res.json()) as MtOpenPositionsResponse;
  return mapFtpPositions(json);
}
