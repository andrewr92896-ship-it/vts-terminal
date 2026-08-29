import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardTile } from '../api/types';
import { useContentWidth } from '../lib/measure';
import { PublicBoard, DEFAULT_BOARD, WALL_W, workspaceCols } from './PublicBoard';
import { isDemo, publicAuth, readPublicUser, setPublicUser } from './PublicRuntime';

// The public Live Wall — the portal's board, arranged by whoever is looking at
// it. Add, remove, move and resize, and size the workspace itself, exactly as
// the private terminal does; what is different is the tile list, and the tiles
// that are missing are missing because `PublicBoard` never imports them.
//
// WHERE THE ARRANGEMENT LIVES depends on who is looking:
//
//   * A signed-in account keeps it, in the same preferences blob as the time
//     zone and the customized My Terminal.
//   * THE DEMO KEEPS IT FOR THE VISIT AND NO LONGER, which is the demo's whole
//     contract — the data is module memory and leaving is the reset. The board
//     says so rather than drawing a Save button that would quietly do nothing.

interface StoredWall { cols: number; tiles: BoardTile[] }

// The stored value is untrusted input, and it comes in TWO shapes: the current
// `{cols,tiles}`, and a bare tile array from before the workspace had a width.
// An array reads as the default twelve columns, which is exactly the canvas
// every board was built on before the setting existed.
function readStored(): StoredWall {
  const fallback = (): StoredWall => ({ cols: 12, tiles: DEFAULT_BOARD.map((t) => ({ ...t })) });
  const raw = readPublicUser().wallLayout;
  if (!raw) return fallback();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length ? { cols: 12, tiles: parsed as BoardTile[] } : fallback();
    const record = parsed as { cols?: number; tiles?: unknown };
    if (!Array.isArray(record.tiles) || record.tiles.length === 0) return fallback();
    const tiles = record.tiles as BoardTile[];
    return { cols: workspaceCols(record.cols, tiles), tiles };
  } catch {
    // An unusable stored value falls back to the default board rather than to an
    // empty one: an empty grid reads as a broken screen, and nothing here is
    // worth refusing to draw a board over.
    return fallback();
  }
}

export function PublicLiveWall() {
  const [wall, setWall] = useState<StoredWall>(readStored);
  const pending = useRef<number | null>(null);
  const latest = useRef<string | null>(null);

  // THE ROOM THE PAGE ACTUALLY HAS, measured on a full-width wrapper OUTSIDE the
  // capped wall below. A board can never report space it is not allowed to
  // occupy, so measuring inside the cap would make the ceiling the cap itself
  // and the workspace could never grow past twelve columns.
  const availRef = useRef<HTMLDivElement>(null);
  const avail = useContentWidth(availRef, WALL_W);
  // How wide the board would like to be. `WALL_W` is both the default cap and
  // the pixel width of a twelve-column workspace — one number, passed down as
  // `baseWidth`, so the two cannot drift.
  const [wantWidth, setWantWidth] = useState<number | null>(null);
  const capped = Math.min(Math.max(WALL_W, wantWidth ?? WALL_W), Math.max(320, avail));

  // DEBOUNCED, and flushed on the way out. A drag fires a layout change per
  // frame, so writing on each one would put a request behind every pixel; and
  // leaving the screen mid-arrangement is exactly when the write matters most.
  const flush = () => {
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = null;
    const raw = latest.current;
    if (raw == null || isDemo()) return;
    void publicAuth.savePreferences({ wallLayout: raw }).catch(() => {});
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const store = useCallback((next: StoredWall) => {
    setWall(next);
    const raw = JSON.stringify(next);
    // The identity is updated at once so the board survives a section change and
    // a return within the visit — in the demo that IS the whole of the storage.
    setPublicUser({ ...readPublicUser(), wallLayout: raw });
    latest.current = raw;
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(flush, 600);
  }, []);

  return (
    <div ref={availRef}>
      <div className="vts-public-wall-head">
        <div>
          <h1>Live Wall</h1>
          <p>One board, arranged by you. Add a tile, move it, size it — and size the workspace it sits on.</p>
        </div>
      </div>
      <div className="vts-public-boundary-note">
        Market information and your own records. Order placement, broker connections and live balances are
        not part of the public terminal.
      </div>
      {/* The capped wall. The cap LIFTS as the workspace grows, so extra columns
          are extra room rather than the same room cut into thinner slices. */}
      <div style={{ maxWidth: capped, marginInline: 'auto' }}>
        <PublicBoard
          tiles={wall.tiles}
          cols={wall.cols}
          onChange={(tiles) => store({ ...wall, tiles })}
          onCols={(cols) => store({ ...wall, cols })}
          onPreset={(tiles, cols) => store({ cols, tiles })}
          baseWidth={WALL_W}
          availWidth={avail}
          onWorkspaceWidth={setWantWidth}
          canSave={!isDemo()}
          saveNote="In the demo the board resets when you leave."
        />
      </div>
    </div>
  );
}
