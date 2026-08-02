# Market Data — implementation notes

`README.md` in this folder is the design handoff as received. This file records
what was built against it, and every place the implementation deviates from the
spec or leaves something for later. Read it before assuming a difference is a bug.

Implemented in `Beta V 5.77`:

| Piece | Where |
| --- | --- |
| Series catalog + FOMC schedule | `apps/api/src/trading/marketData.ts` |
| Live prices (OANDA) | `apps/api/src/trading/marketQuotes.ts` |
| Live macro (FRED), added `Beta V 6.10` | `apps/api/src/trading/marketMacro.ts`, `apps/api/src/trading/brokers/fred.ts` |
| Offline check of the macro math | `apps/api/src/trading/verifyMarketMacro.ts` (`npm run verify:market-macro`) |
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

As of `Beta V 6.18`, **51 of the 71 non-session series read live** on the owner's
install (it was 8). The ceiling is 54 — gold, silver and copper need an OANDA
entity that carries metals; see the entity note below and the Stooq note under
"Sample".

> **The OANDA entity decides how much of the price half works, and most entities
> are narrower than the design assumed.** This file used to say "commodities are
> the cheapest next group — `XAU_USD`, `XAG_USD`, `WTICO_USD`, `BCO_USD` and
> copper are all OANDA instruments". They are instruments OANDA *lists*, but not
> ones every account may quote: the owner's is forex-only, so on first deploy all
> six commodities and all three index CFDs came back sample while FX and DXY were
> live. `fetchOandaTradeableInstruments` is what makes that degrade quietly
> (a symbol the account cannot see is skipped rather than 400-ing the whole
> pricing request), which is why the failure looked like "nine rows are still
> sample" and not like an outage. **Do not assume an OANDA symbol is reachable
> because it exists** — the indices and the energy rows are now sourced from FRED
> as well, so they are live regardless, with OANDA preferred where available.

- **Real:** **FX & dollar** and **Crypto** from OANDA (`marketQuotes.ts`);
  **Policy & rates**, **Inflation**, **Labor & growth**, **Yields & curve**,
  **Indices & volatility**, the energy rows of **Commodities** and **Macro &
  liquidity** from FRED (`marketMacro.ts`). Plus the economic calendar (the live
  Forex Factory rows out of `trading_calendar`, the same feed Market News reads),
  session Open/Closed computed against the ET clock, the FOMC countdown and
  meeting dates, and the trader's saved board layout.
- **Sample:** 20 rows. Seventeen are the ones **no free provider covers** rather
  than ones nobody has got to yet —
  `cut9`, `hold7` (CME FedWatch), `dots` (the SEP), `boe`, `boj`, `be1` (FRED has
  no 1-year breakeven), `nowcast`, `gdpq2` (a forecast), `ismm`, `isms` (ISM is
  licensed and was pulled from FRED), `btcetf`, `funding`, `dom`, `move` (ICE
  BofA), `eps` (FactSet), `recprob`, `citi`. The other three are **`gold`,
  `silver` and `copper`**, which need an OANDA entity that carries metals. They
  go live by themselves the moment such a connection exists. Also still sample:
  the Fed bar's two odds bars.
- **Stooq was tried for the metals and does not work from a server — do not try
  it again without new evidence.** `stooq.com/q/l/` and `/q/d/l/` serve keyless
  CSV and look like the obvious answer. Shipped in `Beta V 6.16`, gold came back
  sample in production. Retried in `6.17` with browser-ish headers and a
  fallback to the daily-history path — the fix that worked for the YouTube
  reads — and it was still sample. The parsers were correct against recorded CSV
  the whole time (they were covered offline), so the request itself never
  received a CSV. The code was removed in `6.18` rather than left dead. Two
  production round-trips is enough: the next attempt at metals should be a
  metals-carrying OANDA entity or a paid feed, not a third guess at a free one.
- **The `review` column is real WITH a FRED key, catalog data without one.**
  Observations cannot answer it — a FRED observation is dated for the period it
  *measures*, so June CPI is dated `2026-06-01` and released in July. The keyed
  `series/release` + `release/dates` endpoints do answer it, and there is no
  keyless equivalent, so this is the one feature that genuinely differs between a
  keyed and a keyless install. Without a key the column keeps the catalog's
  hand-entered dates, and a date that has already passed renders as `tbc` rather
  than a date that has demonstrably gone.
  - `include_release_dates_with_no_data=true` is what makes **future** dates
    appear; without it the response stops at the last release that carried data,
    which is the half we already had.
  - **Release ids are cached for the life of the process** (they do not change)
    and the calendar for 12 hours. One calendar serves every series on that
    release, so ~45 series collapse into a handful of reads.
  - A release happening **today counts as the last one, not the next** — the
    figure is out, and calling today the "next review" recreates the past-date
    problem the column just escaped.
  - **Four rows carry a third-party licence.** `us500`, `us100`, `us30` and
    `vix` come through FRED from S&P Dow Jones Indices, Nasdaq OMX and Cboe,
    who license their index values — unlike the government series around them,
    which are public domain. Fine for a private install; a **paid public**
    launch needs this checked (see the launch-blocker list in `CLAUDE.md`). It
    is also why FRED's release calendar has no forward dates for them, so those
    rows keep `daily · close` rather than real review dates.
  - **The gold "due soon" highlight only fires on a monthly or quarterly
    print.** A daily series is always due tomorrow and a weekly one always
    within the week, so once the dates became real every yield, TIPS and VIX row
    lit up permanently and drowned out the payrolls and CPI releases the
    highlight exists to flag. `reviewInfo` requires the gap between releases to
    exceed a week before it will highlight.
  - **The FOMC rows are never overwritten.** `next: 'fomc'` resolves off the live
    meeting list, which describes a rate decided at a meeting better than
    whichever statistical release happens to carry the series.

