import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import type { BoardTile } from '../api/types';
import { Icon } from '../components/Icon';
import { useContentWidth } from '../lib/measure';
import { useResponsive } from '../hooks/useMediaQuery';
import { BOARD_GRID_CSS } from '../workspaces/trading/boardGridCss';
import { BORDER2, FAINT, GOLD, MUTED, TEXT } from '../workspaces/trading/tvChart';
import { CalendarTile } from '../workspaces/trading/CalendarTile';
import { ChartTile } from '../workspaces/trading/ChartTile';
import { NewsTile } from '../workspaces/trading/NewsTile';
import { WatchlistTile } from '../workspaces/trading/WatchlistTile';
import { ClockTile, MarketDataTile, StreamTile } from '../workspaces/trading/tiles/MarketTiles';
import {
  AnnouncementsTile,
  DividendsTile,
  NetWorthTile,
  NotesTile,
  PatchNotesTile,
  PortfolioTile,
  TodoTile,
} from '../workspaces/trading/tiles/PersonalTiles';

// THE PUBLIC LIVE WALL — the same board, arranged the same way, over the tiles
// the public terminal actually has.
//
// It is NOT `ChartBoard.tsx`, and that is a bundle decision rather than a design
// one: that component maps every tile kind there is, so importing it would pull
// the order ticket, the desk tiles and the broker panels into a bundle served to
// the public. What IS shared is everything that decides how a board looks and
// behaves while it is being arranged — `BOARD_GRID_CSS`, the portal's own tile
// components, `useContentWidth` — so this is the portal's board with a shorter
// list of tiles, not a second board.
//
// WHAT IS ABSENT is absent by not being listed: no ticket, no positions, no desk
// metrics, no broker capital, no team chat, no funded book. There is no filter
// here to get wrong, because those components are never imported.

const COLS = 12;
const ROW_H = 34;
const GAP = 10;
export const WALL_W = 1280;

// ---- The workspace area -----------------------------------------------------
//
// THE SAME SETUP AS THE PRIVATE PORTAL'S BOARD, deliberately — the constants,
// the clamps and the lock-before-you-size behaviour are ported from
// `workspaces/trading/ChartBoard.tsx` rather than re-invented, because the rules
// below are the ones that took a shipped bug each to arrive at.
//
// A COLUMN IS A FIXED SLICE OF WIDTH, NOT A FRACTION OF A FIXED BOARD. Twelve
// columns is `baseWidth`, so eighteen asks the screen for half again as much
// room: the dotted box GROWS and the tiles keep their size. The first version of
// this on the private board added columns *inside* a fixed width, so every extra
// column made all the others thinner and the whole board shrank — the opposite
// of what widening is for.
const MIN_WS_COLS = 6;
const MAX_WS_COLS = 36;
// One column per this many px of pointer travel. A feel constant, not geometry —
// the grid re-fits live as the drag goes.
const WS_NOTCH_PX = 48;

// The width a layout renders at, floored to the tiles' own extent so a board can
// never open narrower than what it carries — which is what the resize clamps
// below get to assume.
export function workspaceCols(cols: number | undefined, tiles: BoardTile[]): number {
  const extent = tiles.reduce((m, t) => Math.max(m, (t.x ?? 0) + (t.w ?? 0)), 0);
  const stored = typeof cols === 'number' && Number.isFinite(cols) ? Math.round(cols) : COLS;
  return Math.max(MIN_WS_COLS, Math.min(MAX_WS_COLS, stored), Math.min(extent, 96));
}

// How many EMPTY columns each side of the arrangement has — the most a shrink
// may take, because shrinking must never cut into a tile.
function wsRooms(tiles: BoardTile[], cols: number): { left: number; right: number } {
  if (tiles.length === 0) return { left: 0, right: Math.max(0, cols - MIN_WS_COLS) };
  const minX = tiles.reduce((m, t) => Math.min(m, t.x ?? 0), Number.POSITIVE_INFINITY);
  const maxX = tiles.reduce((m, t) => Math.max(m, (t.x ?? 0) + (t.w ?? 0)), 0);
  return { left: Number.isFinite(minX) ? minX : 0, right: Math.max(0, cols - maxX) };
}

