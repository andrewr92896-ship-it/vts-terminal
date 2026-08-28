import { useEffect, useRef, useState } from 'react';
import type { BoardTile } from '../api/types';
import { PublicBoard, DEFAULT_BOARD } from './PublicBoard';
import { isDemo, publicAuth, readPublicUser, setPublicUser } from './PublicRuntime';

// The public Live Wall — the portal's board, arranged by whoever is looking at
// it. Add, remove, move and resize, exactly as the private terminal does; what
// is different is the tile list, and the tiles that are missing are missing
// because `PublicBoard` never imports them.
//
// WHERE THE ARRANGEMENT LIVES depends on who is looking:
//
//   * A signed-in account keeps it, in the same preferences blob as the time
//     zone and the customized My Terminal.
//   * THE DEMO KEEPS IT FOR THE VISIT AND NO LONGER, which is the demo's whole
//     contract — the data is module memory and leaving is the reset. The board
//     says so rather than drawing a Save button that would quietly do nothing.

function readStored(): BoardTile[] {
  const raw = readPublicUser().wallLayout;
  if (!raw) return DEFAULT_BOARD.map((t) => ({ ...t }));
  try {
    const parsed = JSON.parse(raw) as unknown;
    // An unusable stored value falls back to the default board rather than to an
    // empty one: an empty grid reads as a broken screen, and nothing here is
    // worth refusing to draw a board over.
    return Array.isArray(parsed) && parsed.length ? (parsed as BoardTile[]) : DEFAULT_BOARD.map((t) => ({ ...t }));
  } catch {
    return DEFAULT_BOARD.map((t) => ({ ...t }));
  }
}

export function PublicLiveWall() {
  const [tiles, setTiles] = useState<BoardTile[]>(readStored);
  const pending = useRef<number | null>(null);
  const latest = useRef<string | null>(null);

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

  const change = (next: BoardTile[]) => {
    setTiles(next);
    const raw = JSON.stringify(next);
    // The identity is updated at once so the board survives a section change and
    // a return within the visit — in the demo that IS the whole of the storage.
    setPublicUser({ ...readPublicUser(), wallLayout: raw });
    latest.current = raw;
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(flush, 600);
  };

  return (
    <div>
      <div className="vts-public-wall-head">
        <div>
          <h1>Live Wall</h1>
          <p>One board, arranged by you. Add a tile, move it, size it.</p>
        </div>
      </div>
      <div className="vts-public-boundary-note">
        Market information and your own records. Order placement, broker connections and live balances are
        not part of the public terminal.
      </div>
      <PublicBoard
        tiles={tiles}
        onChange={change}
        canSave={!isDemo()}
        saveNote="In the demo the board resets when you leave."
      />
    </div>
  );
}
