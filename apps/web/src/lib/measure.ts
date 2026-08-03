import { useLayoutEffect, useState, type RefObject } from 'react';
import { useZoom } from '../theme/zoom';

// Measuring an element's width for a layout decision, correctly inside the
// terminal's CSS `zoom`.
//
// **Read `clientWidth`, never `ResizeObserver.contentRect` or
// `getBoundingClientRect()`** — that is the whole point of this module. The two
// families report different coordinate spaces once `#root` carries a `zoom`:
// `clientWidth` is the element's own LAYOUT size, the same space an inline
// `width: 480px` written back onto a child lands in, while `contentRect` and
// `getBoundingClientRect()` are the PAINTED size. Blink and WebKit do not agree
// about which of those a resize entry carries, so a width measured one way and
// applied the other way comes out a factor of the zoom off.
//
// That is not theoretical: it is what broke the Live Wall on iPhone. The board
// (react-grid-layout's `WidthProvider`) sized its tiles from `contentRect`, so
// on iOS every tile was laid out wider than the board, the page gained a
// sideways scroll, and the two tiles that hard-measure their own box — the
// TradingView chart and watchlist iframes — rendered their contents at the wrong
// size, leaving the widget shifted with a band of the iframe's own white
// background beside it. Chromium reports the other space, which is why the zoom
// feature verified clean on the desktop and shipped broken on the phone.
//
// The observer is only a TRIGGER here; the value always comes from the element.
// The zoom factor is a dependency because changing it does not reliably fire a
// resize entry when the reported space is the one that did not change.
export function useContentWidth(
  ref: RefObject<HTMLElement | null>,
  fallback: number,
): number {
  const zoom = useZoom();
  const [width, setWidth] = useState(fallback);

  // Layout effect, so the first paint is already at the measured width rather
  // than at the fallback.
  useLayoutEffect(() => {
    let ro: ResizeObserver | null = null;
    let raf = 0;
    let cancelled = false;

    const measure = (el: HTMLElement) => {
      // clientWidth is the padding box; take the padding off so this is the
      // content width, i.e. a drop-in for the contentRect.width it replaces.
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const w = Math.max(0, el.clientWidth - pad);
      if (w > 0) setWidth(w);
    };

    // Wait for the element to exist before measuring it.
    //
    // A RefObject cannot tell the hook when it becomes non-null, and the effect
    // only runs once — so a caller that renders its measured element behind a
    // condition (`if (loading) return …`, an empty-state branch, a lazily
    // resolved chunk) got measured never, and silently kept the fallback width
    // for the life of the screen. That is invisible on a desktop, where the
    // fallback is roughly right, and catastrophic on a phone, where it laid a
    // 1120px grid out inside a 390px viewport.
    //
    // Polling a frame at a time is the cheap fix that keeps the RefObject API
    // every call site already uses: it stops the moment the element appears.
    const attach = () => {
      if (cancelled) return;
      const el = ref.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      measure(el);
      ro = new ResizeObserver(() => measure(el));
      ro.observe(el);
    };

    attach();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [ref, zoom]);

  return width;
}
