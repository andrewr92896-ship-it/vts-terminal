import { TABLET_MAX } from '../../hooks/useMediaQuery';
import { NARROW_POSITION_PREVIEW, deskPositionsLayout } from './deskPositionsLayout';

// Offline layout-policy check for the Desk right now panel. The repository has
// no component-test runner, so this pins the responsive states that decide
// whether position count can lengthen the page.

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(66)} ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`,
  );
}

const atWidth = (width: number, count: number, expanded = false) =>
  deskPositionsLayout(count, width <= TABLET_MAX, expanded);

console.log('\n-- empty and short books --');
check('desktop: no positions needs no scroll or toggle', atWidth(1280, 0), {
  visibleCount: 0,
  hiddenCount: 0,
  canToggle: false,
  collapsed: false,
  usesInternalScroll: false,
});
check('mobile: a few positions stay fully visible', atWidth(390, NARROW_POSITION_PREVIEW), {
  visibleCount: 3,
  hiddenCount: 0,
  canToggle: false,
  collapsed: false,
  usesInternalScroll: false,
});
check('desktop: a few positions need no focusable scroll region', atWidth(1280, NARROW_POSITION_PREVIEW), {
  visibleCount: 3,
  hiddenCount: 0,
  canToggle: false,
  collapsed: false,
  usesInternalScroll: false,
});

console.log('\n-- many positions across representative widths --');
for (const width of [1440, 1024, 800]) {
  const layout = atWidth(width, 24);
  check(`${width}px: all rows live in the bounded desktop region`, {
    visibleCount: layout.visibleCount,
    usesInternalScroll: layout.usesInternalScroll,
    canToggle: layout.canToggle,
  }, {
    visibleCount: 24,
    usesInternalScroll: true,
    canToggle: false,
  });
}
for (const width of [TABLET_MAX, 480, 390]) {
  const layout = atWidth(width, 24);
  check(`${width}px: page-flow preview keeps later content nearby`, layout, {
    visibleCount: NARROW_POSITION_PREVIEW,
    hiddenCount: 24 - NARROW_POSITION_PREVIEW,
    canToggle: true,
    collapsed: true,
    usesInternalScroll: false,
  });
}

console.log('\n-- narrow expansion --');
check('mobile: expanding preserves every position without nested scroll', atWidth(390, 24, true), {
  visibleCount: 24,
  hiddenCount: 0,
  canToggle: true,
  collapsed: false,
  usesInternalScroll: false,
});

if (failures) {
  console.error(`\n${failures} Desk right now layout check${failures === 1 ? '' : 's'} failed.\n`);
  process.exit(1);
}

console.log('\nDesk right now responsive layout checks passed.\n');
