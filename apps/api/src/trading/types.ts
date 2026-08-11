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
  // The colour this tile is washed in — whose position it is, or that it is a
  // funded / manual one. Stamped at the boundary by trading/tileColors.ts rather
  // than at any of the eight places a position is built, because it is a fact
  // about the group looking at the tile, not about the trade. Optional for that
  // reason: absent means nobody has chosen, which every screen renders as the
  // appearance it had before this existed.
  tileColor?: string | null;
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
  // 'live'       — at least one broker is configured; trades came from real feeds.
  // 'sample'     — this desk has NEVER connected a broker, so a representative
  //                sample is shown as a first-run preview of the screen.
  // 'unavailable'— a broker IS connected but the terminal cannot read it right
  //                now (deactivated, or its stored credential will not decrypt).
  //
  // The last two used to be one state, and collapsing them was a real fault
  // rather than a tidy simplification: a desk whose OANDA connection had been
  // deactivated by the credential-encryption reset was shown six invented
  // positions with invented P/L, chipped "sample", while the actual problem —
  // "re-enter this account's key" — went unsaid. Made-up positions must never
  // stand in for a broker feed that is down; the same rule Net Worth already
  // follows when it refuses to count the sample, and Market Data follows with
  // `sample: true`. A trader has to be able to tell "nothing is connected yet"
  // from "your book is not being read".
  source: 'live' | 'sample' | 'unavailable';
  generatedAt: number; // ms epoch
  canSeeBalances: boolean; // always true now — balances are open to the trading team
  brokers: BrokerLiveResult[];
  trades: LiveTrade[]; // flattened across brokers, newest first
  note: string | null;
  // Desk-wide break-even buffer (all three shapes) plus per-instrument
  // overrides, so the wall can flag flat positions and label pip moves the same
  // way the rest of the desk does.
  breakEvenPct: number;
  breakEvenMode: 'percent' | 'dollars' | 'pips';
  breakEvenAmount: number;
  breakEvenOverrides: import('./outcome.js').BreakEvenOverride[];
}

// What a trade view LEFT OUT, and why.
//
// The Trade Log and its metrics are a narrowed view of the desk's real trades:
// a connection's "count trades since" cutoff hides an earlier phase, and the
// "ignore test trades" floor hides connection-test fills. Both are deliberate,
// and both were silent — an export headed "2026-06-01 to 2026-08-09" listed no
// June trades at all while nine real ones sat behind a July cutoff, which reads
// as "there were no June trades" rather than "June is not being counted". On a
// figure somebody may present as a track record that is the difference between
// a narrowed number and a wrong one.
//
// Same family of rule as the Live Wall's `source` union, Market Data's
// `sample: true` and the portfolio's `unpricedCount`: state what could not be
// counted rather than letting the total imply it was never there.
export interface ExcludedTrades {
  // Trades dropped because they opened before their connection's cutoff.
  beforeCutoff: number;
  // Broker fills dropped for being under the desk's "test trade" floor.
  belowFloor: number;
  // The cutoff instant (ms) when every excluded trade shares one, so the screen
  // can name a date. Null when several connections cut off on different dates —
  // naming one of them would be false for the trades the others excluded.
  cutoffFrom: number | null;
}
