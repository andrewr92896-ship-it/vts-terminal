# Handoff: Market Data (Advanced Trading → Market Data)

## Overview

A new section in the VTS Portal: **Advanced Trading ▸ Market Data**. It is the desk's
single screen for every rate, print and price the trader watches — a customizable
board of ~78 data series, the next Federal Reserve decision, and the Forex Factory
economic release calendar.

It replaces the data half of the old **Market News** screen
(`apps/web/src/workspaces/trading/MarketNews.tsx`). Market News keeps the headlines
and will be handled separately; the AI "how it could affect us" note and the AI
overview brief are **deliberately removed** — the product should not carry
recommendation-flavoured copy. Everything on this screen is factual data with an
"informational only — not investment advice" line in the content footer.

Three things the user explicitly asked for, so treat them as requirements:

1. **Every rate is visible** — fed funds, YTD inflation, 1-year inflation, the next
   Fed meeting, plus everything else relevant to trading.
2. **Fully customizable** — the trader chooses which metrics are pinned, in what
   order, can remove any of them, and can add their own.
3. Each series shows **who reviews/publishes it, when it was last reviewed, and when
   it is next reviewed** (e.g. FOMC · Jun 17 → Sep 16).
4. Change is shown over **five periods: 1D, 1W, 1M, YTD, 1Y**.

## About the Design Files

`Market Data.dc.html` in this bundle is a **design reference created in HTML** — a
working prototype showing intended look and behaviour. It is **not production code to
copy**. The task is to **recreate this design inside `apps/web`** (Vite + React 18 +
TypeScript) using that codebase's established patterns: inline React styles, the `C`
palette from `apps/web/src/theme/tokens.ts`, the `Icon.tsx` Lucide glyphs, the
existing `Sidebar.tsx` / `TopBar.tsx` / `Portal.tsx` shell, and the Fastify + SQLite
API in `apps/api` for real data.

Open the HTML with a static server from this folder (it loads `support.js` and
`assets/`) — e.g. `npx serve .` — then open `Market Data.dc.html`.

Two things in the prototype that exist only because it is a standalone file:

- The **shell is re-drawn inside the prototype** (sidebar, top bar, footer strip). In
  the app the screen renders *inside* the real shell — implement only the content
  column and register the section in nav. The shell is included so the design can be
  judged in context and so the sidebar row for the new section is unambiguous.
- **All numbers are sample data**, hard-coded in the logic class. Real values come
  from the API. Per the project's copy conventions, any figure that is not real must
  be marked as sample data.

## Fidelity

**High fidelity.** Colours, type sizes, paddings, radii and interaction states are
final and taken from `docs/design/portal-shell.md` (copied here as
`reference/portal-shell.md`). Recreate pixel-perfectly. Where this document and the
shell doc disagree, the shell doc wins.

---

## Screens / Views

One screen, three stacked regions plus a two-view switcher.

```
┌─────────────┬────────────────────────────────────────────────────────────┐
│ sidebar     │ top bar · 64px  (breadcrumb › Market Data)                 │
│ 248px       ├────────────────────────────────────────────────────────────┤
│ (72px       │ screen header: title + subtitle + actions                  │
│ collapsed)  │ Fed decision bar                                           │
│             │ PINNED DATA — tile grid                                    │
│             │ view switcher: [Data board] [Economic calendar]            │
│             │ ▸ Data board: search + group filter, then grouped tables    │
│             │ ▸ Economic calendar: grouped by day, actual/fcst/prev       │
│             │ "informational only" line                                  │
│             ├────────────────────────────────────────────────────────────┤
│             │ footer strip                                               │
└─────────────┴────────────────────────────────────────────────────────────┘
```

Shell geometry: `grid-template-columns: 248px 1fr`, `height: 100vh`,
`overflow: hidden`; the content column is the only scroller. Content padding
`22px 32px 8px`; footer strip `16px 32px` with `border-top: 1px solid #152139`.

### 1. Sidebar (existing component — one change)

Add a section row **Market Data** to the Advanced Trading section list,
**immediately above Market News**:

| | |
|---|---|
| Label | `Market Data` |
| Icon | Lucide `line-chart` — paths `M3 3v16a2 2 0 0 0 2 2h16` and `m19 9-5 5-4-4-3 3`, 16px, stroke 1.75, round caps |
| Active state | `background: linear-gradient(180deg, rgba(235,203,116,.16), rgba(235,203,116,.08))`, label and icon `#EBCB74`, weight 600 |
| Group label above | `ADVANCED TRADING` |

Resting row: text `#93A5C9`, icon `#5E7098`, transparent background, `9px 10px`
padding, `8px` radius, `11px` gap, 13.5px/500. Hover: text `#E9EFFB`, background
`rgba(255,255,255,.03)`.

The founder can reorder sections in Developer Portal ▸ Sidebar Layout, so register
the row through the same nav config as the others (`apps/web/src/theme/nav.ts`), not
as a hard-coded position.

### 2. Top bar (existing component — no change)

Breadcrumb reads `Vitalis Trading Team › Advanced Trading › **Market Data**`. The
prototype adds two responsive rules that are worth keeping if the real bar does not
have them: below ~820px of content width the leading crumbs drop and only the bold
section survives; below ~700px the search chip is hidden.

### 3. Screen header

- `h2` "Market Data" — 19px/700, `#fff`, margin 0.
- Subtitle — 12.5px `#93A5C9`, `margin: 6px 0 0`, max-width 720px, `text-wrap: pretty`:
  "Every rate, print and price the desk watches — pinned where you want them,
  searchable, and on the Forex Factory release schedule. All times Eastern."
- Right cluster (`margin-left: auto`, gap 8px, wraps):
  - `Data as of 5:49:14 PM ET` — 11px IBM Plex Mono `#5E7098`, ticks every second.
  - **Refresh** — ghost button.
  - **Privacy** — ghost button; when on, label becomes `Privacy on` and text +
    border go `#E5A43B`.
  - **Customize board** — ghost button; when on, label becomes `Done`, background
    `linear-gradient(180deg, rgba(235,203,116,.16), rgba(235,203,116,.08))`, text
    `#EBCB74`, border `rgba(235,203,116,.4)`.
  - No gold button on this screen — **Ask VTS AI** in the top bar is the one gold
    action per view.

Ghost button spec: 11.5px/600 `#DFE7FA`, background `rgba(255,255,255,.05)`,
`1px solid #1E2E52`, radius 7px, padding `8px 12px`, `white-space: nowrap`,
hover border `#24365F`.

### 4. Fed decision bar

Panel: background `#0C1930`, `1px solid rgba(235,203,116,.35)`, radius 10px, padding
`14px 16px`, `display: flex; align-items: flex-start; gap: 26px; flex-wrap: wrap`,
`margin-top: 16px`.

Contents, left to right:

1. **Next Federal Reserve decision** (flex `1 1 270px`, min-width 240px)
   - Eyebrow: 10px/700, letter-spacing .8px, uppercase, `#EBCB74`.
   - Line 1: `Wed, Sep 16 · 2:00 PM ET` — 19px/600 IBM Plex Mono `#fff`,
     letter-spacing −0.4px. Reads `Today · 2:00 PM ET` when the meeting is today.
   - Line 2: 11px `#93A5C9` — `Statement 2:00 PM · Powell press conference 2:30 PM · Sep 16, 2026`.
2. **Until statement** — 10px/700 uppercase `#5E7098` label; value 25px/600 mono
   `#EBCB74`. `HH:MM:SS` when under 24h, `48d 20h` beyond. Label flips to
   **Until press conference** between the statement and the presser.
3. **Last reviewed** — same label style; value 25px/600 mono `#E9EFFB` (previous
   meeting date, e.g. `Jul 29`); sub-line 10px `#5E7098` — `held at 4.25–4.50%`.
4. **Target range** — value `4.25–4.50` 25px/600 mono `#E9EFFB` with an 11px
   `#5E7098` `%` suffix.
5. **Two odds bars** (grid `repeat(auto-fit, minmax(172px, 1fr))`, gap 18px, flex
   `1 1 360px`): label = meeting date (`SEP 16`, `OCT 28`) 10px/700 uppercase
   `#5E7098`; readout `cut 78% · hold 22%` 10.5px mono `#93A5C9`; a 5px-tall bar,
   radius 3px, track `rgba(255,255,255,.05)`, cut segment `#2FC77E`, hold segment
   `#24365F`, widths = the percentages; note beneath 10.5px `#5E7098`.

