# Public terminal portal-derived v1

This branch deliberately implements a narrow first vertical slice: the real
React portal shell, Live Wall market composition, Market Data board, and public
email/two-step entry. It does not attempt to fill the remaining accepted pages
with placeholders.

## Exact derivation

The public build consumes the portal's real source at source SHA
`4cca8b189f867800aa9b62938b18664a63860e7f`:

- `apps/web/src/styles/global.css` for the self-hosted type, Meridian CSS tokens,
  zoom variables, form behavior, scrollbars, and animations.
- `apps/web/src/theme/tokens.ts` and `themes.ts` for inline-style parity and
  workspace accents.
- `apps/web/src/components/Icon.tsx` and `Clock.tsx` for the actual glyph and
  Eastern-time clock implementations.
- `apps/web/src/workspaces/trading/MarketData.tsx`, `etClock.ts`,
  `ScreenTitle.tsx`, and `lib/measure.ts` for the actual dense market board,
  countdown/calendar behavior, and responsive content-width measurement.
- `WatchlistTile.tsx`, `CalendarTile.tsx`, `NewsTile.tsx`, and `TvWidget.tsx`
  for the actual Live Wall tile implementations. `PublicClockTile.tsx` is the
  public-safe adaptation of the clock section from `tiles/MarketTiles.tsx`.
- `PublicSidebar.tsx` and `PublicTopBar.tsx` are line-by-line public adaptations
  of the real `Sidebar.tsx` and `TopBar.tsx` geometry/styles. Private auth,
  membership, role preview, employee, privileged notification, and chat
  dependencies are removed rather than hidden.

The brand wordmark reuses the exact existing brand blob. No reference
screenshots are copied into this repository or build.

## Allowlist and data boundary

`publicNav.ts` is a compile-time, two-tier public route allowlist. V1 exposes
only `login`, `two-factor`, `live`, and `data`; omitted routes are absent from
the public import graph.

`vite.public.config.ts` replaces the real component seams for the flat API
client, auth context, entitlement helper, privacy state, and remote chart widget
with public-only adapters. The public build has source maps disabled. The CI
import verifier checks those seams, rejects prohibited source references, and
scans the built bundle for privileged routes, credentials, session names, and
execution vocabulary.

The `?evidence=1` adapter is fictional, non-sensitive, in-memory state used only
for CI rendering. It issues no network requests and creates no cookies. The
normal entry uses only `/public/v1/...` auth and market endpoints; persistence
and delivery require that separate public service/database/secrets deployment
in a later isolated batch.

## Extension points

Later batches add an accepted page only by:

1. adapting or reusing its actual portal React component;
2. adding a public-only data adapter backed by the separate public service;
3. adding the route to `publicNav.ts`;
4. extending the source allowlist, bundle denylist, focused tests, and evidence
   capture.

Closed/manual/deleted trades, News, Studies, Site Help, Finances, Investments,
preferences/settings, and plan/rules pages remain intentionally unimplemented
here rather than represented by generic shells.
