import { BORDER2, GOLD, MUTED } from './tvChart';

// THE BOARD'S GRID CHROME, IN ITS OWN MODULE so the public terminal's board can
// use it too. `ChartBoard.tsx` imports every tile kind there is — the order
// ticket and the desk tiles among them — so the public board cannot be that
// component; what it CAN share, and must, is how a board looks and behaves while
// it is being arranged. Two copies of these rules is two boards that drift into
// looking like different products.
//
// react-grid-layout drag/resize visuals themed to the navy/gold desk, plus the
// per-cell expand control.
//
// The expand button is hover-revealed on a pointer device and permanently
// visible where there is no hover — a touch device gets no chance to discover a
// control that only appears on hover, so it would simply not exist there.
export const BOARD_GRID_CSS = `
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