type PublicTileKind =
  | 'chart' | 'watchlist' | 'news' | 'calendar' | 'clock' | 'marketdata' | 'streams'
  | 'networth' | 'portfolio' | 'dividends' | 'todo' | 'notes' | 'announcements' | 'patchnotes';

interface PublicTileDef {
  kind: PublicTileKind;
  label: string;
  icon: string;
  blurb: string;
  w: number;
  h: number;
  // What a freshly added tile of this kind is configured with. Beside the size,
  // because the two go together: the watchlist has a scrolling mode and a static
  // one, and which is right depends entirely on the shape it is added at.
  defaults?: Partial<BoardTile>;
}

// The catalog, in the order the picker reads it: what a visitor is most likely
// to want first.
export const PUBLIC_TILES: PublicTileDef[] = [
  { kind: 'chart', label: 'Chart', icon: 'candlestick-chart', blurb: 'A live chart for one instrument.', w: 6, h: 10, defaults: { symbol: 'OANDA:EURUSD', interval: '60' } },
  // STATIC, not the scrolling tape. The tape is a wide, short strip — in a tall
  // narrow tile it clips its own quotes at both edges and scrolls the rest out
  // of sight, which is what this was doing. The static list shows every symbol
  // at once, one per row, which is the shape this tile actually is.
  { kind: 'watchlist', label: 'Watchlist', icon: 'list', blurb: 'Quotes for the instruments you follow, one per row.', w: 3, h: 10, defaults: { watchlistMode: 'static', symbols: ['OANDA:EURUSD', 'OANDA:GBPUSD', 'OANDA:XAUUSD', 'NASDAQ:NDX'] } },
  { kind: 'marketdata', label: 'Market Data', icon: 'line-chart', blurb: 'Rates, prints and prices from the board.', w: 3, h: 8 },
  { kind: 'news', label: 'Market News', icon: 'newspaper', blurb: 'The headline feed.', w: 4, h: 8 },
  { kind: 'calendar', label: 'Economic Calendar', icon: 'calendar-days', blurb: 'What is due, and when.', w: 4, h: 8 },
  { kind: 'streams', label: 'Live Streams', icon: 'youtube', blurb: 'A market channel, playing here.', w: 4, h: 8 },
  { kind: 'clock', label: 'Market Clock', icon: 'clock', blurb: 'Which sessions are open right now.', w: 2, h: 6 },
  { kind: 'networth', label: 'Net Worth', icon: 'scale', blurb: 'Everything you own minus everything you owe.', w: 3, h: 7 },
  { kind: 'portfolio', label: 'Portfolio', icon: 'landmark', blurb: 'What the investment accounts are worth.', w: 3, h: 7 },
  { kind: 'dividends', label: 'Dividends', icon: 'banknote', blurb: 'Income received, trailing.', w: 3, h: 6 },
  { kind: 'todo', label: 'To Do', icon: 'list-todo', blurb: 'Your own list.', w: 3, h: 8 },
  { kind: 'notes', label: 'Notes', icon: 'notebook-pen', blurb: 'A scratchpad that stays on the board.', w: 3, h: 6 },
  { kind: 'announcements', label: 'Announcements', icon: 'megaphone', blurb: 'What the terminal has been saying.', w: 3, h: 6 },
  { kind: 'patchnotes', label: 'Patch notes', icon: 'file-text', blurb: 'What changed, and when.', w: 3, h: 6 },
];

const DEF = new Map(PUBLIC_TILES.map((t) => [t.kind, t]));

