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

export interface TradeStationConfig {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  accountIds: string; // comma-separated
  base: string;
  signinBase: string;
}

export interface FtpConfig {
  // Match-Trader gateways differ per prop firm, so the base URL is configurable.
  baseUrl: string;
  token: string;
  accountId: string | null;
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

export function krakenConfig(): KrakenConfig | null {
  const apiKey = env('KRAKEN_API_KEY');
  const apiSecret = env('KRAKEN_API_SECRET');
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

export function tradeStationConfig(): TradeStationConfig | null {
  const refreshToken = env('TRADESTATION_REFRESH_TOKEN');
  const clientId = env('TRADESTATION_CLIENT_ID');
  const clientSecret = env('TRADESTATION_CLIENT_SECRET');
  const accountIds = env('TRADESTATION_ACCOUNT_IDS');
  if (!refreshToken || !clientId || !clientSecret || !accountIds) return null;
  const live = (env('TRADESTATION_ENV') ?? 'sim').toLowerCase() === 'live';
  return {
    refreshToken,
    clientId,
    clientSecret,
    accountIds,
    base: live ? 'https://api.tradestation.com' : 'https://sim-api.tradestation.com',
    signinBase: 'https://signin.tradestation.com',
  };
}

export function ftpConfig(): FtpConfig | null {
  const baseUrl = env('FTP_API_URL');
  const token = env('FTP_API_TOKEN');
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token, accountId: env('FTP_ACCOUNT_ID') ?? null };
}

// Whether a given broker has the credentials it needs to be queried.
export function isBrokerConfigured(key: BrokerKey): boolean {
  switch (key) {
    case 'oanda':
      return oandaConfig() !== null;
    case 'kraken':
      return krakenConfig() !== null;
    case 'tradestation':
      return tradeStationConfig() !== null;
    case 'ftp':
      return ftpConfig() !== null;
    case 'manual':
      // Manual connections have no API credentials; positions are entered by hand.
      return false;
  }
}

export function anyBrokerConfigured(): boolean {
  return BROKER_META.some((b) => isBrokerConfigured(b.key));
}
