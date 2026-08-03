import '../config.js'; // ensure dotenv has loaded before we read process.env
import type { BrokerKey } from './types.js';

// Single source of truth for the four broker connections. The status endpoint
// and the Live Wall both read this so the top-bar dots and the wall always
// agree on which brokers exist and which are configured.
export interface BrokerMeta {
  key: BrokerKey;
  name: string;
  short: string;
  platform: string;
  kind: string;
}

export const BROKER_META: BrokerMeta[] = [
  { key: 'ftp', name: 'Funded Trading Plus', short: 'FTP', platform: 'Match-Trader', kind: 'Funded prop' },
  { key: 'oanda', name: 'OANDA', short: 'OANDA', platform: 'OANDA v20', kind: 'Forex' },
  { key: 'kraken', name: 'Kraken Pro', short: 'KRKN', platform: 'Kraken', kind: 'Crypto' },
  { key: 'tradestation', name: 'TradeStation', short: 'TS', platform: 'TradeStation', kind: 'Stocks' },
  { key: 'manual', name: 'Manual', short: 'MAN', platform: 'Manual entry', kind: 'Manual' },
];

export function brokerMeta(key: BrokerKey): BrokerMeta {
  return BROKER_META.find((b) => b.key === key)!;
}

// ---- Credentials, read lazily from the environment ----
// Nothing is hard-coded; each broker is "configured" only when its required
// secrets are present in apps/api/.env (or the deployed environment). Until the
// owner adds keys, every broker reports unconfigured and the Live Wall falls
// back to sample data.

export interface OandaConfig {
  token: string;
  accountId: string;
  // OANDA practice vs live trading hosts.
  base: string;
}

export interface KrakenConfig {
  apiKey: string;
  apiSecret: string; // base64-encoded private key
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function oandaConfig(): OandaConfig | null {
  const token = env('OANDA_API_TOKEN');
  const accountId = env('OANDA_ACCOUNT_ID');
  if (!token || !accountId) return null;
  const live = (env('OANDA_ENV') ?? 'practice').toLowerCase() === 'live';
  return {
    token,
    accountId,
    base: live ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com',
  };
}

// The account used to READ PRICES — the Market Data board and the price-alert
// watch — as opposed to the one used to read the owner's own positions.
//
// It is deliberately its own pair of variables, and a **practice** account is the
// right thing to point them at. OANDA's rates are account-independent, so a
// practice account with no money in it prices the board exactly as well as a live
// one, and a leaked pricing credential then reaches nothing: no balance, no
// positions, no orders worth placing. Nothing here can ever fall through to a
// user's own connection — see priceSource.ts for what that used to do and why it
// had to stop.
//
// Falls back to the general OANDA_* account so an install that already has one
// keeps pricing exactly as it did.
export function oandaPricingConfig(): OandaConfig | null {
  const token = env('OANDA_PRICING_TOKEN');
  const accountId = env('OANDA_PRICING_ACCOUNT_ID');
  if (token && accountId) {
    const live = (env('OANDA_PRICING_ENV') ?? 'practice').toLowerCase() === 'live';
    return {
      token,
      accountId,
      base: live ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com',
    };
  }
  return oandaConfig();
}

export function krakenConfig(): KrakenConfig | null {
  const apiKey = env('KRAKEN_API_KEY');
  const apiSecret = env('KRAKEN_API_SECRET');
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

// Whether a given broker has the credentials it needs to be queried. Only OANDA
// and Kraken have live connectors; FTP and TradeStation are off-book/manual
// labels (their trades are entered by hand from screenshots), so like `manual`
// they are never auto-queried.
export function isBrokerConfigured(key: BrokerKey): boolean {
  switch (key) {
    case 'oanda':
      return oandaConfig() !== null;
    case 'kraken':
      return krakenConfig() !== null;
    case 'tradestation':
    case 'ftp':
    case 'manual':
      return false;
  }
}

export function anyBrokerConfigured(): boolean {
  return BROKER_META.some((b) => isBrokerConfigured(b.key));
}
