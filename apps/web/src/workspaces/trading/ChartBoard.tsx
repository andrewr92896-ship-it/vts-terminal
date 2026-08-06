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
  const { isPhone } = useResponsive();
  const features = user?.access.features ?? { advancedTrading: desk, funded: false, tradingTeams: false };
  const entitled = useCallback((f: PremiumFeature) => hasEntitlement(user, f), [user]);
  // Saving your own arrangement is the paid part. Without it the reader gets the
  // built-in layouts instead of an empty grid and a locked save button.
  const canCustomize = hasEntitlement(user, 'customBoards');
  const canEdit = canCustomize;
  // DRAGGING is the desktop-only half, not editing. On a phone the wall renders
  // as one column (see `layout`), and a drag there would write that flattened
  // order back over the real arrangement — so the grid stays fixed and a phone
  // reorders with the per-tile arrows instead (see `movePhoneTile`). Everything
  // else edit mode does — adding a tile, removing one, a tile's own settings,
  // naming, sharing and saving the board — works the same on either.
  const canDrag = canEdit && !isPhone;

  // Remember the last-opened preset per user (per device) so returning to the
  // board — after toggling to Positions, a reload, or a new session — lands on
  // the same preset instead of resetting to the default.
  const lastKey = user?.id ? `vts:lastBoard:${user.id}` : null;
  const builtInKey = user?.id ? `vts:wallLayout:${user.id}` : null;
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
  const [templates, setTemplates] = useState<PresetLayout[]>(PRESET_LAYOUTS);
  useEffect(() => {
    let alive = true;
    api
      .wallTemplates()
      .then((r) => {
        if (!alive || r.templates.length === 0) return;
        setTemplates(
          r.templates.map((t) => ({ key: t.key, label: t.label, blurb: t.blurb, tiles: t.tiles })),
        );
      })
      .catch(() => {
        /* keep the built-in fallback */
      });
    return () => {
      alive = false;
    };
  }, []);

  const [tiles, setTiles] = useState<BoardTile[]>([]);
  const [savedTilesJson, setSavedTilesJson] = useState<string>(''); // '' → never saved
  const [editing, setEditing] = useState(false);

  // Escape leaves edit mode. Every other layer of this screen that can be open
  // (the tile picker, a settings modal, the maximized tile) handles Escape
  // itself and stops it, so this only fires when the board is what the reader is
  // actually looking at. Without it the only way out is finding the Done button,
  // which on a long board can be a scroll away from wherever they were dragging.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setEditing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [namePrompt, setNamePrompt] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null);
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

  const applyBoard = useCallback(
    (b: TradingBoard) => {
      setActiveId(b.id);
      setSharedId(null);
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
      setSharedId(null);
      const p = templates.find((t) => t.key === key) ?? templates[0] ?? presetLayout(key);
      setName(p.label);
      const built = buildPreset(p, features, entitled);
      setTiles(built);
      // Baseline the comparison against what was just applied, so an untouched
      // built-in layout is not "modified". Without this every layout switch
      // asked "discard unsaved changes?" about changes nobody had made.
      setSavedTilesJson(JSON.stringify(built));
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
    // Only on mount and when the customization right changes. `load` reads the
    // current built-in choice and the boards list itself, so re-running it on
    // every identity change of those would re-apply a board over the trader's
    // unsaved edits. Its `finally` clears `loading` on both paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCustomize]);

  // Resolved from the live list, so a tile removed while expanded closes the
  // overlay rather than leaving it showing something the board no longer has.
  const maxTile = maxId ? (tiles.find((t) => t.id === maxId) ?? null) : null;

  const tilesJson = useMemo(() => JSON.stringify(tiles), [tiles]);
  const isUnsaved = activeId == null;
  // Modified since it was applied — deliberately NOT "unsaved". A built-in
  // layout is permanently unsaved and is nonetheless untouched, and conflating
  // the two made every layout switch warn about discarding nothing.
  const dirty = tilesJson !== savedTilesJson;
  const activeBoard = activeId ? (boards.find((b) => b.id === activeId) ?? null) : null;

  // Which tiles this reader cannot reach, resolved once per render rather than
  // per tile per frame.
  const locks = useMemo(() => {
    const m = new Map<string, ReturnType<typeof tileLock>>();
    for (const t of tiles) m.set(t.id, tileLock(t.kind, features, entitled));
    return m;
  }, [tiles, features, entitled]);

  // The phone's reading order, so the reorder arrows know which tile is first
  // and which is last. The same sort the phone branch of `layout` renders in.
  const phoneOrder = useMemo(
    () => (isPhone ? [...tiles].sort((a, b) => a.y - b.y || a.x - b.x).map((t) => t.id) : []),
    [tiles, isPhone],
  );

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
    // is also why every row here is `static` and `onLayoutChange` ignores a
    // phone — a drag here would otherwise write this flattened order back over
    // the real one.
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
    });
  }, [tiles, autoRows, isPhone]);

  const onLayoutChange = useCallback(
    (next: Layout[]) => {
      // Only persist layout while editing. Outside edit mode the only layout
      // changes come from expand tiles auto-growing (and reflowing others); those
      // are transient and must not dirty the board or overwrite saved positions.
      //
      // NEVER on a phone, whatever the mode. What the grid reports there is the
      // flattened one-column render (x:0, w:1, floored heights), not the board —
      // writing it back would destroy the desktop arrangement the moment somebody
      // opened edit mode on their phone. This guard is the reason phone editing
      // is safe at all; the phone reorders through `movePhoneTile`.
      if (!editing || isPhone) return;
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
    [editing, isPhone],
  );

  // Move a tile one place in the phone's reading order.
  //
  // "Up" and "down" mean that order, not grid coordinates — a phone renders the
  // board as one column and has no x to speak of. The move is a SWAP of the two
  // tiles' grid geometry, deliberately, rather than a rewrite of the board into
  // a column: the set of slots the trader arranged on a desktop is left exactly
  // as it was, and only which tile occupies which slot changes. The obvious
  // implementation — renumber y down the column and set every x to 0 — is the
  // one thing a phone must never do, since it would flatten a desktop board
  // from the small screen with no way to get it back.
  //
  // Heights are clamped to each tile's own minimum on the way in: the two slots
  // can differ a lot (a ticker strip's two rows against a chart's eight), and a
  // chart dropped into a two-row slot is a stub. Growing one can overlap what
  // sits below it, which the grid's vertical compaction resolves on the desktop.
  const movePhoneTile = useCallback((id: string, dir: -1 | 1) => {
    setTiles((prev) => {
      const order = [...prev].sort((a, b) => a.y - b.y || a.x - b.x);
      const i = order.findIndex((t) => t.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= order.length) return prev;
      const a = order[i];
      const b = order[j];
      const fit = (t: BoardTile, slot: BoardTile): BoardTile => ({
        ...t,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: Math.max(slot.h, tileDef(t.kind)?.minH ?? 4),
      });
      return prev.map((t) => (t.id === a.id ? fit(a, b) : t.id === b.id ? fit(b, a) : t));
    });
  }, []);

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
      // Naming it is the same step for everybody now: how many boards you may
      // keep follows the membership rather than the desk opt-in, so a Markets-
      // only member who paid for custom boards gets real presets like anyone
      // else, instead of one board silently called "My board".
      setNamePrompt({ mode: 'create', value: name });
      return;
    }
    setSaving(true);
    try {
      const { board, boards: list, teamBoards: shared } = await api.updateBoard(activeId!, { layout: { tiles } });
      setBoards(list);
      setTeamBoards(shared);
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
        const { board, boards: list, teamBoards: shared } = await api.createBoard({ name: nm, layout: { tiles }, isDefault: boards.length === 0 });
        setBoards(list);
        setTeamBoards(shared);
        applyBoard(board);
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
  const applyShared = useCallback((b: TradingBoard) => {
    setActiveId(null);
    setSharedId(b.id);
    setName(b.name);
    setTiles(b.layout.tiles ?? []);
    // Baselined for the same reason as a built-in: opening a teammate's layout
    // is not an edit.
    setSavedTilesJson(JSON.stringify(b.layout.tiles ?? []));
    setNamePrompt(null);
    setEditing(false);
  }, []);

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

  const setDefault = async () => {
    if (isUnsaved) return;
    try {
      const { boards: list, teamBoards: shared } = await api.updateBoard(activeId!, { isDefault: true });
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
          onPickBoard={(b) => confirmSwitch(() => applyBoard(b))}
          onPickBuiltIn={(k) => confirmSwitch(() => applyBuiltIn(k))}
          onPickShared={(b) => confirmSwitch(() => applyShared(b))}
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
            <button onClick={() => setEditing((v) => !v)} style={editing ? goldBtn : ghostBtn}>
              {editing ? '✓ Done editing' : '✎ Edit layout'}
            </button>
            {editing && (
              <>
                <TilePicker onAdd={addTile} onOpenMembership={onOpenMembership} />
                {/* The board actions follow the membership, not the desk — see
                    `save` above. They only need a board to act on. */}
                {!isUnsaved && (
                  <button onClick={() => setNamePrompt({ mode: 'rename', value: name })} style={ghostBtn}>
                    {"Rename"}
                  </button>
                )}
                {!isUnsaved && (
                  <button onClick={setDefault} style={ghostBtn} title="Show this board by default">
                    {"Set default"}
                  </button>
                )}
                {!isUnsaved && (
                  <button onClick={deleteBoard} style={{ ...ghostBtn, color: '#ffb4ab' }}>
                    {"Delete"}
                  </button>
                )}
                {/* Publishing sends the ARRANGEMENT to the team, never the
                    figures — each teammate's tiles fetch as themselves. A notes
                    tile's text is stripped server-side on the way out. */}
                {!isUnsaved && onTeam && (
                  <button
                    onClick={() => void toggleShare()}
                    disabled={saving}
                    style={{
                      ...ghostBtn,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      ...(activeBoard?.sharedTeamId
                        ? { color: GREEN, borderColor: 'rgba(53,196,123,.5)' }
                        : null),
                    }}
                    title={
                      activeBoard?.sharedTeamId
                        ? 'Your team can open this layout'
                        : 'Let your team open this layout'
                    }
                  >
                    <Icon name="users" size={12} color={activeBoard?.sharedTeamId ? GREEN : FAINT} />
                    <span>{activeBoard?.sharedTeamId ? 'Shared with team' : 'Share with team'}</span>
                  </button>
                )}
                <button onClick={saveAsNew} style={ghostBtn}>{"Save as new"}</button>
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
        ) : canCustomize ? null : (
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
            {canEdit
              ? 'This board is empty. Turn on Edit layout and add a tile.'
              : 'This layout has nothing you can see yet.'}
          </div>
        ) : (
          <>
            <RGL
              className="layout"
              width={boardW}
              layout={layout}
              cols={isPhone ? 1 : COLS}
              rowHeight={ROW_H}
              margin={[10, 10]}
              // `canDrag` as well as `editing`: a board left in edit mode on a
              // desktop and then narrowed to a phone would otherwise stay
              // draggable, and a drag there writes the flattened one-column
              // order back over the real arrangement. A phone edits through the
              // per-cell arrows below instead.
              isDraggable={editing && canDrag}
              isResizable={editing && canDrag}
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
              compactType="vertical"
            >
              {tiles.map((t) => (
                <div
                  key={t.id}
                  className={`wall-cell${editing ? ' wall-cell-editing' : ''}${
                    editing && isPhone ? ' wall-cell-fixed' : ''
                  }`}
                  style={{ overflow: 'hidden', position: 'relative' }}
                >
                  <BoardTileView
                    tile={t}
                    editing={editing}
                    lock={locks.get(t.id) ?? null}
                    onChange={(p) => patchTile(t.id, p)}
                    onRemove={() => removeTile(t.id)}
                    onMeasure={(px) => measureTile(t.id, px)}
                    onOpenMembership={onOpenMembership}
                  />
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
                  {/* The phone's reorder control, in the same corner the expand
                      button uses and free for exactly the same reason: while
                      editing there is no expand button, and on a phone there are
                      no resize handles either. In the cell rather than the tile
                      header because there is a component per tile kind and this
                      way every one of them gets the control unchanged. */}
                  {editing && isPhone && (
                    <div className="wall-move no-drag">
                      <button
                        onClick={() => movePhoneTile(t.id, -1)}
                        disabled={phoneOrder.indexOf(t.id) <= 0}
                        title={`Move ${tileLabel(t.kind)} up`}
                        aria-label={`Move ${tileLabel(t.kind)} up`}
                      >
                        <Icon name="chevron-up" size={13} color="#cfe0ff" />
                      </button>
                      <button
                        onClick={() => movePhoneTile(t.id, 1)}
                        disabled={phoneOrder.indexOf(t.id) >= phoneOrder.length - 1}
                        title={`Move ${tileLabel(t.kind)} down`}
                        aria-label={`Move ${tileLabel(t.kind)} down`}
                      >
                        <Icon name="chevron-down" size={13} color="#cfe0ff" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </RGL>
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
                        {b.isDefault && <span style={{ fontSize: 10, fontWeight: 600, color: FAINT }}>default</span>}
                      </button>
                    );
                  })}
                </>
              )}
              {teamBoards.length > 0 && (
                <>
                  <div style={menuHeading}>Shared with your team</div>
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

/* A cell that cannot be dragged — edit mode on a phone. The header's grip glyph
   and grab cursor both promise a drag that will not happen there, and the tile
   moves with the arrows instead. */
.wall-cell-fixed .tile-grip { display: none; }
.wall-cell-fixed .tile-header, .wall-cell-fixed .tile-header:active { cursor: default; }

/* The phone's reorder arrows. Full strength always: this is a touch-only
   control, so there is no hover to reveal it with. */
.wall-move {
  position: absolute; right: 6px; bottom: 6px; z-index: 5;
  display: inline-flex; align-items: stretch;
  background: rgba(9,20,46,.96); border: 1px solid ${BORDER2}; border-radius: 7px;
  overflow: hidden;
}
.wall-move button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 30px; padding: 0;
  background: transparent; border: none; cursor: pointer;
}
.wall-move button + button { border-left: 1px solid ${BORDER2}; }
.wall-move button:disabled { opacity: .3; cursor: default; }
.wall-move button:active:not(:disabled) { background: rgba(235,203,116,.18); }
`;

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
