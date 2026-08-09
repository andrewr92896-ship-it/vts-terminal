import type { BoardTile, BoardTileKind, PremiumFeature, UserFeatures } from '../../api/types';

// The catalog of everything the Live Wall can carry: what each tile is called,
// which group it belongs to, what it costs, and how big it starts.
//
// This is the ONE place a tile kind is described. The picker reads it to build
// its menu, the board reads it for minimum sizes and lock state, and the server
// mirrors only the gate half (apps/api/src/trading/boardTiles.ts) — the server
// never needs to know what a tile is called, only who may reach its data.
//
// Adding a tile kind means: the union in api/types.ts, an entry here, an entry
// in the server mirror, and a renderer in the tiles/ folder. Nothing else.

export type TileGroup = 'markets' | 'desk' | 'personal' | 'studies' | 'team';

export const TILE_GROUPS: { key: TileGroup; label: string }[] = [
  { key: 'markets', label: 'Markets' },
  { key: 'desk', label: 'Advanced Trading' },
  { key: 'personal', label: 'My Terminal' },
  { key: 'studies', label: 'Studies' },
  { key: 'team', label: 'Group' },
];

export interface TileDef {
  kind: BoardTileKind;
  label: string;
  group: TileGroup;
  icon: string; // Lucide glyph (components/Icon)
  /** One line stating what the tile IS. Never how to use it. */
  blurb: string;
  /** The paid feature gating it, or null when it is included with every account. */
  feature: PremiumFeature | null;
  /**
   * A tier this tile is MARKED with but not gated by.
   *
   * The two are genuinely different, and conflating them locks people out of
   * their own data. Broker Capital is the case: connecting a broker is Max, but
   * *reading* an account you already connected is not — the endpoint serves any
   * desk user, and Trade History ▸ Live Brokers shows the same figures behind
   * nothing but a marker. That is the terminal's standing rule for a credential
   * feature: reading its status and disconnecting stay open, so a lapsed member
   * is never locked away from what they already have.
   */
  markFeature?: PremiumFeature;
  /** Needs the Advanced Trading opt-in. */
  desk?: boolean;
  /** Needs the nested Funded Account opt-in as well. */
  funded?: boolean;
  /** Starting grid size, and the smallest the tile stays readable at. */
  w: number;
  h: number;
  minH: number;
  minW?: number;
}

