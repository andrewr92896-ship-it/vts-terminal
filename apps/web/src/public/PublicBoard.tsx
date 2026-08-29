import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
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
const WALL_W = 1280;

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
}

// The catalog, in the order the picker reads it: what a visitor is most likely
// to want first.
export const PUBLIC_TILES: PublicTileDef[] = [
  { kind: 'chart', label: 'Chart', icon: 'candlestick-chart', blurb: 'A live chart for one instrument.', w: 6, h: 10 },
  { kind: 'watchlist', label: 'Watchlist', icon: 'list', blurb: 'Quotes for the instruments you follow.', w: 3, h: 10 },
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
  { id: 'w-watch', kind: 'watchlist', title: 'Watchlist', symbols: ['OANDA:EURUSD', 'OANDA:GBPUSD', 'OANDA:XAUUSD', 'NASDAQ:NDX'], watchlistMode: 'scroll', x: 6, y: 0, w: 3, h: 10 },
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
  onChange,
  canSave,
  saveNote,
}: {
  tiles: BoardTile[];
  onChange: (next: BoardTile[]) => void;
  // Whether the arrangement outlives this visit. False in the demo, which is the
  // truth rather than a limitation, and the board says so instead of implying a
  // Save that would do nothing.
  canSave: boolean;
  saveNote: string;
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const { isPhone } = useResponsive();
  const wrap = useRef<HTMLDivElement>(null);
  // Measured in LAYOUT space, never off `contentRect` — see lib/measure.ts for
  // why the two coordinate spaces are not interchangeable under the terminal
  // zoom, and what it cost the private board.
  const measured = useContentWidth(wrap, WALL_W);
  const width = Math.min(measured, WALL_W);

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
      { id: `${kind}-${Date.now().toString(36)}`, kind, title: def.label, x: 0, y, w: def.w, h: def.h } as unknown as BoardTile,
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
          <button key={preset.key} style={btn()} title={preset.hint} onClick={() => onChange(presetTiles(preset.key))}>
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

      <GridLayout
        className="layout"
        layout={layout}
        cols={COLS}
        rowHeight={ROW_H}
        width={width}
        margin={[GAP, GAP]}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing}
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
    </div>
  );
}