// THE TWO DEFAULT LAYOUTS. Both are working boards rather than empty grids: an
// empty one reads as a broken screen, and the demo exists to show a working
// site. They are pickable at any time from the wall's own toolbar, and the demo
// asks which one to start on at the door.
//
// `stacked` is a real ARRANGEMENT — every tile a full twelve columns wide, one
// under another — not a rendering mode. That distinction is the whole point: a
// mode would only apply on a narrow screen, and somebody on a desktop who asked
// for the phone layout would not get it. As an arrangement it reads the same
// everywhere, which is what makes it demonstrable.
export const DEFAULT_BOARD: BoardTile[] = [
  { id: 'w-chart', kind: 'chart', title: 'EUR/USD', symbol: 'OANDA:EURUSD', interval: '60', x: 0, y: 0, w: 6, h: 10 },
  { id: 'w-watch', kind: 'watchlist', title: 'Watchlist', symbols: ['OANDA:EURUSD', 'OANDA:GBPUSD', 'OANDA:XAUUSD', 'NASDAQ:NDX'], watchlistMode: 'static', x: 6, y: 0, w: 3, h: 10 },
  { id: 'w-clock', kind: 'clock', title: 'Market Clock', x: 9, y: 0, w: 3, h: 10 },
  { id: 'w-news', kind: 'news', title: 'Market News', newsFeedKeys: ['all'], x: 0, y: 10, w: 4, h: 8 },
  { id: 'w-cal', kind: 'calendar', title: 'Economic Calendar', calendarImpact: 'medhigh', x: 4, y: 10, w: 4, h: 8 },
  // On the board by default, not merely addable: the slot is one of the things
  // the demo exists to show, and a tile nobody presses Edit to find is a tile
  // nobody sees.
  { id: 'w-stream', kind: 'streams', title: 'Live Streams', x: 8, y: 10, w: 4, h: 8 },
] as unknown as BoardTile[];

// One column, in reading order: what is moving, the chart, then the things you
// scroll to. Heights are generous because a phone shows one tile at a time and a
// cramped tile is worse than a scroll.
export const STACKED_BOARD: BoardTile[] = (() => {
  const rows: [string, string, string, number][] = [
    ['s-watch', 'watchlist', 'Watchlist', 5],
    ['s-chart', 'chart', 'EUR/USD', 10],
    ['s-news', 'news', 'Market News', 9],
    ['s-cal', 'calendar', 'Economic Calendar', 8],
    ['s-stream', 'streams', 'Live Streams', 8],
    ['s-clock', 'clock', 'Market Clock', 7],
  ];
  let y = 0;
  return rows.map(([id, kind, title, h]) => {
    const tile = { id, kind, title, x: 0, y, w: COLS, h } as Record<string, unknown>;
    if (kind === 'chart') { tile.symbol = 'OANDA:EURUSD'; tile.interval = '60'; }
    // The one place the SCROLLING tape is right: full width and short, which is
    // exactly the strip it was built for. The desktop board's watchlist is tall
    // and narrow and uses the static list instead.
    if (kind === 'watchlist') { tile.symbols = ['OANDA:EURUSD', 'OANDA:GBPUSD', 'OANDA:XAUUSD', 'NASDAQ:NDX']; tile.watchlistMode = 'scroll'; }
    if (kind === 'news') tile.newsFeedKeys = ['all'];
    if (kind === 'calendar') tile.calendarImpact = 'medhigh';
    y += h;
    return tile as unknown as BoardTile;
  });
})();

export type BoardPresetKey = 'desktop' | 'stacked';
export const BOARD_PRESETS: { key: BoardPresetKey; label: string; hint: string; tiles: BoardTile[] }[] = [
  { key: 'desktop', label: 'Desktop', hint: 'Tiles side by side, arranged across the width.', tiles: DEFAULT_BOARD },
  { key: 'stacked', label: 'Stacked', hint: 'One tile per row, top to bottom — built for a phone.', tiles: STACKED_BOARD },
];
export function presetTiles(key: BoardPresetKey): BoardTile[] {
  return (BOARD_PRESETS.find((p) => p.key === key) ?? BOARD_PRESETS[0]!).tiles.map((t) => ({ ...t }));
}

