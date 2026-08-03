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
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // clientWidth is the padding box; take the padding off so this is the
      // content width, i.e. a drop-in for the contentRect.width it replaces.
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const w = Math.max(0, el.clientWidth - pad);
      if (w > 0) setWidth(w);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, zoom]);

  return width;
}
