# Market News — redesign kit

Everything needed to rework the **Advanced Trading ▸ Market News** layout in Claude
Design without running the portal, plus the constraints that decide whether a given
layout is actually buildable here.

| File | What it is |
| --- | --- |
| `current-state.html` | Standalone, dependency-free replica of the screen as it ships today. Open it in a browser or drop it into Claude Design as the starting point. Has a state switcher (AI overview / error / edit form / read-only / empty / loading / phone width) so every state is reachable. |
| `sample-data.json` | Realistic payload in the exact production shapes, annotated. Use it so a new layout is designed against real content lengths, not lorem. |
| `tokens.css` | The palette, type scale, radii and spacing actually in use — including the places where this screen has drifted from the app-wide tokens. |

Source of truth for the live screen: `apps/web/src/workspaces/trading/MarketNews.tsx`
(596 lines, one file, everything inline).

---

## 1. What the screen is for

A trader opens Market News to answer three questions, in this order:

1. **What just happened that moves my book?**
2. **What is scheduled to happen, and when?**
3. **So what — how does it change what I do this session?**

Today's layout answers all three with the same undifferentiated vertical stack of
cards, which is the core of the complaint.

Audience is the desk (owner + a few traders). Public demo and `trading_viewer` see
it read-only. It is a **shared** feed — not per-user — so two traders see the same
headlines; only the "affects" chips are personalised.

---

## 2. Where the data comes from

Ingest runs server-side every 5 minutes in production (`apps/api/src/trading/feeds.ts`):
Finnhub, curated RSS (Fed / CNBC / MarketWatch / CoinDesk / Cointelegraph / FXStreet),
the Forex Factory economic calendar, and an unofficial Truth Social endpoint. VTS AI
tags each headline with bias/impact/category and writes the "how it could affect us"
note; it also writes the plain-language calendar explainers.

The browser polls `GET /api/trading/market-news` every **120s** and
`GET /api/trading/truth` alongside it. Both are best-effort — a Truth failure never
affects the rest of the page.

**Volume ceilings** (`apps/api/src/trading/news.ts`): 200 headlines, 400 calendar
events. In practice expect 15–60 headlines and 20–60 events in view. Design for the
top of that range; `sample-data.json` sits at the low end so it stays readable.

### The exact data contract

Nothing outside these fields exists client-side. Anything a new layout wants that
isn't here (sentiment score, ticker price deltas, read/unread, clustering, images,
per-user pinning) is an **API change** — flag it rather than assuming it.

```ts
type NewsImpact   = 'high' | 'medium' | 'low';
type NewsBias     = 'bullish' | 'bearish' | 'neutral';
type NewsCategory = 'markets' | 'geopolitical' | 'economic' | 'crypto' | 'other';

interface NewsItem {
  id: string;
  title: string;
  body: string | null;       // raw source excerpt — only when there is no AI read
  tradeNote: string | null;  // VTS AI's desk read ("How it could affect us")
  source: string | null;     // "Reuters", "CoinDesk", …
  url: string | null;
  category: NewsCategory;
  impact: NewsImpact;
  bias: NewsBias;
  publishedAt: number;       // ms epoch
}

interface CalendarEvent {
  id: string;
  title: string;
  country: string | null;    // "USD", "EUR" — currency code, not a country
  impact: NewsImpact;
  eventTime: number;         // ms epoch
  forecast: string | null;   // pre-formatted strings, e.g. "-98.0B", "4.25%-4.50%"
  previous: string | null;
  actual: string | null;     // null until the release lands
  explainer: string | null;  // VTS AI plain-language "what is this release?"
  source: string | null;     // "Forex Factory"
}

interface TruthPost {
  id: string; author: string; content: string; url: string | null; postedAt: number;
}
```

Two client-side derivations layer on top, both pure (`newsRelevance.ts`):

- **`newsFeeds(item)`** — regex classification into the topic subfeeds
  (`fed`, `eurusd`, `btc`, `gold`, `indices`, `markets`). A headline can be in
  several at once; anything matching nothing falls to `markets`.
- **`affectedInstruments(item, watchlist)`** — the trader's own instruments a
  headline is likely to move, ranked. The watchlist is derived from their trade log
  on mount, falling back to a default majors set. Deliberately conservative — a chip
  only appears when the text actually names a currency, central bank or asset.

---

## 3. What is on the screen today, top to bottom

Content well is capped at **860px**, centred, on the app's navy `#050B18`.

1. **Header row** — `<h2>` "Market News" 19px/700 + a 12.5px muted three-clause
   subtitle, with three buttons floated right: `✨ AI overview`, `Live market news`,
   `Calendar`.
