import crypto from 'node:crypto';
import type { KrakenConfig } from '../config.js';
import { brokerMeta } from '../config.js';
import type { LiveTrade } from '../types.js';

// Kraken — open margin positions.
// POST https://api.kraken.com/0/private/OpenPositions   (API-Key + API-Sign)
// Docs: https://docs.kraken.com/rest/#tag/Account-Data/operation/getOpenPositions

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

const API_BASE = 'https://api.kraken.com';
const PATH = '/0/private/OpenPositions';

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Tidy Kraken's internal asset codes (XXBTZUSD -> BTC/USD) for display. Best
// effort: Kraken prefixes legacy assets with X/Z and uses XBT for BTC.
export function prettyKrakenPair(pair: string): string {
  const fix = (s: string) => (s === 'XBT' ? 'BTC' : s);
  const strip = (s: string) => (s.length === 4 && /^[XZ]/.test(s) ? s.slice(1) : s);
  if (pair.length === 8) {
    return `${fix(strip(pair.slice(0, 4)))}/${fix(strip(pair.slice(4)))}`;
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

function sign(path: string, body: string, nonce: string, secret: string): string {
  const secretBuf = Buffer.from(secret, 'base64');
  const hash = crypto.createHash('sha256').update(nonce + body).digest();
  const hmac = crypto.createHmac('sha512', secretBuf);
  hmac.update(path);
  hmac.update(hash);
  return hmac.digest('base64');
}

export async function fetchKrakenPositions(cfg: KrakenConfig): Promise<LiveTrade[]> {
  const nonce = String(Date.now() * 1000);
  const body = new URLSearchParams({ nonce }).toString();
  const res = await fetch(API_BASE + PATH, {
    method: 'POST',
    headers: {
      'API-Key': cfg.apiKey,
      'API-Sign': sign(PATH, body, nonce, cfg.apiSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Kraken responded ${res.status}`);
  }
  const json = (await res.json()) as KrakenResponse;
  return mapKrakenPositions(json);
}
