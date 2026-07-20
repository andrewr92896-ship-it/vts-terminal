import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useResponsive } from '../../hooks/useMediaQuery';
import { BORDER2, GOLD } from './tvChart';

// Mobile "scroll lock" for the Live Wall charts.
//
// On a phone, dragging inside a TradingView chart (to draw or pan) also scrolls
// the page out from under your finger. Locking freezes every scroll surface on
// the page so finger drags no longer scroll anything — you can work inside a
// chart freely. Because the page can then no longer be finger-scrolled, a wide,
// touch-draggable scrollbar is shown on the right edge so the page is still
// scrollable on purpose.
//
// The lock is global, toggled from any chart's header button; every button and
// the scrollbar read the same shared state.

// The DOM lock is a single CSS class rather than inline styles. `<main>` is
// shared across every section of the portal and React owns its inline style, so
// saving/restoring inline `overflow` is fragile — a missed restore would break
// scrolling app-wide. A class (applied to <html>, <body>, and the content
// container) is applied and, crucially, removed symmetrically here in the store,
// and unlock strips it from EVERY element that carries it, so nothing can be
// left frozen.
const LOCK_CLASS = 'vts-scroll-locked';
const LOCK_CSS =
  `.${LOCK_CLASS}{overflow:hidden!important;overscroll-behavior:none!important;touch-action:none!important;}`;

function ensureStyleEl() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('vts-scroll-lock-style')) return;
  const el = document.createElement('style');
  el.id = 'vts-scroll-lock-style';
  el.textContent = LOCK_CSS;
  document.head.appendChild(el);
}

// The portal's scroll container — its <main>, tagged in Portal.tsx.
function scrollRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('[data-vts-scroll-root]');
}

function applyLock() {
  if (typeof document === 'undefined') return;
  ensureStyleEl();
  document.documentElement.classList.add(LOCK_CLASS);
  document.body.classList.add(LOCK_CLASS);
  scrollRoot()?.classList.add(LOCK_CLASS);
}

function removeLock() {
  if (typeof document === 'undefined') return;
  // Strip the class from anything carrying it — resilient even if the root
  // element changed identity between lock and unlock.
  document.querySelectorAll(`.${LOCK_CLASS}`).forEach((el) => el.classList.remove(LOCK_CLASS));
}

let locked = false;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export const scrollLock = {
  toggle() {
    scrollLock.set(!locked);
  },
  set(v: boolean) {
    if (locked === v) return;
    locked = v;
    if (v) applyLock();
    else removeLock();
    emit();
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

// The padlock button dropped into every Master-board tile header. Because the
// lock is a single global store, flipping it from any one window locks — or
// unlocks — every window at once (all the buttons read the same state, so they
// all change together). Phone-only, matching the chart tile lock it was modeled
// on: the page-scroll freeze only matters for finger drags on touch.
export function ScrollLockButton({ style }: { style?: CSSProperties }) {
  const { isPhone } = useResponsive();
  const isLocked = useScrollLock();
  if (!isPhone) return null;
  return (
    <button
      className="no-drag"
      onClick={() => scrollLock.toggle()}
      aria-pressed={isLocked}
      aria-label={isLocked ? 'Unlock page scroll (unlocks every window)' : 'Lock page scroll (locks every window)'}
      title={
        isLocked
          ? 'Scroll lock on — the page won’t scroll by dragging; use the right scrollbar. Tap to unlock every window.'
          : 'Lock page scroll (mobile) — locks every board window'
      }
      style={{ ...lockBtn, ...(isLocked ? lockBtnOn : null), ...style }}
    >
      {isLocked ? '🔒' : '🔓'}
    </button>
  );
}

const lockBtn: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#cfe',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 7px',
  cursor: 'pointer',
  flex: 'none',
};
const lockBtnOn: CSSProperties = { color: '#0c2768', background: GOLD, borderColor: GOLD };

const THUMB_MIN = 48; // keep the thumb comfortably finger-sized

// Rendered once on the chart board. The DOM freeze itself lives in the store
// (above); this component just draws the wide, touch-draggable scrollbar that
// replaces finger scrolling while locked, and guarantees the lock is released
// if it ever unmounts. Renders nothing (beyond a zero-size DOM anchor) while
// unlocked.
export function MobileScrollLockBar() {
  const isLocked = useScrollLock();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [geo, setGeo] = useState({ top: 0, height: 0, thumbTop: 0, thumbH: THUMB_MIN });
  const drag = useRef<{ startY: number; startScroll: number } | null>(null);

  // Safety net: never leave the page frozen if this unmounts (e.g. the trader
  // navigates to another section) while still locked.
  useEffect(() => () => scrollLock.set(false), []);

  // Resolve the scroll container when locking, for the scrollbar geometry.
  useEffect(() => {
    setRoot(isLocked ? scrollRoot() : null);
  }, [isLocked]);

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

  // Dragging the thumb scrolls the container programmatically (native scrolling
  // is frozen while locked, but scrollTop is still settable). Non-passive so the
  // drag itself never triggers a browser gesture.
  useEffect(() => {
    if (!isLocked || !root) return;
    const onMove = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      if (e.cancelable) e.preventDefault();
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

  if (!isLocked || !root) return null;
  return (
    <div style={{ ...track, top: geo.top, height: geo.height }} aria-hidden>
      <div
        onTouchStart={(e) => {
          drag.current = { startY: e.touches[0].clientY, startScroll: root.scrollTop };
        }}
        style={{ ...thumb, top: geo.thumbTop, height: geo.thumbH }}
      />
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
