import { useCallback, useEffect, useRef, useState } from 'react';
import { C } from '../../theme/tokens';

/**
 * The editor's three panes — sections, form, preview — and the two lines
 * between them that can be dragged.
 *
 * WHAT IS STORED IS A PIXEL WIDTH FOR EACH OF THE FIRST TWO PANES; the preview
 * takes whatever is left. Two numbers, not three, because three widths that
 * have to add up to the window is a constraint somebody has to enforce, and
 * "the last one takes the rest" enforces it by construction.
 *
 * THE FORM'S WIDTH STARTS AS NULL, which means "whatever it was before this
 * existed" — a CSS clamp that scales with the window. It becomes a number the
 * first time it is dragged, and only then. Storing a default number would have
 * changed the layout for anybody who never touched the handle.
 *
 * ON THIS BROWSER, deliberately — the same place the unsaved working copy
 * lives. How wide somebody wants their panes is a fact about the screen in
 * front of them, and a phone-sized split synced to a desk would be wrong on
 * both. Anything that fails to read comes back as the default; a layout is
 * never worth an error.
 */

export type PaneLayout = {
  navOpen: boolean;
  nav: number;
  editor: number | null;
};

export const NAV_MIN = 150;
export const NAV_MAX = 440;
/** The strip left behind when the section list is collapsed. */
export const NAV_RAIL = 40;
export const EDITOR_MIN = 280;
export const PREVIEW_MIN = 260;

const KEY = 'vts:site-editor:panes';
const DEFAULT: PaneLayout = { navOpen: true, nav: 210, editor: null };

function read(): PaneLayout {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT;
    const num = (v: unknown, lo: number, hi: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
    return {
      navOpen: raw.navOpen !== false,
      nav: num(raw.nav, NAV_MIN, NAV_MAX) ?? DEFAULT.nav,
      // No ceiling here: the window it was dragged on may be wider than this
      // one, and the pane clamps itself against the live container on render.
      editor: num(raw.editor, EDITOR_MIN, 100000),
    };
  } catch {
    return DEFAULT;
  }
}

export function useEditorLayout(): [PaneLayout, (patch: Partial<PaneLayout>) => void] {
  const [layout, setLayout] = useState<PaneLayout>(read);
  const update = useCallback((patch: Partial<PaneLayout>) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* a private window, or storage full — the layout still applies for this visit */
      }
      return next;
    });
  }, []);
  return [layout, update];
}

/**
 * The draggable line between two panes.
 *
 * SIX PIXELS WIDE AND DRAWN OVER THE PANE BORDER IT REPLACES, with a negative
 * margin of three on each side, so it adds EXACTLY NOTHING to the row: the
 * one-pixel line people see is the border already there, and the hit area
 * around it is what makes it grabbable without hunting. Net zero matters — at
 * seven pixels each handle left one behind, the stored widths came out two
 * over the container, and flex quietly took a pixel back off every reload.
 * Only while hovered or dragged does it show itself.
 *
 * POINTER CAPTURE, NOT DOCUMENT LISTENERS. A drag that leaves the handle — every
 * drag does, within a frame — keeps reporting to it, and a drag that ends over
 * the preview iframe still ends. That last case is the one the iframe would
 * otherwise swallow, which is also why the editor turns the frame's pointer
 * events off for the duration.
 *
 * `start` is asked for the pane's width at the moment the drag begins, rather
 * than the handle keeping a copy: the form pane's width is a CSS clamp until it
 * is first dragged, so the only thing that knows the number is the element.
 */
export function Splitter({
  label,
  start,
  onResize,
  onDragging,
}: {
  label: string;
  start: () => number;
  onResize: (px: number) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);

  // The cursor must read col-resize wherever the pointer is during a drag, not
  // only over the handle — it is the one signal that the drag is still live.
  useEffect(() => {
    if (!active) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [active]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: start() };
        setActive(true);
        onDragging(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onResize(drag.current.w + (e.clientX - drag.current.x));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setActive(false);
        onDragging(false);
      }}
      onPointerCancel={(e) => {
        if (!drag.current) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setActive(false);
        onDragging(false);
      }}
      onKeyDown={(e) => {
        // The keyboard moves it too, in steps — a handle that can only be
        // dragged is one a keyboard user cannot reach at all.
        const step = e.shiftKey ? 64 : 16;
        if (e.key === 'ArrowLeft') onResize(start() - step);
        else if (e.key === 'ArrowRight') onResize(start() + step);
        else return;
        e.preventDefault();
      }}
      style={{
        flex: 'none',
        width: 6,
        margin: '0 -3px',
        zIndex: 3,
        cursor: 'col-resize',
        position: 'relative',
        touchAction: 'none',
        outline: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 2,
          width: 2,
          borderRadius: 2,
          background: active ? C.gold : hover ? C.line2 : 'transparent',
          transition: 'background-color .12s ease',
        }}
      />
    </div>
  );
}
