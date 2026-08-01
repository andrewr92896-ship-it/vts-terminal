import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';
import type { BoardTile, BoardTileKind, TradingBoard } from '../../api/types';
import { ChartTile } from './ChartTile';
import { WatchlistTile } from './WatchlistTile';
import { PositionsTile } from './PositionsTile';
import { MetricsTile } from './MetricsTile';
import { NewsTile } from './NewsTile';
import { CalendarTile } from './CalendarTile';
import { AlertsTile } from './AlertsTile';
import { MobileScrollLockBar } from './scrollLock';
import { BORDER, BORDER2, FAINT, GOLD, GREEN, MUTED, PANEL, ghostBtn, goldBtn, input, marketStarterTiles, newTile, starterTiles } from './tvChart';

const RGL = WidthProvider(GridLayout);
const COLS = 12;
const ROW_H = 30;
const MARGIN = 10;
const MENU_W = 260; // preset dropdown width, clamped to the viewport when narrower

// A positions tile set to grow to fit its trades (rather than scroll in a fixed
// cell). Its grid height is driven by measured content, not the stored h.
function isExpandPositions(t: BoardTile): boolean {
  return t.kind === 'positions' && (t.positionsView === 'list-expand' || t.positionsView === 'cards-expand');
}

// Grid rows needed to fit `px` of content: a cell of h rows is
// ROW_H*h + MARGIN*(h-1) px tall, so solve for the smallest h that fits.
function rowsForPx(px: number): number {
  return Math.max(1, Math.ceil((px + MARGIN) / (ROW_H + MARGIN)));
}