2. **Error banner** (conditional) — click-to-dismiss red strip.
3. **AI overview card** (conditional) — gold left border, "AI OVERVIEW · VTS AI"
   eyebrow, pre-wrapped prose, `×` to close. Summarises whatever the active feed is
   showing. One AI call per press; nothing is cached.
4. **Filter row** — four labelled `<select>`s: **Feed** (9 options, with counts),
   **Impact** (defaults to *Medium & up*), **Bias**, **Source** (built from what is
   in the current feed), plus a **Clear** button when any filter is off-default.
   Impact/Bias/Source are hidden on the Trump and Calendar feeds.
5. **The feed body**, which is one of four completely different layouts:
   - **News feeds** — a flat `gap: 11px` column of headline cards.
   - **Trump** — a flat `gap: 10px` column of post cards.
   - **Calendar** — events grouped by ET day, each day a gold date label over
     `gap: 6px` rows; a dimmed "Past" block (anything more than 6h old) below.
   - **EUR/USD** — uniquely, the EUR+USD calendar block **first**, then a
     "EUR/USD HEADLINES" label, then the headline cards.

### The headline card

Five metadata elements sit in one wrapping row **above** the title: bias pill
(coloured, with ▲/▼/●), impact chip, category chip, an "affects EUR/USD XAU/USD …"
run of gold chips (max 5), and a right-aligned mono relative time. Then the title at
14px/600 white. Then **either** the AI trade note in an inset panel with a
bias-coloured "HOW IT COULD AFFECT US" label, **or** — if there is no AI read — the
raw source excerpt shown plainly (deliberately never mislabelled as AI). Then a
footer: source name, `Source ↗` link, and Edit / `×` on the right for writers.

### The calendar row

Impact dot, mono ET time, currency code, title, source chip, then an optional
`Act / Fcst / Prev` figure line and an optional `ⓘ` explainer paragraph.

### States

Loading (`"Loading market news…"` bare text), hard error (replaces everything),
soft error (banner over live data), empty per feed (four different empty strings),
no-match-after-filter, read-only (Edit/`×` hidden), and inline edit — where the card
or row is **replaced in place** by a form. All are reachable in `current-state.html`.

---

## 4. Hard constraints — a layout that breaks these can't ship

- **No CSS framework.** Styling is inline-style objects / plain CSS with the tokens
  in `apps/web/src/theme/tokens.ts`. Any layout is expressible; just don't hand back
  Tailwind classes.
- **No URL routing.** `Portal.tsx` holds `workspace`/`screen` in `useState`; the URL
  never changes. There is no deep link to a feed and no browser back. If the design
  wants shareable/restorable feed state, that is a routing change — call it out
  explicitly as a decision, don't assume it.
- **Available width.** Sidebar is 248px (72px collapsed), content well padding is
  16px/32px. On a 1440px viewport that leaves ~1128px, of which the screen currently
  uses 860px. Widening or going multi-column is free real estate that already exists.
- **Must survive 320px.** Phone gets an off-canvas nav drawer and 14px well padding.
  `isPhone ≤480`, `isTablet ≤768` (`hooks/useMediaQuery.ts`).
- **iOS input zoom.** Every input/select is floored at 16px on touch devices by a
  global rule. Don't design a filter row that depends on 12px controls on mobile.
- **Eastern Time everywhere**, always — sessions, market hours and trade codes all
  use ET so a timestamp means the same instant to every teammate.
- **Call the AI "VTS AI"** in every user-visible string. Never "Claude", "Anthropic",
  or a model name.
- **AI is metered** — 1000 calls/user/month, 15/min burst, 503 when unconfigured.
  A layout that fires a brief automatically per feed switch will burn the cap and
  needs to be designed as explicit-press or cached.