function renderTile(tile: BoardTile, editing: boolean, onChange: (patch: Partial<BoardTile>) => void, onRemove: () => void) {
  const props = { tile, editing, onChange, onRemove };
  switch (tile.kind as PublicTileKind) {
    case 'chart': return <ChartTile {...props} />;
    case 'watchlist': return <WatchlistTile {...props} />;
    case 'news': return <NewsTile {...props} />;
    case 'calendar': return <CalendarTile {...props} />;
    case 'clock': return <ClockTile {...props} />;
    case 'marketdata': return <MarketDataTile {...props} />;
    case 'streams': return <StreamTile {...props} />;
    case 'networth': return <NetWorthTile {...props} />;
    case 'portfolio': return <PortfolioTile {...props} />;
    case 'dividends': return <DividendsTile {...props} />;
    case 'todo': return <TodoTile {...props} />;
    case 'notes': return <NotesTile {...props} />;
    case 'announcements': return <AnnouncementsTile {...props} />;
    case 'patchnotes': return <PatchNotesTile {...props} />;
    // A kind this build cannot render is DROPPED rather than drawn as a hole —
    // the same rule the private board's `parseTiles` follows for an unknown kind.
    default: return null;
  }
}

const btn = (active?: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: active ? 'rgba(235,203,116,.14)' : 'rgba(255,255,255,.03)',
  border: `1px solid ${active ? GOLD : BORDER2}`, borderRadius: 8,
  color: active ? GOLD : MUTED, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer',
});