// Ordered within each group free → Premium → Max. (The sidebar stacks the other
// way round — Max → Premium → free — because a nav row is a destination and the
// paid ones lead; the picker is a catalog being read through, so it opens on
// what the reader already has.)
export const TILE_CATALOG: TileDef[] = [
  // ---- Markets: public data, included with every account ----
  {
    kind: 'chart',
    label: 'Chart',
    group: 'markets',
    icon: 'candlestick-chart',
    blurb: 'A live price chart with your own interval and indicators.',
    feature: null,
    w: 6,
    h: 14,
    minH: 8,
  },
  {
    kind: 'watchlist',
    label: 'Watchlist',
    group: 'markets',
    icon: 'list',
    blurb: 'A strip of live quotes for the instruments you follow.',
    feature: null,
    w: 12,
    h: 3,
    minH: 2,
  },
  {
    kind: 'news',
    label: 'Market News',
    group: 'markets',
    icon: 'newspaper',
    blurb: 'Headlines from the desk feeds, filtered to a topic.',
    feature: null,
    w: 4,
    h: 14,
    minH: 5,
  },
  {
    kind: 'calendar',
    label: 'Economic Calendar',
    group: 'markets',
    icon: 'calendar-days',
    blurb: 'Scheduled releases with their forecast and previous figures.',
    feature: null,
    w: 4,
    h: 14,
    minH: 5,
  },
  {
    kind: 'clock',
    label: 'Market Clock',
    group: 'markets',
    icon: 'clock',
    blurb: 'Which sessions are open now, and when the next one opens.',
    feature: null,
    w: 4,
    h: 8,
    minH: 5,
  },
  {
    kind: 'streams',
    label: 'Live Stream',
    group: 'markets',
    icon: 'youtube',
    blurb: 'A financial news channel playing on the board.',
    // Yahoo Finance is free; the rest of the wall is Premium and adding your own
    // is Max. The tile itself is free — which channels play is checked per
    // channel, in the payload and again on the server.
    feature: null,
    w: 5,
    h: 12,
    minH: 7,
  },
  {
    kind: 'marketdata',
    label: 'Market Data',
    group: 'markets',
    icon: 'line-chart',
    blurb: 'Rates, prints and prices with their change columns.',
    feature: 'marketData',
    w: 5,
    h: 12,
    minH: 5,
  },

  // ---- The desk: behind the Advanced Trading opt-in ----
  {
    kind: 'positions',
    label: 'Open Trades',
    group: 'desk',
    icon: 'activity',
    blurb: "Every position your desk currently holds, with live P&L.",
    feature: null,
    desk: true,
    w: 4,
    h: 12,
    minH: 4,
  },
  {
    kind: 'closed',
    label: 'Closed Trades',
    group: 'desk',
    icon: 'history',
    blurb: 'The most recently closed trades and what each one made.',
    feature: null,
    desk: true,
    w: 4,
    h: 12,
    minH: 5,
  },
  {
    kind: 'tradelog',
    label: 'Trade History',
    group: 'desk',
    icon: 'bar-chart-3',
    blurb: 'Win rate, realized P&L and the record over a window.',
    feature: null,
    desk: true,
    w: 4,
    h: 9,
    minH: 5,
  },
  {
    kind: 'metrics',
    label: 'Desk Metrics',
    group: 'desk',
    icon: 'gauge',
    blurb: 'The full Closed Trades & Metrics KPI row, including your capital.',
    feature: null,
    desk: true,
    w: 6,
    h: 10,
    minH: 4,
  },
  {
    kind: 'alerts',
    label: 'Trading Alerts',
    group: 'desk',
    icon: 'bell',
    blurb: 'Incoming TradingView alerts as they arrive.',
    feature: null,
    desk: true,
    w: 4,
    h: 14,
    minH: 5,
  },
  {
    kind: 'sessions',
    label: 'Strategy Sessions',
    group: 'desk',
    icon: 'calendar-clock',
    blurb: 'Your session windows, which are open, and what is next.',
    feature: 'strategySessions',
    desk: true,
    w: 4,
    h: 10,
    minH: 5,
  },
  {
    // The hand-kept book. Deliberately NOT behind the Funded opt-in: plenty of
    // traders keep a manual book without ever running a challenge, which is why
    // Manual Trades is a plain Advanced Trading section.
    kind: 'funded',
    label: 'Manual Trades',
    group: 'desk',
    icon: 'pencil',
    blurb: 'Balance and P&L on a book you keep by hand.',
    feature: null,
    desk: true,
    w: 4,
    h: 10,
    minH: 5,
  },
  {
    // The prop-firm challenge — this is the one behind the nested opt-in.
    kind: 'challenge',
    label: 'Funded Account',
    group: 'desk',
    icon: 'shield-check',
    blurb: 'Challenge equity, target and the drawdown left.',
    feature: 'funded',
    desk: true,
    funded: true,
    w: 4,
    h: 11,
    minH: 5,
  },
  {
    kind: 'capital',
    label: 'Broker Capital',
    group: 'desk',
    icon: 'landmark',
    blurb: 'What each connected account is worth right now.',
    // Marked, not gated — see `markFeature`. Connecting the broker is Max;
    // reading an account you already connected is not.
    feature: null,
    markFeature: 'brokerConnections',
    desk: true,
    w: 4,
    h: 10,
    minH: 5,
  },

  // ---- Personal: the user's own money, lists and reading ----
  {
    kind: 'networth',
    label: 'Net Worth',
    group: 'personal',
    icon: 'scale',
    blurb: 'Everything you own minus everything you owe, over time.',
    feature: null,
    w: 4,
    h: 10,
    minH: 5,
  },
  {
    kind: 'portfolio',
    label: 'Investment Portfolio',
    group: 'personal',
    icon: 'landmark',
    blurb: 'What the long-term portfolio is worth and how it is split.',
    feature: null,
    w: 4,
    h: 11,
    minH: 5,
  },
  {
    kind: 'dividends',
    label: 'Dividends & Income',
    group: 'personal',
    icon: 'banknote',
    blurb: 'What the portfolio has paid out, and its trailing yield.',
    feature: null,
    w: 4,
    h: 10,
    minH: 5,
  },
  {
    kind: 'todo',
    label: 'To Do',
    group: 'personal',
    icon: 'list-todo',
    blurb: 'What is still open on your list.',
    feature: null,
    w: 4,
    h: 11,
    minH: 5,
  },
  {
    kind: 'notes',
    label: 'Notes',
    group: 'personal',
    icon: 'pencil',
    blurb: 'A scratchpad that saves with the board.',
    feature: null,
    w: 4,
    h: 9,
    minH: 4,
  },
  {
    kind: 'announcements',
    label: 'Announcements',
    group: 'personal',
    icon: 'megaphone',
    blurb: 'Notices posted to the terminal.',
    feature: null,
    w: 4,
    h: 10,
    minH: 5,
  },
  {
    kind: 'patchnotes',
    label: "What's New",
    group: 'personal',
    icon: 'file-text',
    blurb: 'The most recent releases and what each changed.',
    feature: null,
    w: 4,
    h: 10,
    minH: 5,
  },

  // ---- Studies ----
  {
    kind: 'studystats',
    label: 'Study Progress',
    group: 'studies',
    icon: 'gamepad-2',
    blurb: 'Your level, streak and accuracy on a study game.',
    feature: null,
    w: 4,
    h: 9,
    minH: 5,
  },
  {
    kind: 'flashcards',
    label: 'Flashcards',
    group: 'studies',
    icon: 'copy',
    blurb: 'A card from one of your sets, turned over on the board.',
    feature: null,
    w: 4,
    h: 9,
    minH: 5,
  },

  {
    kind: 'leaderboard',
    label: 'Study Leaderboard',
    group: 'studies',
    icon: 'trophy',
    blurb: 'Where your group stands on a study game.',
    feature: null,
    w: 4,
    h: 10,
    minH: 5,
  },

  // ---- Team ----
  {
    kind: 'teamchat',
    label: 'Group Chat',
    group: 'team',
    icon: 'message-square',
    blurb: 'The latest messages from your group.',
    feature: 'teamChat',
    w: 4,
    h: 12,
    minH: 5,
  },
];

