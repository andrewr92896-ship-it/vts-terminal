import type { PremiumFeature } from '../memberships/tiers.js';

// The gate half of the Live Wall tile catalog.
//
// The client's catalog (apps/web/src/workspaces/trading/tileCatalog.ts) says what
// each tile is CALLED and how big it starts. The server needs none of that — it
// only needs to know who may reach a tile's data, which is what this states.
//
// Adding a tile kind means an entry here as well as there. A kind absent from
// this map is treated as ungated market data, which is the safe default in the
// only direction that matters: the DATA behind every paid tile is gated at its
// own endpoint (Market Data is `requirePremium('marketData')`, the funded book is
// `requireFunded`, team chat is `requirePremium('teamChat')`), so a tile that
// slipped through here would render an upgrade prompt rather than leak anything.

// A tuple rather than a union so the route's Zod schema can read the list
// directly (`z.enum(BOARD_TILE_KINDS)`) — one list, not a union beside a copy of
// itself in the validator that is free to drift.
export const BOARD_TILE_KINDS = [
  // Markets
  'chart',
  'watchlist',
  'news',
  'calendar',
  'marketdata',
  'streams',
  'clock',
  // The desk
  'positions',
  'metrics',
  'alerts',
  'tradelog',
  'closed',
  'sessions',
  'funded',
  'challenge',
  'capital',
  // Personal
  'networth',
  'portfolio',
  'todo',
  'notes',
  'dividends',
  'announcements',
  'patchnotes',
  // Studies and the team
  'studystats',
  'flashcards',
  'leaderboard',
  'teamchat',
] as const;

export type BoardTileKind = (typeof BOARD_TILE_KINDS)[number];

export interface TileGate {
  /** Reads the desk — needs the Advanced Trading opt-in. */
  desk?: boolean;
  /** Needs the nested Funded Account opt-in as well. */
  funded?: boolean;
  /** The paid feature gating it, if any. */
  feature?: PremiumFeature;
}

export const TILE_GATES: Partial<Record<BoardTileKind, TileGate>> = {
  // Markets
  marketdata: { feature: 'marketData' },
  // The stream tile itself is free — Yahoo Finance plays on every account. WHICH
  // channel may play is checked per channel, in the streams payload and again on
  // the server, so gating the tile would lock a free account out of a channel it
  // is entitled to.

  // The desk
  positions: { desk: true },
  metrics: { desk: true },
  alerts: { desk: true },
  tradelog: { desk: true },
  closed: { desk: true },
  sessions: { desk: true, feature: 'strategySessions' },
  // `funded` is the hand-kept MANUAL book (`/api/trading/funded`), a plain
  // Advanced Trading section — deliberately independent of the Funded opt-in,
  // since plenty of traders keep a manual book without running a challenge.
  funded: { desk: true },
  // `challenge` is the prop-firm Funded Account (`/api/trading/challenge`),
  // which IS behind the nested opt-in and the paid feature.
  challenge: { desk: true, funded: true, feature: 'funded' },
  // Desk-gated only. Connecting a broker is Max, but reading an account you
  // already connected is not — `/api/trading/oanda-capital` serves any desk
  // user, and Trade Analysis ▸ Live Brokers shows the same figures behind
  // nothing but a marker. The client marks this tile with the Max gem without
  // locking it, which is the same rule every credential feature follows:
  // reading its status and disconnecting stay open.
  capital: { desk: true },

  // Team
  teamchat: { feature: 'teamChat' },
};

// Tiles that read the desk rather than public market data. This is the set the
// board route strips from anything a non-desk user saves — everything else on
// the board is public market data or the reader's own, which is exactly the
// split that lets one board serve a Markets-only user and a trader.
export const DESK_TILE_KINDS: Set<string> = new Set(
  Object.entries(TILE_GATES)
    .filter(([, g]) => g?.desk)
    .map(([kind]) => kind),
);
