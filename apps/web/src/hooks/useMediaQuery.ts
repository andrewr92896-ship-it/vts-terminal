import { useEffect, useState } from 'react';

// Shared responsive breakpoints. Everything in the portal styles inline, so
// CSS media queries can't reach those styles — instead we read the viewport
// here and branch the inline style objects. Keeping the thresholds in one
// place means workspaces built later inherit the same phone/tablet behaviour.
export const PHONE_MAX = 480; // vertical phones, ~360–430px
export const TABLET_MAX = 768; // small tablets / large phones landscape

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

// Single source of truth for responsive decisions. `isTablet` is the "narrow"
// trigger (structural stacking); `isPhone` layers on the most compact tweaks.
export function useResponsive(): Responsive {
  const isPhone = useMediaQuery(`(max-width: ${PHONE_MAX}px)`);
  const isTablet = useMediaQuery(`(max-width: ${TABLET_MAX}px)`);
  return { isPhone, isTablet };
}