export function PublicBoard({
  tiles,
  cols,
  onChange,
  onCols,
  onPreset,
  baseWidth,
  availWidth,
  onWorkspaceWidth,
  canSave,
  saveNote,
}: {
  tiles: BoardTile[];
  // The workspace width, in grid columns. Held by the parent because it is saved
  // alongside the tiles — widening the workspace is a change worth keeping.
  cols: number;
  onChange: (next: BoardTile[]) => void;
  onCols: (next: number) => void;
  // Loading a default layout sets the tiles AND the workspace width together.
  // Two separate calls would each write from the same stale value and the second
  // would undo the first.
  onPreset: (next: BoardTile[], cols: number) => void;
  // The pixel width of the DEFAULT twelve-column workspace. One number, passed
  // in, so the screen's cap and the board's idea of a column cannot drift apart.
  baseWidth: number;
  // The room the content area actually has, measured OUTSIDE the capped wall —
  // a board can never report space it is not allowed to occupy.
  availWidth: number;
  // How wide this board would like the wall to be. Null on a phone, which
  // flattens to one column and ignores `cols` entirely.
  onWorkspaceWidth: (px: number | null) => void;
  // Whether the arrangement outlives this visit. False in the demo, which is the
  // truth rather than a limitation, and the board says so instead of implying a
  // Save that would do nothing.
  canSave: boolean;
  saveNote: string;
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  // THE WORKSPACE IS LOCKED EVEN IN EDIT MODE, and the pencil on the frame's
  // corner is the only way in. Arranging tiles and sizing the canvas are
  // different acts, and a drag meant for a tile must never change the canvas
  // under it.
  const [wsUnlocked, setWsUnlocked] = useState(false);
  const { isPhone } = useResponsive();
  const wrap = useRef<HTMLDivElement>(null);
  // Measured in LAYOUT space, never off `contentRect` — see lib/measure.ts for
  // why the two coordinate spaces are not interchangeable under the terminal
  // zoom, and what it cost the private board.
  const boardW = useContentWidth(wrap, WALL_W);

  // Twelve columns is `baseWidth`; eighteen asks for half again as much. The
  // parent lifts its cap to match, so the box grows rather than the columns
  // getting thinner.
  const wantWallW = isPhone ? null : Math.round((baseWidth * cols) / COLS);
  useEffect(() => {
    onWorkspaceWidth(wantWallW);
    return () => onWorkspaceWidth(null);
  }, [wantWallW, onWorkspaceWidth]);

  // THE SCREEN IS THE CEILING, and it is CLAMPED AGAINST rather than discovered
  // by overshooting it: the widest workspace that fits is whole columns of
  // `baseWidth / COLS` into the measured content area, so growing stops one
  // column before anything would have to get thinner. Reacting to a board that
  // came back narrower would work too, and costs a visible column of tile width
  // every time somebody reaches the edge.
  const fitCols = Math.floor((availWidth * COLS) / Math.max(1, baseWidth));
  const maxCols = Math.max(MIN_WS_COLS, Math.min(MAX_WS_COLS, fitCols));
  // A board arranged wider than this screen still RENDERS here — it fits itself
  // to the width, denser, exactly as before. Only growing is capped, so opening
  // a television board on a laptop never rewrites the width it was built at.
  const atScreenLimit = cols >= maxCols;
  // Read by the drag, which cannot re-read state mid-gesture.
  const maxColsRef = useRef(MAX_WS_COLS);
  maxColsRef.current = Math.max(maxCols, cols);

  // Unlocked, the board pulls in from the sides so the frame reads as an object
  // with its handles in reach — pressed against the container edge there is
  // nothing to grab. Plain padding, deliberately NO transform: a scale would
  // reopen the two-coordinate-space trap lib/measure.ts exists to close.
  const wsGutter = wsUnlocked ? 44 : 0;
  const width = wsUnlocked ? Math.max(320, boardW - wsGutter * 2) : boardW;

  // Escape locks the workspace BEFORE it leaves edit mode, so the two states
  // unwind in the order they were entered.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (wsUnlocked) setWsUnlocked(false);
      else setEditing(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [editing, wsUnlocked]);

  // ---- Sizing the workspace ------------------------------------------------
  // Both entrances — the side handles and the − / + steppers — move the frame by
  // whole columns on ONE side. Growing the left inserts columns there and shifts
  // every tile right, so the arrangement keeps its place; shrinking only ever
  // removes EMPTY columns on that side.
  const wsDrag = useRef<{ side: 'left' | 'right'; startX: number; startCols: number; room: number; applied: number } | null>(null);
  useEffect(() => { if (!wsUnlocked) wsDrag.current = null; }, [wsUnlocked]);

  const stepWorkspace = useCallback(
    (side: 'left' | 'right', by: number) => {
      const room = wsRooms(tiles, cols)[side];
      const d = Math.max(Math.max(-room, MIN_WS_COLS - cols), Math.min(maxColsRef.current - cols, by));
      if (d === 0) return;
      onCols(cols + d);
      if (side === 'left') onChange(tiles.map((t) => ({ ...t, x: (t.x ?? 0) + d })));
    },
    [tiles, cols, onCols, onChange],
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
  const wsHandleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = wsDrag.current;
      if (!drag) return;
      const raw = e.clientX - drag.startX;
      // Dragging a side OUTWARD grows that side. Clamped against the geometry
      // recorded at pointer-down and applied as an absolute delta from there, so
      // a burst of moves between renders cannot double-apply.
      const wanted = Math.round((drag.side === 'right' ? raw : -raw) / WS_NOTCH_PX);
      const d = Math.max(
        Math.max(-drag.room, MIN_WS_COLS - drag.startCols),
        Math.min(maxColsRef.current - drag.startCols, wanted),
      );
      if (d === drag.applied) return;
      const shift = drag.side === 'left' ? d - drag.applied : 0;
      drag.applied = d;
      onCols(drag.startCols + d);
      if (shift !== 0) onChange(tiles.map((t) => ({ ...t, x: (t.x ?? 0) + shift })));
    },
    [tiles, onCols, onChange],
  );
  const wsHandleUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    wsDrag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }, []);

  const layout: Layout[] = useMemo(
    () => tiles.map((t, i) => ({ i: t.id, x: t.x ?? 0, y: t.y ?? i * 6, w: t.w ?? 4, h: t.h ?? 8, minW: 2, minH: 4 })),
    [tiles],
  );

  const applyLayout = useCallback(
    (next: Layout[]) => {
      const by = new Map(next.map((l) => [l.i, l]));
      onChange(tiles.map((t) => ({ ...t, ...(by.get(t.id) ? { x: by.get(t.id)!.x, y: by.get(t.id)!.y, w: by.get(t.id)!.w, h: by.get(t.id)!.h } : {}) })));
    },
    [tiles, onChange],
  );

  const add = (kind: PublicTileKind) => {
    const def = DEF.get(kind)!;
    const y = tiles.reduce((max, t) => Math.max(max, (t.y ?? 0) + (t.h ?? 8)), 0);
    onChange([
      ...tiles,
      { id: `${kind}-${Date.now().toString(36)}`, kind, title: def.label, x: 0, y, w: def.w, h: def.h, ...def.defaults } as unknown as BoardTile,
    ]);
    setPicking(false);
  };

  // A phone renders ONE column and never writes that back: the grid is a desktop
  // idea, and a drag on the flattened order would overwrite the real
  // arrangement. Same rule the private board follows.
  if (isPhone) {
    return (
      <div ref={wrap} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
        {tiles.map((t) => (
          <div key={t.id} style={{ minHeight: 240 }}>{renderTile(t, false, () => {}, () => {})}</div>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrap}>
      <style>{BOARD_GRID_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={btn(editing)} onClick={() => { setEditing((v) => !v); setPicking(false); }}>
          <Icon name="pencil" size={13} />{editing ? 'Done' : 'Edit layout'}
        </button>
        {editing && (
          <button style={btn(picking)} onClick={() => setPicking((v) => !v)}>
            <Icon name="plus" size={13} />Add a tile
          </button>
        )}
        {/* THE TWO DEFAULT LAYOUTS, reachable at any time rather than only at the
            door. The demo asks which to start on; this is what makes the answer
            changeable, and what makes somebody on a desktop able to see the
            phone layout at all. Both replace the arrangement outright — there is
            nothing to lose that the other button does not put back in one
            press. */}
        {editing && BOARD_PRESETS.map((preset) => (
          <button key={preset.key} style={btn()} title={preset.hint} onClick={() => onPreset(presetTiles(preset.key), COLS)}>
            <Icon name={preset.key === 'stacked' ? 'smartphone' : 'monitor'} size={13} />{preset.label} layout
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: FAINT, fontSize: 11.5 }}>{canSave ? '' : saveNote}</span>
      </div>

      {picking && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8, marginBottom: 14 }}>
          {PUBLIC_TILES.map((t) => (
            <button key={t.kind} onClick={() => add(t.kind)} style={{ ...btn(), display: 'block', textAlign: 'left', padding: '10px 12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: TEXT, fontSize: 12.5, fontWeight: 600 }}>
                <Icon name={t.icon} size={14} color={GOLD} />{t.label}
              </span>
              <span style={{ display: 'block', marginTop: 4, color: FAINT, fontSize: 11.5, lineHeight: 1.5 }}>{t.blurb}</span>
            </button>
          ))}
        </div>
      )}

      {/* The padded outer box gives the unlocked frame its side gutters; the
          relative inner box is what the dotted outline and its controls anchor
          to, so they wrap the grid exactly whatever height it grows to. */}
      <div style={{ paddingTop: editing ? 16 : 0, paddingLeft: wsGutter, paddingRight: wsGutter }}>
        <div style={{ position: 'relative' }} className={wsUnlocked ? 'ws-sizing' : undefined}>
          <GridLayout
            className="layout"
            layout={layout}
            cols={cols}
            rowHeight={ROW_H}
            width={width}
            margin={[GAP, GAP]}
            containerPadding={[0, 0]}
            // `!wsUnlocked` is the mirror of the workspace being locked while
            // tiles are arranged: while the canvas is being sized the tiles
            // freeze, so the grid's own echoes of that reflow cannot be read as
            // somebody dragging a tile.
            isDraggable={editing && !wsUnlocked}
            isResizable={editing && !wsUnlocked}
            resizeHandles={['se', 'sw', 'ne', 'nw']}
            draggableCancel=".no-drag"
            draggableHandle=".tile-header"
            onLayoutChange={applyLayout}
          >
            {tiles.map((tile) => (
              <div key={tile.id} className={`wall-cell${editing ? ' wall-cell-editing' : ''}`} style={{ position: 'relative' }}>
                {renderTile(
                  tile,
                  editing,
                  (patch) => onChange(tiles.map((t) => (t.id === tile.id ? { ...t, ...patch } : t))),
                  () => onChange(tiles.filter((t) => t.id !== tile.id)),
                )}
              </div>
            ))}
          </GridLayout>

          {/* THE WORKSPACE FRAME: the dotted line around the area the tiles live
              in, drawn only while editing, and LOCKED even then. The pencil on
              its corner is the one way to size it. */}
          {editing && (
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
                      <div style={wsGripPill}><Icon name="grip-vertical" size={11} color={GOLD} /></div>
                    </div>
                  ))}
                  <div style={wsChip}>
                    <button
                      type="button"
                      onClick={() => stepWorkspace('right', -1)}
                      disabled={cols <= MIN_WS_COLS || wsRooms(tiles, cols).right <= 0}
                      aria-label="Remove a column"
                      style={{ ...wsStepBtn, ...(cols <= MIN_WS_COLS || wsRooms(tiles, cols).right <= 0 ? { opacity: 0.35, cursor: 'default' } : null) }}
                    >
                      {"−"}
                    </button>
                    <span>
                      {cols === COLS ? `Mobile width · ${COLS} columns` : cols > COLS ? `Desktop width · ${cols} columns` : `Narrow width · ${cols} columns`}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepWorkspace('right', 1)}
                      disabled={atScreenLimit}
                      aria-label="Add a column"
                      title={cols >= MAX_WS_COLS ? undefined : atScreenLimit ? 'The workspace already fills this screen' : undefined}
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
      {/* Breathing room below the grid while editing, so the bottom row's resize
          handle is not jammed against the footer and can be dragged down. */}
      {editing && <div aria-hidden style={{ height: 140 }} />}
    </div>
  );
}

// ---- Workspace frame chrome -------------------------------------------------
// The dotted line sits in the grid's own container padding, so tiles never touch
// it; everything interactive re-enables pointer events on top of the overlay's
// `pointerEvents: 'none'`.
const wsOutline = (unlocked: boolean): CSSProperties => ({
  position: 'absolute', inset: 0, borderRadius: 14,
  border: unlocked ? `1.5px dashed ${GOLD}` : '1.5px dashed rgba(235,203,116,.35)',
  boxShadow: unlocked ? '0 0 0 4px rgba(235,203,116,.06)' : undefined,
  transition: 'border-color .15s ease',
});
const wsPencilBtn = (unlocked: boolean): CSSProperties => ({
  position: 'absolute', top: -12, right: 10, width: 24, height: 24,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  background: unlocked ? GOLD : 'rgba(9,20,46,.95)',
  border: `1px solid ${unlocked ? GOLD : 'rgba(235,203,116,.55)'}`,
  borderRadius: 7, cursor: 'pointer', pointerEvents: 'auto',
  boxShadow: '0 4px 12px rgba(0,0,0,.35)',
});
// The grab surface runs most of the side; the visible pill near the top is the
// affordance, kept high so it is on screen the moment the frame unlocks.
const wsEdgeStrip = (side: 'left' | 'right'): CSSProperties => ({
  position: 'absolute', top: 24, bottom: 24, [side]: -9, width: 18,
  cursor: 'ew-resize', pointerEvents: 'auto', touchAction: 'none',
});
const wsGripPill: CSSProperties = {
  position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
  width: 16, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(9,20,46,.95)', border: `1px solid ${GOLD}`, borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,.35)', pointerEvents: 'none',
};
const wsChip: CSSProperties = {
  position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px',
  background: 'rgba(9,20,46,.95)', border: '1px solid rgba(235,203,116,.55)',
  borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#EFDFAF',
  whiteSpace: 'nowrap', pointerEvents: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.35)',
};
const wsStepBtn: CSSProperties = {
  width: 18, height: 18, display: 'grid', placeItems: 'center', padding: 0,
  background: 'rgba(235,203,116,.12)', border: '1px solid rgba(235,203,116,.45)',
  borderRadius: 5, color: '#EFDFAF', fontSize: 12, lineHeight: 1, cursor: 'pointer',
};
