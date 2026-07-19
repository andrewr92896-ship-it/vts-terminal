import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { BoardTile, BoardTileKind, TradingBoard } from '../../api/types';
import { ChartTile } from './ChartTile';
import { WatchlistTile } from './WatchlistTile';
import { PositionsTile } from './PositionsTile';
import { NewsTile } from './NewsTile';
import { CalendarTile } from './CalendarTile';
import { AlertsTile } from './AlertsTile';
import { MobileScrollLockBar } from './scrollLock';
import { BORDER, BORDER2, FAINT, GOLD, MUTED, PANEL, ghostBtn, goldBtn, input, newTile, starterTiles } from './tvChart';
import { EditableText } from '../../copy/SiteCopy';

const RGL = WidthProvider(GridLayout);
const COLS = 12;
const ROW_H = 30;
const MARGIN = 10;

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
export function ChartBoard() {
  const { user } = useAuth();
  // Remember the last-opened preset per user (per device) so returning to the
  // board — after toggling to Positions, a reload, or a new session — lands on
  // the same preset instead of resetting to the default.
  const lastKey = user?.id ? `vts:lastBoard:${user.id}` : null;
  const [boards, setBoards] = useState<TradingBoard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // null → unsaved working board
  const [name, setName] = useState('New board');
  const [tiles, setTiles] = useState<BoardTile[]>(starterTiles());
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
      setTiles(b.layout.tiles ?? []);
      setSavedTilesJson(JSON.stringify(b.layout.tiles ?? []));
      setNamePrompt(null);
      if (lastKey) {
        try { localStorage.setItem(lastKey, b.id); } catch { /* storage unavailable — non-fatal */ }
      }
    },
    [lastKey],
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
        const minH = t.kind === 'watchlist' ? 2 : t.kind === 'positions' ? 4 : t.kind === 'news' || t.kind === 'calendar' || t.kind === 'alerts' ? 5 : 8;
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
        setTiles(starterTiles());
        setSavedTilesJson('');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the board');
    }
  };

  if (loading) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}><EditableText id="chartboard.loading">Loading your charts…</EditableText></div>;

  return (
    <div>
      <style>{PLACEHOLDER_CSS}</style>
      <MobileScrollLockBar />

      {/* Presets bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: '.5px', textTransform: 'uppercase', color: FAINT, marginRight: 2 }}>Presets</span>
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => confirmSwitch(() => applyBoard(b))}
            style={boardPill(b.id === activeId)}
          >
            {b.name}
          </button>
        ))}
        {isUnsaved && <span style={boardPill(true)}>{name} <span style={{ color: FAINT }}>· unsaved</span></span>}
        {editing && <button onClick={saveAsNew} style={{ ...ghostBtn, padding: '6px 10px' }}><EditableText id="chartboard.save_new">Save as new</EditableText></button>}
      </div>

      {/* Actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setEditing((v) => !v)} style={editing ? goldBtn : ghostBtn}>
          {editing ? '✓ Done editing' : '✎ Edit layout'}
        </button>
        {editing && (
          <>
            <button onClick={() => addTile('chart')} style={ghostBtn}>+ Chart</button>
            <button onClick={() => addTile('watchlist')} style={ghostBtn}>+ Watchlist</button>
            <button onClick={() => addTile('positions')} style={ghostBtn}>+ Positions</button>
            <button onClick={() => addTile('news')} style={ghostBtn}>+ News</button>
            <button onClick={() => addTile('calendar')} style={ghostBtn}>+ Calendar</button>
            <button onClick={() => addTile('alerts')} style={ghostBtn}>+ Alerts</button>
            {!isUnsaved && (
              <button onClick={() => setNamePrompt({ mode: 'rename', value: name })} style={ghostBtn}>Rename</button>
            )}
            {!isUnsaved && (
              <button onClick={setDefault} style={ghostBtn} title="Show this board by default">Set default</button>
            )}
            {!isUnsaved && (
              <button onClick={deleteBoard} style={{ ...ghostBtn, color: '#ffb4ab' }}><EditableText id="chartboard.delete">Delete</EditableText></button>
            )}
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
          <button onClick={() => setNamePrompt(null)} style={ghostBtn}><EditableText id="chartboard.cancel">Cancel</EditableText></button>
        </div>
      )}

      {error && <div style={errBanner}>{error}</div>}

      {tiles.length === 0 ? (
        <div style={emptyState}>
          This board is empty. Turn on <b>Edit layout</b> and add a chart or watchlist.
        </div>
      ) : (
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
      )}
    </div>
  );
}

// react-grid-layout drag/resize visuals themed to the navy/gold desk.
const PLACEHOLDER_CSS = `
.react-grid-item.react-grid-placeholder { background: rgba(235,203,116,.22) !important; border: 1px dashed ${GOLD}; border-radius: 10px; }
.react-grid-item > .react-resizable-handle::after { border-right-color: ${MUTED}; border-bottom-color: ${MUTED}; }
.react-grid-item.react-draggable-dragging { z-index: 20; opacity: .95; }
`;

function boardPill(active: boolean): CSSProperties {
  return {
    fontSize: 11.5,
    fontWeight: 600,
    color: active ? '#fff' : '#cbd8f5',
    background: active ? 'rgba(235,203,116,.14)' : 'rgba(255,255,255,.04)',
    border: `1px solid ${active ? 'rgba(235,203,116,.5)' : BORDER2}`,
    borderRadius: 7,
    padding: '6px 11px',
    cursor: 'pointer',
  };
}
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