**Meeting schedule must be real, not arithmetic.** The prototype holds the 2026 FOMC
dates as `MM-DD` (`01-28, 03-18, 04-29, 06-17, 07-29, 09-16, 10-28, 12-09`), composes
each onto 2:00 PM Eastern, and picks the first one whose statement is less than an
hour past. In the app, source these from the API/config so they stay correct, and keep
the "compose an absolute Eastern wall-clock time" approach — never `now + offset`.

### 5. Pinned data strip

Header row: `display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 14px;
align-items: center; margin: 18px 0 9px`.

- Left: `PINNED DATA` 10.5px/600 uppercase letter-spacing 1.4px `#5E7098`; count in
  11px mono `#5E7098`; hint 10.5px `#5E7098` — "Always visible, on every view." and,
  in edit mode, "Drag to reorder · ★ unpin · × remove".
- Right: freshness legend — three 6px dots with 10px/700 uppercase labels:
  `LIVE FEED` `#2FC77E`, `MANUAL` `#E5A43B`, `STALE` `#5E7098`. In edit mode, a
  ghost **+ Custom metric** button.

Tile grid: `repeat(auto-fill, minmax(224px, 1fr))`, gap 12px. **224px is a hard
minimum** — the five change values need ~34px each and the grid must not squeeze them
(200px clips `+34.2%`).

Tile: background `#0A1426`, `1px solid #152139`, radius 12px, padding `14px 15px`,
hover border `#24365F`, `position: relative`.

1. **Label row** — 6px freshness dot (`margin-top: 3px`) + label 10px/700 uppercase
   letter-spacing .8px `#5E7098`, `line-height: 10px`, fixed `height: 24px`
   (two lines, clipped) so every tile aligns. In edit mode the row gets
   `padding-right: 54px` to clear the controls.
2. **Figure** — 25px/600 IBM Plex Mono, letter-spacing −0.5px, `margin-top: 6px`,
   colour `#E9EFFB` (sessions use `#2FC77E` when open), single line with ellipsis;
   unit suffix 11px/400 `#5E7098` with `margin-left: 3px`.
3. **Context line** — 10.5px `#5E7098`, one line, ellipsis (e.g. "record high",
   "Jun · rel Jul 14", "held since Dec 2025").
4. **Change micro-grid** — `repeat(5, minmax(0,1fr))`, gap 2px, `margin-top: 9px`.
   Each cell: period label 8px/700 letter-spacing .5px `#3A4A6C`, value beneath
   9.5px/600 mono, `margin-top: 2px`, ellipsis.
5. **Review footer** — `margin-top: 9px; padding-top: 8px; border-top: 1px solid
   #152139`, flex with baseline alignment: body 10px `#93A5C9` (ellipsis) on the
   left, cycle 10px mono on the right (`margin-left: auto`), `#5E7098` normally and
   `#EBCB74` when the next review is within 7 days.
6. **Edit controls** (edit mode only) — absolute `top: 8px; right: 9px`, gap 4px:
   drag handle `⠿` 11px `#5E7098` `cursor: grab`; `★` 11px `#EBCB74` (unpin); `×`
   14px `#5E7098` (remove). Transparent backgrounds, no borders.

### 6. View switcher

Row with `border-bottom: 1px solid #152139`, `margin: 22px 0 14px`,
`padding-bottom: 10px`, `justify-content: space-between`.

Pills (gap 6px): 12.5px, padding `7px 13px`, radius 8px. Inactive: background
`rgba(255,255,255,.02)`, border `#1E2E52`, text `#93A5C9`, weight 500. Active:
background `linear-gradient(180deg, rgba(235,203,116,.16), rgba(235,203,116,.08))`,
border `rgba(235,203,116,.35)`, text `#EBCB74`, weight 600. Each carries a count in
11px mono (`Data board 75`, `Economic calendar 16`).

Right side: contextual hint, 11px `#5E7098`, right-aligned, max-width 440px —
board: "Search every series, ★ pins it to the strip, × removes it." · calendar:
"Actual against forecast, Eastern Time, past releases dimmed below."

### 7. Data board view

