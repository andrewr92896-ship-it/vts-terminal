import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasEntitlement, isFounder, tierOfFeature } from '../../auth/access';
import { Icon } from '../../components/Icon';
import { TierMark } from '../../components/TierMark';
import { ReviewMark } from '../../components/ReviewMark';
import type {
  BoardTile,
  BoardTileKind,
  MembershipTier,
  PremiumFeature,
  TemplateTile,
  TradingBoard,
} from '../../api/types';
import { MobileScrollLockBar } from './scrollLock';
import { useContentWidth } from '../../lib/measure';
import { useResponsive } from '../../hooks/useMediaQuery';
import { BORDER, BORDER2, FAINT, GOLD, GREEN, MUTED, PANEL, ghostBtn, goldBtn, input } from './tvChart';
import { newTile, tileDef, tileLabel, tileLock } from './tileCatalog';
import { PRESET_LAYOUTS, buildPreset, presetLayout, type PresetLayout } from './presetLayouts';
import { BoardTileView } from './tiles';
import { TilePicker } from './tiles/TilePicker';

// Deliberately NOT WidthProvider: it sizes the board from
// `ResizeObserver.contentRect`, which is the painted width, while the pixel
// widths it then writes onto each tile land in the element's layout space. Once
// #root carries a CSS `zoom` those two differ on WebKit, so every tile came out
// a factor of the zoom too wide on iPhone — a sideways scroll on the page, and
// the TradingView iframes rendering into a box the wrong size. `useContentWidth`
// measures the space the tiles are actually written in. See lib/measure.ts.
const RGL = GridLayout;
const COLS = 12;
const ROW_H = 30;
const MARGIN = 10;
const MENU_W = 260; // preset dropdown width, clamped to the viewport when narrower

// ---- The workspace area -----------------------------------------------------
// Each board carries its own width in grid columns (`layout.cols`). 12 is the
// default — the exact canvas every board before the setting existed was built
// on, and the width that flattens well to a phone — while a wider workspace
// packs more, narrower columns onto the same screen. The board always renders
// FIT TO WIDTH (the page must never scroll sideways), so widening the workspace
// is how a television shows tiles side by side instead of a tall strip.
const MIN_WS_COLS = 6;
const MAX_WS_COLS = 36;
// Workspace resize drag: one column per this many px of pointer travel. The
// grid re-fits live as it goes, so this is a feel constant, not geometry.
const WS_NOTCH_PX = 48;

// The width a layout renders at. Floored to the tiles' own extent so a board
// can never open narrower than the tiles it carries (however the blob got that
// way), which is what the resize clamps below get to assume.
function workspaceCols(layout: { tiles?: BoardTile[] | null; cols?: number }): number {
  const tiles = layout.tiles ?? [];
  const extent = tiles.reduce((m, t) => Math.max(m, t.x + t.w), 0);
  const stored =
    typeof layout.cols === 'number' && Number.isFinite(layout.cols) ? Math.round(layout.cols) : COLS;
  return Math.max(MIN_WS_COLS, Math.min(MAX_WS_COLS, stored), Math.min(extent, 96));
}

// The saved-state baseline (and the dirty comparison) covers the workspace
// width as well as the tiles — widening the workspace is a change worth a Save.
function layoutJson(cols: number, tiles: BoardTile[]): string {
  return JSON.stringify({ cols, tiles });
}

// How many EMPTY columns each side of the arrangement has — the most a shrink
// may take, because shrinking must never cut into a tile.
function wsRooms(tiles: BoardTile[], cols: number): { left: number; right: number } {
  if (tiles.length === 0) return { left: 0, right: Math.max(0, cols - MIN_WS_COLS) };
  const minX = tiles.reduce((m, t) => Math.min(m, t.x), Number.POSITIVE_INFINITY);
  const maxX = tiles.reduce((m, t) => Math.max(m, t.x + t.w), 0);
  return { left: Number.isFinite(minX) ? minX : 0, right: Math.max(0, cols - maxX) };
}

// ---- Keeping an arrangement that has not been saved -------------------------
// An arrangement in progress survives leaving the screen: switching to another
// sidebar section and back, a reload, a new session tomorrow. Before this the
// board was rebuilt from the server on every mount, so unsaved work vanished the
// moment the trader looked at anything else, with nothing said about it.
//
// Stored per BOARD — a saved preset, a built-in layout, a teammate's shared one,
// a template being authored — under the reader's own id, and stamped with the
// baseline it was edited FROM. If that baseline no longer matches (the board was
// saved from another device, a built-in template was republished) the draft is
// DROPPED rather than replayed: an arrangement only means anything against the
// board it was made on, and laying old tile positions over different content is
// how somebody loses the newer version without being asked.
//
// The stored copy is the unsaved state only. Saving clears it, so this can never
// become a second, competing record of a board that IS saved.
const DRAFT_PREFIX = 'vts:wallDraft';

interface StoredDraft {
  /** The saved board this was edited from — `layoutJson` of the baseline. */
  base: string;
  cols: number;
  tiles: BoardTile[];
}

function draftKey(userId: string | undefined, boardKey: string | null): string | null {
  return userId && boardKey ? `${DRAFT_PREFIX}:${userId}:${boardKey}` : null;
}

function readDraft(key: string | null, base: string): { cols: number; tiles: BoardTile[] } | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft;
    if (!d || d.base !== base || !Array.isArray(d.tiles)) {
      localStorage.removeItem(key);
      return null;
    }
    return { cols: typeof d.cols === 'number' ? d.cols : COLS, tiles: d.tiles };
  } catch {
    return null;
  }
}

function writeDraft(key: string | null, draft: StoredDraft): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage full or unavailable — the edit is still on screen */
  }
}

function clearDraft(key: string | null): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// A template's tiles are geometry and kind only — no id, no per-tile settings —
// so authoring one on the real grid means minting a tile around each entry on
// the way in and throwing the extras away on the way out.
function tilesFromTemplate(list: TemplateTile[]): BoardTile[] {
  return list.map((t, i) => ({
    ...newTile(t.kind, { x: t.x, y: t.y }),
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    // Deterministic, for the reason `buildPreset` spells out: a template that
    // does not compare equal to itself between two visits discards the
    // arrangement being worked on.
    id: `tpl-${i}-${t.kind}`,
  }));
}

function templateFromTiles(list: BoardTile[]): TemplateTile[] {
  return list.map((t) => ({ kind: t.kind, x: t.x, y: t.y, w: t.w, h: t.h }));
}

// A positions tile set to grow to fit its trades (rather than scroll in a fixed
// cell). Its grid height is driven by measured content, not the stored h.
function isExpandPositions(t: BoardTile): boolean {
  return t.kind === 'positions' && (t.positionsView === 'list-expand' || t.positionsView === 'cards-expand');
}

// A watchlist in scrolling mode is TradingView's ticker tape, which is a strip of
// ONE fixed height — it does not grow to fill a taller tile the way the static
// quote list does. So the phone's minimum-height floor below is the one thing it
// must not be subject to: floored to six rows it drew a short tape above two
// thirds of a tile of nothing.
function isTickerStrip(t: BoardTile): boolean {
  return t.kind === 'watchlist' && (t.watchlistMode ?? 'scroll') !== 'static';
}

// Grid rows needed to fit `px` of content: a cell of h rows is
// ROW_H*h + MARGIN*(h-1) px tall, so solve for the smallest h that fits.
function rowsForPx(px: number): number {
  return Math.max(1, Math.ceil((px + MARGIN) / (ROW_H + MARGIN)));
}

// ---- Per-tile zoom ----------------------------------------------------------
// How large one tile's contents are drawn, independently of the tile's size on
// the board. Zoomed out, a news or calendar tile carries more rows in the same
// cell; zoomed in, a chart or a P/L figure is legible across a room. Both are
// what a wall on a television is for.
//
// It is `transform: scale` on a box sized 1/z, NOT CSS `zoom`, and that is the
// whole implementation decision. `zoom` and a nested browsing context do not
// compose in WebKit — the trap global.css documents and cancels for the
// terminal's own zoom — so a per-tile `zoom` would leave the chart, watchlist
// and live-stream embeds painted across a fraction of their tile with the
// browser's white backdrop beside them, and the global rule cannot cancel a
// factor it does not know about. A transform scales the framed document whole,
// which is exactly what is wanted, and the compensating width/height means the
// content still LAYS OUT to fill the tile — so zooming out genuinely fits more
// in rather than just shrinking what is there.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

function tileZoom(t: BoardTile): number {
  const z = typeof t.zoom === 'number' && Number.isFinite(t.zoom) ? t.zoom : 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}
function stepZoom(z: number, by: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + by) * 10) / 10));
}
// The wrapper is ALWAYS rendered, identity styles and all: swapping it in and
// out with the zoom would change the tree shape, which remounts the tile — and
// remounting a TradingView embed reloads the chart on every press of the
// button. Only the styles may change.
function zoomWrap(z: number): CSSProperties {
  if (z === 1) return { width: '100%', height: '100%' };
  return {
    width: `${100 / z}%`,
    height: `${100 / z}%`,
    transform: `scale(${z})`,
    transformOrigin: 'top left',
  };
}

