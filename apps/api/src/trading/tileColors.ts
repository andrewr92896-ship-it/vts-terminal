import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, userTeams, userTeamMembers } from '../db/schema.js';
import type { BrokerKey } from './types.js';

// Trade tile colours — the wash that says whose position a tile is.
//
// A group that shares its book draws every member's open position in the same
// navy card, so telling one trader's trades from another's meant reading the
// @handle on each one. The group LEADER assigns a colour per person, plus two
// for the tiles that belong to nobody in particular: funded (prop-firm)
// positions and hand-kept manual ones.
//
// THIS FILE IS THE ONLY PLACE THE HEXES EXIST. The palette is sent to the web
// on /api/my-portal/config and the resolved hex is stamped onto each position,
// so no screen ever maps a key to a colour and there is no second copy to drift.

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------
//
// GREEN, RED, GOLD AND AMBER ARE DELIBERATELY ABSENT, and nothing warm may be
// added. On a trade tile those four already carry meaning — green is winning,
// red is losing, gold is break-even, amber is a trailing stop — so a losing
// position washed green would be the one mistake this feature could make that
// actually costs money to misread. What is left is the cool half of the wheel
// plus two neutrals, which is still nine choices for a group capped at five
// people.
//
// `slate` is the exact gray funded positions have always been drawn in, which is
// why it is the funded default below: the group that never touches this feature
// sees the wall it saw yesterday.
export const TILE_COLORS = {
  violet: { label: 'Violet', hex: '#9B7BF0' },
  plum: { label: 'Plum', hex: '#C173E8' },
  magenta: { label: 'Magenta', hex: '#E86FC4' },
  indigo: { label: 'Indigo', hex: '#6C7CF2' },
  sky: { label: 'Sky', hex: '#4FA8F5' },
  cyan: { label: 'Cyan', hex: '#32BDD4' },
  teal: { label: 'Teal', hex: '#2FB6B0' },
  steel: { label: 'Steel', hex: '#7C9AC8' },
  slate: { label: 'Slate', hex: '#8892A6' },
} as const;

export type TileColorKey = keyof typeof TILE_COLORS;

export interface TileColorOption {
  key: TileColorKey;
  label: string;
  hex: string;
}

// The palette as the picker reads it, in display order.
export const TILE_COLOR_OPTIONS: TileColorOption[] = (Object.keys(TILE_COLORS) as TileColorKey[]).map((key) => ({
  key,
  label: TILE_COLORS[key].label,
  hex: TILE_COLORS[key].hex,
}));

export function isTileColorKey(value: unknown): value is TileColorKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TILE_COLORS, value);
}

// A stored key → its hex. Anything unrecognised resolves to null rather than
// throwing: a palette entry retired after somebody chose it must leave their
// tiles plain, not break the wall for the whole group.
export function hexForTileColor(key: string | null | undefined): string | null {
  return isTileColorKey(key) ? TILE_COLORS[key].hex : null;
}

// The colour funded (prop-firm) tiles carry when the group has not chosen one —
// the gray they were hardcoded to before this feature existed. Exported because
// the My Group picker has to show what "not chosen" currently looks like, and a
// second literal there is how the picker and the wall come to disagree.
export const FUNDED_TILE_DEFAULT = TILE_COLORS.slate.hex;

// ---------------------------------------------------------------------------
// Resolving a viewer's palette
// ---------------------------------------------------------------------------

export interface TilePalette {
  byOwner: Map<string, string>; // userId → hex, for the people who have a colour
  funded: string; // never null — falls back to the long-standing gray
  manual: string | null;
}

const EMPTY_PALETTE: TilePalette = { byOwner: new Map(), funded: FUNDED_TILE_DEFAULT, manual: null };

// The colours in force for one viewer. Colours belong to the GROUP, so everyone
// in it reads the same board — that is the whole point of the leader setting
// them. A viewer on no group gets the defaults, which is the appearance every
// tile had before this shipped.
export async function resolveTilePalette(userId: string): Promise<TilePalette> {
  const me = (await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  const teamId = me?.teamId ?? null;
  if (!teamId) return EMPTY_PALETTE;

  const [teamRow] = await db
    .select({ funded: userTeams.fundedTileColor, manual: userTeams.manualTileColor })
    .from(userTeams)
    .where(eq(userTeams.id, teamId))
    .limit(1);
  const memberRows = await db
    .select({ userId: userTeamMembers.userId, tileColor: userTeamMembers.tileColor })
    .from(userTeamMembers)
    .where(eq(userTeamMembers.teamId, teamId));

  const byOwner = new Map<string, string>();
  for (const row of memberRows) {
    const hex = hexForTileColor(row.tileColor);
    if (hex) byOwner.set(row.userId, hex);
  }
  return {
    byOwner,
    funded: hexForTileColor(teamRow?.funded) ?? FUNDED_TILE_DEFAULT,
    manual: hexForTileColor(teamRow?.manual),
  };
}

// What colour one position is drawn in.
//
// THE BROKER KIND WINS OVER THE PERSON, deliberately: a funded position is the
// prop firm's capital and a manual one is a hand-kept note, and the owner asked
// for those two to be coloured separately from anybody. So a trader's own colour
// marks the accounts they actually trade, and their funded book stays visibly
// off-book — which is the distinction the wall already sorts on.
export function tileColorFor(
  trade: { broker: BrokerKey; ownerId: string },
  palette: TilePalette,
): string | null {
  if (trade.broker === 'ftp') return palette.funded;
  if (trade.broker === 'manual') return palette.manual;
  return palette.byOwner.get(trade.ownerId) ?? null;
}

// Stamp a whole feed. Applied at the boundary rather than where a position is
// built, because a colour is a fact about who is looking at the tile, not about
// the trade — see getLiveWall, which paints every one of its return paths by
// wrapping the build rather than remembering to do it four times.
export function paintTiles<T extends { broker: BrokerKey; ownerId: string }>(
  trades: T[],
  palette: TilePalette,
): (T & { tileColor: string | null })[] {
  return trades.map((t) => ({ ...t, tileColor: tileColorFor(t, palette) }));
}