- **Copy is hardcoded.** There is no in-app text editor and no `copy.<id>` override
  store — that mechanism was deliberately removed. New strings are literals in the
  `.tsx`. (The `howto.*` and `ai.*` keys in Admin ▸ Site Wording are the only
  DB-backed wording and don't cover this screen.)
- **Read-only must be a first-class state**, not an afterthought — the public demo
  renders every Trading workspace read-only.
- **`tradeNote` is advice-flavoured.** Per the launch posture in `CLAUDE.md`, any
  surface carrying it needs an "informational only, not investment advice"
  disclaimer. Today there isn't one — the redesign should give it a home.
- **Shared components.** `newsFormat.ts` (time + entity decoding) and
  `newsRelevance.ts` (feeds + affected instruments) are also used by the Live Wall's
  `NewsTile` and `CalendarTile`. Decide whether a new card style propagates to those
  board tiles or the screen forks its own.

---

## 5. What's actually wrong with the current layout

Not a wish list — these are the specific structural problems, so the redesign can be
aimed rather than decorative.

**Navigation is doubled and can contradict itself.** The Feed dropdown already
contains Calendar and Trump, and the header has separate `Live market news` /
`Calendar` buttons for the same axis. `Live market news` renders gold whenever the
feed isn't Calendar — so it is highlighted while you are reading Truth Social posts.
One control should own this.

**Nine feeds are hidden inside a dropdown.** The counts exist and are useful ("Gold
(6)") but a `<select>` shows exactly one of them at a time, so there is no sense of
where the day's activity is concentrated. This is the single biggest wasted signal
on the screen.

**Counts and content disagree.** Impact defaults to *Medium & up*, so "All (14)"
routinely sits above a list of 9. Nothing explains the gap.

**Every story looks equally important.** A 2:00 PM FOMC decision and "Silver tops
$41" get the same card, the same padding, the same 14px title. Impact is encoded
only as a 9.5px chip. The layout has no visual hierarchy for the thing the trader
most needs — what matters right now.

**The metadata outweighs the headline.** Five chips/pills sit above a 14px title in
a wrapping row that on narrow widths pushes the actual news below the fold of the
card. Bias, impact and category are three separate visual objects encoding what is
arguably one judgement.

**Calendar and headlines are unrelated on screen** even when they are the same
story — the FOMC row and the four Powell headlines never reference each other. On
the EUR/USD feed they were bolted together with a one-off special case, which proves
the need but only for one feed.

**Time context is thin.** Headlines show only "12m ago"; there is no absolute ET
stamp. The site's own convention elsewhere (`tradeTime.tsx`, on every position
surface) is to show the clock time *and* the relative reading. Nothing marks what is
new since the last poll or since you last looked.

**Write affordances without a create affordance.** Edit and delete sit on every card
and row, but there is no compose path at all — `api.addNews` and
`api.addCalendarEvent` exist and are never called, and the forms' "New headline" /
"New calendar event" titles are unreachable dead copy. Either the screen gets a
compose entry point or the edit controls should retreat behind something quieter.

**The AI overview is a dead end.** It is a one-shot card at the top, uncached, lost
on dismissal, and unrelated to the list beneath it — you can't tell which of the
headlines it drew from.

**Mobile is mostly chrome.** At 390px the header wraps to three rows and four
150px-min dropdowns wrap to two or three more, so the first screenful is
overwhelmingly controls.

**Palette drift.** This file declares its own `GREEN/RED/AMBER/TEXT/MUTED/FAINT/
BORDER` constants that are all *near* but not equal to the app tokens, and its gold
button uses navy `#0c2768` text where the token is `#241A05`. Full diff in
`tokens.css`. Worth collapsing onto the tokens as part of the work.

---

## 6. Decisions to make in the design (flag your answer)

1. **Does the calendar stay a peer feed, or become a persistent rail?** It is
   time-anchored, always relevant, and currently buried behind a dropdown option.
   A second column is affordable at ~1128px.
2. **Does Truth Social stay a top-level feed?** It sits second in the tab order,
   above every market feed, and is a single low-volume source.
3. **One column or two?** Anything wider than 860px is a deliberate change.
4. **Does impact drive card size**, or stay a chip? A lead/secondary/compact
   three-tier card set is the obvious lever and needs no API change.
5. **Where does the "not investment advice" line live** now that `tradeNote` is
   getting more prominence?
6. **Do the Live Wall `NewsTile` / `CalendarTile` inherit the new card**, or does
   this screen fork?
7. **Is feed state worth a URL?** Only say yes if deep-linking matters — it means
   introducing routing to a screen-state app.

---

## 7. Handing the design back

Match the existing convention in `docs/design/employee-portal/`: HTML prototypes
plus a README that specifies exact values, and a fidelity statement so it's clear
what is final versus indicative. Concretely, land in `docs/design/market-news/`:

- One HTML file per view/state worth pinning down (default feed, calendar,
  narrow/phone, and any new state the design introduces).
- A spec section per region with **real numbers** — colour hex, px sizes, weights,
  gaps, radii, breakpoint behaviour — the way the employee-portal README does.
- A **fidelity** line: pixel-final, or directional.
- An explicit list of anything requiring new API fields or new endpoints, so the
  server work can be scoped separately from the layout work.

With that in hand the React rewrite of `MarketNews.tsx` is mechanical.
