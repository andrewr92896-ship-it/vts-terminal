import type { BoardTile, BoardTileKind, PremiumFeature } from '../../api/types';
import { newTile, tileLock, type TileFeatures } from './tileCatalog';

// The three built-in Live Wall layouts.
//
// Saving your OWN arrangement is paid (`customBoards`), so these are what a free
// account actually gets: three finished boards to choose between rather than an
// empty grid and a locked save button. That is the same rule the rest of the
// terminal follows — a free account is a working product, not a teaser.
//
// A member with `customBoards` gets them too, as starting points: opening one
// and editing it is how a custom board begins.
//
// Every layout is filtered through the viewer's own opt-ins and entitlements
// before it renders (`buildPreset`), so a layout naming a desk tile still opens
// complete for somebody who has never turned the desk on — the row simply is not
// there, and the tiles below it close the gap.

export interface PresetLayout {
  key: string;
  label: string;
  /** One line stating what the layout is for. */
  blurb: string;
  tiles: PresetTile[];
}

// A tile in a built-in layout: its kind and where it sits, plus any settings
// that differ from the catalog default.
interface PresetTile {
  kind: BoardTileKind;
  x: number;
  y: number;
  w: number;
  h: number;
  patch?: Partial<BoardTile>;
}

// The built-in layouts.
//
// SINCE 2026-08 THESE ARE ONLY A FALLBACK. The live list comes from the server
// (`GET /api/wall-templates`), which is what the Developer Terminal's template
// builder edits — so the owner can change the default boards without a deploy.
// These stay for the moment before that request answers, and for the case where
// it fails: a board that renders three finished layouts from memory is a much
// better failure than an empty picker.
//
// The server seeds the same three from its own copy in `wallTemplateSeed.ts` on
// first boot, so an untouched install shows exactly this.
export const PRESET_LAYOUTS: PresetLayout[] = [
  {
    key: 'markets',
    label: 'Markets',
    blurb: 'Charts, quotes, headlines and the calendar.',
    tiles: [
      { kind: 'watchlist', x: 0, y: 0, w: 12, h: 3 },
      { kind: 'chart', x: 0, y: 3, w: 8, h: 16 },
      { kind: 'news', x: 8, y: 3, w: 4, h: 16 },
      { kind: 'calendar', x: 0, y: 19, w: 6, h: 12 },
      { kind: 'clock', x: 6, y: 19, w: 6, h: 12 },
    ],
  },
  {
    key: 'desk',
    label: 'Trading Desk',
    blurb: 'Open trades, the record, and what the desk is watching.',
    tiles: [
      { kind: 'watchlist', x: 0, y: 0, w: 12, h: 3 },
      { kind: 'chart', x: 0, y: 3, w: 8, h: 16 },
      { kind: 'positions', x: 8, y: 3, w: 4, h: 16 },
      { kind: 'tradelog', x: 0, y: 19, w: 4, h: 9 },
      { kind: 'closed', x: 4, y: 19, w: 4, h: 9 },
      { kind: 'alerts', x: 8, y: 19, w: 4, h: 9 },
    ],
  },
  {
    key: 'personal',
    label: 'My Terminal',
    blurb: 'Your money, your list, and what is new.',
    tiles: [
      { kind: 'networth', x: 0, y: 0, w: 4, h: 10 },
      { kind: 'portfolio', x: 4, y: 0, w: 4, h: 10 },
      { kind: 'todo', x: 8, y: 0, w: 4, h: 10 },
      { kind: 'studystats', x: 0, y: 10, w: 4, h: 9 },
      { kind: 'announcements', x: 4, y: 10, w: 4, h: 9 },
      { kind: 'patchnotes', x: 8, y: 10, w: 4, h: 9 },
    ],
  },
];

export function presetLayout(key: string | null | undefined): PresetLayout {
  return PRESET_LAYOUTS.find((p) => p.key === key) ?? PRESET_LAYOUTS[0];
}

// Turn a built-in layout into real tiles for this viewer.
//
// Tiles the viewer cannot reach are dropped rather than rendered locked: a
// layout they did not build should not open as a wall of padlocks. What they are
// missing is discoverable from the picker, which lists every kind with its
// marker — that is the surface whose job is to say what a thing costs.
//
// The remaining tiles are then pulled up to close the vertical gap left behind,
// so a filtered layout reads as a finished board rather than one with holes.
export function buildPreset(
  layout: PresetLayout,
  features: TileFeatures,
  entitled: (f: PremiumFeature) => boolean,
): BoardTile[] {
  const kept = layout.tiles.filter((t) => !tileLock(t.kind, features, entitled));
  // Row bands, in order, so tiles that shared a row still share one.
  const bands = [...new Set(kept.map((t) => t.y))].sort((a, b) => a - b);
  let cursor = 0;
  const yFor = new Map<number, number>();
  for (const band of bands) {
    yFor.set(band, cursor);
    cursor += Math.max(...kept.filter((t) => t.y === band).map((t) => t.h));
  }
  return kept.map((t, i) => ({
    ...newTile(t.kind, { x: t.x, y: yFor.get(t.y) ?? t.y }),
    x: t.x,
    y: yFor.get(t.y) ?? t.y,
    w: t.w,
    h: t.h,
    ...(t.patch ?? {}),
    // A DETERMINISTIC id, replacing the minted one. `newTile` numbers ids from a
    // counter that keeps climbing for the life of the page, so applying the same
    // built-in layout twice produced two sets of tiles that differed only in
    // their ids. Two things break on that:
    //
    //  - an unsaved arrangement is kept per board and matched against the board
    //    it was made on, so a layout that never compares equal to itself threw
    //    the trader's edits away every time they left the screen; and
    //  - React reconciles the grid by these ids, so a fresh set remounts every
    //    tile — which reloads a TradingView chart on each visit.
    //
    // Index plus kind is enough: it is stable for a given reader, and it SHOULD
    // change when the filtered set does, since that is a different board.
    id: `${layout.key}-${i}-${t.kind}`,
  }));
}
