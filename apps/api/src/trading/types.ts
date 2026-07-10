// Shared Trading workspace types. The Live Wall (Stage 2, first screen) streams
// open positions from the connected brokers and normalizes them all to a single
// `LiveTrade` shape so the UI never has to know which broker a trade came from.

export type TradeSide = 'long' | 'short';

// The four broker connections shown as status dots in the Trading top bar.
export type BrokerKey = 'ftp' | 'oanda' | 'kraken' | 'tradestation' | 'manual';

// One open position, normalized across every broker. Money fields are in the
// account's currency as whole-ish numbers; prices keep their natural precision.
export interface LiveTrade {
  id: string; // `${connectionId}:${broker}:${brokerTradeId}` — stable per position
  connectionId: string; // the broker connection (source) this came from
  ownerId: string; // the teammate whose broker account this position is on
  owner: string; // that teammate's username, shown on the position
  broker: BrokerKey;
  brokerName: string; // the connection's label
  instrument: string; // e.g. EUR/USD, BTC/USD, MSFT
  side: TradeSide;
  units: number; // absolute position size (lots / contracts / shares)
  // The price the trade was *intended* to fill at (from an alert). Brokers do
  // not report this, so it is null for live positions until a future alert-log
  // feature records it; the sample feed includes it to show the full card.
  plannedEntry: number | null;
  entryPrice: number; // the actual average fill price
  currentPrice: number | null; // latest mark, when the broker provides it
  takeProfit: number | null;
  stopLoss: number | null;
  // The current trigger price of a trailing stop, when the broker reports one.
  // Distinct from stopLoss (a fixed price) — this one trails the market.
  trailingStopLoss: number | null;
  // entryPrice - plannedEntry, in price terms; null when there is no plan.
  slippage: number | null;
  // Open P/L in account currency. Shared with the whole trading team; null only
  // when the broker feed does not provide it.
  unrealizedPl: number | null;
  strategy: string | null;
  timeframe: string | null;
  openedAt: number | null; // ms epoch
  // Forex pip math (pips of open P/L, money per pip, risk/reward), present only
  // for genuine currency pairs. Money fields are gated like unrealizedPl.
  forex?: import('./forex.js').ForexMetrics | null;
}

// Per-broker outcome of a Live Wall refresh: was it configured, did the fetch
// succeed, and what did it return.
export interface BrokerLiveResult {
  connectionId: string; // the connection/source this result is for
  ownerId: string; // the teammate who owns this connection
  owner: string; // that teammate's username
  broker: BrokerKey;
  name: string; // the connection's label
  platform: string;
  kind: string;
  configured: boolean; // credentials present in the environment
  ok: boolean; // fetch succeeded (always false until configured)
  error: string | null;
  count: number; // number of open trades returned
}

export interface LiveWall {
  // 'live'  — at least one broker is configured; trades came from real feeds.
  // 'sample'— no broker configured yet, so a representative sample is shown.
  source: 'live' | 'sample';
  generatedAt: number; // ms epoch
  canSeeBalances: boolean; // always true now — balances are open to the trading team
  brokers: BrokerLiveResult[];
  trades: LiveTrade[]; // flattened across brokers, newest first
  note: string | null;
  breakEvenPct: number; // desk-wide break-even band, so the wall can flag flat positions
}
