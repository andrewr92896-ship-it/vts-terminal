import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { BORDER2, GOLD } from './tvChart';

// Mobile "scroll lock" for the Live Wall charts.
//
// On a phone, dragging inside a TradingView chart (to draw or pan) also scrolls
// the page out from under your finger. Locking sets `touch-action: none` on the
// page's main scroll container so finger drags no longer scroll the page — you
// can work inside a chart freely. Because the page can then no longer be
// finger-scrolled, a wide, touch-draggable scrollbar is shown on the right edge
// so the page is still scrollable on purpose.
//
// The lock is global (one page scroll container), toggled from any chart's
// header button; every button and the scrollbar read the same shared state.

let locked = false;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export const scrollLock = {
  toggle() {
    locked = !locked;
    emit();
  },
  set(v: boolean) {
    if (locked !== v) {
      locked = v;
      emit();
    }
  },
  get() {
    return locked;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useScrollLock(): boolean {
  return useSyncExternalStore(scrollLock.subscribe, scrollLock.get, () => false);
}

// Walk up from a node to the nearest scrollable ancestor — the portal's <main>
// content area, whose finger-scroll we lock and whose scroll we drive from the
// custom scrollbar.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

const THUMB_MIN = 48; // keep the thumb comfortably finger-sized

// Rendered once on the chart board. When the scroll lock is on it (a) sets
// `touch-action: none` on the scroll container so the page won't finger-scroll,
// and (b) draws a wide draggable scrollbar on the right so the page can still be
// scrolled deliberately. Renders nothing (beyond a zero-size DOM anchor used to
// locate the scroll container) while unlocked.
export function MobileScrollLockBar() {
  const isLocked = useScrollLock();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [geo, setGeo] = useState({ top: 0, height: 0, thumbTop: 0, thumbH: THUMB_MIN });
  const drag = useRef<{ startY: number; startScroll: number } | null>(null);

  // Release the lock if this ever unmounts while still locked.
  useEffect(() => () => scrollLock.set(false), []);

  // Resolve the scroll container when locking.
  useEffect(() => {
    if (!isLocked) {
      setRoot(null);
      return;
    }
    setRoot(findScrollParent(anchorRef.current));
  }, [isLocked]);

  // Disable finger-scrolling of the page while locked.
  useEffect(() => {
    if (!isLocked || !root) return;
    const prev = root.style.touchAction;
    root.style.touchAction = 'none';
    return () => {
      root.style.touchAction = prev;
    };
  }, [isLocked, root]);

  // Track the container's position and scroll so the thumb is sized and placed
  // correctly, following scroll, resize, and content growth.
  useEffect(() => {
    if (!isLocked || !root) return;
    const recompute = () => {
      const rect = root.getBoundingClientRect();
      const trackH = rect.height;
      const ratio = root.clientHeight / Math.max(root.scrollHeight, 1);
      const thumbH = Math.min(trackH, Math.max(THUMB_MIN, trackH * ratio));
      const maxThumbTop = Math.max(trackH - thumbH, 0);
      const scrollable = Math.max(root.scrollHeight - root.clientHeight, 1);
      const thumbTop = maxThumbTop * (root.scrollTop / scrollable);
      setGeo({ top: rect.top, height: trackH, thumbTop, thumbH });
    };
    recompute();
    root.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    // The board's chart iframes resize the page after the bar mounts; poll so
    // the thumb keeps pace with content that grows a beat later.
    const id = window.setInterval(recompute, 500);
    return () => {
      root.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      window.clearInterval(id);
    };
  }, [isLocked, root]);

  // The hard lock. A single non-passive touchmove listener on the window
  // cancels the browser's native finger-scroll for EVERY touch on the page
  // while locked — `touch-action: none` alone isn't honored for overflow
  // containers on iOS Safari, so we cancel the gesture outright. Touches inside
  // the cross-origin TradingView iframe never reach us, so chart panning still
  // works; and dragging the thumb scrolls the page programmatically (below),
  // which is unaffected by cancelling the native scroll. The net effect: the
  // page cannot be finger-scrolled at all — the wide scrollbar is the only way.
  useEffect(() => {
    if (!isLocked || !root) return;
    const onMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault(); // kill native scroll everywhere
      const d = drag.current;
      if (!d) return; // not dragging the thumb — nothing more to do
      const trackH = root.getBoundingClientRect().height;
      const ratio = root.clientHeight / Math.max(root.scrollHeight, 1);
      const thumbH = Math.min(trackH, Math.max(THUMB_MIN, trackH * ratio));
      const maxThumbTop = Math.max(trackH - thumbH, 1);
      const scrollable = Math.max(root.scrollHeight - root.clientHeight, 0);
      const dy = e.touches[0].clientY - d.startY;
      root.scrollTop = d.startScroll + (dy / maxThumbTop) * scrollable;
    };
    const onEnd = () => {
      drag.current = null;
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [isLocked, root]);

  return (
    <div ref={anchorRef} style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      {isLocked && root && (
        <div style={{ ...track, top: geo.top, height: geo.height }}>
          <div
            onTouchStart={(e) => {
              drag.current = { startY: e.touches[0].clientY, startScroll: root.scrollTop };
            }}
            style={{ ...thumb, top: geo.thumbTop, height: geo.thumbH }}
          />
        </div>
      )}
    </div>
  );
}

const track: CSSProperties = {
  position: 'fixed',
  right: 0,
  width: 22,
  zIndex: 45,
  background: 'rgba(4,12,30,.55)',
  borderLeft: `1px solid ${BORDER2}`,
  touchAction: 'none',
};
const thumb: CSSProperties = {
  position: 'absolute',
  left: 3,
  right: 3,
  borderRadius: 8,
  background: GOLD,
  boxShadow: '0 1px 6px rgba(0,0,0,.4)',
  touchAction: 'none',
};