## The live price path (`apps/api/src/trading/marketQuotes.ts`)

FX, the dollar index, crypto, the commodities and the three US index CFDs are
quoted from OANDA at request time and overlaid onto the catalog by
`applyLiveQuotes`. Points worth knowing before changing it:

- **OANDA does not quote the exchange contract for most of these**, so the rows
  that would otherwise claim the wrong publisher restate it: metals are OTC spot
  rather than an LBMA fixing or a COMEX future (`OANDA · spot`), and energy,
  copper and the indices are CFDs tracking a future (`OANDA · CFD`). Same rule as
  DXY below — the number is the right one to trade off, the row simply must not
  say NYMEX or Cboe published it.
- **A wrong symbol degrades to sample, not to an outage.** Every symbol is
  checked against the account's `/instruments` list first, so an instrument this
  OANDA entity does not carry is skipped and its row keeps the catalog figures.

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
- **Crypto availability varies by OANDA entity, and most entities carry none**,
  so the fallback below is the normal path for BTC and ETH rather than an edge
  case. The account's `/instruments` list is checked first, so a symbol the
  entity does not carry is skipped instead of failing the whole pricing request.
  Spot then comes from the terminal's existing keyless coin feed (Coinbase, Kraken
  behind it) and the **daily closes from Kraken's public OHLC**
  (`interval=1440`, ~720 candles), so these rows get the same five real change
  columns as everything else. Two traps in that response, both covered by
  `parseKrakenOhlc`: `result` carries a **`last` cursor beside the candle
  array**, so the array is found by shape rather than key order; and the final
  candle is **still forming**, so it is dropped — counting it would make
  "yesterday's close" mean "the price a moment ago".
- **Caching is stale-while-revalidate**, 60s for spot and 30min for candles, with
  a snapshot that is never replaced by an empty result. A transient OANDA failure
  leaves the last good figures on screen rather than blanking the board.

## The live macro path (`apps/api/src/trading/marketMacro.ts` + `brokers/fred.ts`)

The other half of the board — policy rates, inflation, the labor prints, the
Treasury curve, the VIX, the balance sheet — comes from FRED and overlays the
catalog through the same `applyLiveQuotes` seam. Points worth knowing:

- **It works with no API key, and that is deliberate.** FRED's documented JSON
  API needs a free key; the CSV behind the download button on every FRED chart
  (`fredgraph.csv?id=…`) needs nothing. `fetchFredSeries` prefers the API when
  `FRED_API_KEY` is set and falls back to the CSV when it is not, so the board
  reads live on a fresh install with no signup — the same shape as the Market
  News wall, which watches keylessly and spends a key only on the extras. A key
  that is set but **rejected** also falls through to the keyless read, so a
  typo'd key degrades to the no-key behaviour rather than blanking the board.
- **The published number is rarely the number on the board.** FRED serves CPI as
  an index level and payrolls as a running job total; the board wants a y/y rate
  and a monthly print. Each row declares a `transform` (`level` / `yoy` / `mom` /
  `delta` / `delta3` / `qoqSaar` / `ytdIndex`) that derives the displayed series,
  and value *and* all five change columns read that derived series.
- **The change columns subtract; they do not percent.** A yield going 4.05 → 4.02
  is `−0.03` here, not `−0.74%`. That is what the catalog's fixtures show and
  what a desk means by the move in a rate. (The price side is the opposite —
  percent moves — which is why the two files do not share the change math.)
- **A period shorter than the publication cadence reads a flat zero.** CPI prints
  monthly, so a date look-back from its 1-day column lands on the *previous
  month's* reading and would print that monthly move as a one-day move. Every row
  declares a `cadence` and the gate is applied per period. Zero is right and
  blank is wrong here: the figure genuinely has not moved over that window.
- **Look-backs anchor on the latest reading, not on the wall clock.** A June CPI
  print released in July is still the current reading in August, and its 1-month
  change means against May. Anchoring on `now` would compare June against June
  and report a flat month. Year-to-date is the exception and anchors on the
  calendar — the last reading before this year began.
- **Two units on one row.** The balance sheet reads `6.42` T but moves in
  billions a week, so `changeScale` / `changeSuffix` let the change column use a
  coarser unit than the value. Same mechanism scales a curve spread from percent
  into basis points and jobless claims from persons into thousands.
