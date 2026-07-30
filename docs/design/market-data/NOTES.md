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

1. **A sample-data notice and a fourth freshness state were added.** The spec has
   neither, but its own copy conventions require that "any figure that is not real
   must be marked as sample data". Now that the board is *partly* live, marking it
   has two parts: an amber notice under the header that names which groups read
   live and counts the rest, and a **Sample** dot in the freshness legend so every
   placeholder row is identifiable on its own. Both are driven by the per-series
   `sample` flag, so they shrink by themselves as more groups go live and vanish
   when none are left.
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

- **Real:** the **FX & dollar** and **Crypto** groups (see below), the economic
  calendar (the live Forex Factory rows out of `trading_calendar`, the same feed
  Market News reads), session Open/Closed computed against the ET clock, the FOMC
  countdown and meeting dates, and the trader's saved board layout.
- **Sample:** every other series' `value` and `changes`, the Fed bar's two odds
  bars, and its "held at 4.25–4.50%" sub-line. Nothing available to the portal
  covers CPI, payrolls, the Treasury curve or the Fed balance sheet.

## The live price path (`apps/api/src/trading/marketQuotes.ts`)

FX, the dollar index and crypto are quoted from OANDA at request time and overlaid
onto the catalog by `applyLiveQuotes`. Points worth knowing before changing it:

- **Changes come from daily candles, not spot.** A spot price gives no change
  columns and the five of them are the board's point, so each symbol gets one
  `/v3/instruments/{sym}/candles?granularity=D&count=400` read (~19 months of
  completed daily closes, enough for year-to-date).
- **Look-backs match on the candle's CLOSE, not its start.** OANDA reports a
  candle's `time` as its start and a daily candle closes 24h later, so
  `closeAtOrBefore` compares `timeMs + 24h`. Matching the start reads the close of
  the candle that was still forming at the look-back instant — a value from up to a
  day in that point's future, which skews every period by a session. This was a
  real bug caught in testing; don't reintroduce it.
- **1D is measured against the most recent completed daily close**, which is what
  a desk means by "today's move". Year-to-date uses the last close before the
  **Eastern-Time** year began.
- **DXY is computed, not quoted.** It is not an OANDA instrument, so it is derived
  from the six ICE components and weights (`DXY_LEGS`), with a synthetic close
  series built by evaluating the index on every day all six legs closed. A missing
  leg invalidates the index rather than producing a wrong number, and the row's
  "Reviewed by" is restated to `Computed · ICE weights` so it never claims ICE
  published the figure on screen.
- **Crypto availability varies by OANDA entity.** The account's `/instruments`
  list is checked first, so a symbol the entity does not carry is skipped instead
  of failing the whole pricing request. Where OANDA has no crypto, spot falls back
  to the portal's existing keyless coin feed and the change columns stay sample —
  that feed has no history behind it.
- **Caching is stale-while-revalidate**, 60s for spot and 30min for candles, with
  a snapshot that is never replaced by an empty result. A transient OANDA failure
  leaves the last good figures on screen rather than blanking the board.

## Next

- **Wire a macro provider** for the remaining groups. `applyLiveQuotes` is the
  seam: hand it more entries and the `sample` flags fall on their own.
- **Commodities are the cheapest next group** — `XAU_USD`, `XAG_USD`, `WTICO_USD`,
  `BCO_USD` and copper are all OANDA instruments, so adding them is five rows in
  `QUOTES` with no new vendor. Indices (`NAS100_USD`, `SPX500_USD`, `US30_USD`) are
  the same, though OANDA quotes the CFD rather than the index itself.
- **Real last/next review inputs on the custom-metric form** (flagged in the
  handoff's own "next" list). Custom metrics currently read "Manual entry · when
  you update it".
- **Decide where the calendar lives.** It is on this screen now, but Market News
  still has its own Calendar feed reading the same table, so the same rows appear
  in two places. The handoff calls moving it "a one-block move"; resolve it with
  the Market News redesign (`docs/design/market-news/`).
- Sparklines per series and per-series alert thresholds were discussed in the
  handoff but are not designed.