// The Live Wall's board: a drag-resize grid (react-grid-layout) of tiles drawn
// from every part of the terminal — charts and quotes, the desk's open trades
// and its record, the reader's own net worth and list, their study progress, the
// team's messages.
//
// Two audiences, one screen, and the split is a membership rather than a role:
//
//  - WITHOUT `customBoards` the board is the three built-in layouts
//    (presetLayouts.ts). They are complete boards rather than a teaser, chosen
//    from the same picker a member uses, and the choice is remembered per
//    device since there is nothing saved server-side to remember it in.
//  - WITH it, the board is editable and saved: named presets, any tile the
//    account reaches, arranged however the trader wants.
//
// `desk` is whether the viewer has Advanced Trading, which is an opt-in rather
// than a tier — it decides whether the desk-reading tiles are offered at all.
// Every limit here is applied server-side too (routes/trading.ts); this only
// decides what is offered.
export function ChartBoard({
  desk = true,
  onOpenMembership,
  baseWidth,
  availWidth,
  onWorkspaceWidth,
}: {
  desk?: boolean;
  onOpenMembership?: () => void;
  /** The width the Live Wall screen is capped at by default — the pixel width
   *  of the DEFAULT 12-column workspace. Passed in rather than restated here so
   *  the screen's cap and the workspace's idea of a column are one number. */
  baseWidth: number;
  /** How wide the screen's content area actually is, measured. The ceiling on
   *  how far the workspace can grow — clamped against rather than discovered by
   *  overshooting, so widening never costs a column of tile width. */
  availWidth: number;
  /** The pixel width this board wants the screen to give it, or null for the
   *  default. Widening the workspace has to widen the SCREEN's cap — otherwise
   *  more columns only subdivide a fixed width, which shrinks every tile
   *  instead of growing the board. */
  onWorkspaceWidth?: (px: number | null) => void;
}) {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const features = user?.access.features ?? { advancedTrading: desk, funded: false, tradingTeams: false };
  const entitled = useCallback((f: PremiumFeature) => hasEntitlement(user, f), [user]);
  // Saving your own arrangement is the paid part. Without it the reader gets the
  // built-in layouts instead of an empty grid and a locked save button.
  const canCustomize = hasEntitlement(user, 'customBoards');
  // Arranging a board is a desktop action. On a phone the wall renders as one
  // column (see `layout`), and a drag there would write that flattened order
  // back over the real arrangement — so editing is simply not offered.
  const canEdit = canCustomize && !isPhone;
  // Founder-level, on the reader's REAL roles. It reveals authoring the built-in
  // layouts every other account opens on — the server refuses those routes to
  // anybody else, so this only decides whether the control is drawn.
  const isDev = isFounder(user?.roles ?? []) && !isPhone;

  // Remember the last-opened preset per user so returning to the board — after
  // toggling to Positions, a reload, or a new session — lands on the same preset
  // instead of resetting to the default.
  //
  // Scoped by DEVICE CLASS as well as by user (owner instruction, 2026-08). A
  // board is arranged against a screen: twelve columns of tiles read well at a
  // desk and flatten to one full-width column in the hand, so the board somebody
  // wants on a phone is usually not the one they want on a desktop. Separate
  // browsers already had separate storage; this also keeps one browser from
  // carrying a phone-shaped choice back to the desk when a window is narrowed.
  const deviceClass = isPhone ? 'phone' : 'desktop';
  const lastKey = user?.id ? `vts:lastBoard:${user.id}:${deviceClass}` : null;
  const builtInKey = user?.id ? `vts:wallLayout:${user.id}:${deviceClass}` : null;
  const [boards, setBoards] = useState<TradingBoard[]>([]);
  // What this reader's teammates have published. Read for everyone — a free
  // account cannot build a layout but can open the one their desk uses.
  const [teamBoards, setTeamBoards] = useState<TradingBoard[]>([]);
  // The id of the teammate's shared layout currently open, or null. Held as an
  // id rather than a flag so "Save a copy" knows exactly which row to copy —
  // matching it back by name would break the moment two people shared a layout
  // called "Scalping".
  const [sharedId, setSharedId] = useState<string | null>(null);
  // Whether there is anybody to publish to. From the server — the client has no
  // other way to know, and offering "Share with team" to a solo trader would be
  // a button whose only outcome is an error.
  const [onTeam, setOnTeam] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null); // null → unsaved working board
  const [name, setName] = useState('New board');
  // Which built-in layout a reader without `customBoards` is on.
  const [builtIn, setBuiltIn] = useState<string>(() => {
    if (!builtInKey) return PRESET_LAYOUTS[0].key;
    try {
      return localStorage.getItem(builtInKey) ?? PRESET_LAYOUTS[0].key;
    } catch {
      return PRESET_LAYOUTS[0].key;
    }
  });
  // The published templates from the server — what the Developer Terminal's
  // builder edits. Falls back to the code presets until it answers (and if it
  // never does): a picker showing three finished layouts from memory is a much
  // better failure than an empty one.
  // Loaded by `load()` rather than by an effect of its own, and that ordering is
  // load-bearing: a built-in layout's SAVED state is the template's own tiles,
  // which is both the dirty comparison and what a kept unsaved arrangement is
  // matched against. Fetching separately meant the board applied the code
  // fallback first and the server's version a moment later — two different
  // baselines for one layout, so an arrangement kept from the last visit was
  // discarded as belonging to a board that had changed.
  const [templates, setTemplates] = useState<PresetLayout[]>(PRESET_LAYOUTS);

  const [tiles, setTiles] = useState<BoardTile[]>([]);
  // The workspace width this board renders at — see workspaceCols above.
  const [cols, setCols] = useState<number>(COLS);
  const [savedTilesJson, setSavedTilesJson] = useState<string>(''); // '' → never saved
  const [editing, setEditing] = useState(false);
  // Which board the unsaved-edit draft belongs to — see the draft helpers above.
  // Held as a key rather than derived, because "the open board" is four
  // different things (a saved preset, a built-in, a teammate's, a template) and
  // a draft must never be restored onto a different one.
  const [boardKey, setBoardKey] = useState<string | null>(null);
  // The built-in layout being authored, when a developer is editing one. Null is
  // the ordinary board; anything else means Save writes a TEMPLATE draft rather
  // than one of the reader's own boards. Founder-level only — see `isDev`.
  const [tplEdit, setTplEdit] = useState<{ id: string; key: string; label: string } | null>(null);
  const [tplBusy, setTplBusy] = useState(false);
  // Read by the Escape handler, which is registered once per edit session and so
  // cannot see either value directly. Leaving template authoring is more than
  // dropping out of edit mode — it has to put the published layout back.
  const tplEditRef = useRef(tplEdit);
  tplEditRef.current = tplEdit;
  const exitTemplateEditRef = useRef<(() => void) | null>(null);
  // Whether the workspace frame itself may be resized. LOCKED even in edit
  // mode, deliberately: arranging tiles and sizing the canvas are different
  // acts, and a drag meant for a tile must never change the canvas under it.
  // The pencil on the frame's corner is the only way in, and leaving edit mode
  // always locks it back up.
  const [wsUnlocked, setWsUnlocked] = useState(false);
  const wsDrag = useRef<{
    side: 'left' | 'right';
    startX: number;
    startCols: number;
    /** Clamp baselines taken at pointer-down — a left drag shifts the tiles,
     *  so mid-drag geometry is the wrong thing to clamp against. */
    room: number;
    applied: number;
  } | null>(null);
  useEffect(() => {
    if (!editing || !canEdit) setWsUnlocked(false);
  }, [editing, canEdit]);
  useEffect(() => {
    if (!wsUnlocked) wsDrag.current = null;
  }, [wsUnlocked]);

  // Escape leaves edit mode. Every other layer of this screen that can be open
  // (the tile picker, a settings modal, the maximized tile) handles Escape
  // itself and stops it, so this only fires when the board is what the reader is
  // actually looking at. Without it the only way out is finding the Done button,
  // which on a long board can be a scroll away from wherever they were dragging.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Locking the workspace back up comes first, so Escape mid-sizing does
      // not also throw the reader out of edit mode.
      if (wsUnlocked) setWsUnlocked(false);
      else if (tplEditRef.current) exitTemplateEditRef.current?.();
      else setEditing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, wsUnlocked]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 'create' stores the arrangement on screen under a new name; 'blank' stores a
  // brand-new empty board; 'rename' retitles the open one.
  const [namePrompt, setNamePrompt] = useState<{ mode: 'create' | 'blank' | 'rename'; value: string } | null>(null);
  // Content-driven grid-row counts for positions tiles in an "expand" view, keyed
  // by tile id. These override the tile's stored h so the cell grows to fit every
  // trade; they are transient (never saved, never marked dirty).
  const [autoRows, setAutoRows] = useState<Record<string, number>>({});
  // The tile blown up to fill the screen, if any. Held by id rather than by
  // value so the overlay always renders the live tile — a setting changed while
  // expanded is the same object the board is holding.
  const [maxId, setMaxId] = useState<string | null>(null);
  const firstLoad = useRef(true);
  // The board's own width, read from the element rather than a resize entry —
  // see lib/measure.ts for why that distinction is the whole bug on iPhone.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardW = useContentWidth(boardRef, 1120);

  // ---- What the workspace width actually DOES -------------------------------
  // A column is a fixed slice of width, not a fraction of a fixed board: 12
  // columns is `baseWidth`, so 18 columns asks the screen for half again as
  // much room. That is the whole point — the dotted box GROWS and the tiles
  // keep their size, rather than the same width being cut into thinner columns
  // (which shrinks every tile, and is what this replaced).
  //
  // Phones never ask: they render one flattened column and ignore `cols`.
  const wantWallW = isPhone ? null : Math.round((baseWidth * cols) / COLS);
  useEffect(() => {
    if (!onWorkspaceWidth) return;
    onWorkspaceWidth(wantWallW);
    return () => onWorkspaceWidth(null);
  }, [wantWallW, onWorkspaceWidth]);

  // The screen is the ceiling, and it is CLAMPED AGAINST rather than discovered
  // by overshooting it: the widest workspace that fits is whole columns of
  // `baseWidth / COLS` into the measured content area, so growing stops one
  // column before anything would have to get thinner. (Reacting to a board that
  // came back narrower than asked would work too, but costs a visible column of
  // tile width every time somebody reaches the edge.) Measured, never assumed —
  // the terminal zoom means the layout space available is not the number of
  // pixels on the glass; see lib/measure.ts.
  const fitCols = Math.floor((availWidth * COLS) / Math.max(1, baseWidth));
  const maxCols = Math.max(MIN_WS_COLS, Math.min(MAX_WS_COLS, fitCols));
  // A board arranged wider than this screen still renders here — it just fits
  // itself to the width, the same as it always has. Only GROWING is capped, and
  // only while somebody is sizing the workspace, so opening a television board
  // on a laptop never rewrites the width it was built at.
  const atScreenLimit = cols >= maxCols;
  // Read by the drag, which cannot re-read state mid-gesture.
  const maxColsRef = useRef(MAX_WS_COLS);
  maxColsRef.current = Math.max(maxCols, cols);

  // While the workspace is unlocked the board pulls in from the sides, so the
  // dotted frame reads as an object floating on the page with its side handles
  // in reach — pressed against the container edge there is nothing to grab.
  // Plain padding, deliberately no transform: a scale would reopen the two-
  // coordinate-space trap lib/measure.ts exists to close.
  const wsGutter = wsUnlocked ? 44 : 0;
  // Locked, the grid takes the measured width exactly as it always has — the
  // floor only guards the unlocked state's subtraction.
  const gridW = wsUnlocked ? Math.max(320, boardW - wsGutter * 2) : boardW;

  // Open a board and, if there is one, put the reader's unsaved arrangement of
  // it back. `base` is what the board looks like SAVED, which is both the dirty
  // comparison and the stamp the draft is matched against.
  const applySaved = useCallback(
    (key: string, base: { cols: number; tiles: BoardTile[] }) => {
      const json = layoutJson(base.cols, base.tiles);
      const draft = readDraft(draftKey(user?.id, key), json);
      setBoardKey(key);
      setSavedTilesJson(json);
      setCols(draft?.cols ?? base.cols);
      setTiles(draft?.tiles ?? base.tiles);
      setWsUnlocked(false);
      setNamePrompt(null);
    },
    [user?.id],
  );

  const applyBoard = useCallback(
    (b: TradingBoard) => {
      setActiveId(b.id);
      setSharedId(null);
      setTplEdit(null);
      setName(b.name);
      applySaved(`b:${b.id}`, { cols: workspaceCols(b.layout), tiles: b.layout.tiles ?? [] });
      if (lastKey) {
        try {
          localStorage.setItem(lastKey, b.id);
        } catch {
          /* storage unavailable — non-fatal */
        }
      }
    },
    [lastKey, applySaved],
  );

  // Switch to a built-in layout. Rebuilt through `buildPreset` so it is filtered
  // to what this reader can actually reach before it ever renders.
  const applyBuiltInFrom = useCallback(
    (list: PresetLayout[], key: string) => {
      setBuiltIn(key);
      setActiveId(null);
      setSharedId(null);
      setTplEdit(null);
      const p = list.find((t) => t.key === key) ?? list[0] ?? presetLayout(key);
      setName(p.label);
      const built = buildPreset(p, features, entitled);
      // Baselined against what was just applied, so an untouched built-in layout
      // is not "modified". Without this every layout switch asked "discard
      // unsaved changes?" about changes nobody had made. The built-in templates
      // are authored on the default canvas, so 12 columns is the baseline width.
      //
      // Keyed on the layout actually SHOWN (`p.key`), not the one asked for — a
      // key with no template falls back to the first, and a kept arrangement
      // must belong to the board on screen.
      applySaved(`t:${p.key}`, { cols: COLS, tiles: built });
      if (builtInKey) {
        try {
          localStorage.setItem(builtInKey, key);
        } catch {
          /* ignore */
        }
      }
    },
    [builtInKey, features, entitled, applySaved],
  );
  const applyBuiltIn = useCallback(
    (key: string) => applyBuiltInFrom(templates, key),
    [applyBuiltInFrom, templates],
  );

  const load = useCallback(async () => {
    // The published built-in layouts, before anything is applied. A failure
    // keeps the code fallback — a picker showing three finished layouts from
    // memory is a far better failure than an empty one.
    let tpls = templates;
    try {
      const r = await api.wallTemplates();
      if (r.templates.length > 0) {
        tpls = r.templates.map((t) => ({ key: t.key, label: t.label, blurb: t.blurb, tiles: t.tiles }));
        setTemplates(tpls);
      }
    } catch {
      /* keep whatever the picker already had */
    }
    try {
      // A reader without `customBoards` has nothing saved to load, and the read
      // would only ever come back empty — so go straight to the built-ins.
      if (!canCustomize) {
        applyBuiltInFrom(tpls, builtIn);
        setError(null);
        return;
      }
      const { boards: list, teamBoards: shared, onTeam: team } = await api.tradingBoards();
      setBoards(list);
      setTeamBoards(shared);
      setOnTeam(team);
      if (firstLoad.current) {
        if (list.length > 0) {
          // Prefer the user's last-opened preset, then their default, then the first.
          let savedId: string | null = null;
          if (lastKey) {
            try {
              savedId = localStorage.getItem(lastKey);
            } catch {
              /* ignore */
            }
          }
          // This device's own default before the account's, so a phone opens
          // the board that was arranged for a phone. Nothing set for a phone
          // falls back to the account default, which is the behaviour every
          // board had before the two were split.
          const deviceDefault = isPhone
            ? (list.find((b) => b.isDefaultPhone) ?? list.find((b) => b.isDefault))
            : list.find((b) => b.isDefault);
          applyBoard(list.find((b) => b.id === savedId) ?? deviceDefault ?? list[0]);
        } else {
          // Nothing saved yet: open on a built-in layout rather than an empty
          // grid, so a first visit shows a finished board.
          applyBuiltInFrom(tpls, builtIn);
        }
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your boards');
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [applyBoard, applyBuiltInFrom, builtIn, canCustomize, isPhone, lastKey, templates]);

  useEffect(() => {
    void load();
    // Only on mount and when the customization right changes. `load` reads the
    // current built-in choice and the boards list itself, so re-running it on
    // every identity change of those would re-apply a board over the trader's
    // unsaved edits. Its `finally` clears `loading` on both paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCustomize]);

  // Resolved from the live list, so a tile removed while expanded closes the
  // overlay rather than leaving it showing something the board no longer has.
  const maxTile = maxId ? (tiles.find((t) => t.id === maxId) ?? null) : null;

  const boardJson = useMemo(() => layoutJson(cols, tiles), [cols, tiles]);
  const isUnsaved = activeId == null;
  // Modified since it was applied — deliberately NOT "unsaved". A built-in
  // layout is permanently unsaved and is nonetheless untouched, and conflating
  // the two made every layout switch warn about discarding nothing.
  const dirty = boardJson !== savedTilesJson;
  const activeBoard = activeId ? (boards.find((b) => b.id === activeId) ?? null) : null;

  // Keep the unsaved arrangement on the device, so leaving the screen does not
  // throw it away (see the draft helpers at the top of this file). Debounced,
  // because a single drag fires this on every frame of the gesture and a write
  // per frame is a write per frame.
  const pendingDraft = useRef<{ key: string; draft: StoredDraft } | null>(null);
  useEffect(() => {
    const key = draftKey(user?.id, boardKey);
    if (!key) return;
    if (!dirty) {
      pendingDraft.current = null;
      clearDraft(key);
      return;
    }
    const draft: StoredDraft = { base: savedTilesJson, cols, tiles };
    pendingDraft.current = { key, draft };
    const id = window.setTimeout(() => {
      writeDraft(key, draft);
      pendingDraft.current = null;
    }, 400);
    return () => window.clearTimeout(id);
  }, [user?.id, boardKey, dirty, savedTilesJson, cols, tiles]);
  // Flush whatever the debounce is still holding when the board goes away.
  // Leaving the screen is precisely the case this whole mechanism exists for, so
  // a drag finished within the debounce window must not be the one edit it
  // loses.
  useEffect(
    () => () => {
      const p = pendingDraft.current;
      if (p) writeDraft(p.key, p.draft);
    },
    [],
  );

  // Which tiles this reader cannot reach, resolved once per render rather than
  // per tile per frame.
  const locks = useMemo(() => {
    const m = new Map<string, ReturnType<typeof tileLock>>();
    for (const t of tiles) m.set(t.id, tileLock(t.kind, features, entitled));
    return m;
  }, [tiles, features, entitled]);

  const layout: Layout[] = useMemo(() => {
    // A phone gets ONE column, in the board's own reading order.
    //
    // The grid is a desktop idea: at twelve columns a four-wide tile is about a
    // third of a 390px screen, which is not a tile, it is a sliver. Rather than
    // a second mobile board to keep in sync, the same tiles stack full-width in
    // the order they are arranged in — top-to-bottom, then left-to-right, which
    // is how the desktop board reads anyway.
    //
    // The stored x/y/w are untouched: the phone only changes what is RENDERED,
    // so opening the same board on a desktop finds the arrangement intact. That
    // is also why editing is off here (see `canEdit`) — a drag on the phone
    // would otherwise write this flattened order back over the real one.
    if (isPhone) {
      const ordered = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
      let y = 0;
      return ordered.map((t) => {
        const auto = isExpandPositions(t) ? autoRows[t.id] : undefined;
        // Give every tile a floor on a phone: a 3-row tile is legible in a
        // 12-wide strip and unreadable as a full-width stub. The exception is a
        // tile whose content is a fixed-height strip, which the floor can only
        // pad out with empty tile.
        const floor = isTickerStrip(t) ? 0 : 6;
        const h = Math.max(auto ?? t.h, tileDef(t.kind)?.minH ?? 4, floor);
        const row = { i: t.id, x: 0, y, w: 1, h, minW: 1, minH: h, static: true };
        y += h;
        return row;
      });
    }
    return tiles.map((t) => {
      // An expand positions tile is sized by its measured content — but as a
      // FLOOR, not as a pin. The rule it exists to keep is "every trade is
      // visible without an inner scroll", and that only requires the cell never
      // be SHORTER than its content (`minH`). Pinning `maxH` to the same figure
      // additionally forbade dragging it TALLER, which is not the same rule and
      // is not wanted: on a wall of empty positions the tile could not be given
      // the room the arrangement needed, and a resize handle that refuses to
      // move reads as broken. Extra height is just space — it reintroduces no
      // scroll.
      const auto = isExpandPositions(t) ? autoRows[t.id] : undefined;
      const def = tileDef(t.kind);
      return {
        i: t.id,
        x: t.x,
        y: t.y,
        w: t.w,
        h: Math.max(t.h, auto ?? 0),
        minW: def?.minW ?? 3,
        // The content floor and the kind's own floor, whichever is larger — a
        // tile with one trade in it still may not be shrunk to a sliver.
        minH: Math.max(auto ?? 0, def?.minH ?? 4),
      };
    });
  }, [tiles, autoRows, isPhone]);

  const onLayoutChange = useCallback(
    (next: Layout[]) => {
      // Only persist layout while editing. Outside edit mode the only layout
      // changes come from expand tiles auto-growing (and reflowing others); those
      // are transient and must not dirty the board or overwrite saved positions.
      // While the WORKSPACE is being sized the resize is the only writer — the
      // grid re-fits on every column change, and its echoes of that reflow must
      // not write tile geometry mid-shift.
      if (!editing || wsUnlocked) return;
      setTiles((prev) =>
        prev.map((t) => {
          const l = next.find((n) => n.i === t.id);
          if (!l) return t;
          // Keep an expand tile's saved base height — its live height is content-
          // driven, so don't bake the auto-grown value into the preset. A
          // deliberate drag is a different thing and is recorded by
          // `onResizeStop`, which is the only writer of an expand tile's height.
          return { ...t, x: l.x, y: l.y, w: l.w, h: isExpandPositions(t) ? t.h : l.h };
        }),
      );
    },
    [editing, wsUnlocked],
  );

  // ---- Sizing the workspace ------------------------------------------------
  // Both entrances — the side-handle drag and the − / + steppers — move the
  // frame by whole columns on ONE side. Growing the left inserts columns there
  // and shifts every tile right, so the arrangement keeps its place against the
  // right edge; shrinking only ever removes EMPTY columns on that side.
  const stepWorkspace = useCallback(
    (side: 'left' | 'right', by: number) => {
      const room = wsRooms(tiles, cols)[side];
      const d = Math.max(Math.max(-room, MIN_WS_COLS - cols), Math.min(maxColsRef.current - cols, by));
      if (d === 0) return;
      setCols(cols + d);
      if (side === 'left') setTiles((prev) => prev.map((t) => ({ ...t, x: t.x + d })));
    },
    [tiles, cols],
  );

  const wsHandleDown = useCallback(
    (side: 'left' | 'right') => (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      wsDrag.current = { side, startX: e.clientX, startCols: cols, room: wsRooms(tiles, cols)[side], applied: 0 };
    },
    [tiles, cols],
  );
  const wsHandleMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = wsDrag.current;
    if (!drag) return;
    const raw = e.clientX - drag.startX;
    // Dragging a side OUTWARD grows that side. Clamped against the geometry
    // recorded at pointer-down (`room`), and applied as an absolute delta from
    // there, so a burst of moves between renders cannot double-apply.
    const wanted = Math.round((drag.side === 'right' ? raw : -raw) / WS_NOTCH_PX);
    // The upper clamp is read live: once the box fills the screen, `maxColsRef`
    // freezes at the current width, so dragging further simply does nothing
    // rather than thinning the columns. Shrinking is always allowed.
    const d = Math.max(
      Math.max(-drag.room, MIN_WS_COLS - drag.startCols),
      Math.min(maxColsRef.current - drag.startCols, wanted),
    );
    if (d === drag.applied) return;
    const shift = drag.side === 'left' ? d - drag.applied : 0;
    drag.applied = d;
    setCols(drag.startCols + d);
    if (shift !== 0) setTiles((prev) => prev.map((t) => ({ ...t, x: t.x + shift })));
  }, []);
  const wsHandleUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    wsDrag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  // A finished resize, recorded as the trader's own choice of height. Needed
  // because `onLayoutChange` cannot tell a deliberate drag from a content
  // reflow, and for a content-sized tile it has to ignore the latter.
  const onResizeStop = useCallback(
    (_layout: Layout[], _old: Layout, item: Layout) => {
      if (!editing || wsUnlocked) return;
      setTiles((prev) => prev.map((t) => (t.id === item.i ? { ...t, w: item.w, h: item.h } : t)));
    },
    [editing, wsUnlocked],
  );

  const patchTile = useCallback((id: string, patch: Partial<BoardTile>) => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);
  const removeTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id));
    setAutoRows((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // An expand positions tile reports its natural content height; convert it to a
  // grid-row count (null clears the override when it stops expanding).
  const measureTile = useCallback((id: string, px: number | null) => {
    setAutoRows((prev) => {
      if (px == null) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const rows = rowsForPx(px);
      return prev[id] === rows ? prev : { ...prev, [id]: rows };
    });
  }, []);

  const addTile = useCallback((kind: BoardTileKind) => {
    setTiles((prev) => {
      // Drop new tiles at the bottom of the current stack.
      const maxY = prev.reduce((m, t) => Math.max(m, t.y + t.h), 0);
      return [...prev, newTile(kind, { x: 0, y: maxY })];
    });
    setEditing(true);
  }, []);

  // Load layout — drop the unsaved arrangement and go back to the board as it is
  // saved. The one control here that destroys work, so it is the one that asks.
  const revert = useCallback(() => {
    if (!dirty) return;
    if (!window.confirm('Are you sure? Your current changes will be lost.')) return;
    try {
      const base = JSON.parse(savedTilesJson) as { cols?: number; tiles?: BoardTile[] };
      setCols(typeof base.cols === 'number' ? base.cols : COLS);
      setTiles(base.tiles ?? []);
    } catch {
      /* a baseline that will not parse means there is nothing to go back to */
      return;
    }
    clearDraft(draftKey(user?.id, boardKey));
    setWsUnlocked(false);
  }, [dirty, savedTilesJson, user?.id, boardKey]);

  // "Save as new" — keep the current layout exactly as it is and save it under
  // a new name as a separate preset (the original board is left untouched). It
  // never discards or resets the tiles; it just opens the name prompt, and
  // confirmName's 'create' branch persists the current tiles.
  const saveAsNew = () => setNamePrompt({ mode: 'create', value: isUnsaved ? name : `${name} copy` });

  // ---- Authoring a built-in layout ------------------------------------------
  // The three layouts every account without `customBoards` chooses between are
  // rows in the database, and until now the only way to arrange one was typing
  // x/y/w/h into a list in the Developer Terminal. This edits the same rows on
  // the real grid — the board a member will actually open — and publishes from
  // there. Founder-level only, and the SERVER is the enforcer: every route
  // behind these calls is `requireFounder`.
  //
  // DRAFT THEN PUBLISH is preserved exactly. Saving writes the draft; only
  // Publish reaches a member. Without that split, a half-moved tile is what
  // every unpaid account opens on for as long as somebody is arranging it.
  const refreshTemplates = useCallback(async () => {
    try {
      const r = await api.wallTemplates();
      if (r.templates.length > 0) {
        setTemplates(r.templates.map((t) => ({ key: t.key, label: t.label, blurb: t.blurb, tiles: t.tiles })));
      }
    } catch {
      /* the picker keeps whatever it already had */
    }
  }, []);

  const startTemplateEdit = async () => {
    if (tplBusy) return;
    setTplBusy(true);
    try {
      const { templates: rows } = await api.adminWallTemplates();
      const row = rows.find((t) => t.key === builtIn);
      if (!row) {
        setError('That built-in layout is no longer in the templates list.');
        return;
      }
      setActiveId(null);
      setSharedId(null);
      setName(row.label);
      setTplEdit({ id: row.id, key: row.key, label: row.label });
      // The DRAFT rather than the published tiles, so a layout half-arranged
      // yesterday is picked up where it was left. Templates are authored on the
      // default 12-column canvas — `parseTiles` clamps to it server-side.
      applySaved(`tpl:${row.id}`, { cols: COLS, tiles: tilesFromTemplate(row.draft) });
      setEditing(true);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open that layout for editing');
    } finally {
      setTplBusy(false);
    }
  };

  const saveTemplateDraft = async () => {
    if (!tplEdit || tplBusy) return;
    setTplBusy(true);
    try {
      await api.saveWallTemplateDraft(tplEdit.id, { tiles: templateFromTiles(tiles) });
      setSavedTilesJson(layoutJson(cols, tiles));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that layout');
    } finally {
      setTplBusy(false);
    }
  };

  const publishTemplate = async () => {
    if (!tplEdit || tplBusy) return;
    if (!window.confirm(`Publish "${tplEdit.label}" to everyone? This replaces the layout members open on.`)) return;
    setTplBusy(true);
    try {
      // Save first, so Publish always sends what is on screen rather than
      // whatever the draft happened to hold.
      await api.saveWallTemplateDraft(tplEdit.id, { tiles: templateFromTiles(tiles) });
      await api.publishWallTemplate(tplEdit.id);
      setSavedTilesJson(layoutJson(cols, tiles));
      await refreshTemplates();
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not publish that layout');
    } finally {
      setTplBusy(false);
    }
  };

  const exitTemplateEdit = () => {
    setTplEdit(null);
    setEditing(false);
    // Back to the published layout as a member sees it. The unsaved arrangement
    // stays on the device under its own key, so re-opening the editor resumes
    // rather than restarts.
    void (async () => {
      await refreshTemplates();
      applyBuiltIn(builtIn);
    })();
  };
  exitTemplateEditRef.current = exitTemplateEdit;

  const save = async () => {
    if (tplEdit) {
      void saveTemplateDraft();
      return;
    }
    if (saving) return;
    if (isUnsaved) {
      // Naming it is the same step for everybody now: how many boards you may
      // keep follows the membership rather than the desk opt-in, so a Markets-
      // only member who paid for custom boards gets real presets like anyone
      // else, instead of one board silently called "My board".
      setNamePrompt({ mode: 'create', value: name });
      return;
    }
    setSaving(true);
    try {
      const { board, boards: list, teamBoards: shared } = await api.updateBoard(activeId!, { layout: { tiles, cols } });
      setBoards(list);
      setTeamBoards(shared);
      // The saved board IS the arrangement now, so the effect above drops the
      // stored draft on the next pass — there is nothing unsaved left to keep.
      setSavedTilesJson(layoutJson(workspaceCols(board.layout), board.layout.tiles ?? []));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the board');
    } finally {
      setSaving(false);
    }
  };

  const confirmName = async () => {
    if (!namePrompt) return;
    const nm = namePrompt.value.trim();
    if (!nm) return;
    setSaving(true);
    try {
      if (namePrompt.mode === 'create' || namePrompt.mode === 'blank') {
        const blank = namePrompt.mode === 'blank';
        const { board, boards: list, teamBoards: shared } = await api.createBoard({
          name: nm,
          // A blank board is empty at the default width — deliberately NOT the
          // tiles on screen, which belong to the board being left behind.
          layout: blank ? { tiles: [], cols: COLS } : { tiles, cols },
          isDefault: boards.length === 0,
        });
        setBoards(list);
        setTeamBoards(shared);
        // The arrangement is stored now — under a new name, but stored. So the
        // board it was made on goes back to clean rather than keeping a copy of
        // edits that have already been saved somewhere else, which would greet
        // the trader with the same "unsaved changes" the next time they open it.
        //
        // A blank board stored nothing of that arrangement, so its draft is left
        // exactly where it is: creating a new layout must never be what discards
        // the unsaved work on the board you were looking at.
        if (!blank) clearDraft(draftKey(user?.id, boardKey));
        applyBoard(board);
        // Straight into edit mode: an empty board has nothing to read, and
        // adding the first tile is the only thing to do with it.
        if (blank) setEditing(true);
      } else {
        const { board, boards: list, teamBoards: shared } = await api.updateBoard(activeId!, { name: nm });
        setBoards(list);
        setTeamBoards(shared);
        setName(board.name);
      }
      setNamePrompt(null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the board');
    } finally {
      setSaving(false);
    }
  };

  // Open a teammate's published layout.
  //
  // Read-only by construction: `activeId` stays null, so there is nothing for
  // Save to write to. Nothing of theirs comes with it either — the tiles fetch
  // as the signed-in reader, so this shows THEIR arrangement of YOUR figures.
  const applyShared = useCallback(
    (b: TradingBoard) => {
      setActiveId(null);
      setSharedId(b.id);
      setTplEdit(null);
      setName(b.name);
      // A shared layout keeps the width its author arranged it on — the
      // arrangement is the point, and the width is part of it. Baselined for the
      // same reason as a built-in: opening a teammate's layout is not an edit.
      applySaved(`s:${b.id}`, { cols: workspaceCols(b.layout), tiles: b.layout.tiles ?? [] });
      setEditing(false);
    },
    [applySaved],
  );

  // Take a copy of the shared layout currently open, into the reader's own
  // boards, where they can rearrange it freely.
  const copyShared = async (sourceId: string) => {
    setSaving(true);
    try {
      const { board, boards: list, teamBoards: shared } = await api.copyTeamBoard(sourceId);
      setBoards(list);
      setTeamBoards(shared);
      applyBoard(board);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not copy that layout');
    } finally {
      setSaving(false);
    }
  };

  // Publish this board to the team, or take it back. One per person: the server
  // unshares the reader's others, so the picker stays a short menu.
  const toggleShare = async () => {
    if (isUnsaved) return;
    const next = !activeBoard?.sharedTeamId;
    setSaving(true);
    try {
      const { boards: list, teamBoards: shared, onTeam: team } = await api.shareBoard(activeId!, next);
      setBoards(list);
      setTeamBoards(shared);
      setOnTeam(team);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not share that board');
    } finally {
      setSaving(false);
    }
  };

  // Which board this device class opens on. Two flags rather than one, set from
  // the same menu: a desktop is where boards are arranged, so both are chosen
  // from here — a phone cannot reach this menu at all (`canEdit` is false
  // there), which is exactly why the phone's default has to be settable from
  // somewhere else.
  const setDefault = async (which: 'desktop' | 'phone') => {
    if (isUnsaved) return;
    try {
      const { boards: list, teamBoards: shared } = await api.updateBoard(
        activeId!,
        which === 'phone' ? { isDefaultPhone: true } : { isDefault: true },
      );
      setBoards(list);
      setTeamBoards(shared);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set the default board');
    }
  };

  const deleteBoard = async () => {
    if (isUnsaved) return;
    if (!window.confirm(`Delete the board "${name}"? This can't be undone.`)) return;
    try {
      const { boards: list, teamBoards: shared } = await api.removeBoard(activeId!);
      setBoards(list);
      setTeamBoards(shared);
      // A deleted board's kept-but-unsaved arrangement goes with it — there is
      // no longer anything for it to be an arrangement OF.
      clearDraft(draftKey(user?.id, `b:${activeId}`));
      if (list.length > 0) applyBoard(list.find((b) => b.isDefault) ?? list[0]);
      else applyBuiltIn(builtIn);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the board');
    }
  };

  if (loading) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>{"Loading your board…"}</div>;

  const customBoardsTier = tierOfFeature('customBoards', user?.access.membership);

  return (
    <div>
      <style>{PLACEHOLDER_CSS}</style>
      <MobileScrollLockBar />

      {/* Toolbar — the layout picker and the actions share one wrapping row, so
          the board starts right below it when you're just watching. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={railLabel}>Layout</span>
        <LayoutPicker
          boards={canCustomize ? boards : []}
          teamBoards={teamBoards}
          activeId={activeId}
          builtIn={builtIn}
          name={name}
          isUnsaved={isUnsaved}
          sharedId={sharedId}
          templates={templates}
          onPickBoard={(b) => applyBoard(b)}
          onPickBuiltIn={(k) => applyBuiltIn(k)}
          onPickShared={(b) => applyShared(b)}
          // "Create New Layout" — a blank board, from the same menu the existing
          // ones are chosen in.
          //
          // Marked rather than hidden for a free account, which is the rule the
          // sidebar rows and the tile picker follow: somebody has to be able to
          // see what a membership would let them do. A member on a PHONE is the
          // one case the row is dropped — they cannot arrange a grid here at all
          // (see `canEdit`), and a blank board they have no way to fill is worse
          // than no row.
          createTier={canCustomize ? null : customBoardsTier}
          onCreateNew={canEdit ? () => setNamePrompt({ mode: 'blank', value: '' }) : canCustomize ? null : (onOpenMembership ?? null)}
        />

        {/* A teammate's layout is not the reader's to save over, so the one
            action offered is taking a copy of it. Free accounts can open a
            shared layout but not copy it — copying creates a board. */}
        {sharedId && canCustomize && (
          <button onClick={() => void copyShared(sharedId)} disabled={saving} style={goldBtn}>
            {saving ? 'Copying…' : 'Save a copy'}
          </button>
        )}

        {canEdit && !sharedId ? (
          <>
            <button
              onClick={() => (tplEdit ? exitTemplateEdit() : setEditing((v) => !v))}
              style={{
                ...(editing ? goldBtn : ghostBtn),
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {editing ? (
                <Icon name="check" size={12} color={editing ? '#0c2768' : '#dfe7fa'} />
              ) : (
                // The Premium star rather than a pencil: arranging your own board
                // is what the membership buys, so the control that opens it says
                // so. Drawn for everyone who has it too — the mark states what a
                // thing costs, it is not a lock.
                <TierMark tier={customBoardsTier} size={12} />
              )}
              <span>{editing ? (tplEdit ? 'Done' : 'Done editing') : 'Edit layout'}</span>
            </button>

            {/* Authoring the layouts every other account opens on. Founder-level
                only, and shown only while a built-in layout is the one open —
                that is what it edits. The crown is the Developer Terminal's own
                mark, so a developer-only control carries it here too. */}
            {isDev && !editing && isUnsaved && (
              <button
                onClick={() => void startTemplateEdit()}
                disabled={tplBusy}
                style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="crown" size={12} color={GOLD} />
                <span>{tplBusy ? 'Opening…' : 'Edit default layout'}</span>
              </button>
            )}

            {editing && !tplEdit && (
              <>
                <TilePicker onAdd={addTile} onOpenMembership={onOpenMembership} />
                {/* Every action on the open preset, behind one control. They were
                    six buttons in this row, which on a narrow board wrapped into
                    a second and third line of controls above the board itself. */}
                <PresetSettingsMenu
                  isUnsaved={isUnsaved}
                  dirty={dirty}
                  saving={saving}
                  onTeam={onTeam}
                  shared={!!activeBoard?.sharedTeamId}
                  onRename={() => setNamePrompt({ mode: 'rename', value: name })}
                  isDesktopDefault={!!activeBoard?.isDefault}
                  isPhoneDefault={!!activeBoard?.isDefaultPhone}
                  onSetDefault={(which) => void setDefault(which)}
                  onShare={() => void toggleShare()}
                  onSaveAsNew={saveAsNew}
                  onSave={() => void save()}
                  onDelete={() => void deleteBoard()}
                />
              </>
            )}

            {/* Authoring a built-in layout has its own two actions, because the
                thing being written is not one of the reader's own boards: Save
                writes the DRAFT, and Publish is the separate, deliberate step
                that puts it in front of members. */}
            {editing && tplEdit && (
              <>
                <TilePicker onAdd={addTile} onOpenMembership={onOpenMembership} />
                <span style={tplChip}>
                  <Icon name="crown" size={11} color={GOLD} />
                  <span>Default layout · {tplEdit.label}</span>
                </span>
                <button
                  onClick={() => void publishTemplate()}
                  disabled={tplBusy}
                  style={{ ...ghostBtn, opacity: tplBusy ? 0.55 : 1 }}
                >
                  {"Publish to everyone"}
                </button>
              </>
            )}

            {/* The unsaved pair. Shown whenever there ARE unsaved changes, in
                edit mode or out of it — the arrangement is kept when the trader
                leaves the screen, so they come back to a board that is already
                changed and need to be able to act on it without first finding
                their way back into edit mode. */}
            {dirty && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: FAINT }}>Unsaved changes</span>
                <button onClick={revert} style={ghostBtn}>
                  {"Load layout"}
                </button>
                <button
                  onClick={save}
                  disabled={saving || tplBusy}
                  style={{ ...goldBtn, opacity: saving || tplBusy ? 0.55 : 1 }}
                >
                  {saving || tplBusy ? 'Saving…' : 'Save layout'}
                </button>
              </div>
            )}
          </>
        ) : canCustomize ? (
          // A member on a phone: they already hold this, they simply cannot
          // arrange a grid here. Showing them the upsell would be telling a
          // paying customer to buy what they have bought.
          <span style={{ fontSize: 11, color: FAINT }}>{"Arrange this board on a larger screen"}</span>
        ) : (
          // The paid half, stated rather than hidden: the reader can see that
          // arranging their own board is what a membership adds.
          <button onClick={onOpenMembership} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="pencil" size={12} color={FAINT} />
            <span>Build your own</span>
            <TierMark tier={customBoardsTier} size={11} />
          </button>
        )}
      </div>

      {namePrompt && (
        <div style={namePromptRow}>
          {/* The blank case names a board that does not exist yet, while the
              board on screen is still the previous one — "Name this board"
              would read as retitling what is in front of them. */}
          <span style={{ fontSize: 11.5, color: MUTED }}>
            {namePrompt.mode === 'rename' ? 'Rename board' : namePrompt.mode === 'blank' ? 'Name your new board' : 'Name this board'}
          </span>
          <input
            autoFocus
            value={namePrompt.value}
            onChange={(e) => setNamePrompt({ ...namePrompt, value: e.target.value.slice(0, 80) })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirmName();
              if (e.key === 'Escape') setNamePrompt(null);
            }}
            placeholder="e.g. Forex scalp"
            style={{ ...input, minWidth: 200 }}
          />
          <button onClick={() => void confirmName()} disabled={saving} style={goldBtn}>
            {namePrompt.mode === 'rename' ? 'Rename' : namePrompt.mode === 'blank' ? 'Create' : 'Save'}
          </button>
          <button onClick={() => setNamePrompt(null)} style={ghostBtn}>
            {"Cancel"}
          </button>
        </div>
      )}

      {error && <div style={errBanner}>{error}</div>}

      {/* The measured element is ALWAYS mounted, empty board or not.
          `useContentWidth` measures in a layout effect keyed on the ref, and a
          RefObject cannot notify the hook when it later becomes non-null — so a
          board div that only appears once tiles arrive is never measured, and
          the grid silently keeps its fallback width forever. On a desktop that
          is a slightly narrow board; on a phone it is 1100px-wide tiles inside a
          390px viewport. Keep this div outside the conditional. */}
      <div ref={boardRef}>
        {tiles.length === 0 ? (
          <div style={emptyState}>
            {!canEdit
              ? 'This layout has nothing you can see yet.'
              : editing
                ? 'This board is empty. Add a tile.'
                : 'This board is empty. Turn on Edit layout and add a tile.'}
          </div>
        ) : (
          <>
            {/* The workspace area. The padded outer box gives the unlocked
                frame its side gutters; the relative inner box is what the
                dotted outline and its controls anchor to, so they always wrap
                the grid exactly whatever height it grows to. */}
            <div style={{ paddingTop: editing && canEdit ? 16 : 0, paddingLeft: wsGutter, paddingRight: wsGutter }}>
            <div style={{ position: 'relative' }} className={wsUnlocked ? 'ws-sizing' : undefined}>
            <RGL
              className="layout"
              width={gridW}
              layout={layout}
              cols={isPhone ? 1 : cols}
              rowHeight={ROW_H}
              margin={[10, 10]}
              // `canEdit` as well as `editing`: a board left in edit mode on a
              // desktop and then narrowed to a phone would otherwise stay
              // draggable, and a drag there writes the flattened one-column
              // order back over the real arrangement. `!wsUnlocked` for the
              // mirror of the reason the workspace is locked while tiles are
              // arranged: while the CANVAS is being sized, the tiles freeze.
              isDraggable={editing && canEdit && !wsUnlocked}
              isResizable={editing && canEdit && !wsUnlocked}
              // ALL FOUR CORNERS, not just the bottom-right (owner instruction,
              // 2026-08). Dragging only from the south-east corner means a tile
              // at the right edge of the board can be made bigger but not
              // smaller from the side you are actually looking at, and a tile
              // low on a long board has its one handle off screen.
              //
              // Corners only, deliberately — not the edges as well. An edge
              // handle sits along the whole side of a tile, which on this board
              // overlaps the tile's own scrollable body and its controls, so a
              // drag meant for the content starts a resize instead. Corners are
              // small, unambiguous, and are what people reach for.
              resizeHandles={['se', 'sw', 'ne', 'nw']}
              draggableHandle=".tile-header"
              draggableCancel=".no-drag"
              onLayoutChange={onLayoutChange}
              // The one writer of an expand tile's stored height. Its live
              // height follows its content, so `onLayoutChange` deliberately
              // ignores `h` for those — but a drag is the trader stating what
              // they want, and that has to survive the next content reflow.
              onResizeStop={onResizeStop}
              compactType="vertical"
            >
              {tiles.map((t) => {
                const z = tileZoom(t);
                return (
                <div
                  key={t.id}
                  className={`wall-cell${editing ? ' wall-cell-editing' : ''}`}
                  style={{ overflow: 'hidden', position: 'relative' }}
                >
                  {/* The zoom wrapper. In the CELL rather than in the tile, for
                      the same reason the expand button is: there is a component
                      per tile kind and this way every one of them zooms with no
                      per-tile change. */}
                  <div style={zoomWrap(z)}>
                    <BoardTileView
                      tile={t}
                      editing={editing}
                      lock={locks.get(t.id) ?? null}
                      onChange={(p) => patchTile(t.id, p)}
                      onRemove={() => removeTile(t.id)}
                      // The tile reports its content height in its OWN space,
                      // which the zoom has already stretched — so the rows the
                      // cell actually needs is that height painted, not laid
                      // out. Without the factor a zoomed-out expand tile grows
                      // rows for content that now takes far less room.
                      onMeasure={(px) => measureTile(t.id, px == null ? null : px * z)}
                      onOpenMembership={onOpenMembership}
                    />
                  </div>
                  {/* Zoom, while editing. Deliberately bottom-CENTRE: all four
                      corners are resize handles in edit mode, and the header is
                      what a tile is dragged by. Edit mode rather than reading
                      mode because this writes to the tile like every other tile
                      setting — Save is what keeps it, and Save only exists here.
                      Outside the zoom wrapper, so the control itself is always
                      the same size whatever the tile is set to. */}
                  {editing && canEdit && (
                    <div className="wall-zoom no-drag">
                      <button
                        onClick={() => patchTile(t.id, { zoom: stepZoom(z, -ZOOM_STEP) })}
                        disabled={z <= ZOOM_MIN}
                        style={{ ...zoomBtn, ...(z <= ZOOM_MIN ? { opacity: 0.35, cursor: 'default' } : null) }}
                        aria-label={`Zoom out ${tileLabel(t.kind)}`}
                      >
                        {"−"}
                      </button>
                      <button
                        onClick={() => patchTile(t.id, { zoom: undefined })}
                        style={{ ...zoomBtn, width: 40, fontSize: 10.5, fontWeight: 700 }}
                        title="Back to 100%"
                        aria-label={`${tileLabel(t.kind)} zoom ${Math.round(z * 100)} percent, reset`}
                      >
                        {`${Math.round(z * 100)}%`}
                      </button>
                      <button
                        onClick={() => patchTile(t.id, { zoom: stepZoom(z, ZOOM_STEP) })}
                        disabled={z >= ZOOM_MAX}
                        style={{ ...zoomBtn, ...(z >= ZOOM_MAX ? { opacity: 0.35, cursor: 'default' } : null) }}
                        aria-label={`Zoom in ${tileLabel(t.kind)}`}
                      >
                        {"+"}
                      </button>
                    </div>
                  )}
                  {/* Full-screen, in the cell's bottom-right corner.
                      Deliberately NOT in the tile header: the headers belong to
                      a component per tile kind, seven of which predate
                      the shared frame, and this way every kind gets it with no
                      per-tile change. The corner is free precisely when this is
                      offered — while editing, that is the resize handle, and
                      this is hidden. */}
                  {!editing && (
                    <button
                      className="wall-expand no-drag"
                      onClick={() => setMaxId(t.id)}
                      title={`Expand ${tileLabel(t.kind)}`}
                      aria-label={`Expand ${tileLabel(t.kind)}`}
                    >
                      <Icon name="maximize-2" size={11} color="#cfe0ff" />
                    </button>
                  )}
                </div>
                );
              })}
            </RGL>
            {/* The workspace frame: the dotted line around the area the tiles
                live in, drawn only while editing. It is LOCKED even then — the
                pencil on its corner is the one way to size it, so a drag meant
                for a tile can never change the canvas underneath it. */}
            {/* Not while authoring a built-in layout: those are stored on the
                default 12-column canvas (the server clamps to it), so offering
                a width control there would be offering a setting that cannot be
                saved. */}
            {editing && canEdit && !tplEdit && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
                <div style={wsOutline(wsUnlocked)} />
                <button
                  type="button"
                  onClick={() => setWsUnlocked((v) => !v)}
                  title={wsUnlocked ? 'Lock the workspace' : 'Resize the workspace'}
                  aria-label={wsUnlocked ? 'Lock the workspace' : 'Resize the workspace'}
                  style={wsPencilBtn(wsUnlocked)}
                >
                  <Icon name={wsUnlocked ? 'check' : 'pencil'} size={11} color={wsUnlocked ? '#10224A' : GOLD} />
                </button>
                {wsUnlocked && (
                  <>
                    {(['left', 'right'] as const).map((side) => (
                      <div
                        key={side}
                        onPointerDown={wsHandleDown(side)}
                        onPointerMove={wsHandleMove}
                        onPointerUp={wsHandleUp}
                        onPointerCancel={wsHandleUp}
                        role="separator"
                        aria-label={side === 'left' ? 'Workspace left edge' : 'Workspace right edge'}
                        style={wsEdgeStrip(side)}
                      >
                        <div style={wsGripPill}>
                          <Icon name="grip-vertical" size={11} color={GOLD} />
                        </div>
                      </div>
                    ))}
                    <div style={wsChip}>
                      <button
                        type="button"
                        onClick={() => stepWorkspace('right', -1)}
                        disabled={cols <= MIN_WS_COLS || wsRooms(tiles, cols).right <= 0}
                        aria-label="Remove a column"
                        style={{
                          ...wsStepBtn,
                          ...(cols <= MIN_WS_COLS || wsRooms(tiles, cols).right <= 0
                            ? { opacity: 0.35, cursor: 'default' }
                            : null),
                        }}
                      >
                        {"−"}
                      </button>
                      <span>
                        {cols === COLS
                          ? `Mobile width · ${COLS} columns`
                          : cols > COLS
                            ? `Desktop width · ${cols} columns`
                            : `Narrow width · ${cols} columns`}
                      </span>
                      <button
                        type="button"
                        onClick={() => stepWorkspace('right', 1)}
                        disabled={atScreenLimit}
                        aria-label="Add a column"
                        title={
                          cols >= MAX_WS_COLS ? undefined : atScreenLimit ? 'The workspace already fills this screen' : undefined
                        }
                        style={{ ...wsStepBtn, ...(atScreenLimit ? { opacity: 0.35, cursor: 'default' } : null) }}
                      >
                        {"+"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            </div>
            </div>
            {/* While editing, keep a little breathing room below the grid so the
                bottom-row tile's resize handle isn't jammed against the footer
                and can be dragged down to grow the cell. */}
            {editing && <div aria-hidden style={{ height: 140 }} />}

            {maxTile && (
              <MaximizedTile
                tile={maxTile}
                lock={locks.get(maxTile.id) ?? null}
                onChange={(p) => patchTile(maxTile.id, p)}
                onClose={() => setMaxId(null)}
                onOpenMembership={onOpenMembership}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// One tile, filling the screen.
//
// The same component the grid renders, in a bigger box — not a second view of
// the tile. A chart at a third of a board's width is a thumbnail; a Trade
// Analysis tile has more rows than its cell shows. Rather than making every tile
// responsible for its own expanded form, the box changes and the tile fills it.
//
// It renders through a portal for the same reason the pickers do: the grid's
// stacking context would otherwise trap it behind the tiles beside it.
function MaximizedTile({
  tile,
  lock,
  onChange,
  onClose,
  onOpenMembership,
}: {
  tile: BoardTile;
  lock: ReturnType<typeof tileLock>;
  onChange: (patch: Partial<BoardTile>) => void;
  onClose: () => void;
  onOpenMembership?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2,7,20,.72)', zIndex: 300 }} />
      <div style={maxWrap}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={onClose} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="minimize-2" size={12} color="#dfe7fa" />
            <span>Close</span>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {/* `editing` is false: the expanded view is for reading a tile, not
              rearranging the board it came from. Its own settings stay reachable
              from the grid. */}
          <BoardTileView
            tile={tile}
            editing={false}
            lock={lock}
            onChange={onChange}
            onRemove={onClose}
            onOpenMembership={onOpenMembership}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}

// Everything you can do to the preset that is open: rename it, make it the one
// that opens by default, publish it to your team, save it, save it under a new
// name, delete it.
//
// One control rather than six buttons in the toolbar. They were six, and on any
// board narrower than a desktop they wrapped onto a second and third row of
// controls stacked above the board — the arrangement being edited pushed further
// down the screen the more ways there were to act on it.
//
// Body-portalled and drawn by the terminal for the same reasons the layout
// picker is: a native <select> renders the OS wheel on iOS, and the grid's
// stacking context would otherwise trap the menu behind the tiles.
function PresetSettingsMenu({
  isUnsaved,
  dirty,
  saving,
  onTeam,
  shared,
  onRename,
  isDesktopDefault,
  isPhoneDefault,
  onSetDefault,
  onShare,
  onSaveAsNew,
  onSave,
  onDelete,
}: {
  isUnsaved: boolean;
  dirty: boolean;
  saving: boolean;
  /** Whether there is anybody to publish to — from the server. */
  onTeam: boolean;
  /** Whether this board is currently published. */
  shared: boolean;
  onRename: () => void;
  /** Whether this board is already the default for each device class. */
  isDesktopDefault: boolean;
  isPhoneDefault: boolean;
  onSetDefault: (which: 'desktop' | 'phone') => void;
  onShare: () => void;
  onSaveAsNew: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // CAPTURE phase, and the propagation is stopped outright. Escape here
      // means "close this menu" and nothing else — but the board's own Escape
      // handler is registered first (it mounts first), so a bubble-phase
      // listener runs too late: the board has already dropped out of edit mode
      // by the time this one is reached, and one keypress undoes two things.
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  }

  // A board that has never been saved has nothing to rename, make default,
  // publish or delete — those act on a stored row. Saving it is what creates
  // one, so that stays live.
  const rows: Array<{
    key: string;
    label: string;
    icon: string;
    run: () => void;
    disabled?: boolean;
    danger?: boolean;
    /** The status marks drawn at the right of the row. */
    mark?: 'team';
    hidden?: boolean;
  }> = [
    { key: 'rename', label: 'Rename', icon: 'pencil', run: onRename, disabled: isUnsaved },
    // TWO defaults, both set from here. A phone never reaches this menu, so a
    // single "Set default" could only ever name the screen you were standing
    // at — which is the desk, every time.
    {
      key: 'default',
      label: isDesktopDefault ? 'Desktop default' : 'Set as desktop default',
      icon: 'monitor',
      run: () => onSetDefault('desktop'),
      disabled: isUnsaved || isDesktopDefault,
    },
    {
      key: 'default-phone',
      label: isPhoneDefault ? 'Phone default' : 'Set as phone default',
      icon: 'smartphone',
      run: () => onSetDefault('phone'),
      disabled: isUnsaved || isPhoneDefault,
    },
    // Publishing sends the ARRANGEMENT, never the figures — each teammate's
    // tiles fetch as themselves, and a notes tile's text is stripped
    // server-side on the way out.
    {
      key: 'share',
      label: shared ? 'Shared with group' : 'Share with group',
      icon: 'users',
      run: onShare,
      disabled: isUnsaved || saving,
      hidden: !onTeam,
      mark: 'team',
    },
    { key: 'saveas', label: 'Save as new', icon: 'copy', run: onSaveAsNew },
    {
      key: 'save',
      label: isUnsaved ? 'Save board' : 'Save',
      icon: 'download',
      run: onSave,
      disabled: saving || (!dirty && !isUnsaved),
    },
    { key: 'delete', label: 'Delete', icon: 'trash-2', run: onDelete, disabled: isUnsaved, danger: true },
  ];

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="settings-2" size={12} color={FAINT} />
        <span>Preset Settings</span>
        <Icon name="chevron-down" size={12} color={FAINT} />
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            <div
              style={{
                position: 'fixed',
                top: rect.bottom + 6,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_W - 8)),
                width: Math.min(MENU_W, window.innerWidth - 16),
                background: '#0C1C3C',
                border: `1px solid ${BORDER2}`,
                borderRadius: 10,
                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                padding: 6,
                zIndex: 201,
              }}
            >
              {rows
                .filter((r) => !r.hidden)
                .map((r) => (
                  <button
                    key={r.key}
                    onClick={() => {
                      if (r.disabled) return;
                      setOpen(false);
                      r.run();
                    }}
                    disabled={r.disabled}
                    style={{
                      ...menuRow(false),
                      color: r.danger ? '#ffb4ab' : r.key === 'share' && shared ? GREEN : '#cfe0ff',
                      opacity: r.disabled ? 0.4 : 1,
                      cursor: r.disabled ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                      <Icon
                        name={r.icon}
                        size={13}
                        color={r.danger ? '#ffb4ab' : r.key === 'share' && shared ? GREEN : FAINT}
                      />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>{r.label}</span>
                    {/* Sharing a board is a group feature, and the group half of
                        the terminal is still being built — so the row carries
                        the same mark every other group surface does. */}
                    {r.mark === 'team' && <ReviewMark id="teams" size={12} />}
                  </button>
                ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// The layout picker: the three built-in layouts, a member's own saved boards,
// and whatever their teammates have published.
//
// It is drawn by the terminal itself (a button plus a body-portalled menu)
// rather than a native <select>: on iOS that renders the OS picker wheel, which
// ignores the desk's theme entirely. Portalling to <body> keeps the menu clear
// of the grid's stacking context, and it closes on outside click, scroll, resize
// or Escape so it can never float detached from its button.
function LayoutPicker({
  boards,
  teamBoards,
  templates,
  activeId,
  builtIn,
  name,
  isUnsaved,
  sharedId,
  onPickBoard,
  onPickBuiltIn,
  onPickShared,
  createTier,
  onCreateNew,
}: {
  boards: TradingBoard[];
  teamBoards: TradingBoard[];
  /** The published built-in layouts, from the server. */
  templates: PresetLayout[];
  activeId: string | null;
  builtIn: string;
  name: string;
  isUnsaved: boolean;
  /** The teammate's layout currently open, if any. */
  sharedId: string | null;
  onPickBoard: (b: TradingBoard) => void;
  onPickBuiltIn: (key: string) => void;
  onPickShared: (b: TradingBoard) => void;
  /** The tier "Create New Layout" costs, or null when the reader holds it. */
  createTier: MembershipTier | null;
  /** Start a blank board, or open the membership screen. Null hides the row. */
  onCreateNew: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  }

  const active = boards.find((b) => b.id === activeId);
  const label = active?.name ?? name;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Switch layout"
        style={{
          ...presetBtn,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 'min(calc(72 * var(--vw)), 260px)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {isUnsaved && boards.length > 0 && <span style={{ color: FAINT, flex: '0 0 auto' }}>· unsaved</span>}
        <Icon name="chevron-down" size={12} color={FAINT} />
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            <div
              style={{
                position: 'fixed',
                top: rect.bottom + 6,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_W - 8)),
                width: Math.min(MENU_W, window.innerWidth - 16),
                maxHeight: 'calc(50 * var(--vh))',
                overflowY: 'auto',
                background: '#0C1C3C',
                border: `1px solid ${BORDER2}`,
                borderRadius: 10,
                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                padding: 6,
                zIndex: 201,
              }}
            >
              <div style={menuHeading}>Built-in layouts</div>
              {templates.map((p) => {
                const sel = activeId == null && !sharedId && p.key === builtIn;
                return (
                  <button
                    key={p.key}
                    onClick={() => {
                      setOpen(false);
                      onPickBuiltIn(p.key);
                    }}
                    style={menuRow(sel)}
                  >
                    <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                      {sel ? <Icon name="check" size={13} color={GREEN} /> : null}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.label}
                      </span>
                      <span style={{ display: 'block', fontSize: 10, color: FAINT, marginTop: 1 }}>{p.blurb}</span>
                    </span>
                  </button>
                );
              })}
              {boards.length > 0 && (
                <>
                  <div style={menuHeading}>Your boards</div>
                  {boards.map((b) => {
                    const sel = b.id === activeId;
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          setOpen(false);
                          onPickBoard(b);
                        }}
                        style={menuRow(sel)}
                      >
                        <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                          {sel ? <Icon name="check" size={13} color={GREEN} /> : null}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                          {b.name}
                        </span>
                        {/* A published board says so in the reader's own list,
                            so they always know what their team can see. */}
                        {b.sharedTeamId && <Icon name="users" size={12} color={GREEN} />}
                        {/* Which device each board opens on. Two glyphs rather
                            than the word "default", because there are two of
                            them now and a board can hold both. */}
                        {b.isDefault && <Icon name="monitor" size={12} color={FAINT} />}
                        {b.isDefaultPhone && <Icon name="smartphone" size={12} color={FAINT} />}
                      </button>
                    );
                  })}
                </>
              )}
              {teamBoards.length > 0 && (
                <>
                  <div style={{ ...menuHeading, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>Shared with your group</span>
                    <ReviewMark id="teams" size={11} />
                  </div>
                  {teamBoards.map((b) => {
                    const sel = b.id === sharedId;
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          setOpen(false);
                          onPickShared(b);
                        }}
                        style={menuRow(sel)}
                      >
                        <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                          {sel ? <Icon name="check" size={13} color={GREEN} /> : null}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.name}
                          </span>
                          {/* Naming the author matters here: this is the one
                              group in the menu whose rows somebody else made. */}
                          <span style={{ display: 'block', fontSize: 10, color: FAINT, marginTop: 1 }}>
                            from {b.sharedBy}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
              {/* Last, and separated: everything above is a layout to open,
                  this is the one row that makes one. Same placement rule the
                  Studies launchers follow — the grid of things you have, then
                  the tile that adds another. */}
              {onCreateNew && (
                <>
                  <div style={{ borderTop: `1px solid ${BORDER}`, margin: '6px 2px 4px' }} />
                  <button
                    onClick={() => {
                      setOpen(false);
                      onCreateNew();
                    }}
                    style={menuRow(false)}
                  >
                    <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                      <Icon name="plus" size={13} color={GOLD} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {"Create New Layout"}
                      </span>
                      <span style={{ display: 'block', fontSize: 10, color: FAINT, marginTop: 1 }}>
                        {"Start from an empty board"}
                      </span>
                    </span>
                    <TierMark tier={createTier} size={11} dim />
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// react-grid-layout drag/resize visuals themed to the navy/gold desk, plus the
// per-cell expand control.
//
// The expand button is hover-revealed on a pointer device and permanently
// visible where there is no hover — a touch device gets no chance to discover a
// control that only appears on hover, so it would simply not exist there.
const PLACEHOLDER_CSS = `
.react-grid-item.react-grid-placeholder { background: rgba(235,203,116,.22) !important; border: 1px dashed ${GOLD}; border-radius: 10px; }
.react-grid-item.react-draggable-dragging { z-index: 20; opacity: .95; }

/* ---- Resize handles ----------------------------------------------------
   react-resizable ships visuals for the SOUTH-EAST handle only — the other
   three render as an invisible hit area, which is worse than not having them:
   the tile resizes from a corner with nothing to say so. These draw the same
   corner bracket on all four, rotated to point outward.

   Only while editing. Outside edit mode the handles are not rendered at all
   (isResizable is false), and the bottom-right corner belongs to the expand
   button — which is why that button hides during editing. */
.react-grid-item > .react-resizable-handle {
  width: 16px; height: 16px; padding: 0; background-image: none;
}
.react-grid-item > .react-resizable-handle::after {
  content: ''; position: absolute; width: 7px; height: 7px;
  border-right: 2px solid ${MUTED}; border-bottom: 2px solid ${MUTED};
  border-radius: 0 0 2px 0; opacity: .75; transition: opacity .12s ease, border-color .12s ease;
}
.react-grid-item:hover > .react-resizable-handle::after { opacity: 1; border-color: ${GOLD}; }

.react-grid-item > .react-resizable-handle-se { right: 2px; bottom: 2px; cursor: nwse-resize; }
.react-grid-item > .react-resizable-handle-se::after { right: 3px; bottom: 3px; transform: rotate(0deg); }

.react-grid-item > .react-resizable-handle-sw { left: 2px; bottom: 2px; cursor: nesw-resize; }
.react-grid-item > .react-resizable-handle-sw::after { left: 3px; bottom: 3px; transform: rotate(90deg); }

.react-grid-item > .react-resizable-handle-ne { right: 2px; top: 2px; cursor: nesw-resize; }
.react-grid-item > .react-resizable-handle-ne::after { right: 3px; top: 3px; transform: rotate(270deg); }

.react-grid-item > .react-resizable-handle-nw { left: 2px; top: 2px; cursor: nwse-resize; }
.react-grid-item > .react-resizable-handle-nw::after { left: 3px; top: 3px; transform: rotate(180deg); }

/* A touch device gets no hover, so the handles stay at full strength there —
   otherwise they are permanently at the dimmed resting state and read as
   decoration rather than something to grab. */
@media (hover: none) {
  .react-grid-item > .react-resizable-handle { width: 22px; height: 22px; }
  .react-grid-item > .react-resizable-handle::after { opacity: 1; border-color: ${GOLD}; }
}

/* While editing, a tile has to LOOK movable. Without this the board in edit
   mode is visually identical to the board out of it, and the only clue that
   anything can be dragged is the cursor changing once you are already over a
   header — which nobody discovers by accident. */
.wall-cell-editing { outline: 1px dashed rgba(235,203,116,.32); outline-offset: -1px; border-radius: 10px; }
.wall-cell-editing:hover { outline-color: rgba(235,203,116,.6); }
.wall-cell-editing .tile-header { cursor: grab; }
.wall-cell-editing .tile-header:active { cursor: grabbing; }
.wall-expand {
  position: absolute; right: 6px; bottom: 6px; z-index: 5;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0;
  background: rgba(9,20,46,.92); border: 1px solid ${BORDER2}; border-radius: 6px;
  cursor: pointer;
  opacity: 0; transition: opacity .15s ease;
}
.wall-cell:hover .wall-expand, .wall-expand:focus-visible { opacity: 1; }
@media (hover: none) { .wall-expand { opacity: .55; } }

/* Per-tile zoom, bottom-centre while editing — clear of all four resize
   corners and of the header the tile is dragged by. Revealed on hover like the
   expand button, and left visible where there is no hover to reveal it. */
.wall-zoom {
  position: absolute; left: 50%; bottom: 6px; transform: translateX(-50%); z-index: 6;
  display: inline-flex; align-items: center; gap: 2px; padding: 2px;
  background: rgba(9,20,46,.94); border: 1px solid ${BORDER2}; border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,.4);
  opacity: 0; transition: opacity .15s ease;
}
.wall-cell:hover .wall-zoom, .wall-zoom:focus-within { opacity: 1; }
@media (hover: none) { .wall-zoom { opacity: .6; } }

/* While the workspace is being sized, the tiles freeze — the frame's own
   handles are the only live controls, the mirror of the workspace being locked
   while tiles are arranged. */
.ws-sizing .react-grid-item { pointer-events: none; opacity: .82; transition: opacity .15s ease; }
`;

// ---- Workspace frame chrome -------------------------------------------------
// The dotted line sits in the grid's own 10px container padding, so tiles never
// touch it; everything interactive re-enables pointer events individually on
// top of the overlay's pointerEvents: 'none'.
const wsOutline = (unlocked: boolean): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  borderRadius: 14,
  border: unlocked ? `1.5px dashed ${GOLD}` : '1.5px dashed rgba(235,203,116,.35)',
  boxShadow: unlocked ? '0 0 0 4px rgba(235,203,116,.06)' : undefined,
  transition: 'border-color .15s ease',
});
const wsPencilBtn = (unlocked: boolean): CSSProperties => ({
  position: 'absolute',
  top: -12,
  right: 10,
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  background: unlocked ? GOLD : 'rgba(9,20,46,.95)',
  border: `1px solid ${unlocked ? GOLD : 'rgba(235,203,116,.55)'}`,
  borderRadius: 7,
  cursor: 'pointer',
  pointerEvents: 'auto',
  boxShadow: '0 4px 12px rgba(0,0,0,.35)',
});
// The grab surface runs most of the side; the visible pill near the top is the
// affordance, kept high so it is on screen the moment the frame unlocks.
const wsEdgeStrip = (side: 'left' | 'right'): CSSProperties => ({
  position: 'absolute',
  top: 24,
  bottom: 24,
  [side]: -9,
  width: 18,
  cursor: 'ew-resize',
  pointerEvents: 'auto',
  touchAction: 'none',
});
const wsGripPill: CSSProperties = {
  position: 'absolute',
  top: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 16,
  height: 56,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(9,20,46,.95)',
  border: `1px solid ${GOLD}`,
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,.35)',
  pointerEvents: 'none',
};
const wsChip: CSSProperties = {
  position: 'absolute',
  top: -13,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 6px',
  background: 'rgba(9,20,46,.95)',
  border: '1px solid rgba(235,203,116,.55)',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  color: '#EFDFAF',
  whiteSpace: 'nowrap',
  pointerEvents: 'auto',
  boxShadow: '0 4px 12px rgba(0,0,0,.35)',
};
const zoomBtn: CSSProperties = {
  width: 20,
  height: 20,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  background: 'rgba(255,255,255,.06)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 5,
  color: '#cfe0ff',
  fontSize: 13,
  lineHeight: 1,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const wsStepBtn: CSSProperties = {
  width: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  background: 'rgba(235,203,116,.14)',
  border: '1px solid rgba(235,203,116,.5)',
  borderRadius: 5,
  color: '#EFDFAF',
  fontSize: 13,
  lineHeight: 1,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const maxWrap: CSSProperties = {
  position: 'fixed',
  top: '4vh',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(1240px, calc(94 * var(--vw)))',
  height: 'calc(92 * var(--vh))',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 301,
};
// Says which built-in layout is being authored, so a developer arranging the
// board members open on can never mistake it for one of their own.
const tplChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: '#EFDFAF',
  background: 'rgba(235,203,116,.12)',
  border: '1px solid rgba(235,203,116,.45)',
  borderRadius: 7,
  padding: '6px 10px',
};
const railLabel: CSSProperties = {
  fontSize: 9,
  letterSpacing: '.5px',
  textTransform: 'uppercase',
  color: FAINT,
  marginRight: 2,
};
// The picker's trigger — the gold "this is the open layout" pill.
const presetBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#fff',
  background: 'rgba(235,203,116,.14)',
  border: '1px solid rgba(235,203,116,.5)',
  borderRadius: 7,
  padding: '6px 11px',
  cursor: 'pointer',
};
const menuHeading: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '.6px',
  textTransform: 'uppercase',
  color: FAINT,
  padding: '8px 8px 4px',
};
const menuRow = (sel: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  background: sel ? 'rgba(255,255,255,.06)' : 'transparent',
  border: 'none',
  borderRadius: 7,
  color: sel ? '#fff' : '#cfe0ff',
  fontSize: 13,
  fontWeight: sel ? 700 : 500,
  fontFamily: 'inherit',
  textAlign: 'left',
  padding: '9px 8px',
  cursor: 'pointer',
});
const namePromptRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 12,
  padding: '10px 12px',
  background: PANEL,
  border: `1px solid ${BORDER2}`,
  borderRadius: 9,
};
const errBanner: CSSProperties = {
  marginBottom: 12,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
};
const emptyState: CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: MUTED,
  fontSize: 13,
  background: 'rgba(13,31,68,.5)',
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
};