- **`asOf` names the period, never "live".** `Jun`, `wk to Jul 25`, `Q2`,
  `Jul 31` — so a monthly figure is never read as today's.
- **A price row read off FRED still reads as a price.** The indices and the
  energy rows can be filled by either provider, so they set
  `changeMode: 'pct'` — percent columns with the extra 1-day decimal, exactly as
  `marketQuotes.ts` renders them. A `+18` in the S&P's 1-day column would match
  nothing else on the board. Everything else here stays on differences.
- **A sample row must never claim to be live.** Five of them carried
  `asOf: 'live'` and two asserted a market superlative ("record high") while
  showing the grey Sample dot — the row contradicting its own freshness marker.
  Placeholder rows now read `sample`. Check this whenever a row is added or a
  provider is wired.
- **The VIX changes in percent, not points**, like the three index rows beside
  it in its group and like its own catalog fixture. It rendered `−3.57` next to
  the S&P's `+0.70%` in the same table until `changeMode: 'pct'` was set.
- **"This year" is the Eastern year**, on the macro side as well as the price
  side. Between 7pm and midnight ET on 31 December the UTC year has already
  turned, so a UTC boundary would have the macro rows jump into the new year
  while the price rows beside them were still in the old one.
- **A spread is derived from the two legs the board already shows**
  (`fredMinus`), not read from FRED's ready-made `T10Y2Y` / `T10Y3M`. FRED
  refreshes those on their own clock, so the spread row could reach a day the
  yield rows had not and print `+47` where the two rows beside it implied `+45`.
  The inner join on date pins the spread to the last day *both* legs published,
  so the three rows reconcile by construction — at no cost in accuracy, since
  FRED defines those series as exactly this subtraction.
- **Rows on the Fed's schedule resolve their dates from it.** `review.last`
  takes the sentinel `'fomc-prev'` (alongside the existing `next: 'fomc'`), so
  the Fed funds and primary-credit rows read the live meeting list rather than a
  literal that goes stale — they were claiming a June review while the Fed bar
  above them correctly said July. The **dot plot keeps its literal**: it is
  published quarterly with the SEP, not at every meeting, so the live
  previous-meeting date would be wrong for it.
- **Where the two providers overlap, OANDA wins** (`getMarketData` merges macro
  first, then prices). FRED's published close makes those rows live for every
  install; OANDA's real-time quote is better when the account can see it.
- **A live row may restate its review cycle as well as its publisher.**
  `LiveQuote.reviewLast` exists because the catalog gives every price group
  `"continuous"` — true of an exchange tape, false of a published daily close.
  Without it the S&P and VIX rows read "close" on one side and "continuous" on
  the other. Restate the cycle whenever a source publishes on a different rhythm
  than the catalog assumed.
- Cached 30 min, stale-while-revalidate, never replaced by an empty result, and
  fetched with a concurrency cap of 6 so a refresh is a trickle rather than 40
  simultaneous requests at a public endpoint.
- **A cold read is seconds, so it is budgeted.** ~40 reads six-at-a-time cannot
  be allowed to hang `GET /api/trading/market-data`, so the first caller waits at
  most `COLD_READ_BUDGET_MS` (5s) and otherwise gets a catalog board — every
  macro row honestly flagged Sample — while the refresh finishes into the
  snapshot for the next poll. `warmMarketMacro()` runs at boot in **production
  only** so nobody normally pays it; dev is excluded because `tsx watch` restarts
  on every save and would fire forty requests each time.

**`npm run verify:market-macro`** checks all of the above offline, against
fixtures whose answers are known by hand. It reads no network and no database.
Every one of those behaviours is invisible until it is wrong in production, so
run it after touching a transform, a scale or the cadence gate.

## Next

- **A real release schedule for the `review` column.** It is the one part of a
  live macro row still carrying catalog data (see above). FRED can answer it —
  `fred/series/release` then `fred/release/dates` — but only through the keyed
  API, so wiring it would make the column work on a keyed install and not on a
  keyless one. Decide whether that asymmetry is acceptable before building it.
- **The 17 sample rows all need a paid or licensed vendor**, so none of them is
  a small job: CME FedWatch for meeting odds, ISM for the surveys, ICE BofA for
  MOVE, FactSet for EPS, Citi for the surprise index. `applyLiveQuotes` remains
  the seam — hand it more entries and the `sample` flags fall on their own.
- **BoE and BoJ policy rates** were left out for a smaller reason: the FRED
  series ids for them could not be confirmed, and a wrong id is worse than an
  honest Sample dot. Confirm the ids and they are two rows in `MACRO`.
- **Real last/next review inputs on the custom-metric form** (flagged in the
  handoff's own "next" list). Custom metrics currently read "Manual entry · when
  you update it".
- **Decide where the calendar lives.** It is on this screen now, but Market News
  still has its own Calendar feed reading the same table, so the same rows appear
  in two places. The handoff calls moving it "a one-block move"; resolve it with
  the Market News redesign (`docs/design/market-news/`).
- Sparklines per series and per-series alert thresholds were discussed in the
  handoff but are not designed.
