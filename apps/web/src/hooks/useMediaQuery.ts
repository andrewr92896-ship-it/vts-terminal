import { useEffect, useState } from 'react';

// Shared responsive breakpoints. Everything in the portal styles inline, so
// CSS media queries can't reach those styles — instead we read the viewport
// here and branch the inline style objects. Keeping the thresholds in one
// place means workspaces built later inherit the same phone/tablet behaviour.
export const PHONE_MAX = 480; // vertical phones, ~360–430px
export const TABLET_MAX = 768; // small tablets / large phones landscape

// General-purpose media-query hook, kept for ad-hoc queries.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export interface Responsive {
  isPhone: boolean; // <= 480px — most compact layout
  isTablet: boolean; // <= 768px — narrow layout (also true on phones)
}

// Read the live CSS layout-viewport width. `clientWidth` matches the width
// media queries resolve against (it excludes any scrollbar and is unaffected
// by horizontal overflow), with `innerWidth` as a fallback. Defaults to a
// desktop width only when there is no DOM (never the case in the browser).
function viewportWidth(): number {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 1024;
  return document.documentElement?.clientWidth || window.innerWidth || 1024;
}

// Single source of truth for responsive decisions. `isTablet` is the "narrow"
// trigger (structural stacking); `isPhone` layers on the most compact tweaks.
// Driven by the live viewport width so the very first render is already
// correct on a phone (never defaults to desktop) and it follows resize and
// orientation changes.
export function useResponsive(): Responsive {
  const [width, setWidth] = useState<number>(viewportWidth);

  useEffect(() => {
    const update = () => setWidth(viewportWidth());
    update(); // reconcile any width change between first render and mount
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return { isPhone: width <= PHONE_MAX, isTablet: width <= TABLET_MAX };
}
