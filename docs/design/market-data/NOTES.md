# Market Data — implementation notes

`README.md` in this folder is the design handoff as received. This file records
what was built against it, and every place the implementation deviates from the
spec or leaves something for later. Read it before assuming a difference is a bug.

Implemented in `Beta V 5.77`:

| Piece | Where |
| --- | --- |
| Series catalog + FOMC schedule | `apps/api/src/trading/marketData.ts` |
| Per-user board layout (pinned / hidden / custom) | `apps/api/src/trading/marketDataLayout.ts`, table `market_data_layout` (migration `0078`) |
| Routes | `GET /api/trading/market-data`, `GET|PUT /api/trading/market-data/layout` in `routes/trading.ts` |
| Screen | `apps/web/src/workspaces/trading/MarketData.tsx` |
| ET arithmetic (compose an absolute Eastern instant, sessions, countdown) | `apps/web/src/workspaces/trading/etClock.ts` |
| Nav row + icon | `theme/nav.ts` (`data`, above `news`), `Icon.tsx` (`line-chart`) |

## Deviations from the spec

1. **A sample-data notice was added.** The spec has no such element, but its own
   copy conventions require that "any figure that is not real must be marked as
   sample data" — and every series value/change is a fixture (see below). One
   amber notice under the header says so, rather than marking 75 tiles
   individually. Delete it when the values become real; the payload's
   `sampleValues` flag drives it.
2. **`Data as of …` shows the last successful fetch, not a ticking clock.** The
   prototype ticks that readout every second off `NOW`, which makes the label
   state something untrue. Visual treatment is unchanged (same position, 11px
   mono, `#5E7098`); only the value differs. The 1s tick still drives the Fed
   countdown and the session rows, which do need it.
3. **75 series, not 78.** The spec says "~78" and its count example reads
   "75 of 78", but the prototype's `LIB` holds 75 and its own view-switcher
   example reads "Data board 75". Every count on the screen is computed, so this
   self-corrects if series are added.
4. **Table cards scroll sideways below their minimum instead of clipping.** The
   spec's narrowest board variant needs ~580px and the calendar ~660px; the card
   has `overflow: hidden`, so on a 390px phone the last columns were silently
   cut. Both cards now wrap their grid in an `overflowX: auto` container with a
   `minWidth`. Nothing is ever hidden, and the page itself still never scrolls
   sideways.
5. **The screen supplies its own content padding** (`22px 32px 8px`, `14px` on a
   phone). The spec puts that on the shell's content well, but the real shell's
   scroller has no padding — other Trading screens make their gutter with
   `maxWidth` + auto margins. This one is deliberately full-width, so it pads
   itself.
6. **Privacy reuses the site-wide privacy mode** (`privacy/privacy.tsx`) rather
   than a screen-local toggle, so turning it on here masks money figures
   everywhere, as it does from My Portal ▸ Settings. Behaviour on this screen is
   the spec's: only money-flagged series mask; rates, prices and yields stay.
7. **Column dropping keys off measured content width**, via a `ResizeObserver` on
   the screen root, rather than `window.innerWidth − rail`. Same thresholds
   (1060 / 860), but correct when the sidebar is collapsed.
8. **No shell chrome was reimplemented** — sidebar, top bar and footer strip come
   from the real `Portal.tsx`, as the handoff instructs. The breadcrumb and
   top-bar responsive rules it suggests were left alone; they belong to `TopBar`,
   not this screen.

## What is real and what is not

- **Real:** the economic calendar (the live Forex Factory rows out of
  `trading_calendar`, the same feed Market News reads), session Open/Closed
  computed against the ET clock, the FOMC countdown and meeting dates, and the
  trader's saved board layout.
- **Sample:** every series `value` and `changes` set, the Fed bar's two odds bars,
  and its "held at 4.25–4.50%" sub-line. The portal has no macro-data provider —
  OANDA and Kraken cover live FX/crypto/metals prices, nothing covers CPI,
  payrolls, the Treasury curve or the Fed balance sheet.

## Next

- **Wire a macro provider.** `marketData.ts` is shaped for it: replace `value`,
  `changes`, `asOf` and `source` per series and drop `sampleValues`. If only some
  groups go live, move to a per-series `sample` flag so a partially-real board
  stays honest. FX / metals / crypto / indices could come off the existing broker
  connections before any new vendor is added.
- **Real last/next review inputs on the custom-metric form** (flagged in the
  handoff's own "next" list). Custom metrics currently read "Manual entry · when
  you update it".
- **Decide where the calendar lives.** It is on this screen now, but Market News
  still has its own Calendar feed reading the same table, so the same rows appear
  in two places. The handoff calls moving it "a one-block move"; resolve it with
  the Market News redesign (`docs/design/market-news/`).
- Sparklines per series and per-series alert thresholds were discussed in the
  handoff but are not designed.
