import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasEntitlement, tierOfFeature } from '../../auth/access';
import { Icon } from '../../components/Icon';
import { TierMark } from '../../components/TierMark';
import type { BoardTile, BoardTileKind, PremiumFeature, TradingBoard } from '../../api/types';
import { MobileScrollLockBar } from './scrollLock';
import { useContentWidth } from '../../lib/measure';
import { BORDER, BORDER2, FAINT, GOLD, GREEN, MUTED, PANEL, ghostBtn, goldBtn, input } from './tvChart';
import { DESK_TILE_KINDS, newTile, tileDef, tileLock } from './tileCatalog';
import { PRESET_LAYOUTS, buildPreset, presetLayout } from './presetLayouts';
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
export function ChartBoard({ desk = true, onOpenMembership }: { desk?: boolean; onOpenMembership?: () => void }) {
  const { user } = useAuth();
  const features = user?.access.features ?? { advancedTrading: desk, funded: false };
  const entitled = useCallback((f: PremiumFeature) => hasEntitlement(user, f), [user]);
  // Saving your own arrangement is the paid part. Without it the reader gets the
  // built-in layouts instead of an empty grid and a locked save button.
  const canCustomize = hasEntitlement(user, 'customBoards');

  // Remember the last-opened preset per user (per device) so returning to the
  // board — after toggling to Positions, a reload, or a new session — lands on
  // the same preset instead of resetting to the default.
  const lastKey = user?.id ? `vts:lastBoard:${user.id}` : null;
  const builtInKey = user?.id ? `vts:wallLayout:${user.id}` : null;
  const [boards, setBoards] = useState<TradingBoard[]>([]);
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
  const [tiles, setTiles] = useState<BoardTile[]>([]);
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
  // The board's own width, read from the element rather than a resize entry —
  // see lib/measure.ts for why that distinction is the whole bug on iPhone.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardW = useContentWidth(boardRef, 1120);

  const applyBoard = useCallback(
    (b: TradingBoard) => {
      setActiveId(b.id);
      setName(b.name);
      setTiles(b.layout.tiles ?? []);
      setSavedTilesJson(JSON.stringify(b.layout.tiles ?? []));
      setNamePrompt(null);
      if (lastKey) {
        try {
          localStorage.setItem(lastKey, b.id);
        } catch {
          /* storage unavailable — non-fatal */
        }
      }
    },
    [lastKey],
  );

  // Switch to a built-in layout. Rebuilt through `buildPreset` so it is filtered
  // to what this reader can actually reach before it ever renders.
  const applyBuiltIn = useCallback(
    (key: string) => {
      setBuiltIn(key);
      setActiveId(null);
      const p = presetLayout(key);
      setName(p.label);
      setTiles(buildPreset(p, features, entitled));
      setSavedTilesJson('');
      if (builtInKey) {
        try {
          localStorage.setItem(builtInKey, key);
        } catch {
          /* ignore */
        }
      }
    },
    [builtInKey, features, entitled],
  );

  const load = useCallback(async () => {
    try {
      // A reader without `customBoards` has nothing saved to load, and the read
      // would only ever come back empty — so go straight to the built-ins.
      if (!canCustomize) {
        applyBuiltIn(builtIn);
        setError(null);
        return;
      }
      const { boards: list } = await api.tradingBoards();
      setBoards(list);
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
          applyBoard(list.find((b) => b.id === savedId) ?? list.find((b) => b.isDefault) ?? list[0]);
        } else {
          // Nothing saved yet: open on a built-in layout rather than an empty
          // grid, so a first visit shows a finished board.
          applyBuiltIn(builtIn);
        }
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your boards');
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [applyBoard, applyBuiltIn, builtIn, canCustomize, lastKey]);

  useEffect(() => {
    void load();
    // Only on mount and when the customization right changes — `load` re-reads
    // the built-in choice from state each time it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCustomize]);

  useEffect(() => {
    if (!canCustomize) setLoading(false);
  }, [canCustomize]);

  const tilesJson = useMemo(() => JSON.stringify(tiles), [tiles]);
  const isUnsaved = activeId == null;
  const dirty = isUnsaved || tilesJson !== savedTilesJson;

  // Which tiles this reader cannot reach, resolved once per render rather than
  // per tile per frame.
  const locks = useMemo(() => {
    const m = new Map<string, ReturnType<typeof tileLock>>();
    for (const t of tiles) m.set(t.id, tileLock(t.kind, features, entitled));
    return m;
  }, [tiles, features, entitled]);

  const layout: Layout[] = useMemo(
    () =>
      tiles.map((t) => {
        // Expand positions tiles are sized by their measured content: lock the
        // grid height to the reported row count so the cell grows per trade and
        // can't be hand-resized shorter (which would reintroduce a scroll).
        const auto = isExpandPositions(t) ? autoRows[t.id] : undefined;
        const def = tileDef(t.kind);
        return {
          i: t.id,
          x: t.x,
          y: t.y,
          w: t.w,
          h: auto ?? t.h,
          minW: def?.minW ?? 3,
          minH: auto ?? def?.minH ?? 4,
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
          activeId={activeId}
          builtIn={builtIn}
          name={name}
          isUnsaved={isUnsaved}
          onPickBoard={(b) => confirmSwitch(() => applyBoard(b))}
          onPickBuiltIn={(k) => confirmSwitch(() => applyBuiltIn(k))}
        />

        {canCustomize ? (
          <>
            <button onClick={() => setEditing((v) => !v)} style={editing ? goldBtn : ghostBtn}>
              {editing ? '✓ Done editing' : '✎ Edit layout'}
            </button>
            {editing && (
              <>
                <TilePicker onAdd={addTile} onOpenMembership={onOpenMembership} />
                {desk && !isUnsaved && (
                  <button onClick={() => setNamePrompt({ mode: 'rename', value: name })} style={ghostBtn}>
                    {"Rename"}
                  </button>
                )}
                {desk && !isUnsaved && (
                  <button onClick={setDefault} style={ghostBtn} title="Show this board by default">
                    {"Set default"}
                  </button>
                )}
                {desk && !isUnsaved && (
                  <button onClick={deleteBoard} style={{ ...ghostBtn, color: '#ffb4ab' }}>
                    {"Delete"}
                  </button>
                )}
                {desk && <button onClick={saveAsNew} style={ghostBtn}>{"Save as new"}</button>}
              </>
            )}
            {editing && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {dirty && <span style={{ fontSize: 11, color: FAINT }}>Unsaved changes</span>}
                <button
                  onClick={save}
                  disabled={saving || (!dirty && !isUnsaved)}
                  style={{ ...goldBtn, opacity: saving || (!dirty && !isUnsaved) ? 0.55 : 1 }}
                >
                  {saving ? 'Saving…' : isUnsaved ? 'Save board' : 'Save'}
                </button>
              </div>
            )}
          </>
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
          <span style={{ fontSize: 11.5, color: MUTED }}>{namePrompt.mode === 'create' ? 'Name this board' : 'Rename board'}</span>
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
            {namePrompt.mode === 'create' ? 'Save' : 'Rename'}
          </button>
          <button onClick={() => setNamePrompt(null)} style={ghostBtn}>
            {"Cancel"}
          </button>
        </div>
      )}

      {error && <div style={errBanner}>{error}</div>}

      {tiles.length === 0 ? (
        <div style={emptyState}>
          {canCustomize
            ? 'This board is empty. Turn on Edit layout and add a tile.'
            : 'This layout has nothing you can see yet.'}
        </div>
      ) : (
        <>
          <div ref={boardRef}>
            <RGL
              className="layout"
              width={boardW}
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
                  <BoardTileView
                    tile={t}
                    editing={editing}
                    lock={locks.get(t.id) ?? null}
                    onChange={(p) => patchTile(t.id, p)}
                    onRemove={() => removeTile(t.id)}
                    onMeasure={(px) => measureTile(t.id, px)}
                    onOpenMembership={onOpenMembership}
                  />
                </div>
              ))}
            </RGL>
          </div>
          {/* While editing, keep a little breathing room below the grid so the
              bottom-row tile's resize handle isn't jammed against the footer and
              can be dragged down to grow the cell. */}
          {editing && <div aria-hidden style={{ height: 140 }} />}
        </>
      )}
    </div>
  );
}

// The layout picker: the three built-in layouts, and — for a member who can
// arrange their own — their saved boards under them.
//
// It is drawn by the terminal itself (a button plus a body-portalled menu)
// rather than a native <select>: on iOS that renders the OS picker wheel, which
// ignores the desk's theme entirely. Portalling to <body> keeps the menu clear
// of the grid's stacking context, and it closes on outside click, scroll, resize
// or Escape so it can never float detached from its button.
function LayoutPicker({
  boards,
  activeId,
  builtIn,
  name,
  isUnsaved,
  onPickBoard,
  onPickBuiltIn,
}: {
  boards: TradingBoard[];
  activeId: string | null;
  builtIn: string;
  name: string;
  isUnsaved: boolean;
  onPickBoard: (b: TradingBoard) => void;
  onPickBuiltIn: (key: string) => void;
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
              {PRESET_LAYOUTS.map((p) => {
                const sel = activeId == null && p.key === builtIn;
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
                        {b.isDefault && <span style={{ fontSize: 10, fontWeight: 600, color: FAINT }}>default</span>}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// Re-exported so the Live Wall (and the server mirror's client twin) can keep
// reading the desk-tile set from one place.
export { DESK_TILE_KINDS };

// react-grid-layout drag/resize visuals themed to the navy/gold desk.
const PLACEHOLDER_CSS = `
.react-grid-item.react-grid-placeholder { background: rgba(235,203,116,.22) !important; border: 1px dashed ${GOLD}; border-radius: 10px; }
.react-grid-item > .react-resizable-handle::after { border-right-color: ${MUTED}; border-bottom-color: ${MUTED}; }
.react-grid-item.react-draggable-dragging { z-index: 20; opacity: .95; }
`;

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