const BY_KIND = new Map<BoardTileKind, TileDef>(TILE_CATALOG.map((t) => [t.kind, t]));

export function tileDef(kind: BoardTileKind): TileDef | undefined {
  return BY_KIND.get(kind);
}

export function tileLabel(kind: BoardTileKind): string {
  return BY_KIND.get(kind)?.label ?? 'Tile';
}

// Tiles that read the desk rather than public market data. Mirrors the server's
// own set (routes/trading.ts), which is the enforcer.
export const DESK_TILE_KINDS: Set<BoardTileKind> = new Set(
  TILE_CATALOG.filter((t) => t.desk).map((t) => t.kind),
);

// Why a tile cannot be shown to this viewer, or null when it can.
//
// Two different answers on purpose, because they lead somewhere different: an
// opt-in is switched on by the user themselves in Premium Features, while a
// paid feature needs a membership. Telling someone to upgrade when the fix is a
// toggle they already own would be wrong.
export type TileLock =
  | { reason: 'optIn'; what: 'advancedTrading' | 'funded' }
  | { reason: 'feature'; feature: PremiumFeature };

// Only the two opt-ins are read, so the parameter names them rather than taking
// the whole `UserFeatures` — a caller with a signed-out fallback should not have
// to invent an acknowledgement stamp to ask what a tile costs.
export type TileFeatures = Pick<UserFeatures, 'advancedTrading' | 'funded' | 'tradingTeams'>;

