// The responsive policy for Live Trades' "Desk right now" book. Kept pure so
// the important page-flow behavior can be checked without a browser test stack.
//
// Wide layouts keep every position mounted inside a bounded scrolling region:
// later panels therefore start after the bounded region, not after every row.
// Narrow layouts avoid putting a second vertical scroller inside the page. They
// show a useful preview and let the trader deliberately expand the full book.

export const NARROW_POSITION_PREVIEW = 3;

export interface DeskPositionsLayout {
  visibleCount: number;
  hiddenCount: number;
  canToggle: boolean;
  collapsed: boolean;
  usesInternalScroll: boolean;
}

export function deskPositionsLayout(
  positionCount: number,
  narrow: boolean,
  expanded: boolean,
): DeskPositionsLayout {
  const count = Math.max(0, Math.floor(positionCount));
  const canToggle = narrow && count > NARROW_POSITION_PREVIEW;
  const collapsed = canToggle && !expanded;
  const visibleCount = collapsed ? NARROW_POSITION_PREVIEW : count;

  return {
    visibleCount,
    hiddenCount: count - visibleCount,
    canToggle,
    collapsed,
    usesInternalScroll: !narrow && count > NARROW_POSITION_PREVIEW,
  };
}