**Toolbar** (`align-items: flex-end`, gap 10px, wraps): a **Find data** text input
(232px) placeholder "rate, CPI, yield, gold…", a **Group** select (min 172px, "All
groups" + the ten groups), a ghost **Clear** button when either is active, and a
right-aligned count `75 of 78 series · 15 pinned` (10.5px `#5E7098`).

Field label: 10px/700 uppercase letter-spacing .8px `#5E7098`, `margin-bottom: 6px`.
Input/select: background `rgba(255,255,255,.03)`, `1px solid #1E2E52`, radius 7px,
12.5px, padding `9px 11px`, colour `#E9EFFB`, no outline.

**One card per group** (only groups with matches render), gap 14px. Card: `#0A1426`,
`1px solid #152139`, radius 12px, `overflow: hidden`.

Card header — same grid as the rows, `padding: 11px 16px`, background `#0C1930`,
`border-bottom: 1px solid #152139`:
group label (10.5px/600 uppercase, ls 1.4px, `#5E7098`) + count, then column labels
in `#3A4A6C`: `VALUE` (10px/700 uppercase, right), the five period labels
(9.5px/700 mono, ls .4px, right), `REVIEWED BY`, `LAST → NEXT REVIEW`, and an empty
cell for the star.

Row — `padding: 8px 16px`, `border-top: 1px solid rgba(21,33,57,.7)`,
`align-items: center`:

| Cell | Spec |
|---|---|
| Name | 6px freshness dot + 12.5px `#E9EFFB`, ellipsis |
| Value | 13px/600 mono, right-aligned, unit suffix 10px/400 `#5E7098` |
| 1D 1W 1M YTD 1Y | 11px mono, right-aligned, ellipsis, coloured by sign |
| Reviewed by | 11.5px `#93A5C9`, ellipsis |
| Last → next review | 11px mono, `#5E7098` or `#EBCB74` if due within 7 days |
| ★ / × | 11px star (`#EBCB74` pinned, `#3A4A6C` not) + 14px `×` in edit mode |

Grid template and gap 10px, three responsive variants driven by content width
(viewport minus rail):

- `≥ 1060`: `minmax(0,1fr) 96px repeat(5, 58px) 116px 136px 22px`
- `860–1060`: drop **Reviewed by** → `minmax(0,1fr) 96px repeat(5, 58px) 136px 22px`
- `< 860`: also drop **Last → next review** → `minmax(0,1fr) 90px repeat(5, 54px) 22px`

The five change columns never drop; the review data is still on the tiles.

**Removed** section (edit mode, when anything was removed): label `REMOVED` + count,
then dashed chips — `1px dashed #1E2E52`, radius 8px, padding `8px 11px`, label
10px/700 uppercase `#93A5C9` + `+ restore` 11px `#EBCB74`.

**Empty state** (card, 30px padding, centred, 12.5px `#93A5C9`): "Nothing matches
that. Clear the filters, or add it yourself with *Customize board → + Custom
metric*." (the trailing phrase in `#EBCB74`).

### 8. Economic calendar view

Toolbar: **Currency** select (All / USD only / EUR only), **Impact** select (All /
Medium & up / High only), right-aligned count `14 upcoming · 2 released`.

One card, `overflow: hidden`. Header row (`padding: 10px 16px`, background `#0C1930`)
with 10px/700 uppercase `#5E7098` labels: `TIME ET`, `CCY`, (dot column), `EVENT`,
`ACTUAL`, `FORECAST`, `PREVIOUS`. Grid:
`78px 34px 12px minmax(0,1fr) 80px 80px 80px`, gap 12px.

Day group header: `padding: 9px 16px`, `border-top: 1px solid #152139`, background
`rgba(255,255,255,.014)`; day 11px/700 `#EBCB74` (`#93A5C9` for past groups) plus a
10px uppercase `#5E7098` tag (`released` on past groups). Past groups render at
`opacity: .62`, ordered newest-first, after all upcoming groups.

Event row: `padding: 8px 16px`, `border-top: 1px solid rgba(21,33,57,.7)`,
`align-items: start`.

- Time: 11.5px mono `#E9EFFB`; beneath it a relative line 9.5px mono — `in 2h 18m` /
  `in 1d 17h` — `#EBCB74` when under 4 hours away, else `#5E7098`.
- Ccy: 11px mono `#93A5C9`.
- Impact dot: 6px, `margin-top: 5px` — high `#F0596E`, medium `#E5A43B`, low `#5E7098`.
- Event: 12.5px `#E9EFFB`; if the event has an explainer, a 10px `#5E7098` hint
  `ⓘ what this is` / `ⓘ hide` follows it and the row toggles the explainer
  (11.5px `#93A5C9`, line-height 1.55, max-width 660px). Rows without an explainer
  are not clickable (`cursor: default`).
- Actual / Forecast / Previous: 11.5px mono, right-aligned. Actual 600 weight
  `#E9EFFB` when present, `#3A4A6C` when it is a `—`. Forecast `#93A5C9`, previous
  `#5E7098`.

Split rule: an event stays in **upcoming** until 6 hours after its time, then moves
to the dimmed past block. Both blocks sort by time (upcoming ascending, past
descending).

### 9. Content footer + shell footer

- `Market data is informational only — not investment advice.` — 10.5px `#5E7098`,
  letter-spacing .3px, `margin-top: 16px`.
- Shell footer strip: `© 2026 Vitalis Trading Systems LLC. All rights reserved.
  Confidential.` left; `Terms · Privacy · Rules` + access label (`Full access`, mono)
  right. All 10.5px `#5E7098`.

### 10. Custom metric form (edit mode)

Panel `#0C1930`, `1px solid #152139`, radius 10px, padding `14px 16px`,
`margin-bottom: 12px`. Header: `NEW CUSTOM METRIC` 10.5px/600 uppercase ls 1.4px
`#5E7098`, and a right-aligned 10.5px `#5E7098` note "Anything the feeds don't carry
— your own numbers, marked as manual."

Fields in `repeat(auto-fit, minmax(152px, 1fr))`, gap 10px, `align-items: start`:
**Label** (placeholder "e.g. 5s30s spread"), **Group** (select), **Value**
("e.g. 68"), **Unit** ("% · bps · K"), **Change** ("▲ 2"), **As of**
(default text "entered by you").

Actions: **Add tile** — 11.5px/600 `#E9EFFB`, background `rgba(235,203,116,.14)`,
border `1px solid rgba(235,203,116,.4)`, radius 7px, padding `8px 14px`; **Cancel** —
ghost; then a 10.5px `#5E7098` note "It pins straight to the strip and can be removed
like any other tile."

Save requires a non-empty label and value; the new metric is appended to its group,
pinned to the end of the strip, and marked `manual` (amber freshness dot). Its review
line reads "Manual entry · when you update it" — **worth extending with real
last/next review fields when you build this against the API.**

### 11. Undo toast

Fixed, bottom 24px, centred (`left: 50%; transform: translateX(-50%)`), z-index 55.
Background `#0C1930`, `1px solid #1E2E52`, radius 10px, padding
`10px 12px 10px 16px`, `box-shadow: 0 16px 40px rgba(0,0,0,.5)`, gap 14px.
Message 12.5px `#E9EFFB` — `Removed “Fed funds target” from the board.` Then an
**Undo** button (ghost-ish: `1px solid #1E2E52`, `rgba(255,255,255,.05)`, 12.5px/600,
padding `7px 14px`, radius 7px) and a `×` dismiss (18px `#5E7098`). Auto-dismisses
after 7 seconds. Every removal gets one — this matches the portal-wide
"undo on every list removal" rule.

---

## Interactions & Behavior

| Action | Result |
|---|---|
| Click a view pill | Switches board ⇄ calendar. Pinned strip and Fed bar persist across both. |
| Type in **Find data** | Filters series by label, group, value and as-of text; empty groups disappear; count line updates. |
| **Group** select | Restricts the board to one group. |
| **Clear** | Resets search + group (only rendered when one is active). |
| Click ★ on a board row | Pins/unpins that series to the strip (appends to the end when pinning). |
| Click × (edit mode) | Removes the series from board and strip, shows the undo toast. |
| Drag a pinned tile | Reorders the strip. Reorder happens on `dragenter` over another pinned tile (live preview), `dragover` is prevented, `dragend` clears; the dragged tile sits at `opacity: .45`. |
| **Customize board** | Toggles edit mode: banner, tile controls, drag, + Custom metric. Banner copy: "Edit mode — drag a pinned tile to reorder, ★ to pin or unpin, × to remove. Every removal can be undone." (12.5px `#F3E3B8`, background `rgba(235,203,116,.08)`, border `1px solid rgba(235,203,116,.35)`, radius 8px, padding `9px 12px`.) |
| **Privacy** | Masks money-flagged figures as `•••••` (and their changes as `•••`). Rates, prices, yields and pips stay visible — they are price facts, not balances. Only `BTC spot ETF net flow` is flagged in the sample data. |
| Click a calendar row with an explainer | Expands/collapses the explainer; only one open at a time. |
| Collapse the sidebar | Rail 248px → 72px (`.18s ease`), icons only with `title` tooltips, wordmark → mono `VTS`, version pill → `5.78`. |
| Clock / countdown | Tick every second. Nothing else animates except the blinking activity dot in the sidebar. |

No hover scale or lift effects anywhere — hover is a colour/border swap only
(`.15s` colour, `.18s` layout).

## State Management

```
view              'board' | 'calendar'
editing           boolean                 // Customize board
addOpen           boolean                 // custom-metric panel
privacy           boolean
railCollapsed     boolean
pinned            string[]                // ordered metric ids — persist per user
hidden            string[]                // removed metric ids — persist per user
custom            Metric[]                // user-created metrics — persist per user
q                 string                  // board search
groupFilter       'all' | groupKey
calCcy            'all' | 'USD' | 'EUR'
calImpact         'all' | 'medhigh' | 'high'
openCal           eventId | null          // expanded explainer
undo              { id, label } | null    // 7s timeout
dragId            string | null
tick              number                  // 1s clock
vw                number                  // window width, for responsive columns
```

`pinned`, `hidden` and `custom` are the trader's layout and must persist server-side
per user (the founder already reorders nav from Developer Portal, so this is the same
class of preference). Everything else is ephemeral UI state.

Data fetching: one endpoint for the series board (value, unit, change set, freshness,
review body/dates), one for the calendar window, one for the FOMC schedule. Poll or
push per existing portal practice; show the last successful timestamp in
`Data as of …` and follow the portal's error convention — say what happened and what
still works ("Showing the last values from 9:41:07 AM ET. Couldn't refresh: request
timed out."), dismissible by clicking.

## Data model

```ts
type Metric = {
  id: string;
  group: 'policy' | 'inflation' | 'labor' | 'yields' | 'fx'
       | 'commod' | 'crypto' | 'equity' | 'macro' | 'session';
  label: string;            // e.g. 'CPI y/y · 1-yr inflation'
  value: string;            // display-ready, e.g. '4.25–4.50'
  unit: string;             // '%', 'bps', 'K', 'M USD', 'T USD', ''
  asOf: string;             // 'Jun · rel Jul 14', 'record high', 'live'
  source: 'live' | 'manual' | 'stale';   // freshness dot
  money?: boolean;          // masked in privacy mode
  valueColor?: string;      // sessions only (green when open)
  changes: [string, string, string, string, string];  // 1D, 1W, 1M, YTD, 1Y
  review: {
    body: string;           // 'FOMC', 'BLS', 'BEA', 'NY Fed', 'Cboe', …
    last: string;           // ISO date, or a cadence phrase
    next: string | 'fomc';  // ISO date, 'fomc' = next Fed meeting, '' = tbc
  };
};
```

Change values are **display strings**, signed with a real minus (`−`, U+2212) and
coloured by their leading character: `+` → `#2FC77E`, `−` → `#F0596E`, zero or `—` →
`#93A5C9` / `#3A4A6C`. Units follow the series: rate and index-point series in their
own units (pp, bps, K, $B), prices and indices in percent. `—` where a period is
meaningless (session rows, YTD on a year-to-date series).

Review rendering: if `last` is an ISO date, show `Jun 17 → Sep 16` (formatted
`MMM d`, Eastern); if `next` is `'fomc'`, use the live next-meeting date; if `last`
is a cadence phrase (`continuous`, `daily`, `daily · 3:30 PM`, `daily · 9:00 AM`,
`daily · 1:15 PM`), show it verbatim with no arrow. Highlight gold when the next
review is 0–7 days out.

### The 78 series, by group

| Group | Label | Contents |
|---|---|---|
| `policy` | Policy & rates | Fed funds target, effective fed funds, IORB, SOFR, next-meeting cut odds, hold priced, 2026 dot-plot median, primary credit rate, ECB deposit rate, BoE bank rate, BoJ policy rate |
| `inflation` | Inflation | CPI y/y (1-yr inflation), core CPI y/y, CPI year to date, PCE y/y, core PCE y/y, core PCE m/m, PPI y/y, 1/5/10-yr breakevens, UMich 1-yr expectations, Cleveland nowcast |
| `labor` | Labor & growth | Unemployment rate, nonfarm payrolls, payrolls 3-mo avg, avg hourly earnings, initial claims, participation rate, real GDP, Q2 advance forecast, ISM mfg, ISM services, retail sales |
| `yields` | Yields & curve | UST 3m/2y/10y/30y, 2y–10y spread, 3m–10y spread, 10-yr real (TIPS), 30-yr mortgage |
| `fx` | FX & dollar | DXY, EUR/USD, GBP/USD, USD/JPY, USD/CAD, AUD/USD |
| `commod` | Commodities | Gold, silver, WTI, Brent, copper, nat gas |
| `crypto` | Crypto | BTC/USD, ETH/USD, BTC spot ETF net flow *(money)*, BTC perp funding, BTC dominance |
| `equity` | Indices & volatility | US100, US500, US30, VIX, MOVE, S&P Q2 blended EPS |
| `macro` | Macro & liquidity | Fed balance sheet, overnight reverse repo, Chicago Fed NFCI, NY Fed recession probability, Sahm rule gap, Citi econ surprise |
| `session` | Sessions | New York, London, Tokyo, Sydney — Open/Closed computed from the live Eastern clock against each window, with `closes 4:00 PM` / `opens 7:00 PM` beneath |

Default pinned set (15, in order): `ffr, cut9, cpi, cpiytd, cpce, unrate, y2, y10,
s2s10, real10, dxy, gold, btc, us500, vix`.

Exact sample values, change sets and review mappings are the `LIB`, `CHANGES` and
`REVIEW` / `REVIEW_GROUP` literals in the logic class of `Market Data.dc.html` —
lift them from there if you want the prototype's numbers as fixtures.

### Calendar events

16 sample events with absolute Eastern times: MBA applications 07:00, advance goods
trade 08:30, pending home sales 10:00, crude inventories 10:30 (today); FOMC decision
14:00 and press conference 14:30 (on the meeting date); Eurozone flash CPI 05:00,
German prelim CPI 08:00, advance GDP 08:30, claims 08:30 (+1 day); core PCE 08:30,
ECI 08:30, Chicago PMI 09:45, revised UoM 10:00 (+2 days); German Ifo 04:00 (−2 days)
and CB consumer confidence 10:00 (−1 day). Four carry explainers (advance goods
trade, FOMC decision, FOMC press conference, Eurozone flash CPI, core PCE).

Fields: `id, title, ccy, impact, timeET, day, actual?, forecast?, previous?, explainer?`.

## Design Tokens

```css
--bg:      #050B18   /* app background            */
--side:    #071021   /* sidebar AND top bar       */
--panel:   #0A1426   /* cards                     */
--panel-2: #0C1930   /* nested panels, footers    */

--line:    #152139   /* default border / divider  */
--line-2:  #1E2E52   /* stronger border, inputs   */
--hover:   #24365F   /* card border on hover      */

--text:    #E9EFFB   /* primary text              */
--muted:   #93A5C9   /* secondary text            */
--faint:   #5E7098   /* labels, metadata          */

--gold:      #EBCB74 /* accent (Advanced Trading), active nav */
--gold-2:    #C9A24B /* gradient bottom stop      */
--gold-text: #241A05 /* text on a gold button     */
--green:     #2FC77E /* positive / open / live    */
--red:       #F0596E /* negative / high impact    */
--amber:     #E5A43B /* manual source, privacy on */
```

Two extra values this screen uses, both already implied by the shell doc:
`#3A4A6C` for de-emphasised column labels and unset stars, and
`rgba(21,33,57,.7)` for inner table row dividers.

Accent tints: `rgba(235,203,116,.16)` → `.08` for the active-section /
active-pill gradient, `.12` for a tinted chip, `.35–.4` for a tinted border.

**Radii:** 12 cards · 10 panels/toasts · 8 rows, buttons, icon buttons · 7 inputs and
small buttons · 5 chips · 4 the version pill.

**Type:** IBM Plex Sans 400/600/700 for UI; **IBM Plex Mono for every figure, time,
ticker, period label and version** — a value in the sans face is wrong. Sizes in use:
25 tile figure · 19 title and Fed line · 13.5 nav · 13 breadcrumb and row value ·
12.5 body/buttons/rows · 11–11.5 metadata and table cells · 10.5 labels/footer ·
9.5–10 chips, micro values and column labels · 8 tile period labels.

**Spacing** is hand-tuned, not a 4/8 grid — copy the exact paddings above.

**Motion:** `.15s` colour, `.18s` layout. `livePulse` (2s loop) on the sidebar
activity dot is the only infinite animation. No hover transforms.

## Responsive behavior

Breakpoints in the prototype are driven by **content width** (viewport − rail), not
media queries, because the rail collapses:

| Threshold | Change |
|---|---|
| `< 1060` | Board drops the **Reviewed by** column |
| `< 860` | Board also drops **Last → next review** |
| `< 820` | Breadcrumb shows only the bold section |
| `< 700` | Top-bar search hidden; right cluster pushed right |

Per the shell doc, phone (≤480) turns the rail into a 264px off-canvas drawer behind
the hamburger over a `rgba(0,0,0,.55)` scrim, with no bottom tab bar; every text input
is floored at 16px on touch so iOS never zooms. The prototype does not mock the
drawer.

## Assets

- `assets/brand/vitalis-wordmark.png` — the real wordmark, rendered at 148px wide in
  the sidebar brand block. Never redraw it; the collapsed rail uses mono text `VTS`.
- **Icons: Lucide only, 16px, stroke 1.75, round caps**, drawn inline exactly as
  `apps/web/src/components/Icon.tsx` does. Used here: `line-chart` (Market Data —
  new), plus the existing `panel-left-close`, `shield-check`, `external-link`,
  `briefcase`, `candlestick-chart`, `landmark`, `graduation-cap`, `crown`,
  `life-buoy`, `layout-dashboard`, `bell`, `trash-2`, `calendar-clock`, `pencil`,
  `newspaper`, `list-todo`, `chevron-right`, `search`, `sparkles`.
- No photos, no illustrations, no icon font, no emoji. Status is a coloured dot;
  controls are the functional glyphs `⠿ ★ × ⓘ ▲ ▼ →`.
- Fonts: the app self-hosts IBM Plex via `@fontsource`. The prototype loads the same
  families from `_ds/…/tokens/fonts.css` (Google Fonts) purely so the file works
  standalone — **do not introduce a CDN request into the portal.**

## Copy conventions used

Sentence case, plain and technical, no exclamation marks, no emoji. Second person.
Times always Eastern and labelled `ET`. Trading vocabulary unapologetically
(basis points, breakevens, dot plot, perp funding). Advice-flavoured surfaces carry
the informational-only line. Any figure that is not real must be marked sample data.

## Files

| File | What it is |
|---|---|
| `Market Data.dc.html` | The design reference. Open it in a browser (served, not `file://`). Markup is the template at the top; sample data, formatting and behaviour are the `class Component` logic block at the bottom — `LIB`, `CHANGES`, `REVIEW`, `REVIEW_GROUP`, `CAL`, `MEETINGS`, `DEFAULT_PINS`. |
| `support.js` | Runtime that renders the prototype. Not part of the design; do not port it. |
| `assets/brand/vitalis-wordmark.png` | Brand asset used by the design. |
| `_ds/…/tokens/fonts.css` | IBM Plex web-font loader for the standalone prototype only. |
| `reference/portal-shell.md` | The current shell brief — the source of truth for chrome, tokens, type and component patterns. |
| `reference/portal-shell.html` | The shell as a working page, for visual comparison. |

## Out of scope / next

- **Market News** keeps the headline feed and is being designed separately. The
  economic calendar currently lives here in Market Data (scheduled releases rather
  than reporting) — if it should sit in News instead, that is a one-block move.
- Real last/next review inputs on the custom-metric form.
- Sparklines per series, and per-series alert thresholds, were discussed but are not
  designed yet.