// Tiles that exist only for an account granted Trading Teams.
//
// These are HIDDEN, not locked, and that is the difference between this and
// `tileLock`. A lock is an advertisement — it tells the reader what they would
// get by upgrading or by turning an opt-in on, which is right for everything
// else in the catalog. Trading Teams cannot be bought or switched on, so a
// padlock on this tile would name a feature with no way to reach it. Filter with
// `visibleTiles` wherever the catalog is enumerated.
const GRANT_ONLY_KINDS = new Set<BoardTileKind>(['teamchat']);

// The catalog as this account should see it. Use this rather than TILE_CATALOG
// directly anywhere a list of tile kinds is shown to a user.
export function visibleTiles(features: TileFeatures): TileDef[] {
  return TILE_CATALOG.filter((t) => features.tradingTeams || !GRANT_ONLY_KINDS.has(t.kind));
}

export function tileLock(
  kind: BoardTileKind,
  features: TileFeatures,
  entitled: (f: PremiumFeature) => boolean,
): TileLock | null {
  const def = BY_KIND.get(kind);
  if (!def) return null;
  // A grant-only tile the account does not hold reads as locked for anything
  // that still has one on a board (a saved layout from when the grant was held).
  // The picker never offers it — see visibleTiles.
  if (GRANT_ONLY_KINDS.has(kind) && !features.tradingTeams) {
    return { reason: 'feature', feature: 'teamChat' };
  }
  if (def.desk && !features.advancedTrading) return { reason: 'optIn', what: 'advancedTrading' };
  if (def.funded && !features.funded) return { reason: 'optIn', what: 'funded' };
  if (def.feature && !entitled(def.feature)) return { reason: 'feature', feature: def.feature };
  return null;
}

// Defaults for a freshly-added tile. The geometry comes from the catalog so a
// tile's starting size is stated once, beside everything else about it.
export function newTile(kind: BoardTileKind, at: { x: number; y: number }): BoardTile {
  const def = BY_KIND.get(kind);
  const id = `${kind}-${Math.round(at.x)}-${Math.round(at.y)}-${idCounter()}`;
  const base: BoardTile = {
    id,
    kind,
    x: at.x,
    y: at.y,
    w: def?.w ?? 4,
    h: def?.h ?? 10,
    title: def?.label,
  };
  switch (kind) {
    case 'chart':
      return { ...base, title: undefined, symbol: 'OANDA:EURUSD', interval: '60', style: '1', studies: [] };
    case 'watchlist':
      return {
        ...base,
        symbols: ['OANDA:EURUSD', 'OANDA:GBPUSD', 'OANDA:XAUUSD', 'OANDA:NAS100USD', 'BINANCE:BTCUSDT'],
      };
    case 'positions':
      return { ...base, positionsView: 'list' };
    case 'news':
      return { ...base, newsFeed: 'all' };
    case 'calendar':
      return { ...base, minImpact: 'medhigh' };
    case 'alerts':
      return { ...base, alertsFilter: 'active' };
    case 'marketdata':
      // Left empty: the tile falls back to the board's default pins, so a fresh
      // tile shows real rows rather than an empty frame waiting to be told what
      // to display.
      return { ...base, seriesIds: [] };
    case 'closed':
    case 'announcements':
    case 'patchnotes':
    case 'teamchat':
    case 'leaderboard':
    case 'todo':
      return { ...base, limit: 8 };
    case 'tradelog':
      return { ...base, range: '30d' };
    case 'notes':
      return { ...base, noteText: '' };
    default:
      return base;
  }
}

// A monotonic counter so ids added in the same millisecond don't collide
// (Date.now() alone can repeat within a burst of "add tile" clicks).
let _n = 0;
function idCounter(): number {
  _n = (_n + 1) % 100000;
  return _n;
}