// The customizable, multi-chart board on the Live Wall. It's a drag-resize grid
// (react-grid-layout) of chart and watchlist tiles that a trader arranges and
// saves as named "presets" (persisted per-user via /api/trading/boards). The
// grid is locked for interaction until "Edit layout" is on, so charts stay
// clickable while you trade and only move when you mean to move them.
//
// `desk` is whether the viewer has Advanced Trading. Without it the board is
// still fully theirs to arrange and save — what it loses is the desk half: the
// tiles that read team positions, desk performance and the alert feed, and the
// named presets (they keep one board rather than a switchable set). Both limits
// are enforced server-side too; this only decides what is offered.
export function ChartBoard({ desk = true }: { desk?: boolean }) {
  const { user } = useAuth();
  // Remember the last-opened preset per user (per device) so returning to the
  // board — after toggling to Positions, a reload, or a new session — lands on
  // the same preset instead of resetting to the default.
  const lastKey = user?.id ? `vts:lastBoard:${user.id}` : null;
  const [boards, setBoards] = useState<TradingBoard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // null → unsaved working board
  const [name, setName] = useState('New board');
  const [tiles, setTiles] = useState<BoardTile[]>(() => (desk ? starterTiles() : marketStarterTiles()));
  const [savedTilesJson, setSavedTilesJson] = useState<string>(''); // '' → never saved
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [namePrompt, setNamePrompt] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null);
  // Content-driven grid-row counts for positions tiles in an "expand" view, keyed
  // by tile id. These override the tile's stored h so the cell grows to fit every
  // trade; they are transient (never saved, never marked dirty).
  const [autoRows, setAutoRows] = useState<Record<string, number>>({});
  const firstLoad = useRef(true);

  const applyBoard = useCallback(
    (b: TradingBoard) => {
      setActiveId(b.id);
      setName(b.name);
      // A board saved while the trader had the desk keeps its desk tiles in the
      // database; drop them from what is rendered if the desk is off now, rather
      // than mounting tiles whose every request would be refused.
      const shown = allowedTiles(b.layout.tiles ?? [], desk);
      setTiles(shown);
      setSavedTilesJson(JSON.stringify(shown));
      setNamePrompt(null);
      if (lastKey) {
        try { localStorage.setItem(lastKey, b.id); } catch { /* storage unavailable — non-fatal */ }
      }
    },
    [lastKey, desk],
  );

  const load = useCallback(async () => {
    try {
      const { boards: list } = await api.tradingBoards();
      setBoards(list);
      if (firstLoad.current && list.length > 0) {
        // Prefer the user's last-opened preset, then their default, then the first.
        let savedId: string | null = null;
        if (lastKey) {
          try { savedId = localStorage.getItem(lastKey); } catch { /* ignore */ }
        }
        applyBoard(list.find((b) => b.id === savedId) ?? list.find((b) => b.isDefault) ?? list[0]);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your boards');
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [applyBoard, lastKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const tilesJson = useMemo(() => JSON.stringify(tiles), [tiles]);
  const isUnsaved = activeId == null;
  const dirty = isUnsaved || tilesJson !== savedTilesJson;

  const layout: Layout[] = useMemo(
    () =>
      tiles.map((t) => {
        // Expand positions tiles are sized by their measured content: lock the
        // grid height to the reported row count so the cell grows per trade and
        // can't be hand-resized shorter (which would reintroduce a scroll).
        const auto = isExpandPositions(t) ? autoRows[t.id] : undefined;
        const minH = t.kind === 'watchlist' ? 2 : t.kind === 'positions' ? 4 : t.kind === 'metrics' ? 4 : t.kind === 'news' || t.kind === 'calendar' || t.kind === 'alerts' ? 5 : 8;
        return {
          i: t.id,
          x: t.x,
          y: t.y,
          w: t.w,
          h: auto ?? t.h,
          minW: 3,
          minH: auto ?? minH,
          ...(auto ? { maxH: auto } : {}),
        };
      }),
    [tiles, autoRows],
  );

  const onLayoutChange = useCallback(
    (next: Layout[]) => {
      // Only persist layout while editing. Outside edit mode the only layout
      // changes come from expand tiles auto-growing (and reflowing others); those
      // are transient and must not dirty the board or overwrite saved positions.
      if (!editing) return;
      setTiles((prev) =>
        prev.map((t) => {
          const l = next.find((n) => n.i === t.id);
          if (!l) return t;
          // Keep an expand tile's saved base height — its live height is content-
          // driven, so don't bake the auto-grown value into the preset.
          return { ...t, x: l.x, y: l.y, w: l.w, h: isExpandPositions(t) ? t.h : l.h };
        }),
      );
    },
    [editing],
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

  const confirmSwitch = useCallback(
    (fn: () => void) => {
      if (dirty && !window.confirm('Discard unsaved changes to this board?')) return;
      fn();
    },
    [dirty],
  );

  // "Save as new" — keep the current layout exactly as it is and save it under
  // a new name as a separate preset (the original board is left untouched). It
  // never discards or resets the tiles; it just opens the name prompt, and
  // confirmName's 'create' branch persists the current tiles.
  const saveAsNew = () => setNamePrompt({ mode: 'create', value: isUnsaved ? name : `${name} copy` });

  const save = async () => {
    if (saving) return;
    if (isUnsaved) {
      // Without the desk there are no named presets, so the one board saves
      // straight through under a fixed name instead of prompting for one.
      if (!desk) {
        setSaving(true);
        try {
          const { board, boards: list } = await api.createBoard({ name: 'My board', layout: { tiles }, isDefault: true });
          setBoards(list);
          applyBoard(board);
          setError(null);
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not save the board');
        } finally {
          setSaving(false);
        }
        return;
      }
      setNamePrompt({ mode: 'create', value: name });
      return;
    }
    setSaving(true);
    try {
      const { board, boards: list } = await api.updateBoard(activeId!, { layout: { tiles } });
      setBoards(list);
      setSavedTilesJson(JSON.stringify(board.layout.tiles ?? []));
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
      if (namePrompt.mode === 'create') {
        const { board, boards: list } = await api.createBoard({ name: nm, layout: { tiles }, isDefault: boards.length === 0 });
        setBoards(list);
        applyBoard(board);
      } else {
        const { board, boards: list } = await api.updateBoard(activeId!, { name: nm });
        setBoards(list);
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

  const setDefault = async () => {
    if (isUnsaved) return;
    try {
      const { boards: list } = await api.updateBoard(activeId!, { isDefault: true });
      setBoards(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set the default board');
    }
  };

  const deleteBoard = async () => {
    if (isUnsaved) return;
    if (!window.confirm(`Delete the board "${name}"? This can't be undone.`)) return;
    try {
      const { boards: list } = await api.removeBoard(activeId!);
      setBoards(list);
      if (list.length > 0) applyBoard(list.find((b) => b.isDefault) ?? list[0]);
      else {
        setActiveId(null);
        setName('New board');
        setTiles(desk ? starterTiles() : marketStarterTiles());
        setSavedTilesJson('');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the board');
    }
  };

  if (loading) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>{"Loading your charts…"}</div>;

  return (
    <div>
      <style>{PLACEHOLDER_CSS}</style>
      <MobileScrollLockBar />

      {/* Toolbar — the preset picker and the layout actions share one wrapping
          row, so the board starts right below it when you're just watching. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {/* Named presets are part of Advanced Trading. Without it the viewer has
            exactly one board, so there is nothing to pick between. */}
        {desk && (
          <>
            <span style={{ fontSize: 9, letterSpacing: '.5px', textTransform: 'uppercase', color: FAINT, marginRight: 2 }}>Presets</span>
            <PresetPicker
              boards={boards}
              activeId={activeId}
              name={name}
              isUnsaved={isUnsaved}
              onPick={(b) => confirmSwitch(() => applyBoard(b))}
            />
          </>
        )}
        <button onClick={() => setEditing((v) => !v)} style={editing ? goldBtn : ghostBtn}>
          {editing ? '✓ Done editing' : '✎ Edit layout'}
        </button>
        {editing && (
          <>
            <button onClick={() => addTile('chart')} style={ghostBtn}>+ Chart</button>
            <button onClick={() => addTile('watchlist')} style={ghostBtn}>+ Watchlist</button>
            <button onClick={() => addTile('news')} style={ghostBtn}>+ News</button>
            <button onClick={() => addTile('calendar')} style={ghostBtn}>+ Calendar</button>
            {/* The desk tiles: team positions, desk performance, the alert feed. */}
            {desk && (
              <>
                <button onClick={() => addTile('positions')} style={ghostBtn}>+ Positions</button>
                <button onClick={() => addTile('metrics')} style={ghostBtn}>+ Metrics</button>
                <button onClick={() => addTile('alerts')} style={ghostBtn}>+ Alerts</button>
              </>
            )}
            {desk && !isUnsaved && (
              <button onClick={() => setNamePrompt({ mode: 'rename', value: name })} style={ghostBtn}>Rename</button>
            )}
            {desk && !isUnsaved && (
              <button onClick={setDefault} style={ghostBtn} title="Show this board by default">Set default</button>
            )}
            {desk && !isUnsaved && (
              <button onClick={deleteBoard} style={{ ...ghostBtn, color: '#ffb4ab' }}>{"Delete"}</button>
            )}
            {desk && <button onClick={saveAsNew} style={ghostBtn}>{"Save as new"}</button>}
          </>
        )}
        {editing && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {dirty && <span style={{ fontSize: 11, color: FAINT }}>Unsaved changes</span>}
            <button onClick={save} disabled={saving || (!dirty && !isUnsaved)} style={{ ...goldBtn, opacity: saving || (!dirty && !isUnsaved) ? 0.55 : 1 }}>
              {saving ? 'Saving…' : isUnsaved ? 'Save board' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {namePrompt && (
        <div style={namePromptRow}>
          <span style={{ fontSize: 11.5, color: MUTED }}>{namePrompt.mode === 'create' ? 'Name this board' : 'Rename board'}</span>
          <input
            autoFocus
            value={namePrompt.value}
            onChange={(e) => setNamePrompt({ ...namePrompt, value: e.target.value.slice(0, 80) })}
            onKeyDown={(e) => { if (e.key === 'Enter') void confirmName(); if (e.key === 'Escape') setNamePrompt(null); }}
            placeholder="e.g. Forex scalp"
            style={{ ...input, minWidth: 200 }}
          />
          <button onClick={() => void confirmName()} disabled={saving} style={goldBtn}>{namePrompt.mode === 'create' ? 'Save' : 'Rename'}</button>
          <button onClick={() => setNamePrompt(null)} style={ghostBtn}>{"Cancel"}</button>
        </div>
      )}

      {error && <div style={errBanner}>{error}</div>}

      {tiles.length === 0 ? (
        <div style={emptyState}>
          This board is empty. Turn on <b>Edit layout</b> and add a chart or watchlist.
        </div>
      ) : (
        <>
          <RGL
            className="layout"
            layout={layout}
            cols={COLS}
            rowHeight={ROW_H}
            margin={[10, 10]}
            isDraggable={editing}
            isResizable={editing}
            draggableHandle=".tile-header"
            draggableCancel=".no-drag"
            onLayoutChange={onLayoutChange}
            compactType="vertical"
          >
            {tiles.map((t) => (
              <div key={t.id} style={{ overflow: 'hidden' }}>
                {t.kind === 'chart' ? (
                  <ChartTile tile={t} editing={editing} onChange={(p) => patchTile(t.id, p)} onRemove={() => removeTile(t.id)} />
                ) : t.kind === 'positions' ? (
                  <PositionsTile
                    tile={t}
                    editing={editing}
                    onChange={(p) => patchTile(t.id, p)}
                    onRemove={() => removeTile(t.id)}
                    onMeasure={(px) => measureTile(t.id, px)}
                  />
                ) : t.kind === 'metrics' ? (
                  <MetricsTile tile={t} editing={editing} onRemove={() => removeTile(t.id)} />
                ) : t.kind === 'news' ? (
                  <NewsTile tile={t} editing={editing} onChange={(p) => patchTile(t.id, p)} onRemove={() => removeTile(t.id)} />
                ) : t.kind === 'calendar' ? (
                  <CalendarTile tile={t} editing={editing} onChange={(p) => patchTile(t.id, p)} onRemove={() => removeTile(t.id)} />
                ) : t.kind === 'alerts' ? (
                  <AlertsTile tile={t} editing={editing} onChange={(p) => patchTile(t.id, p)} onRemove={() => removeTile(t.id)} />
                ) : (
                  <WatchlistTile tile={t} editing={editing} onChange={(p) => patchTile(t.id, p)} onRemove={() => removeTile(t.id)} />
                )}
              </div>
            ))}
          </RGL>
          {/* While editing, keep a little breathing room below the grid so the
              bottom-row tile's resize handle isn't jammed against the footer and
              can be dragged down to grow the cell. */}
          {editing && <div aria-hidden style={{ height: 140 }} />}
        </>
      )}
    </div>
  );
}

// The saved-preset picker. A trader with a few boards used to get a wrapping
// wall of pills — three rows deep on a phone — sitting above every tile, so the
// list collapses into one dropdown and the board starts that much higher up.
//
// It is drawn by the portal itself (a button plus a body-portalled menu, the
// same shape as the metrics tile's trader picker) rather than a native
// <select>: on iOS that renders the OS picker wheel, which ignores the desk's
// theme entirely. Portalling to <body> keeps the menu clear of the grid's
// stacking context, and it closes on outside click, scroll, resize or Escape so
// it can never float detached from its button.
function PresetPicker({
  boards,
  activeId,
  name,
  isUnsaved,
  onPick,
}: {
  boards: TradingBoard[];
  activeId: string | null;
  name: string;
  isUnsaved: boolean;
  onPick: (b: TradingBoard) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
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
  // With nothing saved yet there is only the working board, so the button is
  // just a label — opening an empty menu would say nothing.
  const empty = boards.length === 0;

  return (
    <>
      <button
        ref={btnRef}
        onClick={empty ? undefined : toggle}
        disabled={empty}
        title={empty ? 'Save this board to keep it as a preset' : 'Switch preset'}
        style={{
          ...presetBtn,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 'min(72vw, 260px)',
          cursor: empty ? 'default' : 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {isUnsaved && <span style={{ color: FAINT, flex: '0 0 auto' }}>· unsaved</span>}
        {!empty && <Icon name="chevron-down" size={12} color={FAINT} />}
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
                maxHeight: '50vh',
                overflowY: 'auto',
                background: '#0C1C3C',
                border: `1px solid ${BORDER2}`,
                borderRadius: 10,
                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                padding: 6,
                zIndex: 201,
              }}
            >
              {isUnsaved && (
                <button onClick={() => setOpen(false)} style={menuRow(true)}>
                  <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                    <Icon name="check" size={13} color={GREEN} />
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: FAINT }}>unsaved</span>
                </button>
              )}
              {boards.map((b) => {
                const sel = b.id === activeId;
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      setOpen(false);
                      onPick(b);
                    }}
                    style={menuRow(sel)}
                  >
                    <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                      {sel ? <Icon name="check" size={13} color={GREEN} /> : null}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    {b.isDefault && <span style={{ fontSize: 10, fontWeight: 600, color: FAINT }}>default</span>}
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// Tiles that read the desk rather than public market data. A viewer without
// Advanced Trading never sees these — the same three kinds the server strips
// from anything they save (routes/trading.ts).
const DESK_TILE_KINDS = new Set<BoardTileKind>(['positions', 'metrics', 'alerts']);

function allowedTiles(tiles: BoardTile[], desk: boolean): BoardTile[] {
  return desk ? tiles : tiles.filter((t) => !DESK_TILE_KINDS.has(t.kind));
}

// react-grid-layout drag/resize visuals themed to the navy/gold desk.
const PLACEHOLDER_CSS = `
.react-grid-item.react-grid-placeholder { background: rgba(235,203,116,.22) !important; border: 1px dashed ${GOLD}; border-radius: 10px; }
.react-grid-item > .react-resizable-handle::after { border-right-color: ${MUTED}; border-bottom-color: ${MUTED}; }
.react-grid-item.react-draggable-dragging { z-index: 20; opacity: .95; }
`;

// The picker's trigger — the gold "this is the open preset" pill the row used
// to render per board, now the one thing standing in for the whole list.
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
