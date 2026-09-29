# AGENTS.md

Project guidance for any coding agent working in this repo. This file is the
**current source of truth** for how the terminal is built and how it behaves.
`README.md` is outdated (it still describes "Stage 1" and workspaces that no
longer exist) — trust this file and the code, not the README.

> When you change how the terminal works, update the relevant part of this file
> in the same change so it never goes stale.

## One instruction file

**`AGENTS.md` — this file — is the canonical one, and everything goes in it.**
`CLAUDE.md` exists only to import it (`@AGENTS.md`, Claude Code's documented
import syntax) and holds no instructions of its own.

**This repo is worked on with Claude Code** (owner decision, 2026-08 — GPT Codex
was set up alongside it and then dropped). The two-file arrangement is kept
anyway, because it costs nothing and `AGENTS.md` is the filename every other
coding agent reads: adding a second tool later is a decision rather than a
migration. Nothing about it changes how Claude Code behaves — the import is
expanded at session start, so this file is read in full exactly as `CLAUDE.md`
would be.

The rule that matters is unchanged: **write every instruction here**, not in
`CLAUDE.md`. Two instruction files drift within a month, and whichever one is
stale then gets followed confidently.

## THERE IS AN OPEN WORK ORDER FOR THE PUBLIC DEMO

**`docs/implementation/demo-work-order.md` is the owner's own brief, transcribed
with a checkbox per item, and it is not finished.** It was written down rather
than left in a chat because it is long and a context window is not a place to
keep instructions. Read it before doing any work on the public demo, and tick an
item only when the change is built and verified.

It also carries an explicit instruction about how to FINISH: when every item is
done, say so in capitals and stop, and ask the owner to type an acknowledgement
rather than letting them press continue past it.

## Before you touch anything: confirm this is the live checkout

The terminal is worked on from **more than one machine**, and the single most
expensive mistake made in this repo was a session that edited a **stale clone**
for hours while believing it was the live site. It never checked, and it could
not find out: the clone sat in a cloud-sync folder where `git fetch` hangs
outright, and the preview it "verified" against served those same stale files,
so every check it ran confirmed the wrong thing.

The check is `scripts/check-checkout.sh`, and **Claude Code runs it
automatically** at the start of every session via
`.claude/hooks/session-start.sh` — so ordinarily it is read rather than run. It
lives in `scripts/` rather than inside the hook so it can also be run by hand,
which is what CI and any environment without that hook does:

    bash scripts/check-checkout.sh

It never touches the network and always exits 0, so it is safe to run anywhere,
any time. If it says **STOP**, believe it — but the checks are simple enough to
run by hand, and they are worth knowing:

- **Remote** is `andrewr92896-ship-it/vts-terminal`. The repository was renamed
  from `vts-portal`, and **both spellings are accepted** — GitHub redirects the
  old name indefinitely and a clone made before the rename keeps its old remote
  URL until somebody re-points it. Anything else is the wrong repo — **except no
  remote at all**, which is a managed environment (Codex cloud, CI) that
  provisioned the checkout itself, and is reported as fine. Treating that as
  wrong printed STOP on every cloud session, and a guard that cries wolf every
  time is one people learn to scroll past.
- **`APP_VERSION`** in `apps/web/src/meta/version.ts` reads `Beta V …`. A
  `Pre-Alpha` or `Stage N` version means an old checkout — the live app left
  those behind long ago.
- **History is deep.** A real clone has dozens of commits; the bad one had one.
- **The path is on local disk.** A checkout inside OneDrive, Dropbox, Google
  Drive or iCloud will corrupt itself — those services rewrite files underneath
  git. Never work in one, and never try to repair one: clone fresh to local disk.

Then, before editing: `git fetch origin main && git log --oneline -1 origin/main`
and confirm you are working from that. `main` is the only branch that deploys.

**Ask rather than guess** about anything local that is not in the repo — whether
a working `apps/api/.env` or database already exists, and how to sign in for
testing. A previous session invented credentials and seeded its own database
because it did not ask. There is a read-only **demo account** for looking at the
app without creating anything.

## What the terminal is

VTS Terminal ("Vitalis Trading Systems") is a **private, dark "pro-terminal" web
app** for the owner (Andrew) and a few invited users. One login leads to a
sidebar of workspaces, each with its own sections. It is a PWA (installable,
web push). There is no public sign-up; there is a single read-only **demo
account** and a public **Early Access** request form on the login screen.

## Product direction (owner goal)

The terminal is **currently** private/invite-only, but the **stated goal is to launch
it publicly as a paid, subscription-based product** — an official iOS app on the
App Store, under the legal entity **Vitalis Trading Systems LLC**. It will be
**opened to the general public and monetized via a recurring subscription** (not
invite-only forever). A headline feature is a **home-screen widget showing open
positions**. Keep this trajectory — public users + paid subscriptions — in mind for
architecture decisions.

**Subscription/monetization implications to plan for** (not yet built):

- **Apple takes its cut and mandates its rails.** A subscription unlocking digital
  features inside an iOS app must use **Apple In-App Purchase / StoreKit
  auto-renewable subscriptions** (Apple's 15–30% cut applies); you cannot bill a
  card directly in-app or link out to an external checkout for the digital
  subscription. Plan billing around StoreKit for iOS, and a separate web billing
  path (e.g. Stripe) for the web app.
- **Entitlements become first-class.** Move from "invite-only + roles" toward a
  **subscription/entitlement layer** (who has paid, tier, trial state, expiry,
  grace period) that gates feature access alongside the existing RBAC roles. The
  read-only **demo account** and public **Early Access** form stay as the
  top-of-funnel for the paid product.
- **More users = more of everything already flagged:** ToS + privacy policy,
  in-app account deletion (Guideline 5.1.1(v)), AI-use disclosure, "informational
  only, not investment advice" disclaimers, and the securities/fintech attorney
  review all become **launch blockers**, not nice-to-haves, once real money and
  the general public are involved. Auto-renewable-subscription disclosure rules
  (clear price/terms/cancellation before purchase) also apply.

(None of this is legal advice.)

Agreed **lowest-liability** shape for that public launch (research done 2026-07):

- **~~Read-only tracker, not a trading platform.~~ Superseded (owner decision,
  2026-07): the web terminal now places real orders** — see **Advanced Trading ▸
  Trade Desk** below. The app still never *moves money* (no deposits, withdrawals
  or custody: it sends an order to the trader's own broker under the trader's own
  credentials), but it does now **execute trades**, which is the line App Review
  Guideline **3.2.1(viii)** draws — that guideline reserves financial
  *trading/investing/money-management* apps to the financial institution
  providing the service, or an entity authorised to do so. **Consequences to plan
  for, not to ignore:**
  - The **iOS app cannot simply ship the Trade Desk** on the strength of being a
    tracker. Either the native shell excludes order placement (leaving it a
    tracker on iOS while the web app trades), or the App Store listing is made
    under an entity that satisfies 3.2.1(viii) — which is a legal/licensing
    question for the attorney review below, not a build-time decision.
  - This is the change that makes the **securities/fintech attorney review a hard
    launch blocker** rather than a strong recommendation, and it materially raises
    the case for **E&O / tech / cyber insurance**.
  - **Broker credential custody stops being optional to think about.** A
    read-only key can no longer be the default advice for OANDA, because the desk
    needs a trading token. **Kraken now needs an order-capable key too** (owner
    decision, 2026-08 — the crypto desk), but only a **spot** one: the connector
    never sends `leverage`, so the key needs Query funds, Query open orders &
    trades and Create & modify orders, and explicitly **not** margin trading.
    Keep that narrowing — it is what bounds the worst case on a leaked key to
    the cash and coins in the account, with no liquidation path.
  (None of this is legal advice.)
- **Native shell = Capacitor wrap of the existing React app + a native SwiftUI
  WidgetKit extension** (widgets are always native Swift; no web/PWA widget exists
  on iOS). React Native/Expo is the heavier alternative.
- **API auth for mobile/widget = a per-user, revocable bearer token** (today every
  route is `httpOnly` cookie-only, which a widget extension can't use). Add a
  read-only `GET /api/widget/positions`-style endpoint scoped via `scopedTraderIds`;
  the widget stores its token in the App Group keychain.
- **Broker credential custody is the main real liability.** Prefer **read-only /
  OAuth-scoped** broker connections (Kraken supports query-only keys; OANDA tokens
  can trade — treat with care). The widget token must expose **display data only**,
  never broker keys or trade ability.
- **Before public launch:** Organization Apple account + D-U-N-S under the LLC;
  ToS + privacy policy; in-app account deletion (Guideline **5.1.1(v)**); AI-use
  disclosure; "informational only, not investment advice" disclaimers on
  advice-flavored features (session bias, AI coaching); and a
  **securities/fintech attorney** review of those advice-flavored features
  (potential RIA/CFTC-CTA exposure). Consider E&O/tech/cyber **insurance** to
  transfer residual liability. (None of this is legal advice.)

## Public/private deployment boundary

The product is being separated into three deployments:

- `apps/marketing` → `vitalistradingsystems.com`
- `apps/public-terminal` → `app.vitalistradingsystems.com`
- `apps/web` + `apps/api` → the private portal at `portal.vitalistradingsystems.com`

The public builds must never import or contain private portal, partner/team, administration, broker execution, private signal, or trade-distribution code. `npm run verify:boundaries` enforces the initial source/artifact boundary. The existing web/API application is private. Treat its trading, team, founder, admin and employee modules as **INTERNAL ONLY — PENDING LEGAL AND COMPLIANCE REVIEW**.

The code scaffolds separate deployments, private admission, cookies and configuration, but physical Railway services, public authentication, public/private databases, DNS, TLS and private MFA remain manual deployment blockers. Read `docs/architecture/public-private-separation.md` and `docs/implementation/public-private-migration-status.md` before changing this boundary. Never weaken it with a runtime feature flag or role-based redirect between applications.

### App icons — three deployments, two pieces of art, one crop rule

`scripts/generate-app-icons.mjs` rasterizes every home-screen and browser icon
in the repository. A development-time tool, not part of any build: install sharp
and run it after editing a piece of source art.

- **The private terminal** signs in under **gold VTS on orange**
  (`apps/web/public/brand/vts-app-icon.png`, 2026-09; navy before that), and is
  the only one of the three with a manifest and a maskable icon.
- **The landing page and the public terminal** — which is also where the demo
  runs — share the **navy** one, kept as its own copy under each app's brand
  directory the way the wordmark already is. The deployments do not share a
  public directory, so anything else would need a build step that crosses the
  boundary.

**A HOME-SCREEN ICON IS FULL BLEED. A FAVICON IS A CIRCLE.** That split is the
whole rule, and it was arrived at the expensive way: every icon was cut to a
circle in 7.96 on an owner instruction, and on an iPhone the result was a navy
disc sitting in a **black rounded square** (owner report with a photograph,
2026-09).

**iOS does not honour transparency in a home-screen icon** — it composites the
art over black and then applies Apple's own squircle mask — so a transparent
corner is a black corner, every time. Android's maskable slot is the same idea
from the other end: the launcher owns the shape and the art has to reach the
edges, so a circle there is cropped a second time into a smaller circle with a
transparent ring around it. **A browser tab is the one place the alpha
survives**, so that is the one place a circle is cut.

Nothing is lost on the home screen by going full bleed: iOS and most Android
launchers round the tile themselves, which is the rounded icon the circle was
reaching for. **Do not re-cut the app icons to circles** — the platform already
does the rounding, and the only thing a circle adds is the black corner.

**The mark must fit whatever crop its deployment applies**, and the script
measures rather than assumes: 32.4% of the width from centre against a 40%
budget for the orange art (which has a maskable variant, the tightest crop
here), 32.8% against 50% for the navy (whose only crop is the favicon's
inscribed circle). Art that outgrows its budget fails the script with the
remedy.

**The ground is read PER ROW, from that row's left edge**, so a vertical
gradient counts as ground rather than as the mark — the navy art is a gradient
and the orange one is flat, and a single corner sample only works for the
second. The tolerance separating ground from mark sits at 60 deliberately: the
two populations are far apart (95% of pixels within 4 of the ground, the mark at
225 and up) and at 24 a single corner pixel of noise read as the mark and put
the orange measurement at 70%.

**What each deployment links.** The private terminal's manifest is generated by
`vite-plugin-pwa` in `vite.config.ts`; its `index.html` carries the Apple touch
icon. The public terminal and the landing page each link a favicon and an Apple
touch icon and **no manifest** — neither is installable, and adding
`apple-mobile-web-app-capable` would change how they launch, which is a separate
decision. The landing page's head is emitted by `render.mjs`, so a link added
there has to be added to `src/index.html` too or `verify:marketing-render` goes
red. The employee portal links only the wordmark favicon and is deliberately not
installable.

## The public terminal (`apps/public-terminal`) and demo mode

The public terminal is the **same React app as the private portal, with a
different set of screens allowlisted and the risky halves replaced at the build
boundary**. It is not a rebuild and must not become one — a second design system
is the thing this arrangement exists to avoid.

### How the reuse works: seams, not forks

`apps/web/vite.public.config.ts` replaces a small list of private modules with
public adapters in `apps/public-terminal/src/adapters/` — `api/client`,
`auth/AuthContext`, `auth/access`, `privacy/privacy`, `legal/content`,
`meta/version`, `help/tutorials`, `auth/reviewMarks`, and `TvWidget`. Everything
else is the portal's own component, imported unchanged.

**Replace at the seam rather than filtering at render.** Two of those adapters
exist because a render-time gate is not the same as not shipping:

- **`publicTutorials.ts`** — the portal's How-to guides describe order
  placement, broker connections and strategy sessions. Filtering the topic list
  would still ship every body string in the bundle.
- **`publicReviewMarks.ts`** — the portal's `risk` notes are the owner's own
  compliance judgments, gated on `isFounder` at render. That is enough on the
  portal and is **not** enough in a bundle served to the public, where every one
  of those sentences is readable in the JavaScript. The public file carries no
  `risk` entry at all.

`scripts/verify-public-imports.mjs` holds the import allowlist, the adapter-seam
list, and the built-bundle denylist. **The denylist matches phrases, not
proximity**: the bundle is minified, so `/broker.{0,8}key/` fires on
`{key:'',label:'No broker'}`, which is a trade form and not a credential. A
guard that cries wolf is one people widen until it catches nothing. It runs
twice in `verify` — before the build for the source allowlist, and **after** it,
because on a clean checkout there is no `dist` for the first pass to read.

### Demo mode

**The demo is the showcase**, and it is a runtime mode rather than a build flag:
`?demo=1`, or "Explore the demo" on the sign-in card. One deployed bundle serves
both the demo and real accounts.

- **THE DEMO IS WRITABLE, and shared screens must not read `user.isDemo` to
  decide otherwise.** That flag means "a write here will be refused", which is
  true on the private terminal — `demoGuard` rejects every non-GET — and false
  here, where the demo reaches no service and answers writes out of module
  memory. So `adapters/publicAuth.ts` deliberately does NOT pass `isDemo`
  through to the screens; the DEMO bar and badge read `isDemo()` from
  `PublicRuntime` instead, so a visitor is still told plainly it is sample data.
  Hidden, those controls made the showcase a thing you could only look at —
  Investments, Budget, Net Worth and bug reports all had no add button.
  - **A control that appears and silently does nothing is worse than one that is
    missing**, which is exactly what the first one did: an added goal came back
    without the `pct` the screen renders with `.toFixed`, so the page threw and
    blanked. `verify:demo-writes` had only counted the goals. It asserts every
    field the screen reads now, and the demo visual spec drives all four
    formerly-hidden controls to the act they exist for.
- **Nothing is saved, because there is nothing to save.** The data is module
  state in `apps/public-terminal/src/demo/`. Leaving or reloading re-imports the
  module, so the reset is a property of where the data lives rather than a
  cleanup somebody has to remember.
- **`demoStore.ts` DERIVES every read from the seeded state** rather than
  storing payloads beside it, so a write and the figure it changes cannot
  disagree: log a trade and the win rate above it moves, because both come from
  one array.
- **The seed is plausible, not flattering** — a losing month, a prediction that
  did not come true, one that could not be settled at all, and a holding no
  provider can price. That last one is the terminal's own rule: a figure nobody
  could measure is counted and named, never valued at zero.
- **There is no evidence-only build.** There was, and it meant CI screenshotted
  a bundle nobody is served — it auto-entered the terminal, so the sign-in card
  was never captured and the demo data could not ship at all. The CI bundle and
  the deployed bundle are the same bundle; only the URL differs.
- **AI fails closed everywhere, the demo included**, until the provider
  migration. `publicApi.ts` refuses every AI-shaped method by name before the
  demo store is consulted, so a showcase never implies a capability that is not
  wired.


### THE DEMO'S MARKET BOARD IS READ LIVE, AND THE SERVER THAT SERVES THE BUNDLE IS WHAT READS IT

Owner request, 2026-09: the demo is shown in demonstrations, and the board has
to be current. It was not. Every figure on it was a literal in
`adapters/publicApi.ts`, and most of them were marked `source:'live'` with
`sample:false` — so during a demonstration the first screen a prospective
customer sees showed a Fed target policy had moved past, review dates a month
gone, and frozen quotes wearing the live styling. **That is the rule this
repository states everywhere else and broke here: a figure nobody measured must
never be reported as a measured one.**

- **`apps/public-terminal/server/` IS PUBLIC-BUILD CODE AND IS SCANNED AS SUCH.**
  `verify-public-boundary` now walks it beside `src` and `dist`; without that a
  whole directory of the public deployment would sit outside the guard. Nothing
  in it may name the portal, a private route or a credential — every source is a
  public one (the St. Louis Fed; Kraken's keyless public candles).
- **IT HAS TO BE SERVER-SIDE, and the reason is the CSP rather than the design.**
  The demo runs in a browser with no session, and `serve-static-app.mjs` sends
  `connect-src 'self'` plus TradingView and nothing else — so a browser-side
  fetch to a data provider is refused before it is made. The one process on the
  public side that can read a provider on the demo's behalf is the server that
  serves the bundle, which is where `GET /demo/market-data` is mounted. It is
  behind a `--market` flag (set in `deploy/railway/public-terminal.json`)
  because that script also serves apps with no board.
  - **`FRED_API_KEY` on the `public-terminal` service is what keys it**, and it
    is optional exactly as it is privately: the chart-download CSV is keyless and
    is the fallback, and a key that is set but REJECTED falls through to it. The
    key on the `marketing` service does nothing — nothing there reads one.
  - **The cache is warmed on boot and every ten minutes.** A cold process would
    make the first visitor wait on the providers, and during a demonstration the
    first visitor is the demonstration.
- **THE DEMO STILL REACHES NO ACCOUNT SERVICE, and that property is unchanged.**
  `publicRequest` still refuses from inside the demo; this is a same-origin,
  read-only route carrying no session, no account and nothing stored, so
  "leaving is the reset" is untouched — there is still nothing to reset.
- **A ROW NEVER CLAIMS MORE THAN IT HAS.** A provider that will not answer
  leaves its row on the bundled fallback with `sample: true` and the grey dot,
  and `sampleValues` says part of the board is sample; a provider that answered
  with an old reading says **Stale** (see below). **The
  fallback board in the bundle is ALL Sample but one row** — the New York
  session, which is the clock rather than a reading — and `verify:public-market`
  asserts exactly that, because the fallback is what a demonstration sees when
  the feed is down and it is where the original bug would come back.
- **A ROW IS LIVE, STALE OR SAMPLE — AND THE FIRST CUT ONLY EVER SAID LIVE.**
  An outside audit of the deployed board (2026-09) found the green **Live feed**
  dot on Treasury yields, FX and the VIX that were four days old.
  `MarketFreshness` has carried a `stale` value since the board was built and
  **nothing in the repository had ever set it**; `rowFor` stamped `source:
  'live'` on everything it could fill. `freshnessFor` now decides from the
  READING'S OWN AGE against a per-cadence window (`FRESH_FOR_MS`), so a Friday
  close read on Monday is live and the same figure still up on Thursday is not.
  - **It degrades honestly whatever the cause** — FRED lagging, a provider gone
    quiet, the cache holding an old answer. Nothing has to diagnose why.
  - **The date never moves, only the claim about it.** A stale row still shows
    the reading it actually has; what changes is that the board stops calling it
    current.
  - **A COIN IS STAMPED WITH WHEN IT WAS READ, NOT WITH ITS CANDLE**
    (`cadence: 'continuous'`). Kraken's last daily candle is the one still
    forming and its timestamp is midnight UTC, so stamping that prints a bare
    date over a price from minutes ago — which reads as a daily close. The row
    carries the ET time of the fetch, and its freshness window is hours.
- **THE FX ROWS SAY "NOON RATE" IN THE LABEL.** They are the Fed's H.10 noon
  buying rates — one published observation a day. "EUR/USD" alone on a market
  board is read as the price right now, and the review cycle underneath is not
  what anybody checks first. The private board's FX comes from OANDA and
  genuinely is a quote, which is why it carries no such qualifier and this does.
- **GOLD IS NOT ON THE BOARD, and that is this file's own rule being followed.**
  It shipped as a permanent placeholder reading "—", which the audit called
  broken and was right to: a dash in a price column reads as a fault rather than
  an absence, and it had no prospect of ever filling. Kraken's tokenized gold
  would price something close to it, but labelling PAXG as "Gold spot" is the
  same error as calling the Fed's broad basket DXY. **`SAMPLE_ROWS` is empty and
  nothing on the demo board is sample** — `verify:public-market` asserts it.
- **What the audit checked and found CORRECT**, so nobody re-opens it: the fed
  funds target and effective rate, CPI Y/Y, core PCE, jobless claims,
  unemployment, the S&P close, and the 10Y−2Y spread reconciling with the two
  yield rows above it. **CPI year to date** was queried and is unchanged: it is
  the private board's own `ytdIndex` (December's seasonally-adjusted index to
  the latest), and compounding the published rounded monthly changes instead
  accumulates a few hundredths — which is what the auditor did. Changing it
  would put the two boards' definitions out of step; raise it with the owner
  rather than editing one side.
- **THE ROW SET IS SHORT, AND WIDENING IT IS A DECISION.** The private board
  carries seventy-odd series through a reader this deployment may not import, so
  `marketFeed.mjs` copies the reader and **not** the catalog: seventeen showcase
  rows and only the three transforms they need (`level`, `yoy`, `ytdIndex`).
  Copying the whole catalog would be a mirror nobody could keep in step. A row no
  free provider covers (gold, the meeting odds) is **not added at all** rather
  than added as a permanent placeholder — the meeting-odds row is gone for the
  same reason it left the private board in 7.98.
- **The rules that make a figure right travel with it**, and each is pinned by a
  fixture proved to fail: a RATE moves by subtraction and a PRICE by percent; a
  period shorter than the publication cadence reads a flat zero rather than
  borrowing last month's move; look-backs anchor on the latest READING, not on
  the wall clock, except year-to-date which anchors on the calendar; the 10Y−2Y
  spread is the board's own two yield rows subtracted on a date join, so the
  three reconcile by construction; a range row refuses without its lower bound
  rather than stating policy as a point target; **Kraken answers HTTP 200 to a
  refusal**, so its `error` array is read first.
- **THE FOMC SCHEDULE NOW EXISTS THREE TIMES** — the private calendar, the public
  server feed (`server/fomcDates.mjs`) and the bundle's fallback
  (`FALLBACK_MEETING_DATES`). `verify:market-calendar` reads all three **as
  text** and fails when they disagree, because one is an `.mjs` outside that
  workspace and one is a non-exported const, and a check that can only see what a
  module exports has a blind spot exactly where a copy would hide. The runway
  guard covers all three at once.
- **`npm run verify:public-market` is offline and stays offline.** It proves the
  transforms, the change columns, the parsers, the payload assembly, the route
  wiring and the fallback's honesty. **What it cannot prove is that a provider
  knows a series name** — the fixtures are built from the catalog's own ids — so
  a name FRED does not publish passes here and comes back Sample in production.
  Only the deployed board establishes that.
- **THE ECONOMIC CALENDAR IS LIVE TOO, AND THE HEADLINES ARE NOT**
  (`server/calendarFeed.mjs`, `GET /demo/market-news`). The calendar shares a
  screen with the board — Market Data is its only home — so an invented one
  would be the only panel there with made-up dates on it; it reads Forex
  Factory's keyless weekly JSON, the same feed the private terminal ingests.
  **Headlines stay the bundled set**, each naming "Fictional Wire": a calendar
  is a schedule of public statistical releases, and republishing somebody's
  copy on a public marketing demo is a licensing question rather than a build.
  Releases carry **no explainer** — the private board's plain-language note is
  written by AI, which fails closed everywhere here — and an empty read leaves
  the bundled calendar up, because an empty schedule reads as "nothing is
  coming", which is a claim rather than an absence.
- **The capture suite deliberately runs WITHOUT `--market`**, so it screenshots
  the fallback and reaches no third party — the same rule that blocks TradingView
  and YouTube there. A green capture run says nothing about the live feed.

### The screenshot test is the evidence, so it has to assert something

`scripts/public-terminal.visual.spec.mjs` captures every retained page family at
1440 / 768 / 390. It asserts **no page error and real content**, not merely that
`#root` exists — a page whose tree threw still has a root, and a thrown render
leaves the root dead for every later hash navigation, so one broken screen
blanks every capture after it. That is not hypothetical: it shipped, and eight
screens were blank behind a passing test.

**IT BLOCKS TRADINGVIEW AND YOUTUBE OUTRIGHT, AND THAT IS A CORRECTNESS RULE
RATHER THAN A SPEED ONE.** The suite is usually written and run in an agent
sandbox with **no outbound access**, where those hosts simply fail — so it was
hermetic by accident, and two things silently depended on that. `waitUntil:
'networkidle'` settled only because nothing was ever connecting: on CI, which
*does* have outbound access, an embed holds its connection open, the page never
goes idle, and one navigation ate the whole 300s test budget while naming
nothing. And the watchlist case reads the config the tile hands TradingView —
when their script really loads it takes the container over and that config goes
with it, so the read came back empty and the test reported the wrong widget.
- **The consequence is the part worth remembering: the job was red in CI for
  four commits while every local run said 11/11 passed.** A green run in a
  network-blocked sandbox is not evidence about CI, and "it passes locally" is
  not a report that a suite is passing. Check the workflow run.
- So the hosts are named and aborted in a `beforeEach`, the capture loop waits
  for the screen to have painted rather than for idle (a screen that stays empty
  is what the blank list is for, and it names its route), and anything read
  straight after a state change — the workspace's own width — is **polled**, not
  read once. **Add a new embed's host to that list** rather than letting a third
  party decide whether the run passes.

### The public Live Wall is a board (`apps/web/src/public/PublicBoard.tsx`)

**Editable exactly as the private one is** (owner instruction, 2026-08): add,
move, resize and remove tiles. It was five fixed panels.

**IT IS NOT `ChartBoard.tsx`, AND THAT IS A BUNDLE DECISION.** That component
maps every tile kind there is through `tiles/index.tsx`, so importing it would
pull the order ticket, the desk tiles and the broker panels into a bundle served
to the public. What IS shared is everything that decides how a board looks and
behaves while it is being arranged — `BOARD_GRID_CSS` (extracted to
`workspaces/trading/boardGridCss.ts` for exactly this), the portal's own tile
components, `useContentWidth` — so this is the portal's board with a shorter list
of tiles rather than a second board.

**What is absent is absent by not being listed.** `PublicBoard` names the
fourteen kinds it can draw and imports only `MarketTiles` and `PersonalTiles`;
the desk tiles, the ticket and the team tiles live in their own files and are
never imported. There is no render-time filter to get wrong.

**Where the arrangement lives depends on who is looking**: a signed-in account
keeps it in the preferences blob; the demo keeps it for the visit and says so
rather than drawing a Save that would do nothing. The write is debounced and
flushed on unmount — a drag fires a layout change per frame, and leaving
mid-arrangement is when the write matters most. A phone renders one column and
never writes that back, the same rule the private board follows.

**THE PHONE COLUMN'S CELLS HAVE REAL HEIGHTS, and a tile fills its cell**
(owner report, 2026-09). A tile is `height: 100%` of its cell; on the grid the
cell is an absolutely sized box, so that resolves. The first phone pass gave
each cell only a `minHeight`, against which a percentage is `auto` — so every
tile shrank to its content, the chart and the stream slot collapsed to whatever
an unsized embed happens to be, and the rest of each cell sat empty UNDER the
tile's border: a squat chart and a sliver of stream slot each above a hundred
pixels of nothing. `phoneCellPx` now sets each cell to its tile's rows with a
six-row floor, in the pixels a grid cell of that many rows would be, and the
column reads top to bottom then left to right like the desktop board. **The
ticker tape is the one exception** (`isTickerStrip`, the private board's own
test): a strip of one fixed height that does not grow into a taller tile, so a
floor could only pad its cell — it takes its content's height, and the stacked
board's watchlist is three rows for the same reason. The visual suite asserts
on a phone that every cell is exactly its tile and that an embed host is handed
most of it, proved failing against a min-height cell (a 39px chart tile in a
430px cell).

### The public board's WORKSPACE is sizable, and it is the private setup

Ported from `ChartBoard.tsx` rather than re-invented (owner instruction,
2026-08): the constants, the clamps and the lock-before-you-size behaviour are
the same, because each of those rules cost a shipped bug to arrive at.

- **A column is a fixed slice of width, not a fraction of a fixed board.** Twelve
  columns is `baseWidth`, so eighteen asks the screen for half again as much
  room — the dotted box GROWS and the tiles keep their size. The private board
  shipped the opposite once: columns added *inside* a fixed width, so every extra
  column made all the others thinner and the whole board shrank. The browser test
  asserts the tiles' width holds while the box grows, and was proved failing
  against exactly that mistake.
- **`availWidth` is measured OUTSIDE the capped wall.** A board can never report
  space it is not allowed to occupy, so measuring inside the cap would make the
  ceiling the cap itself and the workspace could never pass twelve columns.
- **The workspace is LOCKED even in edit mode**; the pencil on the frame's corner
  is the only way in, and while it is unlocked the tiles freeze (`ws-sizing`).
  Escape locks the workspace before it leaves edit mode.
- **Growing the left inserts columns and shifts every tile right; shrinking only
  ever removes EMPTY columns**, clamped against the geometry recorded at
  pointer-down so a burst of moves cannot double-apply.
- **Phones never reach it** — the board flattens to one column and returns before
  any of this renders.
- The width is saved with the tiles: the stored wall is `{cols,tiles}`. A bare
  array from before the setting existed reads as twelve columns, which is the
  canvas every board was built on.

### The watchlist tile has TWO widgets, and the tile's SHAPE picks one

`scroll` is TradingView's ticker tape — a wide, short strip. `static` is the
market-quotes list, every symbol visible at once, one per row. The default board
had the tape in a tall narrow tile, where it clipped its own quotes at both edges
and scrolled the rest out of sight.

So the desktop board's watchlist is **static** and the stacked board's — full
width and short — is **the tape**, and `PUBLIC_TILES` carries the mode as a tile
default so a freshly added one lands correctly too. Asserted on the CONFIG the
tile hands the widget: TradingView's script does not load in CI at all, so a test
waiting for their iframe would prove nothing either way.

### The demo asks which device it is on, and there are TWO default boards

Owner instruction, 2026-08. Before the demo draws the terminal it asks one
question — desktop, or phone/tablet — and the answer picks the Live Wall layout
and whether the sidebar starts open. `PublicDeviceCard`, gated in `PublicApp`.

- **It is a QUESTION, not a measurement.** The viewport only decides which answer
  is marked as recommended. Somebody on a laptop showing the phone layout is a
  real thing to want, and that is also why `STACKED_BOARD` is a real
  **arrangement** — every tile twelve columns wide, one under another — rather
  than a narrow-screen rendering mode. A mode would only apply below a
  breakpoint, so the desktop visitor who asked for it would not get it.
- **It is a GATE, not a modal over the board.** The wall reads its tiles in a
  state initialiser, so a layout chosen after it mounted would never reach it.
- **`?device=desktop|mobile` answers it in the URL**, the same way `?sidebar=`
  already pre-answers the rail — a link opens straight into a layout, and the
  browser suites reach a screen without clicking through the door. `deviceLayout`
  is the one place an answer is turned into a board, so the URL and the card
  cannot mean different things. **A capture suite that forgets it does not fail
  fast**: `#root` is visible at the door, so the run just spends its budget
  waiting for a main column that is not there — five minutes instead of twenty
  seconds, naming nothing. That is why the page-family read is bounded.
- **Both layouts stay reachable** from the wall's own toolbar (`BOARD_PRESETS`),
  so the answer is a starting point rather than a setting.
- **The choice is module state and a real account is never asked.** Leaving is
  the reset, like everything else the demo holds; an account has a saved board
  and a saved sidebar, and a question at sign-in that overwrote them would be
  worse than unhelpful.

### The public top bar sizes itself in the COMPONENT, not in `public.css`

The shell is styled inline, so a rule in the stylesheet loses to the inline
value. The first phone pass put the bar's padding and its icon-only Help button
in a media query; neither applied, the row overflowed 390px, and flex compressed
the Help button to the width of its icon while the account chip hung off the
right edge. `PublicTopBar` reads `useResponsive` and branches its own styles, at
the same 768 the stylesheet uses for the drawer. **Only `.vts-clock-date` is left
in CSS** — the one element with no inline `display` to beat.

What the phone drops is either duplicated a tap away or was never readable in a
64px bar: the workspace half of the breadcrumb (it wrapped and squeezed the
SECTION name to an ellipsis, and it is the highlighted row in the drawer), the
search box, the clock's date line and its seconds, and the profile name.

**Two dead controls were fixed rather than hidden.** The notifications bell had
no handler and never did — the public terminal delivers no notifications at all,
so there was nothing for it to open, and it is **removed**. The account chip was
labelled "Account settings" and also had no handler; there is a settings screen,
so it now goes there. Both reached the shell the way the Help button does, by
event, because the bar sits above the router.

### The public shell's grid STATES its row, and that is what makes it scroll

`.vts-public-shell` is a two-column grid the height of the viewport with
`overflow: hidden`, and the main column inside it is the scroller. Left with an
implicit row, that row is `auto` and sizes to its CONTENT, so the column's
`height: 100%` resolved against a row as tall as the page rather than the
viewport — the main column grew to fit everything, the shell clipped the rest,
and **nothing on a desktop could scroll up or down** (owner report, 2026-09).
The phone layout is `display: block`, where 100% resolves against the shell
itself, so it scrolled fine and every capture in the visual suite is taken at
the top of the page, which is why nothing noticed. `grid-template-rows:
minmax(0, 1fr)` pins the row to the viewport. The visual suite now scrolls the
longest screen on both widths and asserts the column is no taller than the
window — proved failing against the old rule.

### Live streams show the SLOT in the public terminal

`StreamChannel.placeholder` (`api/types.ts`) means **no player is mounted for
this channel — draw the slot and say what would be in it**. Set only by the
public terminal, which has no YouTube key and does not embed a third party's
broadcast into a showcase; the private API never sets it, so nothing on the
private terminal changed.

- **`streamEmbed.ts` owns it**: `isPlaceholder` is checked first in `shouldPlay`,
  so no code path can mount an embed for one, and `STREAM_PLACEHOLDER_TEXT`
  ("Live stream plays here") is one string read by both render sites — the
  Market News wall (including its mini player) and the Live Wall's stream tile.
- **Nothing is marked `live`.** A fabricated live reading is the thing the
  terminal's own rules forbid, and a placeholder says "preview slot" rather than
  "unconfirmed" — the latter would imply we looked and could not tell.

### The early-access form says what happens to the address

The Privacy Policy on the public terminal is a pre-release SUMMARY and opens by
disclaiming itself — honest about a document nobody has written yet, and no use
whatever to somebody deciding whether to type their email in. But the form takes
real personal data from a real person and keeps a row for it forever.

So the binding statement lives **at the point of collection**
(`.vts-public-collect` in `PublicLogin.tsx`): what is kept, that it is used only
to say when Early Access opens, that it is never sold or shared, and how to have
it deleted. It is written to stand on its own whatever the summary says about
itself, and the live-account suite asserts it is on screen — a notice that can be
quietly dropped is not a commitment.

Styled slate rather than gold or amber on purpose: the sign-in card's other
blocks are offers — the demo door and the beta-access invitation — and this is
neither an offer nor a warning.

**THE "THIS IS NOT THE GROUP TERMINAL" NOTICE IS REMOVED AND IS NOT TO BE
REBUILT** (owner instruction, 2026-09). An amber card on the sign-in screen told
every visitor that group operations were unavailable and their features would be
"significantly reduced". It was written for the handful of people who might land
on the public terminal by mistake, and it was shown to everybody else — so the
first thing a prospective customer read was what the product does not have,
before they had seen what it does. The people it was for reach the private
portal by its own address.

`legal/content` is imported for the support address rather than hardcoding it, so
there is one home for it; that is why the module is on the public import
allowlist, and the build seam swaps it for `publicLegal.ts` as usual.

### The screenshot reader shows a worked EXAMPLE (`ScreenshotExample.tsx`)

The import panel asks somebody to hand over a picture of their trade history
before it will say what happens to it. "See an example" answers that first: a
drawn screenshot, the rows that come out of it, and what lands on the account —
**running no AI and calling no route on either terminal**. That is what makes it
usable in the public terminal, where AI fails closed until the provider
migration, and it is why an import refused with **501 opens it automatically**
rather than ending on "switched off". The example set is deliberately not
flattering: a loser, a scratch, and a duplicate shown as skipped rather than
quietly dropped.

### Admin editing inside the demo, without an Admin workspace

Owner instruction, 2026-08. The public terminal has **no Admin workspace and must
not gain one** — administration code is absent from the public bundle by
construction. So what is demonstrated is the administrative ACT, on the very
screens the notice appears on: post an announcement on Announcements, publish a
note on Patch notes. The screens are the portal's own.

- Both composers are gated on **`canManage` from the payload**. The private API
  sends it for announcements (admins) and does not send it at all for patch
  notes, which are published from Admin ▸ Patch Notes there — so the private
  Site Help is unchanged. The public API answers **false**: there is no public
  administrator, and a composer a visitor could post through is one anybody could
  post through.
- `publishPatchNote` is therefore **demo-only by construction** and is named in
  `verify:demo-coverage`'s `DEMO_ONLY` with that reason.

### What the public terminal does not have

Groups in every form (creation, invitations, chat, shared books, signals,
publishing, named-user routing), broker connections, order placement, live
balances, Funded Trades, Admin and Developer. Absent from the routes, imports
and bundle — not hidden by a role. Trading Notes stays, as a **personal record
with no control that can publish one**.

### The public API (`apps/public-api`)

Its own service, database (**Postgres**, via `pg`), cookies
(`vts_public_session_v1`, path `/public`) and secrets. Early access is
unauthenticated by necessity — the person asking has no account — so it is rate
limited, bounded in what it stores, and answered identically whether or not the
address is already on the list. The server listens only when it is the process
being run, so a route can be tested by importing it.

**Eleven record families have real storage** (2026-08): budget, to-do,
investments, net worth, trading notes, study games, flashcard sets, study
presentations, support, the hand-kept trade log and the funded book. Everything
else a public screen can reach is either refused as AI or deliberately unbuilt —
see the coverage check below, which is what keeps that sentence true.

**EVERY ROUTE RESOLVES THE ACCOUNT FROM THE SESSION.** No route anywhere takes a
"whose" parameter, and an id the caller does not own answers **404 rather than
403**, so a guessed id cannot be probed for. There is no team dimension and no
admin surface on the public side at all — which is why, for instance, a support
reply can only ever be posted as `user`: a client must not be able to post a
message that renders as staff having answered.

**THERE IS NO PUBLIC SIGN-UP, SO ADMITTING SOMEBODY IS ITS OWN PATH**
(`src/admit.ts`, `npm --workspace @vts/public-api run admit`). A visitor asks
through the early-access form and an operator lets them in. It is the **only**
supported way to create an account, because a hand-written row is an account
that can never sign in in three separate ways, **all three of which answer with
the same generic 401 a wrong password does**: `password_hash` is
`scrypt$<salt>$<digest>` rather than a password; `force_password_change` without
an unexpired `temporary_password_expires_at` is refused **outright** by `login`,
so the setting that sounds like the safe one locks the account instead; and a
password below the terminal's own rule signs in and can then never be **changed**,
since `changePassword` validates the new one against a rule the old one never had
to meet. The password is printed once and is not recoverable.
- **It deliberately does NOT force a change.** The window a forced change needs
  is fifteen minutes — right for a password the terminal itself just emailed,
  wrong for an invitation read the next morning.
- **MAIL IS A HARD DEPENDENCY OF SIGNING IN AT ALL.** Every login is gated on an
  emailed code and `SmtpPublicMailer` has **no fallback that logs it**, unlike
  the employee portal's. With `PUBLIC_SMTP_URL` pointing at nothing, a correct
  password reaches the second factor and stops there, for everybody, permanently.
- **Admitting somebody DELETES their beta-access request**, after the account
  exists rather than before, so a failed admit leaves the lead for the next
  attempt. That is the earliest of the three ends a request can come to — the
  other two being the person asking for deletion, and the sweep below.

**THE CLICKWRAP IS A GATE, AND THE RECORD IS THE POINT OF IT**
(`src/legalDocuments.ts` + `public_document_acceptances`, migration `0016`;
routes `GET /legal/documents` and `POST /legal/accept`; the screen is
`apps/web/src/public/PublicLegalGate.tsx`). A "Terms" link in the footer is a
**browsewrap** and is worth close to nothing — nobody can show the person ever
saw it. What makes a **clickwrap** worth something is that there was a moment, an
affirmative act, and a row saying which words were on the screen.
- **THE GATE IS IN `authenticatedAccount`, WHICH IS WHY IT CANNOT BE FORGOTTEN.**
  Every authenticated route resolves its caller through that one helper, so a
  route added tomorrow inherits the refusal. **403**, not 402 or 428 — nothing
  here is for sale and nothing is conditional. The client never needs to read
  that refusal: `legalAcceptanceRequired` rides the session payload beside
  `passwordChangeRequired`, so the shell draws the gate instead of a terminal
  whose every request would come back 403.
- **WHAT STAYS REACHABLE WHILE THE GATE IS UP IS EXACTLY WHAT DOES NOT USE THAT
  HELPER**, and that is not a coincidence: reading the session, signing out,
  changing a forced password and asking to delete the account all call the auth
  service directly. **A gate somebody cannot leave is not a consent mechanism** —
  declining and wanting out is a legitimate combination.
- **THE SERVER HOLDS A VERSION AND A HASH, NEVER THE DOCUMENT TEXT.** The Terms
  and Privacy Policy live in the public terminal's bundle
  (`adapters/publicLegal.ts`); this is a different deployment and may not import
  from it. **`npm run verify:legal-hashes`** recomputes the SHA-256 of the
  canonical rendering and fails when it disagrees. **The fix is never "update the
  hash"** — it is bump the version AND the hash, which re-prompts everybody,
  because people who agreed to the old wording have not agreed to the new one.
  That is the property worth protecting: **the terms cannot be quietly changed
  underneath somebody who already agreed.**
- **THE ACKNOWLEDGEMENT IS THE EXCEPTION AND IS SERVED IN FULL**, because it is
  owned here and hashed from the same constants it is served from — what was on
  the screen and what the record pins are provably one thing. The two documents
  are only described.
- **IT IS AN ACKNOWLEDGEMENT, NOT AN AGREEMENT TO BE BOUND, AND THAT IS
  DELIBERATE.** The public Terms and Privacy Policy are still pre-release
  summaries that say outright they create no obligations; presenting those under
  "I agree to be bound" would be a claim the documents contradict, and a
  clickwrap whose own text is untrue is worse than none. What IS affirmatively
  agreed to are the four statements that stand whatever state the documents are
  in — informational only, risk of loss, not a broker/adviser/custodian, and the
  broker's own records are the authority. **When the operative documents are
  published, `ACKNOWLEDGEMENT_VERSION` goes to '2' and everybody is re-prompted.
  Nothing else in the mechanism moves.**
- **THE CLIENT SENDS NOTHING.** `POST /legal/accept` takes no body: the version
  and hash written are the server's own, because a client-supplied hash is a
  record of whatever the client felt like claiming.
- **APPEND-ONLY, ONE ROW PER DOCUMENT.** Accepting v1 and later v2 leaves two
  rows — "when did they agree to the current terms" and "did they ever see the
  old ones" are different questions. Accepting twice writes neither a row nor a
  second audit event. Nothing updates or deletes a row; the account cascade is
  the only thing that removes one, and **the retention sweep must never take
  one** — it is evidence, not spent authentication material.
- **`admitAccount` DELIBERATELY DOES NOT TICK THE BOX.** An operator letting
  somebody in cannot consent on their behalf; if admission wrote these rows the
  gate would exist and nobody would ever meet it. The test fixtures, the
  live-suite seed and `verify:public-wiring` write them explicitly, and that last
  one is the cautionary case: **403 is not 404, so the wiring check went green
  proving nothing the first time the gate was up.** Its seed helper now fails
  loudly on any non-2xx.
- **The "is this account current?" answer is cached in-process, one way only**
  (`accepted` in `auth.ts`). `session()` runs on every authenticated request, so
  reading the rows there put an extra query on every request in the service.
  Caching only the CURRENT answer is safe: acceptance is append-only, and the
  required set is a module constant, so the only thing that can make a current
  account owe something again is a deploy — which restarts the process. **"Owed"
  is never cached**, because that is the answer that changes.
- **The documents are readable FROM the gate**, rendered by the same
  `LegalDocBody` the Site Help screens use. Somebody gated out of the terminal
  cannot navigate to Site Help, and "agree to a document you cannot open" is the
  failure this exists to avoid.
- The live-account suite seeds a SECOND account that has never ticked, which is
  what proves the gate stands in the browser; the demo never reaches it at all.
- **THE TWO SERVICES MUST DEPLOY FROM THE SAME COMMIT, and nothing enforces
  that.** The document TEXT ships in the public terminal's static bundle; the
  VERSION and HASH live in the public API. They are separate Railway services
  (`deploy/railway/public-terminal.json` and `public-api.json`), so a deploy
  that moves one and not the other puts a reader in front of one wording while
  the record pins another — the exact failure the hash exists to prevent, at
  deployment level rather than code level. **Neither order is safe**: a newer
  bundle means new text under an old hash, a newer API means a new version
  recorded against text the reader never saw.
  `verify:legal-hashes` checks the REPOSITORY and cannot see this.
  - The mitigation today is operational: deploy both together, and treat a
    legal-document change as a two-service release.
  - **The real fix, before public launch:** have the gate hash its own
    rendering in the browser and compare it with the hash the API is serving,
    refusing to offer the box on a mismatch ("this terminal is being updated")
    rather than recording one. That closes the window instead of asking
    somebody to remember it. It needs a browser-safe copy of
    `canonicalLegalText` plus `crypto.subtle.digest`, i.e. a documented mirror
    like `sizing.ts`, with a `verify:*-mirror` check.
  - The demo never reaches the API, so none of this touches it.

**THE RETENTION SWEEP IS WHAT MAKES A SENTENCE IN THE PRIVACY POLICY TRUE**
(`src/retention.ts`, `sweepExpired` in both stores). A published document saying
beta-access requests are removed after six months is a **feature, not a wording
choice**: until something deletes them the document is aspirational, which is
the one failure mode a privacy policy must not have.
- **Two kinds of rule, kept apart.** The **beta-access cutoff** (180 days) is a
  commitment to somebody who is not a customer and whose address is the only
  thing VTS holds about them. The **spent-authentication cutoff** is hygiene:
  an expired session, a used sign-in code, a rotated trusted device and a spent
  deletion link are already refused by name in `auth.ts`, so removing them
  changes no answer the terminal gives — only how much dead material a database
  copy contains.
- **EXPIRED OR SPENT, NEVER MERELY OLD.** A trusted device is deliberately valid
  for thirty days and a session for twelve hours, and the sweep must not become
  a second, shorter opinion about either. There is no grace period, because
  there is nothing to be gentle about — a request that already read a row is
  unaffected, and one that reads it afterwards gets the refusal it would have
  got anyway.
- **IT IS NOT GATED ON PRODUCTION**, unlike every watch in the private API.
  Those send notifications and spend money at a provider; this one deletes rows,
  and code that deletes rows must not have its first ever execution be against
  the one database that matters. It starts with the server, runs once
  immediately, then every six hours, on an unref'd timer.
- **A failed pass is logged, never thrown.** The terminal works perfectly well
  with a day of dead rows in it and the next pass clears them —
  `public_api.retention_failed` is what makes a sweep that has been failing for
  a month findable.
- **`public_recovery_events` is swept and nothing writes one.** The table
  survives from the first migration and no code path has ever inserted a row;
  the DELETE is there so a future writer inherits the rule, and the Postgres
  suite hand-inserts a row so the statement is actually proved rather than
  merely present.
- **EVERY CUTOFF IS TESTED ON BOTH SIDES**, and the six-month period is written
  out as a literal in the test rather than read from `RETENTION` — it is a
  sentence in a published document, so shortening the constant has to fail a
  test rather than silently move the goalposts with everything measured against
  it. All seven DELETE predicates were proved load-bearing by breaking each one
  in turn.
- Audit events are deliberately **not** swept: they are the one intentionally
  retained table, and the Privacy Policy says so.

**THE INVESTMENTS WORKSPACE READS THREE THINGS THAT ARE NOT ON THE PORTFOLIO
PAYLOAD** — `/investments/performance`, `/investments/dividends` and
`/investments/contributions`, each its own route. They were built and served on
the private side and never ported, so Performance, Dividends and Contributions
rendered **permanently empty on a real account while the demo showed them
full**, which is the worst way round: the showcase proves a screen the first
customer finds blank. The rules travel with them — a **trailing** yield rather
than a forward one, a tax year with no catalog entry reporting **no limit**
rather than the nearest year's, an employer match reported **beside** the
contribution and never added into it, and the performance window's contribution
figure taken as the difference between the running totals at each end so it
reconciles with the line above it.

**THE PORTFOLIO PAYLOAD'S SHAPE IS THE CONTRACT, NOT JUST ITS FIGURES.**
`flags` sits **inside** `allocation` (beside `byClass`/`bySector`/`byRegion`),
and `livePricesConfigured` and `asOf` are required. The public payload had
`flags` as a sibling, so `portfolio.allocation.flags.length` threw and the
**Investments Overview — the workspace's landing page — was blank for any
account that actually held an investment account.** It rendered perfectly while
empty, which is why nothing but a real account with rows in it could find it.
`apps/web/src/api/types.ts` is the authority on that shape for both services.

**THE TO-DO PAYLOAD'S `tag` IS LOAD-BEARING AND MUST BE `'trading'`.** The
screen renders only sections carrying it and adds new items to the first one
that does, so a null tag is a To Do list that shows nothing whatever is in it
and cannot be added to either. Privately the tag marks the desk's own list among
several; publicly there is one To Do screen and one list, so every section
belongs on it. The demo already set it, so this worked in the showcase and was
dead for a real account — the same shape as the Investments screens above, and
the reason the live-account suite exists.

**SIGNING OUT IS `signOut` IN `adapters/publicAuth.ts`, AND IT HAS TO REVOKE.**
There was no control for it anywhere in the public terminal and the adapter's
`logout` was a stub returning nothing, so an account, once in, could not get out
— on a shared computer, for the twelve hours the session cookie lasts. The
`/auth/logout` route and `publicAuth.logout()` both existed the whole time;
only the wiring and a button were missing. The demo is the one case that reaches
no service: leaving it is dropping the module flag, which a load of the bare URL
does. The live suite's last test asserts the session answers **401 afterwards**,
because a screen that merely forgot you is not a sign-out.

**Two adapter files carry the seam and they are not the same job.**
`apps/public-terminal/src/adapters/publicApi.ts` maps a portal `api.*` call to a
public route; `apps/public-terminal/src/demo/demoStore.ts` answers the same names
out of module memory. **The demo is checked FIRST** in the proxy — `publicRequest`
refuses to reach the service from inside it — which is why the live map sits
behind that branch rather than beside the market-data methods. Putting a record
method on `baseApi` breaks the demo, because anything there is returned before
the demo branch is reached.

**Three checks keep the public terminal honest, and each was proved to fail
rather than observed to pass:**

- **`verify:demo-coverage`** walks the public screen tree, collects every `api.*`
  call reachable from it, and requires each to be answered — live, demo, refused
  as AI, or NAMED in the script with the reason it is deliberately unbuilt. It
  catches **two** classes: nothing answers it, and *only the demo* answers it.
  The second is the expensive one — it works in the showcase and 404s for the
  first real customer, so the screen that was the proof the product works is the
  screen that breaks. The named lists are the point: a gap somebody decided to
  leave is fine, a gap nobody knows about is not.
  **It matches `api` and the method name across a LINE BREAK**, which is not a
  detail: `api\n  .investmentPerformance(days)` is ordinary formatting, and
  requiring the dot to be adjacent made four whole screens invisible to this
  check — every one of them demo-only, which is the class it exists to catch.
- **`verify:demo-writes`** drives every demo write to the act it exists for,
  asserting on the field the SCREEN destructures. This is the half a screenshot
  test cannot see: a capture asserts a page rendered, not that pressing "add" on
  it did anything. The whole Investments workspace shipped broken behind a
  passing screenshot because an unhandled name answers with an
  empty-but-generic payload, so `const { portfolio } = await api.create…()`
  destructured `undefined`.
- **`verify:postgres`** applies every migration to an empty schema and drives one
  round trip through each record family against a real database. Its own CI job
  with a Postgres service, separate from `verify`, which deliberately needs
  nothing. It is NOT a second copy of the behavioural tests — those belong with
  the memory store, where they are fast and total. What is checked here is only
  what the memory store cannot: that the statements are valid, and that what
  goes in comes back out as the same shape. **Assert every column on the way
  back, not the few a summary happens to use** — the first version missed a
  wrong alias because the win rate it checked was computed from prices.
  It also drives an **admitted account through the real login, the real emailed
  code and the real session lookup** — the one thing that can tell an account
  that works from one that only looks like it does — and that is what found the
  fault where `consumeRateLimit` bound a `limit` parameter its SQL never
  referenced, which Postgres refuses to type. **Every rate-limited route threw
  against a real database**: sign in, the second factor, recovery and early
  access, i.e. every way in, on a store the suite had otherwise exercised
  happily because it seeded its session directly instead of logging in.
  It ends by asserting **every statement in the store has actually executed**,
  through a Proxy that records each call, with a named exemption list. That is
  what turns the above from a lucky find into a rule: **29 statements had never
  run** when it was first switched on — every UPDATE and every DELETE in the
  whole API, the market-data layout, the password change, and the early-access
  upsert the marketing site's own form posts to. `this` is bound to the proxy so
  a helper the store calls on itself is recorded too, and the list is checked
  for STALE entries as well as missing ones — an excuse that is no longer true
  hides the next real gap.

- **The live-account browser suite** (`scripts/public-terminal.live.spec.mjs`,
  its own CI job) drives the public terminal as a REAL SIGNED-IN ACCOUNT against
  a real server and a real database. Every case asserts that data which was
  seeded is ON THE SCREEN — a blank page passes "the root is visible", and only
  the trade's own instrument proves the payload arrived and was understood.
  **Its `pageerror` listener is removed again after each screen**: left
  attached, an error thrown late lands in whichever arrays are still listening
  and gets reported against a screen that did not cause it, which sent one chase
  after the wrong file.
  **It serves HTTPS**, with a throwaway self-signed certificate, because the API
  refuses a non-HTTPS entry in `PUBLIC_ALLOWED_ORIGINS` outright. Over plain
  HTTP the browser's Origin matched nothing and the origin guard refused **every
  write before it reached any code** — invisibly, because the suite was
  read-only at the time, so the first write test added to it failed for a reason
  that had nothing to do with the write. It also drives one write THROUGH THE
  UI and re-reads it after a reload: the demo answers writes out of module
  memory and the API's own tests post to the routes directly, so neither can see
  a screen that destructures a key the write's response does not carry. Three
  writes are driven now — a budget category, a prediction and an investment
  account — and after the last one **every screen in that workspace is opened
  again**, because the Investments screens share one portfolio snapshot: a write
  answering with a shape they cannot read takes THEM down rather than the screen
  that made it, which is how the Overview fault stayed hidden.
  **Signing out consumes a session**, so the seed makes a SECOND one for that
  test to burn and the test skips with its reason when that one is already spent
  — otherwise a local re-run fails on a test that is working correctly. CI
  seeds before every suite, so it always runs there.
  Two things about the harness that were each wrong once and are easy to get
  wrong again. **Opening a screen goes via `about:blank` first**, because
  navigating to the URL the page is already on — same path, same hash — is a
  same-document navigation the browser does not reload for, so every "and it is
  still there after a reload" assertion was reading the DOM already on screen.
  And **cross-device state is checked in a SECOND BROWSER CONTEXT, polled**: the
  study player keeps its own copy on the device and syncs it up, so a reload in
  the same browser shows the count back whether or not the server was ever told
  (that test passed with the save path broken until it was written this way),
  and the account's saved progress is a second request behind the deck, so
  reading once races the hydrate.

- **`verify:limits-mirror`** compares the IRS contribution limits in
  `apps/api/src/investments/limits.ts` against the copy in
  `apps/public-api/src/investmentLimits.ts`, line for line. The public API is
  its own service and may not import from the private one, so the catalog is
  copied; nothing in either build would notice them diverging, and it is the one
  figure here where being wrong means somebody over-contributes on the strength
  of a number that looked right on their screen.

- **`verify:public-wiring`** reads every path OUT OF the adapter (about seventy) and calls
  each against a real server on a real database, because both halves are written
  by hand and nothing else compares them: the adapter is not typechecked against
  the routes, the demo never reaches them, and the API's own tests write the
  paths a second time. Only a route-not-found counts — a 400 means the route is
  there and disliked an empty body.

- **The `live-account` CI job** drives the terminal as a real signed-in account
  against the real API and a real database, and asserts that SEEDED DATA IS ON
  THE SCREEN rather than that the page rendered. The demo job cannot see this: a
  field the server spells one way and a component reads another renders as an
  empty list, never as an error, and a blank page still passes "the root is
  visible". Proved by renaming a payload key and watching exactly one test fail.

**`npm run db:migrate:public` is the runner**, idempotent, on the API's start
command so every deploy applies what is pending. It **refuses to run against a
database holding non-`public_*` tables** — that is the private database's shape,
and pointing it there is the worst thing the script could do. Every public table
is prefixed for exactly that reason, and `verify:migrations` enforces it across
**all** migrations (it read the first two by name, so everything added later was
covered by none of its guards).

`docs/implementation/public-launch-runbook.md` is what is left to provision, all
of which needs a Railway account and a domain.

## THE SITE EDITOR — vitalistradingsystems.com, EDITED FROM THE PRIVATE PORTAL

Owner request, 2026-09: the marketing landing page gets the same editing tool
the owner's portfolio has (`andrewr92896-ship-it/andrewramey-admin`), living in
its own **founder-only workspace on portal.vitalistradingsystems.com**. The
standing rule that came with it: **a feature added to either editor is added to
the other.** The two are separate codebases with the same shape, so parity is a
matter of making the same change twice — see the file map below for where each
half of a feature lives here.

**THE LANDING PAGE DID NOT CHANGE, AND THAT IS CHECKED, NOT PROMISED.** The
words moved out of `apps/marketing/src/index.html` into a document
(`apps/marketing/render/seed.mjs`) and one function turns that document into the
page (`apps/marketing/render/render.mjs`). `npm run verify:marketing-render`
renders the seed and compares it with `src/index.html`, whitespace between tags
collapsed, so the page cannot drift from the hand-written file without a check
going red. **`src/index.html` stays in the tree as the thing the check compares
against**; the server no longer serves it.

- **The top bar carries the signature logo, not a typed wordmark** (owner
  instruction, 2026-09): `apps/marketing/src/brand/vitalis-wordmark.png`, a copy
  of the same file the terminal signs in under, served by the marketing server
  from its own `src` like the stylesheet. The document's `bar.mark` /
  `bar.markEm` still exist and are the image's ALT text — the editor labels
  them as such, so nothing is typed into a field that is never drawn.
- **The renderer is plain JavaScript with no dependencies and no DOM**, on
  purpose: it runs on the marketing server per request (a service with no build
  step), in the portal's preview page in the browser on every keystroke, and in
  Node against the file. Every value is escaped on the way in. `render.d.mts`
  describes it for the two TypeScript importers; keep the two in step.
- **The marketing service is a small server now** (`apps/marketing/server.mjs`,
  start command in `deploy/railway/marketing.json`, health at `/healthz`). It
  reads the PUBLISHED document off the portal's public route, keeps the last
  good one, and renders the page from it; **with `SITE_CONTENT_ORIGIN` unset or
  the portal unreachable it serves the seed — today's page.** The portal is
  ASKED, never imported: `verify-public-boundary` still forbids private code and
  the portal's hostname in the marketing sources, and the origin is an
  environment variable for exactly that reason. It also proxies `/files/<slug>`
  from the portal so an uploaded image is at the site's own address, and the CSP
  gained ONE host — `www.youtube-nocookie.com` in `frame-src`, for the video
  block. `verify:marketing-server` drives it as a process.
  - **To deploy it:** set `SITE_CONTENT_ORIGIN=https://portal.vitalistradingsystems.com`
    on the Railway marketing service. Nothing else changes; without it the
    site is exactly what it was.
- **The private API holds the document** (`apps/api/src/siteEditor/service.ts`,
  routes in `routes/siteEditor.ts`, migration `0140`): a DRAFT the editor writes
  on Save and nobody else sees, what is PUBLISHED, the last twenty saves, and
  uploads as bytes in SQLite (no blob store here; the precedent avatars set).
  **Keyed by site**, so a second site is an entry in `SITES` and a renderer of
  its own. The validator is the RENDERER'S — imported from `apps/marketing` — so
  the one function that decides whether a document can be drawn decides whether
  it can be saved. Everything under `/api/site-editor` is `requireFounder`; the
  two routes under `/api/public/site/:site` are what the SITE reads and serve
  only what is published. `db:check-site-editor` walks it (in `verify:db`).
- **The workspace** (`apps/web/src/workspaces/site/`, key `site`, founder-level
  in `auth/access.ts`, one lazy chunk) is the portfolio admin's editor brought
  across: three states (working / saved / published), undo and redo on the
  keys, Revert / Save / Deploy with confirmations and Railway's deploy purple,
  the last twenty saves, export and import, the file picker with open /
  download / preview behaviours, the collapsible section list, drag-resizable
  panes, and one Add menu on every section offering the site-wide blocks —
  card, image, video (any YouTube link), text, callout. `siteApi.ts` keeps the
  admin's method names so a fix made in one editor is the same diff in the
  other. `SectionForm.tsx` mirrors what `render.mjs` draws — the portfolio
  editor's lesson about fields that are typed into and never drawn.
- **Two section types were added since, on the parity rule** (2026-09).
  **Certificates (`certificates`)**: items carry `imgSrc`, `title`, `meta`,
  `credential`, `href`/`linkLabel`, and the renderer sorts them — a badge is a
  tile that is one link, the whole of it, so the badge is what confirms the
  completion and the address is never printed; no badge is a row under the
  tiles with the same link written out. `certificates()` in `render.mjs`,
  `.certs` in the stylesheet, `CERTIFICATE` in `SectionForm.tsx`, spec F2.
  **Image slideshow (`gallery`)**: slides are items with `imgSrc`, `alt`,
  `title`, `caption`; the section carries `imgFit` and `thumbs`. The page is
  static HTML, so the player is **`apps/marketing/src/slideshow.js`** — plain
  JavaScript, one file, run in two places: the site links it as a module
  script only when a visible slideshow is on the page, and `sitePreview.ts`
  imports `mountSlideshows` and calls it after every re-render, so the preview
  and the site cannot move differently. Every slide is in the markup with all
  but the first `hidden` (readable with scripts off; a hidden lazy image is not
  fetched), the image is a `data-preview` link so `viewer.js` is the lightbox
  (a page with a slideshow links the viewer too), and the link and image are
  `draggable="false"` because a native drag starts after a few pixels and
  cancels the pointer events a swipe is read from — the swipe test failed on
  exactly that. `gallery()` in `render.mjs`, `.slideshow` in the stylesheet,
  `SLIDE` + `FrameField` in `SectionForm.tsx`, spec F3.
- **The preview is a third HTML entry** (`apps/web/site-preview.html` →
  `src/sitePreview.ts`), for the reason the portfolio settled: the page's
  layout resolves against the VIEWPORT, so it has to be its own document in an
  iframe. It imports the marketing renderer and the marketing stylesheet — no
  second renderer to drift — and points `/files/` at the portal's public file
  route, since `/files/` is the site's proxy and does not exist here. The
  editor POSTS its working state in. `server.ts` serves it by hand with
  `no-store` and, for this ONE path, `frame-ancestors 'self'` instead of
  `'none'` — the global header would otherwise block the editor framing its
  own preview. It is kept out of the service-worker precache like the employee
  entry.
- **Down for maintenance is a fourth screen, Settings**, the portfolio admin's
  control brought across: the checkbox STAGES and Apply commits, the state line
  reports what is IN FORCE and never what is staged, and the switch is one
  column on `site_documents` (migration `0141`). The site reads it off
  `GET /api/public/site/:site/state` — **the only route that counts as the site
  checking in** (`notePoll`), because the content route is read for a
  different reason and counting it reported a healthy link while the
  maintenance half was failing in the portfolio admin. Three rules, all the
  portfolio's: **the site FAILS OPEN** (`maintenanceOn()` in `server.mjs`
  treats an answer older than six polls as off, so the portal being
  unreachable is never what keeps the site down — proved in
  `verify:marketing-server`); it deletes nothing; and the notice is a **503
  with `Retry-After` and `no-store`**, self-contained, with `/healthz` exempt
  so the deploy that enables it cannot roll itself back. The notice's markup
  lives in `server.mjs` and its React twin in `Settings.tsx` ("what visitors
  would see"); keep the two in step by hand.
- **`scripts/site-editor.browser.spec.mjs`** drives all of it in Chromium against
  the real API and the real marketing server (needs Playwright; not in
  `verify`). Two things it caught that a typecheck cannot: Fastify refuses a JSON
  content-type with no body, so a body-less POST (publish, revert, delete)
  answered "Bad Request" — `siteApi.ts` sets the header only when there is a
  body; and the seeded founder meets the terms gate first, which the test
  accepts through the API the way the app does.

## Architecture

Monorepo, **npm workspaces**:

- `apps/api` — **Fastify + TypeScript** backend. Holds all secrets; the browser
  never sees broker keys, the Anthropic key, or password hashes. In production
  it also serves the built web app (`@fastify/static`) — one process, same
  origin, so the API and site share a host.
- `apps/web` — **Vite + React 18 + TypeScript** frontend. Styling is
  inline-style / theme-token based (`src/theme`), **not** a CSS framework.
  **Two build entries, not one:** `index.html` → the main terminal, and
  `employee.html` → the separate **Employee Portal** at `/employee` (see its own
  section below). They share design tokens and the `Icon` component and nothing
  else — no employee code ships in the main bundle, and vice versa.

Tech:

- **DB:** SQLite via **Drizzle ORM** on the **libsql** driver (`@libsql/client`);
  file at `DATABASE_URL` (default `file:./data/vts.db`; prod uses a Railway
  volume). Schema in `apps/api/src/db/schema.ts`; ~129 SQL migrations in
  `apps/api/migrations` (`db:migrate`), seed with `db:seed`. Per-user deletes
  are **explicit** in `admin/service.ts` (no `ON DELETE CASCADE`) — when you add
  a per-user table, add it to that delete list too.
- **Auth:** username/password, **argon2id** (`@node-rs/argon2`), signed
  **httpOnly** session cookies, role-based access. See `apps/api/src/auth`. The
  Employee Portal has its **own, separate** session system
  (`apps/api/src/employee`) — the two never grant each other anything.
- **AI:** Claude via `@anthropic-ai/sdk`, server-side only (`apps/api/src/ai`).
- **Secrets at rest:** broker credentials are AES-256-GCM encrypted
  (`security/secretbox.ts`).
- **Notifications:** web push (VAPID, `web-push`) and **Pushover**. Both are on
  `requireMarkets` (**signed in**), deliberately **not** the Advanced Trading
  opt-in: price alerts are included with every account, and
  gating the delivery channel behind the desk left a user without the desk able to set
  an alert and never be told it fired.
  - **The SERVER guards are still exactly that. The SCREEN is not** (owner
    instruction, 2026-08). Every alert control now lives on **Advanced Trading ▸
    Alert Settings**, and that workspace is an opt-in — so an account without
    the desk can no longer *reach* the free web-push and price-alert controls,
    even though the routes behind them still answer any signed-in caller. That
    is a deliberate trade the owner made to get one home for alerts instead of
    three, and it is the one thing to revisit at public launch: the guards are
    already right, so the fix would be a reachable second entry point rather
    than a server change. **Do not "correct" the guards to match the nav** —
    they are the half that is correct.

### Where things live

- API modules: `apps/api/src/{admin,ai,auth,badges,chat,demo,earlyAccess,employee,feedback,features,legal,messageTemplates,notifications,patchNotes,security,settings,studies,support,teams,todo,trading,userTeams}`.
  Routes in `apps/api/src/routes/*`, registered in `server.ts` (health, auth,
  admin, earlyAccess, brokers, trading, tradeDesk, webhooks, tvWebhook, todo, ai,
  chat, feedback, features, studies, push, pushover, content).
- Web shell: `apps/web/src/components` (`Portal.tsx` is the router/shell,
  `Sidebar.tsx`, `TopBar.tsx`, `AskClaudePanel.tsx`, `TeamChat.tsx`,
  `UpdatePrompt.tsx`, `InstallPrompt.tsx`, …).
- Web features: `apps/web/src/workspaces/{trading,investments,studies,myportal,admin,help}`.
- Employee Portal web app: `apps/web/src/employee/*` (its own entry, API client,
  shell and screens) — a separate bundle, see its section below.
- Web API client: `apps/web/src/api/client.ts` — one flat typed `api` object;
  every call is cookie-authed (`credentials: 'include'`), root-relative `/api`,
  throws `ApiError { status }` on non-2xx.
- **Navigation is data-driven:** `apps/web/src/theme/nav.ts` is the source of
  truth for workspaces, sidebar sections, order, icons, and role gates. Section
  `key`s are the screen keys switched in `Portal.tsx` (`renderScreen` /
  `renderExtra`).
- **Sidebar order is code-only, and nothing at runtime may change it** (owner
  decision, 2026-08). The `NAV` array **is** the order — workspaces, and the
  sections within each — and reordering the sidebar means editing `theme/nav.ts`
  and deploying. `Sidebar.tsx` reads `NAV` directly.
  - **Removed, and not to be reintroduced:** the Developer Terminal ▸ Sidebar
    Layout editor (`AdminSidebarLayout`), `theme/navOrder.ts` (`applyNavOrder` /
    `buildNavOrder` / `isDefaultOrder`), the `NavOrderOverride` type, the three
    client methods, the routes `GET /api/nav-layout` and
    `PUT|DELETE /api/admin/nav-layout`, and the `app_settings` key `nav.order`
    (dropped by migration `0098`). Do not add a second, runtime source of nav
    order — two of them can disagree, and the stored one wins silently, which is
    exactly what made a code change to the order look like it had not deployed.
  - Consequence worth knowing: a section's `key` no longer needs to stay stable
    for a *saved layout's* sake. It still does for every other reason — the keys
    are the screen keys `Portal.tsx` switches on, `DEFAULT_SCREEN` names them,
    and in-app links and `howto.<screen>` wording are keyed on them. **Rename a
    label, never a key** remains the rule; only the justification narrowed.

## Workspaces & sections (`theme/nav.ts`)

Sections a user lacks the role for — or the **feature opt-in** for (see Feature
Access below) — are hidden. **My Terminal is pinned to the very top of the
workspaces list** (see `theme/nav.ts` order).

- **Markets is GONE as a workspace** (owner decision, 2026-08). Its two sections,
  Market News (`news`) and Market Data (`data`), are **My Terminal sections** now
  — the Live Wall had already moved there, and all three read public market data
  rather than anything belonging to a workspace of their own. **Nothing else
  changed**: the screens, their section keys, their routes and their guards are
  untouched, so the `howto` wording and every in-app link still resolve, and
  Market Data is still Premium while Market News is still free. The `markets`
  `WorkspaceKey`, its theme, its `DEFAULT_SCREEN` entry and its
  `WORKSPACE_LABELS` entry are all deleted.
  - **`requireMarkets` keeps its name** and still means exactly what it meant:
    signed in, no opt-in, no trade / broker / balance reachable. It was never a
    workspace check (`WorkspaceKey` server-side is only `'trading' | 'studies'`),
    so nothing on the server moved. Read "Markets" in a server comment as "the
    market-facing surfaces included with every account".
  - **The two are kept adjacent in the sidebar** (owner decision, 2026-08): they
    are read as a pair. Since `data` is Premium and the Max → Premium → free
    stacking puts it above the free rows, keeping them together means **Market
    News leads the free rows rather than the Live Wall**. The wall still opens on
    sign-in — where a workspace's list starts is not what it opens on.
  - The `markets` **tile group** and the `markets` **built-in Live Wall layout**
    keep their keys and labels — they name a data category, not the workspace,
    and the preset key is what a free account's remembered layout choice is
    stored against.
- **Advanced Trading** (gold, internal key `trading`) — **opt-in** (and several of
  its parts are **paid** — see Memberships):
  **Live Wall** (`live` — the terminal's one board, moved here from My Terminal
  by owner instruction, 2026-08 and leading this workspace; see its own section
  below),
  **Live Trades** (`tradedesk` — placing real orders, see below),
  **Closed Trades & Metrics**
  (`desk` — **ONE page**, the trade log with Live Brokers below it; legacy keys
  `log`/`history`/`metrics` alias into it. **The key stayed `desk` through every
  label change** — "Trade Desk" → "Trade Analysis" → "Trade History" → "Closed
  Trades & Metrics" (all 2026-08) — so the `howto.desk` wording and every in-app
  link keep pointing at the review screen; the placement screen took the *new*
  key `tradedesk` and was itself renamed "Trade Desk" → "Live Trades" without
  touching its key. **Rename a label, never a key** is the whole rule here.
  The file is `TradeHistory.tsx`; a search for the old names finds only patch
  notes, which are a dated record and stay as written.
  **The heading matches the sidebar row exactly** — "Closed Trades & Metrics"
  in both places. It briefly read "Trade History & Metrics" at the top; one
  screen carries one name.
  **Live Brokers stopped being a tab** (owner instruction, 2026-08): the two
  answer one question between them — what the trades did, and what the accounts
  behind them hold — and a tab meant only half the answer was ever on screen.
  `DeskView` survives because `initialView` is still passed by in-app links;
  every value lands on the one page and `brokers` scrolls to that panel.
  **History was removed** — owner decision, 2026-08: it listed the same closed
  trades the Trade Log already carried, from the same rows, so two screens
  answered one question and were free to disagree about it. Everything it had
  that the Trade Log did not was **folded in rather than dropped** — the
  day-of-week and month filters, the By Strategy / By Instrument breakdowns
  (`tradeBreakdown.tsx`), the strategy column, the held time, and **editing a
  closed trade you own even when the broker imported it** (a broker row is not
  `editable`, so the inline form cannot touch it; the pencil saves through
  `PATCH /api/trading/history/:id`, which is the only route that will, and the
  Trade Log re-reads afterwards because that route answers with the History
  shape). Any narrowing recomputes the summary client-side, the same rule History
  followed, so a filtered selection scores exactly as the unfiltered one does.
  The `history` view key still resolves — to the log — so a stale link lands
  somewhere. Do not rebuild the screen),
  Strategy Sessions (`sessions` — per-weekday ET windows with a Bull/Bear/Two-way
  bias; each session picks its own Mon–Fri days + hours, or is filled to the
  instrument's full market hours via the `/api/trading/market-hours` AI lookup.
  Open/close/pre-open notifications are opt-in from **Alert Settings**, not from
  this screen — it builds and edits the sessions themselves. The one alert
  control that IS here is **Rollover close**, and it is the same component Alert
  Settings renders — see its own section below),
  Manual Trades (`funded` key, `FundedScreen`), **Funded Trades**
  (`prop` key — the nested opt-in; the desk's prop-firm accounts, see below.
  Labelled "Funded Account" until 2026-08; the key, the opt-in and the paid
  feature are all still `funded`/`prop`).
  **Trading Notes** (`notes` — predictions and observations, see its own section
  below).
  **The sidebar order here follows the TRADE'S LIFE, not the tier stacking**
  (owner instruction, 2026-08): Live Wall → Live Trades → Closed Trades &
  Metrics → Funded Trades → Manual Trades → Deleted Trades → Trading Notes →
  Strategy Sessions → Alert Settings.
  The wall leads because it is the board the rest of the workspace is summarised
  onto; the rows after it are the trade's own sequence. It is the one
  workspace that does not stack Max → Premium → free, because a trader reads
  these rows as a sequence rather than as a price list. The last three rows are
  the ones that are not records of trades: Trading Notes is what you thought,
  Strategy Sessions is a plan for making them, and Alert Settings is how the
  terminal reaches you.
  **Alert Settings** (`alerts`, `workspaces/trading/AlertSettings.tsx` — see its
  own section below).
  **The Trading Alerts FEED was REMOVED outright** (owner instruction, 2026-08)
  — the screen, its route, its how-to guide, its demo-tour step and `Alerts.tsx`
  are gone and are not to be rebuilt. **The alert plumbing is untouched**: the
  TradingView webhook, the `trading_alerts` table, the alert sound and the Live
  Wall's Alerts tile all still work, so the wall can still show alerts even
  though the feed screen is gone. **The `alerts` KEY was reused** for Alert
  Settings (owner instruction, 2026-08): nothing linked to the removed screen,
  so a stale link now lands on the alert settings rather than nowhere.
  **To Do moved
  to My Terminal** (owner decision, 2026-08 — a to-do list is personal, not a
  desk instrument); its key is still `td_trading`, so in-app links keep working.
  Market Data and Market News left this workspace long ago and now live in **My
  Terminal**; their section keys are unchanged (`data` / `news`), so the `howto`
  wording and in-app links keep working.
  - **Trade Desk** (`tradedesk`, `workspaces/trading/TradeDesk.tsx` +
    `OrderTicket.tsx` + `DeskPositions.tsx`) is where a trade is **placed**. It
    sends real orders to the trader's **own** accounts at **two venues — OANDA
    (forex, margin) and Kraken (crypto, spot)**: market / limit / stop, with
    protective orders attached on fill, plus closing (whole or partial), amending
    a live trade's stop/target, and cancelling a resting order. Beside the ticket
    sits the desk's open book — every position the trader's **team** currently
    holds — so a trade is sized knowing what the desk is already in.
    - **One desk, two venue models, and the difference is declared not sniffed.**
      OANDA's model is a *trade*: an object with an id, a stop and a target
      attached, closed by that id. Kraken spot has no such object — a buy leaves
      a **balance**, and a protective order is a separate order the exchange
      places when the entry fills. `trading/deskBrokers.ts` is the adapter layer
      that states what each venue can do (`spot`, `maxProtectiveOrders`,
      `canAmendProtection`) and normalizes the rest; `trading/orderDesk.ts` is
      pure policy — who may trade, what is validated, what is journalled, what is
      refused — and is broker-agnostic. **A third venue is a new adapter, not new
      conditionals in orderDesk.** Do not reintroduce per-broker branching there.
    - **The split in what the two halves may do is the design.** *Watching* is
      the same `/api/trading/live` feed every other screen reads, so the
      visibility boundary stays defined once (`trading/scope.ts`) — and since
      2026-08 that boundary is self-only, so the "team book" beside the ticket is
      the trader's own open positions. *Acting* is personal too: every write resolves its
      connection through `getActiveDecrypted(userId)`, which is keyed on the
      caller, so **there is no code path that trades a teammate's account** —
      teammates' rows on the book are watch-only by construction. Do not add an
      "act on behalf of" path here; a desk lead editing a teammate's *settings*
      (below) is a different thing entirely from placing their trades.
    - **The desk book's row controls differ by WHERE THE POSITION LIVES**, and
      that difference is the design rather than an inconvenience
      (`positionEditKind` in `workspaces/trading/positionEdit.tsx` — shared with
      the Live Wall, see below). A live **OANDA** row's stop and target
      are instructions sent to the broker, and the whole position can be closed
      from here. A **funded (`ftp`) or hand-kept (`manual`)** row has no broker
      behind it, so its stop and target are a *record of what the firm is
      holding* — editable here since 2026-08 (owner request), through the same
      owner-scoped routes the Funded and Manual screens use
      (`PATCH /api/trading/funded/trades/:id`, `PATCH /api/trading/positions/:id`),
      with the wording saying outright that nothing is sent anywhere. **No Close
      button on those**: a funded trade is closed from its own screen, where the
      result screenshot is read. A **Kraken margin** row is neither and stays
      watch-only, which is what the desk's own `close`/`amend` refusals already
      say.
    - **THE DESK BOOK MAY NOT SET THE PAGE HEIGHT.** On desktop and narrow
      desktop, `Desk right now` keeps its heading fixed and scrolls the full
      position list inside a viewport-bounded, keyboard-focusable region. On
      tablet and phone it avoids a nested vertical scroller: the first three
      positions stay in page flow with an explicit Show all / Show fewer
      control. This keeps Holdings, Working orders, Sent orders and the later
      Founder settings reachable however many current or sample positions the
      feed returns, without dropping any row detail or action.
    - **`trading/sizing.ts` IS THE CANONICAL SIZING MATH, AND IT EXISTS TWICE ON
      PURPOSE** (`apps/api/src/trading/sizing.ts` and
      `apps/web/src/workspaces/trading/sizing.ts`, identical below their
      headers). Money-from-a-size (`costOfUnits`), size-from-money
      (`unitsForCost`), the per-pip value and the whole Account % computation
      live here, pure and import-free. The ticket sizes in the browser on every
      quote tick and a Founder join sizes on the server at the moment the order
      goes out, so it genuinely has to be in both places; the repo's answer to
      that is the one `pips.ts` and `forex.ts` already use — a documented mirror.
      What makes it safe is **`npm run verify:sizing`**, which imports BOTH files
      and runs every fixture through each, so a change made to one and not the
      other fails there rather than in production as a size nobody meant. It is
      in `scripts/verify.mjs`, so CI runs it. **Change one file and change the
      other.**
    - **Server:** `trading/orderDesk.ts` (validation, journaling, the personal
      boundary) over `trading/deskBrokers.ts` (the adapters) over the two write
      connectors — `brokers/oandaOrders.ts` and `brokers/krakenOrders.ts`. Those
      two are **the only files that can trade**; `brokers/oanda.ts` and
      `brokers/kraken.ts` stay read-only, and `brokers/krakenClient.ts` holds the
      signing/nonce/transport both Kraken files share (it knows how to sign a
      request, not which paths exist). Routes are their own file,
      `routes/tradeDesk.ts` under `/api/trading/desk/*`: reads behind
      `requireWorkspace('trading')`, **every write behind
      `requireWorkspaceWrite`** (the right guard on a write even though no
      read-only role exists today — see Roles & access), and the demo refused
      twice (demoGuard blocks every non-GET; `refuseDemo` in the service is the
      second lock, deliberately, on the one surface that moves money).
    - **Both venues lie about success in their own way, and both are handled.**
      **OANDA answers `201 Created` even when it immediately cancels the order**
      (insufficient margin, market halted, an unfillable FOK), so an
      `orderCancelTransaction` in the body is raised as an error. **Kraken answers
      HTTP `200` to a refusal**, with the reason in an `error` array — checked
      before the status, once, in `krakenClient.ts`, so no caller can skip it —
      **and its `AddOrder` returns a transaction id rather than a fill**, so
      `placeKrakenOrder` asks `QueryOrders` what actually happened before it
      reports anything. In all three cases reading the obvious success signal
      would put a position on the desk that the account does not hold. Keep them.
    - **Every attempt is journalled** to `trading_orders` (migration `0082`),
      including the refusals with the broker's own reason — a rejected order
      never becomes a position, so this is the only record it happened. Rows are
      append-only and in the `admin/service.ts` per-user delete list.
    - **Kraken is spot-only, deliberately, and that is a safety property rather
      than an omission.** No request built in `krakenOrders.ts` ever sends
      `leverage`, so the desk cannot open a margin position on Kraken, cannot be
      liquidated there, and the API key needs no margin permission. A "sell" is a
      sale of coins the account already holds; there is no short. Kraken **margin**
      positions still reach the Live Wall through the read connector, but stay
      **watch-only** on the desk — `close` and `amend` refuse them by name, and
      `DeskPositions` only offers controls on an `oanda` row. Do not add a
      leverage path without revisiting the liability note above.
    - **Spot holdings are the crypto answer to "what am I in".** A spot buy leaves
      a balance, not a position, so `GET /api/trading/desk/holdings` reports what
      each spot account owns (priced live, with the part locked by resting orders,
      staked balances marked and unsellable) and the **Holdings** panel renders
      it. Selling one deliberately **loads the ticket** rather than firing its own
      order — the review-and-confirm step is the point, and it means the desk
      gains no second write path. Keep that.
    - **Kraken attaches exactly one protective order to an entry** (`close[…]`,
      its conditional close; spot REST has no bracket/OCO). A ticket carrying both
      a stop and a target is **refused**, on the server and mirrored in the ticket.
      The two tempting alternatives are both worse: dropping one silently leaves a
      live position without the protection the trader thought they set, and placing
      the second as a free-standing order leaves it working after the first
      triggers — with nothing to cancel it, that order opens a brand-new position
      on its own.
    - **Order validity is checked against the instrument's own spec**
      (OANDA `/v3/accounts/{id}/instruments`, Kraken `/0/public/AssetPairs`: price
      precision, size precision, tick size, minimum and maximum size), cached
      10 min — per connection for OANDA (an entity may not offer every
      instrument), once install-wide for Kraken (the list is public and identical
      for everybody, with the in-flight request shared so a desk opening does not
      fetch the whole exchange four times). An over-precise price is rejected
      outright by both, so the rounding is validation, not tidying. Kraken also
      enforces a minimum order **value** (`costmin`) that a size above the size
      floor can still fall below, so that is checked too. Protective levels are
      checked against the price the order will actually transact at — the **ask**
      for a buy, the **bid** for a sell — not the mid, and a **stop entry** is
      checked to be on the far side of the market (above to buy, below to sell).
    - **A LEVEL THAT WOULD FIRE THE MOMENT IT WAS SET IS REFUSED, AND THAT IS A
      SECOND QUESTION FROM THE ONE ABOVE** (`trading/protection.ts`, mirrored in
      `workspaces/trading/protection.ts`; owner report, 2026-08 after it took one
      of the desk's own positions out). The check above asks whether a level is
      on the right side of the price the trade **opens** at, which is what makes
      a trade coherent. This one asks whether it is on the right side of the
      price it is **watched** against — and they are not the same price.
      - **A LONG'S PROTECTIVE ORDERS FIRE ON THE BID AND A SHORT'S ON THE ASK.**
        A long is filled at the ask and closed at the bid, so a stop measured
        against the ask reads safely below the market while already sitting at
        the price it triggers on. **Every spread is a band in which a level
        passes the entry-side check and fires on arrival**, which is exactly what
        happened: a stop typed at the price on the screen.
      - **The minimum distance is ONE PIP** (owner's own figure), or one whole
        **point** on anything that is not a genuine currency pair — the same
        `forexPair` switch the rest of the desk reads movement by, and
        deliberately not the instrument's `pipLocation`, which would quote gold's
        point in cents.
      - **ONLY A MARKET ORDER IS JUDGED AGAINST THE LIVE MARKET.** A resting
        entry is not on the book, so its levels are measured against its own
        trigger price and cannot fire on anything until it fills.
      - **DIRECTION AGAINST THE ENTRY IS NOT ASKED ON AN AMEND.** Moving a long's
        stop above its entry is a trader taking risk off, which must stay
        allowed; what is refused there is a level on the wrong side of the
        *current* market.
      - **A MISSING QUOTE IS NOT A REFUSAL.** With no price to judge against
        there is no judgement to make, and blocking a stop because a quote failed
        would be a terminal that stops somebody protecting a live position at the
        moment the feed is worst. The venue still rules on what it receives.
      - **THE AMEND PATH WAS UNCHECKED ENTIRELY UNTIL THIS LANDED**, and could
        not have been checked: the modify payload carries no direction. It now
        reads the position from the venue (`DeskBroker.positions()`) rather than
        taking a side from the client — the account is the authority, an amend is
        a deliberate human action rather than a poll, and the same read supplies
        the levels the position was on before, which is what a Founder level-move
        invitation is built from. **A position the venue does not report is not
        judged and not invented.**
      - `npm run verify:protection` runs BOTH mirrors over the same fixtures.
    - Two guards worth keeping: identical entry tickets inside a **5-second
      window** are refused (a double-click at a broker means two positions, not
      one), and any successful action **drops the team's cached desk snapshot**
      (`invalidateDeskSnapshot`) so the trader does not keep seeing the pre-trade
      wall for the rest of its TTL.
    - **Every instrument states what a unit of price movement is worth, in the
      unit that instrument is actually read in** — the figure a trader sizes by.
      One switch decides which: `forexPair(instrument)`
      (`workspaces/trading/pips.ts`, mirrored server-side in `trading/forex.ts`)
      is the terminal's single test for a genuine currency pair, so the desk agrees
      with how the Live Wall, Trade Log and History already score a trade.
      - A **pair** speaks pips: "$10.00 / pip", a spread in `PIPS`, stop/target
        as "money · pips". The pip's *size* comes from OANDA's own `pipLocation`,
        not a JPY-or-not guess.
      - **Everything else** — indices, shares, metals, **crypto** — speaks points,
        where a point is **one whole unit of price** (5,000 → 5,001; a dollar of
        share price): "$10.00 / point", a spread in `PTS`, "money · pts".
        Deliberately *not* that instrument's `pipLocation`, which OANDA reports
        as 0.01 for gold — reading that as a "point" would quote the figure in
        cents.
      Never label a non-pair's movement in pips; never size a point from
      `pipLocation`.
      - **AND A SET OF TRADES REPORTS BOTH UNITS, NEVER ONE STANDING FOR THE
        WHOLE** (`netMovement` / `fmtMovement` / `hasAnyMovement` in `pips.ts`).
        Every aggregate on the desk used to be a pip sum written as
        `if (pips != null) sum += p`, and `tradePips` returns null for anything
        that is not a pair — so gold, the indices and crypto were dropped in
        **silence**. A By Instrument row of pure gold printed **"(0 pips)"**, a
        measured zero standing in for a figure never measured, beside perfectly
        real money; a mixed strategy row printed a pip figure covering only its
        forex legs, with nothing saying so. Same family of rule as the Live
        Wall's `unavailable` source and Investments' `unpricedCount`: **a figure
        that could not be measured must never be reported as a measured one.**
        - **A null leg means "no trade here speaks that unit", and is never a
          zero.** That is what separates a desk holding no gold from one whose
          gold came out flat — and a break-even pair still correctly reads
          `0 pips`, because that zero WAS measured.
        - **The two are never added.** A mixed set reads
          `(+183 pips · -40.9 pts)`; a set with no pair reads points alone,
          which the old `hasAnyPips` gate hid entirely.
        - **`netPips` and `hasAnyPips` are DELETED, not left unused** — an
          unused-but-plausible pips-only aggregate is how this comes back. Do
          not reintroduce one.
        - Call sites: the Trade Log KPI cards and its CSV, the By Strategy / By
          Instrument breakdowns, the tape's per-trade figure, Funded Trades'
          stats, and the Live Wall's Desk Metrics tile. `history.ts`'s server
          `groupBy` still sums pips only and is commented as such — **no screen
          reads it**; wire it to one and it needs this shape first. Sizes render through `fmtUnits`
      (`TradeCard.tsx`), which keeps more decimals the smaller the size — the
      default locale format prints 0.00042 of a bitcoin as "0". Keep all of this
      when adding stocks or another broker.
    - **THE QUICK-SIZE CHIPS ARE THE TRADER'S OWN** (`ticket_presets`, migration
      `0125`; `trading/ticketPresets.ts` server-side,
      `workspaces/trading/ticketPresets.ts` + `TicketPresetMenu.tsx` on the web).
      The cog at the end of the row is where they are set: what the buttons are,
      what they mean, and when one reads red.
      - **The DEFAULT ladders live in the WEB, and the server holds no copy.**
        They are what the ticket renders before the row has loaded and all it
        ever renders for an account that customised nothing, so a second copy
        server-side could only drift from what is on screen. **A null ladder
        means "the built-in one", never "no buttons"** — which is what lets a
        default improved in code still reach everyone who never overrode it, and
        what makes clearing the list hand the built-ins back rather than leaving
        a trader with no shortcuts.
      - **Five ladders, kept apart because a number means a different thing in
        each**: whole-unit instruments (thousands — a micro lot is 1,000),
        fractional ones (0.01 … 1, for anything the broker allows a fractional
        size on), **money per pip/point**, **money spent** on a spot account, and
        a **share of account value** (see Account % below).
        1,000 is an ordinary FX size and a ruinous bitcoin one, so one shared
        ladder would be wrong on whichever instrument it was not written for.
        `ladderKind` picks: the mode decides, except that units splits by
        `tradeUnitsPrecision`.
      - **A money-per-pip chip is a SIZE worked out from the live quote**, never
        a second sizing model: `unitsForPreset` inverts the same
        `units × step × factor` the ticket already reads out under the size box,
        so "$5 a pip" and the "$5.00 / pip" line agree by construction. Without
        a quote it resolves to **nothing and the chip dims** — a shortcut on an
        order ticket must never fill in a size derived from a figure that was
        not read.
      - **A built-in ladder is filtered to what the broker would accept; a
        ladder the trader typed is NOT.** The terminal may prune its own
        suggestions, but a button somebody put there must not vanish without
        explanation — an unusable one is caught by the ticket's own validation,
        which says why.
      - **EVERY CHIP CARRIES TWO READINGS, because they answer different
        questions** (migration `0126`; `marginBasis`, `usageFor` /
        `primaryPct` / `secondaryPct`). A share of **free margin** (cash on
        spot) is "can this go on right now" — the figure the broker refuses
        against — and a share of the **account value** is "how big is this for
        this account", regardless of what is open. On a desk already 90%
        committed the first reads several hundred percent for every size, which
        is true and says nothing about whether the size is sensible; that is the
        case the second exists for.
        - **The basis chooses which one LEADS and is coloured**, green under the
          threshold and red at or above it; the other sits beside it in grey.
          Colouring both was tried in the design and rejected — two coloured
          percentages on one small button is a chip nobody reads at a glance.
        - **The threshold is stored PER BASIS** (`marginWarnPct` /
          `valueWarnPct`, both default 100, both 1–100). One shared number would
          be re-interpreted on switching: 100% of free margin is the point of
          refusal, while a position worth 100% of the account is a different kind
          of extreme — a trader sizing against the account wants something like
          30 there.
        - **Null `marginBasis` is 'free'**, exactly what every ticket read before
          the second basis existed, so nobody's buttons changed on deploy. A null
          *reading* is left unsaid rather than filled in from the other — an
          account not reporting its value disables the Account value choice
          rather than quietly measuring against something else.
        - A red chip is **still pressable**: free margin moves as trades open and
          close, and a refusal belongs at Review, not at a shortcut.
      - The same share is restated on the ticket's own **Margin (est.)** cell,
        taken from the money figure already displayed there rather than
        recomputed, so the two cannot disagree. The chips price off the **market**
        (the side the order would pay) while the summary prices off the
        **order** — a limit order's own trigger — which is the correct difference,
        not a drift.
      - **ACCOUNT % — a preset that stores a SHARE, not a size** (owner request,
        2026-08; `ticket_presets.pct_presets`, migration `0135`). A fifth mode
        beside Units and $ per pip: each button is a percentage, and the size it
        works out to is the one whose **estimated margin** takes about that share
        of the account's current value.
        - **IT IS NOT A RISK CALCULATION AND MUST NEVER READ THE STOP.** "Account
          %" is the share of account value the position's required margin
          consumes; it says nothing about what the trade could lose. The existing
          **Risk (USD) / stop-first** workflow is untouched and independent — a
          stop entered afterwards still prices the risk off the final size, it
          just does not decide it. Do not merge the two.
        - **THE PERCENTAGE IS THE STORED INTENT AND THE UNITS ARE NOT.** An
          account that grows has to place a correspondingly larger trade from the
          same button, which is only true if the share rather than a snapshot of
          the size is what is saved. The units are re-derived on every render
          from the live account value, the live quote and the venue's own margin
          rate, once more when the order goes to Review, and once more at the
          moment it is sent.
        - **IT REUSES THE MARGIN PATH THE TICKET ALREADY SHOWS**, inverted:
          `unitsForCost` is the exact inverse of `costOfUnits`, which is the one
          function behind the chips' readings and the **Margin (est.)** cell
          alike. Nothing here re-derives a broker's margin rule, and **an
          instrument that states no margin rate is a refusal rather than a 2%
          guess**.
        - **PRESSING A % CHIP TAKES CONTROL OF THE SIZE; TYPING TAKES IT BACK.**
          `pctIntent` in `OrderTicket.tsx` is the whole mechanism: while it is
          set the box follows the live answer, and the size box's own `onChange`
          clears it — which is what makes a manual edit an override rather than
          something the next quote tick overwrites. Sizing from a stop, loading a
          holding, and switching account (both surfaces key the ticket on the
          connection) all clear it too.
        - **THE ACCOUNT VALUE IS THE SAME NAV EVERY OTHER SURFACE READS**
          (`DeskAccount.nav` — what the account strip prints as ACCOUNT VALUE and
          what the chips' 'value' basis is measured against). There is
          deliberately no second interpretation of what an account is worth.
          Going to Review on a percentage-sized order **re-reads the accounts
          endpoint first**, because the quote is polled every two seconds and the
          account arrives as a prop that can be a minute old — long enough for a
          share of it to be the wrong size. A failed refresh keeps the figure
          already on screen rather than blocking the review.
        - **OPTIONAL $/PIP ROUNDING, AND IT IS A FLOOR** (`pct_round` /
          `pct_round_increment`, default off at **$0.50**). The money-per-pip is
          floored to the increment and the size is derived from THAT, so a trade
          reads "$3.50 / pip" rather than "$3.82 / pip". **Never nearest and
          never up**: a cleaner number must not be bought by committing more of
          the account than was asked for. Everything is then recomputed from the
          size that will actually be sent, and **the percentage reported
          afterwards is the ACTUAL one** — 46%, not the 50% that was pressed.
          Repeating the target there would hide exactly the thing rounding does.
          A share too small to make one increment is **refused with a reason**
          (lower the increment, turn rounding off, or raise the share), never
          sent as a zero.
        - **A SIZE BELOW THE VENUE'S MINIMUM IS REFUSED, NOT RAISED TO IT** —
          raising it spends more of the account than was asked for, silently,
          which is the failure this mode exists to prevent. A size above the
          venue's **maximum** is clamped DOWN and says so, and the actual
          percentage then reports what the clamped size uses.
        - **A PERCENTAGE IS NOT A SIZE, so the venue's size bounds must never
          filter the ladder.** Running "5" through `usableChips` against a
          1,000-unit minimum drops every chip and leaves a "1000%" button in
          their place. Whether a share is usable is decided by what it works out
          to, which is what dims the chip and supplies the reason.
        - Everything the existing presets do still applies: the chips carry their
          two margin readings, colour by the trader's chosen basis and turn red
          at their own threshold — **on the ACTUAL margin after rounding**. The
          chip also carries the size and the money-per-pip, because a percentage
          on its own is not something anybody can size from, and the editor
          previews the same computed answer rather than a second estimate of it.
      - **Nobody else's, deliberately** — unlike `trading_desk_settings`, which a
        desk lead may edit for a teammate. A desk lead may change how a
        teammate's results are scored; the shortcuts on a ticket belong to
        whoever sends the order, so the service takes the caller's id and there
        is no `userId` parameter on either route. In the `admin/service.ts`
        per-user delete list.
      - Edits apply to the chips **at once** and are written a beat later
        (debounced, flushed on unmount): a preset is edited a keystroke at a
        time and the chips have to follow the typing rather than the network.
        `loadTicketPresets` shares one read, since a Live Wall can carry several
        ticket tiles reading the one row.
    - **The stop and target take a PRICE or a DISTANCE**, chosen by the
      Price/Pips toggle beside them (owner request, 2026-08) — "Points" on
      anything that is not a currency pair, off the same `forexPair` switch as
      everything above. Three rules carry it:
      - **The order still carries prices.** A distance is converted in the
        ticket against `reference` — the ask for a buy, the bid for a sell, a
        resting order's own trigger — which is the very price the server
        validates the levels against, so the two cannot disagree.
      - **Direction is never typed.** A stop goes on the losing side and a
        target on the winning one, derived from the side, so a mistyped sign
        cannot put a stop above a long's entry. It also means flipping
        long↔short re-derives both levels correctly instead of stranding a
        price from the other side.
      - **A derived level is rounded to the venue's `displayPrecision`**, since
        an over-precise price is rejected outright by both brokers — validation,
        not tidying. And a distance typed with **nothing to measure from** (a
        limit order with no trigger yet) resolves to no level, which must never
        read as "no stop wanted": `unresolved` refuses the order rather than
        sending a naked position. Switching units converts what is already
        typed rather than clearing it.
    - No notification is fired here on purpose: the desk watch reconciles within
      ~10s and sends the existing "trade opened/closed" push, so firing one at
      placement would double every buzz.
  - **Trading Notes** (`notes`, `workspaces/trading/TradingNotes.tsx` +
    `notesFormat.tsx` over `trading/notes.ts` and `trading/noteSettle.ts`, routes
    `/api/trading/notes/*`; `trading_notes`, migration `0129`). A trader writes
    down what they think the market does next **before** it does, and settles it
    against what happened. Two kinds in one table: a **prediction** carries a
    window, a deadline and an outcome it still owes; an **observation** leaves
    all of those null and is never settled. **Premium** (`tradingNotes`); sharing
    with a private group rides the existing Trading Teams grant on top.
    - **THREE RULES CARRY THE FEATURE, and without them it is a notes app.**
      - **A PUBLISHED CALL IS FROZEN.** Sharing a prediction stamps `locked_at`,
        and a window that has opened locks the call whether or not it was ever
        shared; afterwards only the reflection may be written. A track record
        that can be edited after the fact is not a track record — the same rule
        a published study package follows. Un-sharing does **not** unlock: you
        can stop showing a call, not un-make one other people read.
      - **NOBODY SEES A CALL BEFORE ITS WINDOW OPENS.** One `or(...)` clause in
        the read query, and it is what separates a weekly ritual from a comment
        thread — whoever writes second would otherwise be anchoring on whoever
        wrote first, and the week would measure nothing. Your own is always
        readable; hiding it from its author would make the composer unusable.
      - **A CALL THAT COULD NOT BE SETTLED IS NEVER SCORED AS WRONG.**
        `unsettleable` is a real outcome, excluded from the hit rate and
        reported on its own, drawn **neutral rather than red**. Same family as
        the Live Wall's `unavailable` source, Investments' `unpricedCount` and
        Market Data's `sample: true`: a thing that could not be measured must
        never be reported as a measured one. **Do not fold it into the misses.**
    - **`week_key` is an ET week stamp ('YYYY-Www', Monday-based), STORED not
      derived.** A trading week is an Eastern concept, like History's day
      buckets — derived per reader, a call would move between weeks when
      somebody changed their display zone, and two people in one group would be
      reading different boards. `etInstant` composes the window's absolute
      instants from ET wall-clock time rather than `now + offset`, which drifts
      across DST (the trap `etClock.ts` closes on the web side).
    - **`open_price` is the mark the call was made against**, stamped by the
      watch when the window opens, and it is what an outcome is measured from
      when no explicit target was named. It has to be read **at the time** —
      last Monday's price cannot be recovered later, the same reason the
      Investments performance curve is built forward and never back-filled. A
      call that never got one is not settled automatically.
    - **`noteSettle.ts` is the watch** (production-only, 5 min): stamp open
      prices, then settle what is past its deadline, off the same install-owned
      price feed the price alerts read (`priceSource.ts` — never a customer's
      credential). **It deliberately does NOT require a delivery channel**,
      unlike the price-alert watch: settling is the work and the buzz is a
      courtesy, so a terminal with no push must still settle its calls. A call
      the feed **cannot** grade — freeform, or one with no open price — is left
      alone rather than closed out, because it belongs to its author and is
      already sitting in their queue.
    - **Directions are only `up`/`down`, deliberately.** Those are the two a
      price feed can settle without being told what "flat" means for this
      instrument. A rangebound call is written freeform and settled by the
      person who made it, which is honest; grading it against a band nobody
      chose is not. `partial` likewise only ever comes from a person.
    - **Calibration, not a leaderboard** (owner decision, 2026-08). Confidence
      is 1–5, mapped to a stated probability (`CONFIDENCE_STATED`), and the
      record shows **what you said against how often you were right at that
      level**. `getStats` is the viewer's **own** and nobody else's: a
      forward-looking accuracy figure attached to a named person is the raw
      material for an implied track record. The group board shows what everyone
      **called** and how it settled, and ranks nobody. Do not add a ranking.
    - **"Did you trade your own call"** (`getTradeLinks`) reads the viewer's own
      `trading_positions` in the called instrument inside the called window, and
      says outright when they traded **against** it. **Self-only** — widening it
      to teammates would put one person's trade data on another's screen through
      a route that is not the Live Wall's, so it stays closed until it is asked
      for.
    - The **Live Wall tile is `tradingnotes`, NOT `notes`** — that kind is
      already the board's own scratchpad. Two different things, two keys.
    - Notifications go **only to the call's author**. A push about somebody
      else's call landing would be the terminal pushing one person's market view
      at another, which is a different feature with a different set of questions
      behind it.
    - **Carries a `risk` review mark** (owner instruction, 2026-08 — founder-level
      only, like every `risk` entry). Sharing a prediction with a group is one
      customer telling others where the market is going *before* it goes there,
      which is more advice-shaped than the session bias beside it: directional,
      forward-looking and aimed at named people. Marked on the nav row and on
      the Live Wall tile. The screen already says "a personal record, not a
      recommendation" and no notification ever pushes one member's call at
      another; what awaits the attorney pass is whether that is enough once the
      group half is public.
  - **ROLLOVER CLOSE — three timed alerts around the 5pm ET rollover** (owner
    request, 2026-08; `trading/rolloverMath.ts` + `rollover.ts` +
    `rolloverWatch.ts`, routes `GET|PUT /api/trading/rollover`; `rollover_plans`,
    migration `0130`. The panel is `RolloverAlertSettings` in
    `workspaces/trading/alertPanels.tsx`). A funded position cannot be held
    through rollover, so the trader needs telling to come off it — and then
    telling again, once it has passed, to decide about getting back on.
    - **Three events, three different questions**: `evaluate` ("you are still
      holding; decide what comes off"), `close` ("close it now"), and `recheck`
      ("rollover has passed; are you getting back in?"). Defaults 16:30 / 16:45 /
      17:15 ET, each with its own time and its own rung on the existing
      notification ladder — `close` defaults to `alert` because it is the only
      one with a deadline attached.
    - **THE FIRST TWO ONLY FIRE WHEN A FUNDED POSITION IS ACTUALLY OPEN, AND
      THAT GATE IS WHY THERE IS NO WEEKDAY PICKER.** A flat day, or a weekend
      with nothing on, is silent by itself. A day picker would be a second
      switch for a job one gate already does — and one more thing to be wrong
      when a trader is holding over a bank holiday.
    - **THE RECHECK IS DELIBERATELY THE EXCEPTION.** By the time it is due the
      position it is about has usually been closed, so gating it on "still open"
      would silence it in precisely the case it exists for. It fires when
      something is open **or** a funded trade closed **today** — an ET day,
      matched on the day stamp rather than a midnight instant, so it needs no
      zone arithmetic to get wrong across DST. That also makes it restart-proof:
      the fact is read from the database rather than from the watch's in-memory
      dedup set, so a restart at 4:50pm does not swallow the 5:15 alert.
    - **THE SAME COMPONENT RENDERS ON STRATEGY SESSIONS AND ON ALERT SETTINGS.**
      Strategy Sessions is where a plan for the trading day belongs and where the
      owner asked for it; Alert Settings is the one home for alert opt-ins. One
      component over one route, exactly as `GroupAlertSender` already renders in
      two places — two copies with one route behind them drift within a month,
      and whichever one somebody happens to open is the one that looks broken.
    - **A save is a PATCH and the server merges.** The web app is a
      service-worker-cached PWA, so an old bundle posts a subset of the plan —
      and that must never blank an event it does not know about. Same rule the
      trade-event prefs follow with their flags-only save.
    - A time that does not parse **keeps the stored one** rather than being
      written as a time no minute ever matches, and an unrecognised level falls
      back to `alert` rather than silencing something somebody relies on.
    - Delivery is personal — each alert reaches only the account whose plan
      produced it, like the session and price-alert watches. A `repeating` close
      alert goes through `sendPushoverToUsers` like everything else, so it picks
      up the trader's own repeat timing and its Acknowledge button from
      `deliver`, the one place a priority-2 message is sent.
  - **THE RE-ENTRY CHECK — what getting back on would cost**
    (`trading/reentryMath.ts` + `reentry.ts`, `GET /api/trading/funded/reentry`;
    `workspaces/trading/ReentryCheck.tsx`, on **Funded Trades** between the live
    positions and the history, plus the `reentry` Live Wall tile). After a
    rollover close the trader has one decision left, and it needs three figures.
    - **THEY ITEMIZE WITHOUT DOUBLE-COUNTING, and that is the whole design.**
      **Drift is measured against the SAME SIDE the trade exited at** — a long
      exits at the bid, so it is compared with the current bid; a short exits at
      the ask. Done that way, `drift + spread` comes to exactly the distance
      from the exit fill to the re-entry fill (`ask − exit` for a long,
      `exit − bid` for a short). Measured against the **mid** instead, half a
      spread lands in both terms and every figure on the panel is quietly
      overstated. `verify:rollover` pins that identity.
    - **Sign convention: POSITIVE IS WORSE.** A negative drift is the market
      having come back to you while you were flat, which makes re-entry cheaper
      than the exit — exactly as useful to know, and it must never be reported
      as a cost.
    - **Quotes prefer the trader's OWN OANDA connection** (purpose `quotes`,
      written **after** the broker answers so the row carries the real outcome),
      because the point of the spread line is what *they* would pay to cross.
      It falls back to the install pricing account, and the payload **says
      which** — a figure whose source is unstated is one the reader cannot
      judge. Neither available means `bid`/`ask` are null and the check renders
      "not priced" rather than a cost of zero.
    - **COMMISSION IS STATED BY THE TRADER, NEVER GUESSED**
      (`funded_accounts.commission_per_lot`, round-turn per standard lot,
      editable on the account card). Nothing can look a prop firm's commission
      schedule up. **Null is "not stated" and is never read as zero**, and it is
      **applied to currency pairs only** — a standard lot is 100,000 units for a
      pair and something else entirely for gold, an index or a coin, so applying
      the rate there would be wrong by orders of magnitude while looking
      plausible.
    - **THE TOTAL IS REFUSED RATHER THAN APPROXIMATED.** With no commission rate,
      or an instrument not quoted in the account's currency, there is no total —
      the drift and spread are still shown as the real figures they are, and the
      missing part says so. Same rule Net Worth follows: a total silently missing
      a part reads complete while understating, which is the one error this panel
      exists to prevent. **Do not fold an unknown commission in as zero.**
    - Money is only stated when the instrument is **quoted in the account's own
      currency**, where a price move times the size *is* the money with no rate
      involved. Anything else shows pips (or points) alone rather than a figure
      converted at a rate this has no source for.
    - Only trades closed in the last 18 hours are listed: a re-entry decision is
      a right-now decision, and a trade closed yesterday is one you did not
      re-enter. Nothing closed recently draws no panel at all.
  - **FOUNDER TRADE COORDINATION — one Founder invites another onto a trade**
    (`trading/founderTrades.ts` + `founderTradeWatch.ts`, routes
    `/api/founder-trades/*`; `founder_trade_invites` / `founder_trade_events` /
    `founder_trade_prefs` / `founder_trade_links` / `founder_linked_positions`,
    migrations `0131`–`0139`. On the web: `components/FounderTradeModal.tsx`
    mounted in `Portal.tsx` and `FounderTradePanel.tsx` on Live Trades). One
    Founder places a trade — or moves a level on one they are already in — and
    the other is asked, on a blocking modal, whether to do the same. One press
    does it.
    - **TWO KINDS OF INVITATION** (`kind`, migration `0139`): an **`entry`** is a
      trade the sender opened, and an **`amend`** is a stop or target they moved
      or added on a position they already hold. They share the row, the claim,
      the reminders, the modal, the audit timeline and the two decision routes —
      what differs is the question and what the press does. A second workflow for
      the second kind would be a second place for all of that to drift.
    - **THE DATABASE ROW IS THE WORKFLOW, and every other property here follows
      from that.** `status` (`primary_pending` → `complete`) is the single
      statement of what is still owed, and the blocking modal renders it and
      nothing it remembers itself — so an unresolved invitation survives a
      refresh, a relogin, a second tab and a redeploy. **Do not add a
      client-side "seen" or "dismissed" flag**; there is nothing for one to mean.
    - **ANSWERING IS FINISHING. THE FUNDED QUESTION LEFT THIS WORKFLOW** (owner
      decision, 2026-08). Joining a trade used to advance to "are you also
      placing this on your funded account?" and then to a screenshot; both are
      gone, and either answer to the one question now ends it. **Nothing about
      the funded book, the Funded Trades screen or any funded route changed** —
      what was removed is this workflow's demand that the recipient answer for it
      before the invitation would close. The funded COLUMNS are kept as the
      archive of what was decided while the step existed, and migration `0139`
      completed every row still standing on one of the two removed steps: an
      unresolved row keeps a blocking modal up and a phone repeating, so leaving
      them would have stranded somebody in a workflow with no exit.
      `funded_pending` and `proof_pending` are **deleted from
      `FOUNDER_TRADE_STATUSES`** rather than left unused, so a state nothing can
      reach cannot find its way back into the code.
    - **ELIGIBILITY IS READ FROM THE ROLES, EVERY TIME, AND THERE IS NO NAME
      ANYWHERE.** `eligibleFounders()` is the one computation — founder-level
      (`founder` or the permission-equivalent `software_developer`), active,
      never the demo — and the picker, the invite guard, the audit read and the
      reminder watch all call it. A third Founder appears the day they are
      granted the role, with no schema change and no code change. Revoking the
      role stops the reminders and closes the reads on the next request.
      **Every route is on `requireFounder`, reads included**: a workflow carries
      a trade, its levels and a screenshot of somebody's funded account, so
      there is no half of it that is safe to serve more widely. The terminal
      hiding the feature is discoverability, never the protection.
    - **THE RECIPIENT'S SIZE IS THEIR OWN, AND AN UNSET ONE IS REFUSED RATHER
      THAN DEFAULTED** (`founder_trade_prefs.default_units`). The invitation
      snapshots the inviter's size for **display** and the join never reads it.
      Null is "not stated" and is never read as a number — sending an order at a
      size nobody chose is the one failure this feature must not have.
      - **IT CAN BE A FIXED SIZE OR A SHARE OF THE JOINER'S OWN ACCOUNT**
        (`size_mode` / `size_pct` / `pct_round` / `pct_round_increment`,
        migration `0135`; `resolveJoinSize` in `founderTrades.ts`). `units` is
        the fixed figure and is what **every setting made before this existed
        is** — a null `size_mode` reads as it, so nobody's join changed on
        deploy. `account_pct` is the same Account % definition the order ticket
        uses, with the same optional floor-rounding, applied to the RECIPIENT'S
        own account value, quote and margin requirement.
      - **A PERCENTAGE IS RESOLVED AT JOIN TIME, BEFORE THE CLAIM.** The size is
        worked out from the account moments before the order goes out, never
        read off anything stored — which is the whole reason the share rather
        than the units is what is saved. Resolving before the claim also keeps
        the existing property that a refusal costs nothing and can be retried at
        once. A share that cannot be priced right now **refuses**; it never falls
        back to a stale unit count and certainly never to the inviter's.
      - **Whether a size has been STATED is checked before the account is**
        (`assertSizeStated`), because a percentage needs the account to resolve
        and somebody who has set up neither should still be told about the size
        first — the order this refused in before percentages existed.
      - The settings preview (`previewJoinSize`,
        `GET /api/founder-trades/size-preview`) is **informational and stores
        nothing**: it says what the saved share currently comes to, priced on a
        liquid pair it names, because a size genuinely differs per instrument.
        It is read from the server so the preview and the join come out of the
        same code.
      - **Nothing else about the workflow moved** — invitation routing, the
        stop and target that travel, join/decline, the funded question, the
        screenshot, the reminders and the permission rules are all untouched.
        Only how the joiner's own size may be arrived at changed.
    - **WHAT TRAVELS IS THE GROUP'S RULE, SET ONCE FOR EVERYBODY**
      (`trading/founderTradeConfig.ts` over the `app_settings` key
      `founderTrades.share`; `GET|PUT /api/founder-trades/config`, founder-level,
      no migration). The instrument and the direction always travel — without
      them there is nothing to join — and the inviter's **stop** and **take
      profit** each travel or not, as absolute levels on the same instrument.
      Both default ON (owner instruction, 2026-08; the target was excluded in the
      first cut and was added the same week).
      - **It is install-wide rather than per person on purpose.** Two Founders
        disagreeing about whether a target is copied would make one invitation
        mean two different things depending on who sent it.
      - **THE SIZE IS DELIBERATELY NOT IN THIS OBJECT AND MUST NEVER BE.** A
        switch that made the joined size follow the inviter's is the one thing
        this feature must not have; adding it here would be a mistake, not a
        feature.
      - A malformed stored row **falls back to the defaults rather than
        throwing** — this is read on the path that places an order, and a bad
        settings row must never be what stops somebody joining a trade.
      - **A spot venue takes ONE protective order**, so when both levels would
        travel there the **stop is kept and the target is dropped**, with
        `primary.target_dropped` on the timeline. Never the other way round, and
        never a dead-end refusal telling a half-asleep trader to place the other
        by hand. The venue is read from the connection row, so this costs no
        broker round trip.
    - **A JOIN IS CLAIMED BEFORE IT IS SENT.** One conditional `UPDATE` decides
      which caller reaches the broker, so two tabs, a double-click and a retried
      request cannot become two positions — and the desk's own five-second
      duplicate window sits behind it as a second lock. A claim that goes stale
      (a request that never reported back) is **released with a recorded warning
      rather than retried silently**: the previous order may have reached the
      broker, so the recipient is told to check before it happens again.
    - **A LEVEL MOVE NEVER GUESSES WHICH POSITION IT IS ABOUT.** An `amend`
      invitation carries the RECIPIENT'S OWN position, resolved when it was
      raised, and `resolveAmendTarget` is the one computation:
      - an explicit **pairing** first (`chain`) — they joined this trade, or the
        two positions were paired by hand. Exact.
      - failing that, the recipient's open positions in the same instrument and
        direction (`instrument`). **Exactly one is a match; two or more is
        NONE.** An ambiguous book is where picking would be picking at random,
        and moving a stop on the wrong position is the one failure this half must
        not have. The invitation is still raised — knowing what a partner did is
        worth knowing either way — it simply offers no button.
      - `targetMatch` travels to the recipient, because "we are provably in the
        same trade" and "you have one position that looks like it" are different
        degrees of confidence and they should read which before they press.
      - **The position's ID is deliberately NOT on the client payload.** The
        apply route reads it off the row it stored, so nothing sent from the
        browser can redirect an order — the same rule the size follows on an
        entry.
    - **A MOVE OR AN ADD, NEVER A REMOVAL** (owner request, 2026-08 — "whenever
      that individual moves or adds a stop loss or take profit"). Taking a level
      OFF raises nothing: one press that strips the protection from somebody
      else's live position is a different risk from one that tightens it, and it
      is not what was asked for. A level re-saved at the value it already had is
      not a move either.
    - **ONLY THE LEVEL THAT MOVED TRAVELS.** A stop the sender did not touch is
      left `undefined` rather than sent, so applying a target change never
      cancels and re-places the recipient's stop at the broker — the same rule
      the position editor already follows.
    - **APPLYING CALLS THE SERVICE, NOT THE ROUTE**, which is what stops a chain
      ping-ponging: `autoAmendAfterModify` is wired to the HTTP route, and the
      recipient's own amend therefore never fans back out over their links.
    - **`founder_linked_positions` PAIRS TWO POSITIONS** (migration `0139`). A
      join pairs them automatically; two Founders who each placed the same trade
      independently pair theirs by hand from the trade card — the case the owner
      named, where the invitation came, was not joined, and the trade was placed
      separately anyway.
      - **Canonicalised by user id** (the lexicographically smaller is always
        side A), so pairing A with B and B with A is one row rather than two that
        could later disagree. The unique index enforces it.
      - **No foreign key on a connection or a trade id**, deliberately, for the
        same reason `source_ref` carries none: a position closes and the pairing
        is the record that the two were linked.
      - **Both positions are read from each account** before a manual pairing is
        written — instrument and direction checked there rather than taken from
        the request. A pairing built on what a client asserted is a pairing that
        could later move a stop on a position nobody meant. **A long and a short
        in the same pair are refused**: copying one's stop onto the other puts it
        on the wrong side of the market every time.
      - **Either party may break one**, exactly as either may set a link.
      - **`LiveTrade.linkedWith` is the LINKED marker** on the Live Wall card and
        the Live Trades row, stamped in `getLiveWall` beside the tile colours and
        for the same reason — `buildLiveWall` returns from four places, so a
        stamp applied inside it is a wall that loses its markers whenever a
        broker goes quiet. **Founder-level viewers, own positions only**: a
        pairing is between two accounts, and the marker's whole job is to say
        whether a level moved HERE reaches anybody.
    - **PUSHOVER ACKNOWLEDGEMENT IS NOT AN ANSWER, and `founderTradeWatch.ts` is
      what makes that true.** Pushover's own emergency retries stop when
      somebody acknowledges on their phone; this watch reads the DATABASE on
      every pass and, while a row still owes an action, sends a **fresh**
      notification. Silencing a phone buys quiet until the next interval and
      nothing more. It is bounded four ways so it can never become an endless
      siren: it only reads unresolved rows (so finishing a step stops it with
      nothing to unschedule), it honours each recipient's own interval, it skips
      a row being answered right now, and reminders **lapse after 24 hours**
      (`REMINDER_MAX_AGE_MS`) — the modal stays, because the workflow is server
      state and does not expire, but a phone that has repeated for a day is no
      longer saying anything new. One loop, one timer, started once from
      `server.ts`: adding invitations lengthens a pass, never adds a job.
    - **THE MODAL IS MOUNTED IN `Portal.tsx`, NOT ON A SCREEN**, and it has no
      close button, no backdrop click handler and no Escape handler anywhere in
      the file. An invitation has to be answerable from wherever the recipient
      is, and a level move arrives while they are looking at something else
      entirely. It takes **no navigation callback**: the funded question that
      used to follow a decision is gone, so answering finishes the workflow where
      the reader is standing.
    - **IT IS BUILT FOR SOMEBODY WHO WAS JUST WOKEN UP**: one question per
      screen, the direction and instrument set larger than anything else, the
      trade's facts **restated on every step** rather than remembered from the
      last one, the size the order will actually go out at stated before the
      button, and two full-width buttons labelled with what they do rather than
      yes/no. **There is deliberately no confirmation step** — the JOIN press IS
      the confirmation, and a second dialog at 3am is how somebody taps through
      both. A trade with **no stop** says so in amber rather than leaving a
      blank field.
    - **BEING FOUNDER-LEVEL IS AUTHORITY TO TAKE PART, NOT CONSENT TO TRADE.**
      Joining requires the **Advanced Trading opt-in** like every other write on
      the desk (`canSendOrders`), since that is where the terminal asks somebody
      to acknowledge that it places real orders with their own broker.
      **DECLINE stays available either way** — an invitation nobody can answer
      is the one way this workflow could trap somebody.
    - **SEVERAL INVITATIONS QUEUE, OLDEST FIRST, AND NONE IS DISCARDED.** The
      modal shows the head of the queue and says how many are behind it. One
      trade raises **one** invitation per recipient (a unique index on
      `(source_ref, recipient_user_id)`), so a retried create returns the
      invitation that already exists rather than raising a second modal about
      one trade.
    - **INVITING IS A STANDING LINK, NOT A PER-TRADE QUESTION** (owner
      instruction, 2026-08 — it shipped as a prompt on every fill and was
      replaced the same day). A question on every fill is a prompt people learn
      to click past. **Do not reintroduce a per-trade prompt.**
      - **`founder_trade_links` IS THE SWITCH, AND EITHER END MAY SET IT**
        (migration `0134`; the `Links` card on the Live Trades panel). One row
        per direction between two Founders, carrying **two independent
        switches** for what travels (`send_entries` / `send_amends`, migration
        `0139`): new trades, stop and target moves, either, or both. Opening a
        trade and moving a stop on one are different things to want (owner
        instruction, 2026-08 — "separate switches per link direction, full
        custom"), so neither implies the other.
        - **BOTH OFF IS NOT A STATE.** The row is still the link, so the last
          switch going off REMOVES it — which keeps "a disabled link and no link
          are the same fact", the property this table was built on, now that
          there is more than one thing a link can say.
        - **A PATCH, not a replace.** The terminal is a service-worker-cached
          PWA, so a browser on an old bundle changing one switch must never
          silently reset the other. The route also reads a legacy `on` field as
          the entries switch, which is exactly what it meant when it was the
          only one.
        - Existing links took entries **ON** and level-moves **OFF**, so nobody's
          link changed behaviour on deploy.
        - It replaced `founder_trade_prefs.auto_invite` / `auto_invite_user_id`
          (migration `0132`), which could only say "I send to ONE person" and
          could only be set by the sender. Those columns are **kept as the
          archive** and nothing reads them; `0134` carried every enabled one
          across, so nobody's setting changed on deploy.
        - **Wanting somebody's trades sent to you must not require touching
          their account** (owner instruction, 2026-08), which is the whole
          reason this is a link rather than a sender-only switch. The caller
          must be one of the two parties and which one does not matter; a link
          between two OTHER people is refused. Both parties see it, so nobody
          can be sending or receiving through something they cannot see.
        - **A→B and B→A are separate rows.** Switching one on says nothing about
          the other, which is what lets trades flow one way only.
      - **The invitation is raised SERVER-SIDE**, fire-and-forget from the
        route — `autoInviteAfterFill` from the place route, `autoAmendAfterModify`
        from the amend one — so it happens whether or not the tab that acted is
        still open, and can never delay or fail the response. Each fans out over
        every link on its own channel, and one recipient failing never stops the
        others being told.
      - **Only a FILL is sent, never a resting order.** The recipient joins at
        market, so inviting off an untriggered limit/stop would put them in at a
        price the inviter has not paid, against a stop set for a different
        entry. `status === 'filled'` is the gate.
      - Eligibility is re-read from the roles on every fill and on every read of
        the link lists, so a revoked Founder drops out of both rather than
        lingering as a link that silently does nothing — and comes back if the
        role does. An auto-sent invitation records `invite.auto_sent` on its
        timeline, so a standing link and an in-the-moment decision stay
        distinguishable afterwards.
    - **NOTIFICATIONS ARE SET IN BOTH DIRECTIONS, and they are different
      questions** (owner instruction, 2026-08).
      - **Receiving** — `reminder_level` / `reminder_every_seconds`, defaulting
        to `repeating`: a trade sent to you is asking you to act, and the
        workflow is not resolved until you do.
      - **Sending** — `notify_on_response` / `response_level` (migration
        `0134`), defaulting to on at `normal`. `notifyInviterOfResponse` tells
        the sender what was decided at each step: joined, declined, the funded
        answer, the screenshot. **Never a reminder** — it is a note about a
        decision already made, so there is nothing outstanding to nag about,
        which is also why it does not break through silent mode the way the
        receive side does.
      - It is **skipped for a self-addressed test**, or every drill would buzz
        its own operator about what they just pressed.
      Nothing else on the wall needed a tile: the blocking modal is already
      global, so a board tile could only restate what is already covering the
      screen.
    - **THE TEST DRILL PLACES A REAL TRADE, AND THAT IS THE POINT**
      (`planFounderTest` / `runFounderTest`, `GET|POST /api/founder-trades/test`;
      `founder_trade_invites.is_test`, migration `0133`. `TestDrill` on the Live
      Trades panel). A simulation that stops short of the broker proves nothing
      about the half most likely to be wrong — the order path, the levels, and
      the journal row the invitation is built from.
      - **THE TEST COMES TO WHOEVER RAN IT** (owner instruction, 2026-08). The
        point of the drill is to feel the RECEIVING end — the notification, the
        modal, the join — so the invitation is addressed to the person who
        pressed the button. Nobody else is woken up to test the system, and no
        second person has to be set up before it can be tried. `createInvite`
        therefore allows a self-addressed invitation **only** when `isTest`;
        a real one still refuses, because you are already in your own trade.
        Consequence worth stating on the button, and it is: joining the test
        places a SECOND minimum-size order, so the drill leaves two positions to
        close.
      - **It is bounded rather than faked**: the venue's own
        `minimumTradeSize`, a liquid major, and **never EUR/USD** (owner
        instruction — a test should not land on the pair a real position is most
        likely already open on, where a stray extra position is hardest to
        spot). `TEST_PAIR_PREFERENCE` picks the pair from what the account can
        actually trade, so an entity carrying an unusual set still finds one.
      - **The plan is a separate READ from the run.** `GET` says exactly what
        would be placed — pair, size, levels, account, recipient — so the button
        states it before anything is sent. A button that puts a real order on
        somebody's account without saying so first is not one anybody should
        press.
      - **It carries the shared levels**, derived from the live quote at a fixed
        pip distance, so the drill exercises the copying rather than only the
        notification.
      - **EVERY SURFACE THE RECIPIENT MEETS SAYS IT IS A TEST** — the modal's
        banner and heading, and `TEST · ` at the front of the Pushover and web
        push titles. That is the rule every other test in the terminal follows,
        and it matters most here: a drill indistinguishable from a real fill gets
        acted on at 3am. **Nothing else about the workflow changes** — same state
        machine, same claim, same funded question, same screenshot, same
        reminders — which is what makes it a test of the real thing.
      - A test that comes back **working rather than filled** raises nothing and
        says so, the same rule auto-send follows: there is no position to join.
    - **The invitation is raised from the FILL, not from the ticket.**
      `sourceRef` is the desk's own `trading_orders` row, so the server reads the
      instrument, direction and stop off the trade it actually placed instead of
      trusting anything the client sends — which is why `placeDeskOrder` returns
      `orderRecordId`. It carries no foreign key: an invitation is a record of
      what was asked and must outlive the journal row it points at.
    - **`founder_trade_events` is the audit timeline**, append-only, and a null
      actor means the terminal acted on its own schedule (a reminder, a released
      claim) — the convention `credential_audit` already uses. It records the
      source trade, the invitation, every reminder, the decision, the order
      result and the completion, **plus the refusals**: a JOIN or an apply
      refused before anything was sent, a duplicate blocked by the claim, a
      repeat invitation folded into the existing one, and — on a level move —
      whether a position of the recipient's could be aimed at at all
      (`amend.target_resolved` / `amend.target_unresolved`). All of it is fire
      and forget: the timeline must never be what stops a decision being
      recorded.
    - **VTS never places a funded trade** and never will. That is unchanged; what
      changed is that this workflow no longer ASKS about one — see "answering is
      finishing" above. There is no Funded Trading Plus integration and no
      Match-Trader automation.
    - Reading a workflow is **the two parties and nobody else** — not a
      teammate, not a plain admin, not another Founder — and an id that is not
      the caller's answers **404**, so a guessed id cannot be probed. **Only the
      recipient can decide**; the inviter may read and never answer.
    - Screenshots from the removed funded branch are still stored inline on the
      rows that carry one, as client-scaled JPEG data URLs (this deploy has no
      blob store). Nothing writes or serves one any more — the route and the
      client method are gone rather than left as an unreachable surface.
    - `npm run db:check-founder-trades` walks the whole state machine through
      the real services against a scratch database — that answering finishes it,
      the refused JOIN that leaves the row where it was, the size that is never
      the inviter's, the two-party read boundary and the reminder pacing, plus
      the level-move half: the two switches being independent, both off removing
      the link, a removal and an unchanged level raising nothing, an unaimed
      move offering no button, a pairing being one row however it is stated, and
      either party breaking it. Like `db:check-sharing` it **writes**, so it
      refuses any database that already holds a user. In `verify:db`, so CI runs
      it.
  - **Alert Settings** (`alerts`, `workspaces/trading/AlertSettings.tsx` over
    `components/NotificationSettings.tsx` + `workspaces/trading/alertPanels.tsx`)
    is the **ONE home for everything the terminal can buzz you about** (owner
    instruction, 2026-08). The controls were in three places — phone
    notifications, Pushover and the per-trade toggles in My Terminal ▸ Settings,
    price alerts under them, and the session open/close toggles on Strategy
    Sessions — which is three places to look for one job.
    - **Marked Premium** (`SECTION_FEATURE.alerts` → the new `alertSettings`
      feature). **Two panels are deliberately OUTSIDE that feature** and render
      for any account reaching the screen: **phone notifications** (web push
      takes no credential, so a free account is still told when its price alert
      fires) and **price alerts** (included with every account — an alert nobody
      can be told about is not an alert). That is the same split Market Data
      makes with its free calendar, and it is what keeps charging for Pushover
      honest. **Do not fold those two into the paid block.**
    - **Every test SAYS it is a test, in the title, before anything else** —
      `TEST · VTS Terminal`, on Pushover and web push alike. Somebody woken at
      3am reads the first line on a lock screen and little more; a test
      indistinguishable from a fill gets acted on, and a notification system
      that cries wolf is worse than one that stays quiet.
    - **EVERY TRADE EVENT HAS ITS OWN VOLUME** — the four-rung ladder in
      `notifications/prefs.ts` (`NOTIF_LEVELS`, `LEVEL_PRIORITY`), stored per
      `(recipient, watched trader, event)` beside the on/off boolean that
      already existed (migration `0121`).
      | level | Pushover priority | what the phone does |
      | --- | --- | --- |
      | `silent` | −1 | shows, no sound, no vibration |
      | `normal` | 0 | sound, respects Pushover's quiet hours |
      | `alert` | 1 | sound through quiet hours — **what everything sent before** |
      | `repeating` | 2 | repeats until acknowledged |
      - **The boolean still decides WHETHER, the level decides HOW LOUD.** Two
        separate questions: off means you never hear about the event, silent
        means it is waiting for you when you look.
      - **`alert` is the default AND the fallback for an unrecognised value.** It
        is what every notification sent before levels existed, so nothing stored
        changed meaning and no backfill was needed — and a level nobody
        recognises must never silence an alert somebody is relying on.
      - **PUSHOVER ONLY.** Web push has no equivalent — a browser notification is
        a browser notification — so a level never changes whether the phone-alert
        copy is sent. `recipientLevelsForEvent` answers who *and* how loud in one
        query, and `recipientsWantingEvent` is the thin id-only wrapper web push
        uses; reading them separately is how two channels come to disagree about
        who is being notified.
      - **A flags-only save leaves levels alone** (`setPref`'s optional fourth
        argument, and the route's union schema). The web app is a
        service-worker-cached PWA, so a browser on an old bundle posts bare flags
        — and that must not silently reset somebody's repeating alert.
    - **`alert_prefs` — how often a repeating alert repeats and for how long.**
      ONE row per user, deliberately not per watched trader: anything worth
      waking somebody for wants the same urgency, and six copies of two numbers
      is six things to keep in step. Pushover **refuses** a priority-2 message
      without both `retry` and `expire`, so `deliver` supplies them
      unconditionally at that priority. Its bounds are retry ≥ 30s, expire ≤
      10800s (3 hours), and `normalizeRepeatPrefs` **clamps rather than
      rejects** — refusing a save here would leave an alert that does not repeat
      at all, the opposite of what was asked for. Normalized on read too, so a
      row stored before a bound moved can never hand Pushover a value it refuses.
    - **A REPEATING ALERT IS ACKNOWLEDGED FROM THE TERMINAL, AND OPENING THE APP
      IS THE ACKNOWLEDGEMENT** (owner decision, 2026-08). `pushover_receipts`
      stores the receipt Pushover returns for every priority-2 send — that
      receipt is the only way to stop the repeats from this side, so without the
      row the terminal would be drawing a button it could not honour.
      - **`LiveAlertBanner` silences on arrival**, on mount and on the tab
        becoming visible or focused (already-open is the case a mount misses).
        A repeating alert exists to get somebody to the desk, so arriving *is*
        answering it.
      - **There is deliberately NO "do you want to acknowledge?" prompt.** It was
        proposed and rejected: the phone is still making noise while somebody
        reads a dialog, and a question at 3am is the worst moment to ask one.
        What replaces it is a card that does not ask but **tells** — what fired
        and when — and stays until dismissed, so an alert can never be silenced
        without a trace. That was the only thing the prompt was protecting.
      - **The row is marked answered even when Pushover's cancel call fails.**
        The alternative is a banner that will not clear because of a network
        hiccup, while the phone stops on its own at expiry anyway.
      - **`callback_token` is what makes the public callback route safe.**
        Pushover signs nothing, so `POST /api/pushover/callback/:token` is
        unauthenticated by necessity and matches on an unguessable value —
        otherwise anybody who could guess a receipt id could mark somebody
        else's alert answered. It answers 200 whatever happens; Pushover retries
        what it considers a failure, and there is nothing useful to retry.
      - **Pushover's own acknowledge button stays the fallback.** If the terminal
        is unreachable, that is the path that still stops the noise, so nothing
        here may become the only way out.
      - Rows are **kept** after resolution rather than deleted — they are the
        record that an alert fired and that somebody answered it, which is what
        "did I sleep through one?" needs. A null `resolved_at` is what makes an
        alert live; the stored `expires_at` is what lets an unanswered one stop
        being reported without a round trip to Pushover.
    - **The repeating TEST goes through the same path** as a real one, so it uses
      the user's own repeat timing and is cancellable from the terminal. A test
      you cannot acknowledge the way you acknowledge a real alert is not testing
      the thing the terminal does.
    - **TWO ACCOUNT SWITCHES sit under Phone notifications** (`alert_prefs`,
      migration `0123`), and the scope difference is the point: phone
      notifications are per **device** (a push subscription belongs to one
      browser), these are per **account**.
      - **`accountAlerts` is the master switch**, and it gates the EXISTING send
        paths as well as the new one — `filterAccountAlerts` is applied inside
        `sendToUsers` and `sendPushoverToUsers`, the one place each channel
        leaves the server, so no caller can forget it. A master switch that only
        governed whichever feature remembered it would be a lie.
        - **The test buttons deliberately ignore it** (`ignoreAccountSwitch`). A
          test is a direct request made in the moment, and a test that silently
          does nothing is indistinguishable from a broken setup — which is the
          exact failure the test exists to detect.
      - **`groupAlerts`** is whether somebody else in your group may buzz you.
        A different question from the master switch, and the master switch is a
        **superset**: `recipientsAcceptingGroupAlerts` requires both.
      - **Both default ON**, matching the `notification_prefs` convention (no
        row = hears about everything), so nothing already working went quiet on
        deploy. `groupAlerts` is reachable only by an account holding the
        Trading Teams grant, so defaulting it on cannot expose anybody who was
        not deliberately put in a group.
    - **THE GROUP NUDGE — one member buzzing the rest** (`notifications/
      groupAlerts.ts`, `POST /api/notifications/group-alert`; `GroupAlertSender`
      rendered on **both** Alert Settings and My Terminal ▸ My Group).
      - **THERE IS NO MESSAGE, DELIBERATELY** (owner instruction, 2026-08). The
        notification carries the sender's name and nothing more. Free text on a
        push that sounds through silent mode on other people's phones is a
        different feature with a different set of problems — moderation, abuse,
        and on a trading desk the point at which a nudge becomes a signal to
        act. **Do not add a message field.** The sender picks only WHO and how
        loud.
      - **It can be aimed at specific people** (owner request, 2026-08), and the
        narrowing is done against the group membership the service just read —
        so the picker cannot become a way to buzz an arbitrary account. Three
        rules carry it:
        - **An empty selection means EVERYBODY**, which is what the button did
          before picking existed, so a cached bundle omitting the field keeps
          working unchanged.
        - **A selection resolving to nobody is REFUSED, never widened.**
          Silently turning "just Dale" into "the whole desk" is the worst
          reading of an ambiguous input available here.
        - **Being named individually does not override an opt-out.**
          `recipientsAcceptingGroupAlerts` is applied to a picked person exactly
          as to the whole group.
      - **`sendToUsers`, not `sendToTradingDesk`.** The desk sender additionally
        requires the recipient to hold the Advanced Trading opt-in, and a private
        group is not the trading desk — somebody in your group who never turned
        the desk on must still be reachable.
      - **One per sender per minute**, in memory like the AI burst limit. Not
        really a policy question: this is a repeating alert that ignores silent
        mode, fired at other people's phones by pressing a button, so without a
        cooldown a slip of the finger is a siren nobody can stop from their side.
        The cooldown is stamped **even when nobody was reachable**, or "everyone
        has it switched off" would be an unlimited retry loop against the send
        path.
      - **It reports how many people it actually reached**, so the sender is told
        the truth rather than a cheerful "sent" when the whole group has group
        notifications off.
      - Three guards, each a different question: `requireTradingTeams` (the
        grant), `requirePremium('teams')` (the tier — group alerts are part of
        Private Groups, so they reuse that key rather than inventing a feature),
        and the demo refused because this writes to other people's phones.
      - Marked with the **`teams` diamond** and the **`groupAlerts` review mark**
        (owner instruction) — `wip` for everyone, plus a founder-only `risk` note
        that one user making another user's phone sound needs compliance review
        before public launch.
    - `npm run db:check-alerts` walks all of it through the real services against
      a scratch database. Like `db:check-sharing` it **writes**, so it refuses any
      database that already holds a user. Run it after touching `prefs.ts`,
      `alertPrefs.ts`, `pushoverReceipts.ts` or `groupAlerts.ts`.
    - **The push hook and the Pushover status are owned by the SCREEN and passed
      down** (`PushControls`, `onConnectedChange`). Two hook instances do not see
      each other, so turning phone alerts on in one panel left the test panel
      still reading "off" with its button disabled for no visible reason.
    - `alertPanels.tsx` was `alertSettings.tsx` and had to be renamed: it differs
      from the screen's `AlertSettings.tsx` only in casing, which is the same
      file on a case-insensitive filesystem and a hard `TS1149` on a
      case-sensitive one.
  - **Capital is three KPI cards on the Trade Log** — Deposited Capital,
    Withdrawn Capital, and Total Capital (`workspaces/trading/CapitalCards.tsx`,
    served by `trading/traderCapital.ts` over
    `GET|PATCH /api/trading/capital` + `POST /api/trading/capital/sync`). The row
    could say what the trades made and never what they were made **on**, so
    "+$378 realized" read the same on a $2,000 account as on a $200,000 one.
    - **THE FIGURES ARE PER BROKER ACCOUNT, AND THE CARD IS THE TOTAL** (owner
      instruction, 2026-08; `trading_capital_accounts`, migration `0127`). It was
      one deposited figure and one withdrawn figure per person, on
      `trading_desk_settings` — which cannot describe either shape a real desk
      takes: **several accounts under one login** (a partner whose account the
      lead connected), where the sync summed every account's funding into one
      number so "my deposit" was really everybody's and one sync switch governed
      the lot; and **partners who sign in themselves**, each holding their own.
      Each `(trader, account)` pair now carries its own deposited and withdrawn
      figures, each independently typed or synced. `accountKey` is a
      `broker_connections.id`, or **`'other'`** for capital behind no connected
      account — a hand-kept book, or a trader with no broker at all.
      - **No foreign key on `accountKey`, deliberately.** Removing a connection
        must not delete the record of money that was paid into it; the row
        survives as "Account no longer connected" and its figure still counts,
        until the trader clears it themselves.
      - **The rollup says how it was arrived at** (`CapitalTotal`): how many
        accounts state a figure, how many state nothing, and whether any of it
        is automatic. An account stating nothing is **counted, never read as
        zero**, and accounts in **different currencies refuse to be added** —
        the same rule Total Capital and Net Worth already follow. `capitalSub`
        phrases it once, for the card and the Live Wall tile alike.
      - The old columns are **kept, not dropped**, as the archive.
        `backfillCapitalAccounts()` carries them across **on boot** rather than
        in the migration, because splitting one summed figure needs to know
        which of a trader's connections exist and which can be synced. A sync
        that was on becomes that same sync on **each** of their OANDA accounts —
        never the summed figure attributed to one of them, which is a number
        that account never held — and each row then reads its own. Idempotent:
        a trader who already has per-account rows is left alone.
    - **THE CARDS FOLLOW THE TRADER FILTER**, like every other figure on the KPI
      row (owner instruction, 2026-08). They were the viewer's own whatever the
      filter said, which put one person's deposit beside another person's
      results: on "Individual stats — @dale" the card read the viewer's $1,900,
      and on "Whole desk" that same $1,900 stood in for what the desk had put
      in. **`?userId=` is the scope** — a trader's id, or **`desk`** for the
      whole visible desk (`getDeskCapital`, the traders' accounts concatenated
      and rolled up, `userId: null`, `traders: n`).
      - **BOTH SIDES OF THE RETURN MOVE TOGETHER**, which is the rule that
        replaces the old one. The screen hands the card the realized P/L of the
        **same selection** the deposit covers, so a percentage always describes
        one set of people. The old pairing was the reverse of safe: the
        viewer's deposit under a teammate's P/L, or the desk's P/L over one
        member's money.
      - **Reading is bounded by `visibleTraderIds`; writing stays on
        `canEditDeskSettingsFor`.** Reading follows the boundary that already
        decides whose trades are on the screen these figures sit on — so a
        deposit is never shown to somebody who cannot see the trades it
        explains, and a trader in no group resolves to themselves by
        construction. Setting a member's is narrower: a **desk lead** (group
        leader holding the Trading Teams grant, or an admin), the same gate
        that governs how a teammate's results are scored, checked on **every**
        request. That is what lets a lead keep their own deposit typed by hand
        while a partner's account beside it syncs itself.
      - **THE DESK'S PANEL LISTS EVERY VISIBLE TRADER'S ACCOUNTS, GROUPED BY
        PERSON** (owner request, 2026-08), and each row carries its own
        `canEdit` — a founder or admin reaches everyone, a group leader their
        own group, everybody else only themselves. A person the viewer cannot
        set is **shown and not editable**, never hidden. That is what "edit my
        group's capital" means: each member's figures set in one place, on the
        member's own row.
        - **There is deliberately NO group-owned figure to type into.** A total
          belonging to several people has no single owner to write it back to,
          and a stored group number would be a second writer for the sum to
          disagree with — the fault this whole area was rebuilt to remove. The
          card's total stays derived.
        - The panel **mirrors the card's scope** rather than holding one of its
          own, so the two can never be showing different people. A write
          answers with the one trader it touched, so the panel re-reads its own
          scope afterwards instead of taking that answer — on the desk's card
          the rest of the group would otherwise vanish behind the person just
          edited.
      The Live Wall's **Desk Metrics** tile follows its own trader picker the
      same way, with the same paired P/L, and keys its fetch on the scope (two
      tiles pinned to different traders otherwise share one answer — the
      `useTileData` rule). They stay **read-only** there: the Trade Log is the
      one screen that writes them, so a board tile cannot become a second writer
      of a number two surfaces already have to agree on.
    - **Deposited and Withdrawn are each TYPED or SYNCED, per figure and per
      account** (`deposited_sync` / `withdrawn_sync`). Synced reads **one**
      account's funding history — `fetchOandaFunding` in `brokers/oanda.ts`
      counts **only `CLIENT_FUNDING`** transfers, because OANDA also files
      transfers between the trader's own sub-accounts and entity migrations as
      funding, and summing those answers a different question than "what did I
      put in". Excluded events are counted and surfaced (`otherTransfers`), and
      a truncated history walk says so rather than understating silently.
    - **The typed and synced figures are SEPARATE columns** (`deposited_capital`
      vs `synced_deposited`), so turning sync off hands back the figure typed on
      **that** account, and typing a figure returns that one account to manual —
      leaving every other account, sync included, exactly as it was. That
      isolation is the whole point of the change. The synced pair is the **last
      good reading**: a failed refresh keeps it, stamped, instead of blanking to
      zero (`stale-while-revalidate`, refreshed on read past a 15-minute TTL and
      immediately by the Sync button — which sits behind an "Are you sure you
      want to sync?" confirm). Kraken deliberately does not feed the sync: its
      ledger records "0.5 BTC in", and turning that into dollars needs the price
      on the day it landed, which the terminal does not have.
    - **Null is "not stated" and is NEVER inherited.** Every other desk setting
      falls back to the shared `'desk'` row; capital is read from the trader's
      **own** rows only, because one trader's deposit is not another's — and the
      carry-over skips the `'desk'` row outright. **Zero is a real answer** and
      stays distinct from null: the card shows the money with no percentage
      rather than dividing by zero. These figures are owned by
      `traderCapital.ts` and deliberately **not** part of
      `DeskSettings`/`updateDeskSettings` — they have a second, broker-driven
      writer, and two write paths into one number is how the two disagree.
    - **Total Capital is what the trader holds right now**: OANDA NAV plus a
      Kraken account's USD-valued equity (`fetchKrakenTradeBalance`), summed
      across their own connections, cached ~60s per trader. Accounts in
      different currencies refuse the total (Kraken's reading is a USD
      valuation, so it only joins a USD desk), and a connection that will not
      answer is **left out and counted** (`unreadable`, named on the card) —
      the Net Worth rule, since a total quietly missing an account looks
      complete while understating.
    - **Live Brokers and its Live Wall tile state what was PAID IN beside what
      each account is worth** (`capitalByConnection`, read into
      `getOandaCapital`). That panel could say an account holds $2,416 and
      nothing about the money that went into it, which is half the question a
      capital screen is being asked. It reads the **stored rows only** — no
      broker call, no refresh — because the capital cards own that refreshing
      and a NAV panel must not become a second thing that triggers a funding
      sync. It applies the same typed-or-synced rule the cards do, so the two
      cannot disagree about which figure is the live one, and an account the
      broker would **not** answer for still reports its deposit (that figure is
      stored here, not read from the broker) rather than showing only an error.
    - The funding read is audited as its own `credential_audit` purpose
      (`funding`, individual rows — a person asked for it, and the row is
      written **after** the broker answers so it carries the real outcome); the
      NAV read rides the existing hourly-aggregated `capital` purpose.
    - `npm run db:check-capital` walks all of it through the real services
      against a scratch database — the per-account isolation and the carry-over
      above all. Like `db:check-sharing` it **writes**, so it refuses any
      database that already holds a user. In `verify:db`, so CI runs it.
  - **A narrowed figure SAYS it is narrowed** (`ExcludedTrades` on the
    `/trades` and `/history` payloads; `workspaces/trading/excludedNote.ts` is
    the one place it is phrased). Two settings quietly shrink what the desk
    scores — a connection's "count trades since" cutoff and the "ignore test
    trades" floor — and both used to do it in silence. A CSV export headed
    `Date range,2026-06-01 to 2026-08-09` listed no June trades at all while
    **nine real ones** sat behind a July cutoff, which reads as "there were no
    June trades" rather than "June is not being counted". On a number somebody
    may present as a track record that is the difference between a narrowed
    figure and a wrong one — the excluded trades were the losing months, so
    hiding them raised the win rate from 40% to 50% and the profit factor from
    2.40 to 3.52.
    - **Counted as the rows are filtered, never recomputed after.** `cutoffFor`
      (`connections.ts`) returns the cutoff that excluded a trade rather than a
      boolean, so the same call both drops the row and says which date dropped
      it; `beforeCutoff` is now defined in terms of it. Tallying against a
      second, parallel test is how a count and a filter come to disagree about
      the same trade.
    - **`cutoffFrom` is null when connections cut off on different dates.**
      Naming one of them would be false for the trades the others excluded, so
      the copy falls back to "before your connection cutoffs".
    - Drawn on the Trade Log (replacing a line that said the floor was on
      without saying whether it had caught anything), written into the CSV
      **directly under the date range** — the line it qualifies — and carried on
      the Live Wall's Desk Metrics tile, which is read on its own with no screen
      around it to qualify the number. Nothing is drawn when nothing was
      excluded, so the absence of the note means everything is counted.
  - **Trade History settings are per trader** (`trading/settings.ts`,
    `getDeskSettings(userId)` / `updateDeskSettings(userId, patch)`): the
    break-even buffer, per-instrument buffers (`trading_be_overrides`, keyed
    `(owner_id, instrument)`; `owner_id = userId`, or `'desk'` for the shared
    default a trader falls back to before customizing), and the "ignore test
    trades" floor all govern **that trader's own view** of the desk. A trader
    edits their own; a **desk lead** — team leader or admin/founder — can edit
    any **teammate's** via the `?userId=` param, gated by
    `trading/deskAccess.ts` (`canEditDeskSettingsFor` / `editableDeskMembers`).
    The `DeskSettingsModal` "Whose settings" picker surfaces this. `getTrades` /
    `getHistory` / `getLiveWall` score each viewer's desk with the **viewer's
    own** settings.
    - **A badge never grants this**, and no badge may again. Holding the Chief
      Analyst / Chief Strategist designation used to make somebody a desk lead;
      both were removed outright (see Position designations below).
    - **The team half is behind the Trading Teams GRANT** (2026-08). Editing a
      teammate's settings — and even seeing their name in the "whose settings"
      picker — is a team surface, and `deskAccess.ts` was the one that gated on
      `actor.teamId` alone. Revoking somebody's grant while leaving them on a
      team therefore left them able to reach teammates here after every other
      team surface had vanished. `isDeskLead` and `canEditDeskSettingsFor` both
      check the grant now. Admins are unaffected — their reach never depended on
      a team.
  - **A funded account is SHARED WITH THE TEAM and owned by ONE TRADER, and
    there can be SEVERAL** (owner decision, 2026-08). `trading_challenges` was
    keyed by `user_id` as its primary key, which said "one prop account per
    person" — wrong twice over, since a trader can run more than one at a time
    and a desk can have a trader on each of their own. Migration `0108` rebuilds
    the table with its own `id` and `user_id` as an ordinary owner column; the
    existing row keeps `id = user_id`, so nothing stored changes hands.
    - **Reads resolve through `visibleTraderIds`, writes match the caller.**
      That is the whole access model, and it means the sharing cannot reach
      anybody who was not deliberately given the **Trading Teams grant** — a
      public signup resolves to itself by construction rather than by a filter
      somebody has to remember. `listChallenges` returns the caller's accounts
      first, then their teammates'; every write (`updateChallenge`,
      `syncEquityFromTradeLog`, the balance screenshot) takes the account id
      **and** the caller and matches on both, answering **404 rather than 403**
      so an id the caller does not own cannot be probed for. A teammate's card is
      watch-only because no write path can reach it, not because the screen hides
      a button.
    - **REMOVAL is the one exception, and only for an ADMIN** (owner request,
      2026-08). `removeChallenge` still refuses a non-owner outright — 404, so an
      id cannot be probed for — **unless the caller is an admin**, which is the
      same install-wide support reach they already hold over trades
      (`tradeDeleteScope`) and over a stranded broker connection
      (`adminRemoveConnection`), and it exists for the identical reason: an
      account somebody else left on the desk otherwise has exactly one person who
      can tidy it, which is no use when that person is not the one looking at it.
      **Editing stays owner-only** — a desk lead does not get to restate somebody
      else's target or equity. The admin path is recorded in the **Administrator
      Log** (`funded.removed`), best-effort, and the payload carries
      `canRemoveAny` so the screen knows where to draw the control — the server is
      still the enforcer, the same shape as `canDeleteAny` on the trade payloads.
      Nothing hangs off the row: the funded BOOK (`funded_accounts` /
      `funded_trades`) is separate, so removing an account takes its settings and
      its equity and nothing else.
    - **A FUNDED ACCOUNT EXISTS BECAUSE SOMEBODY ADDED ONE. Reading this screen
      creates nothing** (owner report, 2026-08). `listChallenges` used to open
      with an `ensureOwnChallenge` that inserted a default 200,000 FTP row for any
      trader who had none — so merely opening Funded Trades, or carrying the Live
      Wall's Funded Account tile on a board, minted a prop challenge in that
      trader's name. On a solo desk that read as a convenience; on a desk that
      shares its funded book it is a fabrication, and it put two people in the
      owner's group on everybody's screen running challenges they had never heard
      of, with only they themselves able to remove them.
      - It is the rule the Live Wall's `source` union and Market Data's
        `sample: true` already state: **a figure nobody supplied must never stand
        in for one that exists.** An empty list is now the ordinary state and the
        screen says so; `getOwnChallenge` returns **null** rather than an invented
        account, and the AI coaching brief answers 400 rather than reading one.
      - **The Live Wall tile distinguishes "not loaded" from "none"** for the same
        reason — a permanent "Loading…" on an account that does not exist reads as
        a broken tile.
      - Migration `0128` clears what the old behaviour left: a row still at every
        seed default with `updated_at` still equal to `created_at`, which carries
        no information at all. The daily roll rewrites `day_start_equity` but
        deliberately leaves `updated_at` alone, which is what makes that column
        trustworthy here. It cannot tell such a row from a first account somebody
        added deliberately and never filled in — the same empty placeholder by
        every measurable property — and that is the accepted cost.
    - **The funded BOOK is shared the same way** (`getFunded` over
      `visibleTraderIdsForUser`): a teammate's Manual Trades accounts and their
      trades appear, owner-tagged (`ownerId` / `owner` / `isMine`), and every
      write still resolves ownership from the caller. Two deletes were tightened
      when this landed — `removeFundedTrade` and `removeFundedAccount` used to
      delete with the owner in the `WHERE` clause, which **silently matched
      nothing** on a teammate's row and answered 200. That was invisible while
      the book was self-only (no teammate could learn an id to aim at) and is a
      lie the client would repeat now that the desk reads each other's books.
      Look the row up, then refuse.
    - **A new account's equity, peak and day-start all start AT its account
      size.** Seeding the 200,000 default into a 50,000 account puts both
      drawdown floors above the equity, so the card opens reading **"Breached"**
      on an account that has never traded. Caught by running the endpoint, not
      by the typecheck — `newRow` takes the size for exactly this reason.
    - `MAX_PER_TRADER` (12) is a runaway-input guard, not a licence question.
  - **The Funded screen carries the funded book's own STATS and its PAST
    TRADES** (`FundedStats.tsx`, `FundedPastTrades.tsx`, both under `FundedBook`
    in `FundedChallenge.tsx`). Funded trades never reconcile into
    `trading_positions`, so they reach neither the Trade Log nor Live Brokers —
    which left the screen stating a challenge with no record behind it.
    - The stats are the **Trade History KPI row scored over the funded book
      alone**: trades, win rate, realized and unrealized P/L, gross profit and
      loss, profit factor and projected PF. Computed by the same
      `tradeStats.ts` functions the desk uses (their input widened to a
      structural `ScoredTrade`, which `TradeRecord` already satisfies), with the
      viewer's own break-even buffer, so a win means the same thing on both
      screens. **Deliberately no Avg Slippage card** — slippage is entry vs.
      plan and a funded trade has no planned entry, so that card could only ever
      read "—".
    - An open funded position's live P/L is **read back off the Live Wall**
      (`fundedPlFor` in `useLivePrices`, keyed on the `funded:<id>` ids the wall
      gives them) rather than derived again here: only the server knows the
      money-per-pip and the FTP lot-to-unit scaling, so deriving it twice is how
      two screens come to disagree about one position.
    - **Money is not totalled across currencies** — accounts kept in different
      ones leave the money cards at "—" with a line saying so, the same rule Net
      Worth follows. Positions the desk could not mark are counted and named
      rather than quietly left out of the total.
    - Past trades are listed newest-first across the desk's accounts, and this
      is also where a **previously completed trade is loaded in** — from a
      trade-history screenshot (the existing AI import) or typed in **with its
      open and close times**. Those two fields are why the form is not the
      Manual Trades one: that form stamps no dates, so a trade entered there
      cannot sit in a day, a month, or the account's P/L windows.
  - **The Funded Account's daily drawdown resets on its own**
    (`trading/challenge.ts`, `rollDayStart`; `trading_challenges.day_start_on`,
    migration `0107`). `dayStartEquity` is what the daily gauge measures against,
    and nothing used to move it: it was written once when the challenge row was
    created and changed only if the trader retyped it by hand, so a gauge
    labelled "Resets daily" was really reporting the whole loss since the
    challenge began — an account down since the start but flat on the day showed
    half its daily allowance spent, in amber, having lost nothing. On the one
    gauge that exists to warn about the breach that ends a challenge, a false
    alarm is the worst failure available.
    - The **first read of a new ET day** rolls the day-start onto the equity the
      account is carrying and stamps the day. That figure is the last equity the
      trader recorded, which is exactly what "what this account started today on"
      means for a book with no API behind it — nothing is invented.
    - The boundary is the **ET calendar day**, matching every other trading-day
      bucket in the terminal (`codes.ts`, `pnl.ts`). A weekend roll is a no-op:
      nothing traded, so the equity has not moved.
    - **A hand-typed day-start is stamped with the day it was typed on**, so the
      next read reads it as today's and leaves the trader's correction alone.
      `updatedAt` is deliberately not bumped by a roll — it records when the
      trader last changed something, and the day turning over is not that.
    - **`day_start_on` is not backfilled by the migration**, on purpose: SQLite's
      `date('now')` is UTC and this boundary is Eastern, so the code that knows
      the rule is the only thing that ever writes the column. A null simply rolls
      on the next read.
  - **Market Data** (`data`, `workspaces/trading/MarketData.tsx` — now a
    **My Terminal** section, files unchanged) is the desk's
    read-only board of every rate, print and price it watches: 75 series across
    ten groups (policy, inflation, labor, yields, FX, commodities, crypto,
    indices, macro, sessions), each with five changes (1D/1W/1M/YTD/1Y) and who
    publishes it / when it was last and is next revised. A bar at the top counts
    down to the next **FOMC** statement and press conference. Two views: the
    series board (search + group filter) and the **Forex Factory economic
    calendar**, which reads the shared `trading_calendar` rows. **This screen is
    the calendar's only home** — Market News used to render the same rows and no
    longer does, so it appears once. Deliberately factual: **no AI note and no
    advice-flavoured copy** anywhere on it, plus an "informational only" footer
    line.
    - The **catalog lives in code** (`trading/marketData.ts`), identical for
      everyone, and is **mostly live** — **51 of the 71** non-session series, from
      **two providers** that both overlay the catalog through the one
      `applyLiveQuotes` seam. Adding a third is more entries handed to that seam,
      not a branch in the catalog. They **do** overlap (the indices and the energy
      rows are sourced from both), and `getMarketData` merges macro first so
      **OANDA wins where it can answer** — its quote is real-time, FRED's is a
      published close.
      - **Prices — `trading/marketQuotes.ts`, from OANDA.** **The pricing account
        is the install's own and is never a customer's**
        (`oandaPricingConfig()` in `trading/config.ts`: `OANDA_PRICING_*`, then
        the general `OANDA_*`, then nothing). It used to fall back to the first
        active OANDA connection on the whole deployment, which meant one trader's
        key served the Market Data board for **every** signed-in account and every
        price alert on the install — spending their rate limit, showing in their
        account activity, with no way for them to know or opt out. That is
        indefensible the moment a stranger connects an account, so the fallback is
        gone and there is no path back to a user connection: `resolveOandaPricingConfig()`
        and `hasPriceSource()` are **synchronous env reads**, and a function that
        cannot await cannot read a credential. Point the variables at a **practice**
        account — the rates are account-independent, so it prices the board exactly
        as well and a leak reaches no money. With none set, those rows keep their
        sample figures and stay marked `sample: true`.
        The FX majors, the
        dollar index, the crypto majors, the commodities and the three US index
        CFDs: spot from `/pricing`, and the 1D/1W/1M/YTD/1Y changes computed from
        `/v3/instruments/{sym}/candles` daily closes. Three subtleties: a
        look-back matches on a candle's **close** (`time + 24h`), never its start,
        or the change reads a close that had not happened yet; **DXY is computed**
        from the six ICE components (it is not an OANDA instrument), so that row
        restates its publisher rather than claiming ICE; and OANDA does not quote
        the **exchange contract** for the metals, energy, copper or indices — they
        are OTC spot and CFDs — so those rows restate the publisher too
        (`OANDA · spot` / `OANDA · CFD`) rather than claiming NYMEX or Cboe.
        **Instrument availability differs per OANDA entity, and most entities are
        narrower than you would guess** — the owner's is **forex-only**, so
        metals, energy and the index CFDs all come back unavailable on it. The
        account's `/instruments` list is checked first, so a symbol it lacks keeps
        its sample figure instead of 400-ing the whole pricing request; crypto
        falls back to the keyless coin feed for spot **and Kraken's public OHLC
        for daily closes**, so BTC/ETH keep real change columns on the entities
        (most of them) that carry no crypto at all.
        **Never assume an OANDA symbol is reachable because the instrument
        exists** — that assumption shipped once and left nine rows sample. The
        indices and energy rows are sourced from FRED as well for exactly this
        reason. Cached stale-while-revalidate (60s spot / 30min candles); a
        failed refresh keeps the last good figures.
      - **Macro — `trading/marketMacro.ts` over `brokers/fred.ts`, from FRED.**
        Policy rates, inflation, the labor prints, the Treasury curve, the VIX and
        the balance sheet. **It needs no API key**: FRED's chart-download CSV
        (`fredgraph.csv`) is keyless and is the fallback, with the documented JSON
        API used when `FRED_API_KEY` is set — and a **rejected** key falls through
        to the keyless read, so a typo degrades to the no-key behaviour instead of
        blanking the board. Four rules carry the design, and each is invisible
        until it is wrong in production: the published number is **transformed**
        into the displayed one (`yoy`, `delta`, `qoqSaar`, … — FRED serves CPI as
        an index and payrolls as a running total); the change columns **subtract**
        rather than percent (a yield 4.05 → 4.02 is `−0.03`, not `−0.74%`);
        a period **shorter than the series' cadence reads a flat zero**, because a
        date look-back from a monthly series' 1-day column otherwise prints the
        previous *month's* move as a one-day move; and look-backs **anchor on the
        latest reading**, not the wall clock, since a June print is still current
        in August (YTD is the exception and anchors on the calendar). `asOf` names
        the period — `Jun`, `wk to Jul 25`, `Q2` — and never says "live". Cached
        30 min, SWR, never replaced by an empty result.
        **`npm run verify:market-macro`** checks all of it offline against
        hand-computed fixtures; run it after touching a transform, a scale or the
        cadence gate.
    - **17 rows can never go live, and 54 of the 71 non-session rows can.** The
      seventeen are the ones **no free provider covers** — CME FedWatch meeting
      odds, the SEP dot plot, BoE/BoJ rates, the 1-year breakeven, the Cleveland
      nowcast, the GDP forecast, the ISM surveys (licensed), the MOVE index,
      blended EPS, the Citi surprise index and the three crypto flow/funding
      rows. **A row nothing can refresh must not claim a reading date**: every
      one of them carries `asOf: 'sample'` rather than a specific day, because a
      fixture stamped "Jul 28" is a fixture asserting somebody read it on the
      28th of July. The ones with a verified figure behind them (the policy
      rates, the ISM prints) keep a real date and are re-checked when the
      catalog is refreshed. **A label must not name a period either** — "Cleveland
      nowcast · Jul" and "Q2 advance GDP" put a stale month in the row's own
      title, where no overlay can ever reach it. The other three
      are **gold, silver and copper**, which need an OANDA entity that carries
      metals and go live on their own once one is connected. **Stooq was tried
      twice for the metals and does not answer a server** — keyless CSV that
      looks like the obvious answer, shipped and retried with browser-ish
      headers, sample both times; do not try it again without new evidence (see
      `docs/design/market-data/NOTES.md`). Each series carries
      `sample: true|false`, the payload's `sampleValues` means "any of it is
      sample", and the screen names which groups read live plus a **Sample** dot in
      the freshness legend on each placeholder row. Keep that marking accurate when
      you wire a provider. The calendar, the session Open/Closed readings and the
      Fed countdown *are* real.
    - **Two consistency rules the board learned the hard way.** A **spread** is
      derived from the two legs the board already shows (`fredMinus`), not read
      from FRED's ready-made `T10Y2Y`/`T10Y3M` — those refresh on their own clock,
      so the spread could reach a day the yield rows had not and print `+47` where
      the rows beside it implied `+45`; the inner join on date makes the three
      reconcile by construction. And a row on the **Fed's schedule** resolves its
      dates from that schedule (`review.last: 'fomc-prev'` beside the existing
      `next: 'fomc'`) rather than a literal, which had the Fed funds row claiming
      a June review while the Fed bar above it correctly said July. The **dot plot
      keeps its literal** — it is published quarterly with the SEP, not at every
      meeting.
    - **A live row restates its review cycle, not just its publisher.**
      `LiveQuote.reviewLast` exists because the catalog gives every price group
      `"continuous"`, which is true of an exchange tape and false of a published
      daily close — leaving it made the S&P and VIX rows say "close" and
      "continuous" at once. Restate the cycle whenever a source publishes on a
      different rhythm than the catalog assumed.
    - **THE FOMC CALENDAR MUST NEVER RUN OUT, AND `verify:market-calendar` IS
      WHAT GUARANTEES IT** (`trading/fomcCalendar.ts`). The schedule held one
      year and `nextMeetingStamp` rolled an exhausted list onto `year + 1` reusing
      its month-days — so the day after a year's last meeting the bar counted down
      to a date the Fed had never published. 2027 opens on the **27th**, 2026 on
      the 28th: one day wrong, stated with total confidence, on the one bar whose
      entire job is saying when the decision lands. Exactly the rule this board
      already enforces everywhere else, broken where it mattered most.
      - **The resolvers refuse rather than extrapolate.** `nextMeetingFrom` /
        `prevMeetingFrom` take full ISO dates and return **0** when the schedule
        is spent; the bar is guarded on that and hides itself. `nextMeetingStamp`
        and the MM-DD pair survive only for a service-worker-cached bundle
        talking to an API from before `meetingDates` existed — **new code uses
        the ISO pair.**
      - **The payload carries both.** `meetingDates` (ISO, spanning years) is what
        the client resolves against; `meetings` + `meetingYear` stay beside it
        because an older cached bundle would read an ISO string as a month-day.
      - **The check fails while three meetings are still ahead**, with the remedy
        in the message — months of warning rather than a board that quietly starts
        lying. When CI tells you to, add the next year. The module is
        **import-free** for the same reason `pushoverRefusal.ts` is: the check has
        to read the schedule with no config, database or network.
      - The Fed publishes about two years ahead and labels the forward year
        tentative. Keep two years loaded.
      - **THE SCHEDULE EXISTS THREE TIMES**, because the public terminal is a
        separate deployment that cannot import it: here, in
        `apps/public-terminal/server/fomcDates.mjs` (the demo feed) and in
        `FALLBACK_MEETING_DATES` in the public adapter. The check reads all
        three **as text** and fails when any disagrees — one is an `.mjs`
        outside that workspace and one is a non-exported const, so importing
        would leave a blind spot exactly where a drifted copy would hide.
        Adding a year means editing three files, and the check names them.
    - **THE FED BAR STATES THE SCHEDULE, NOT THE ODDS ON IT.** It used to draw two
      invented probabilities — "cut 78% · hold 22%" over a green bar, with "cut
      fully priced by December" beneath — as bare fact, carrying **none** of the
      Sample marking every placeholder row on the board carries. Nothing sources
      meeting-by-meeting pricing (CME FedWatch is not a free feed), so it was a
      design fixture that had escaped onto the panel readers treat as
      authoritative — and it hard-coded a **direction**, so by late 2026, with the
      Fed raising, it was still telling every reader a cut was fully priced. It
      lists the next meetings instead, which the terminal genuinely knows. **Do
      not put a probability back on that bar without a provider behind it.**
    - **A meeting's year comes from the meeting.** The bar stamped its date line
      with the payload's `meetingYear`, so January 2027's meeting read "Jan 27,
      2026" the moment the countdown crossed the year.
    - **The Fed decision bar reads its target range from the `ffr` series**, never
      from a literal. It carried a hardcoded "4.25–4.50" in two places, which
      became a visible lie the moment that row went live off FRED — the bar
      claimed a hold at a range the row directly beneath it contradicted. Anything
      the bar states about current policy must come from the payload. **One of the
      two survived as a `|| '4.25–4.50'` fallback** and was still naming a range
      the Fed had left 75bp behind; there is now no literal at all, and the Target
      range stat drops out rather than state a rate nobody read. "Last reviewed"
      says `target X%`, never `held at X%` — the terminal does not know whether the
      last meeting held or moved.
    - **The `review` column ("Last → next review") is real only with a FRED key.**
      Observations cannot answer it — a FRED observation is dated for the period
      it *measures*, not the day it was published — but the keyed
      `series/release` + `release/dates` endpoints can, and there is no keyless
      equivalent. So this is the **one** thing that genuinely differs between a
      keyed and a keyless install: with `FRED_API_KEY` the column shows real
      publication dates, without it the catalog's hand-entered ones (and a date
      that has already passed renders `tbc` rather than a date that has gone).
      Never wire the *observation* date into it — "last reviewed Jun 1" for a June
      CPI print released in July is a worse claim than the schedule it replaces.
      **THE CATALOG HOLDS A CADENCE, NOT A DATE.** Twenty rows carried hand-typed
      release dates and every one of them had passed — the whole column read
      `tbc` on an unkeyed install, and the stored data was a lie waiting to be
      read. Hand-typing twenty more is the treadmill that produced that, so a
      FRED-covered row now states its rhythm (`'monthly'`, `'weekly · Thursday'`,
      `'quarterly'`), which renders verbatim and never goes stale, and the keyed
      release endpoints override it with real dates. **Only a date somebody
      verified and that is still ahead belongs in the catalog** — the BoE's next
      decision, and nothing else.
      A release happening **today is the last one, not the next**, and the **FOMC
      rows are never overwritten** (`next: 'fomc'` resolves off the live meeting
      list, which beats whichever statistical release carries the series).
    - The **arrangement is per user** (`trading/marketDataLayout.ts`,
      `market_data_layout`): the ordered pinned strip, removed series, and
      user-authored "custom metrics". `GET /api/trading/market-data`,
      `GET|PUT /api/trading/market-data/layout`. Unknown series ids are dropped on
      read, so a catalog change never invalidates a saved layout. It is in the
      `admin/service.ts` per-user delete list.
    - `workspaces/trading/etClock.ts` is the single place that **composes an
      absolute Eastern instant** from a wall-clock date/time (a scheduled release,
      an FOMC statement) rather than `now + offset`, which drifts across DST. It
      also holds the session-window, countdown and "in 2h 18m" helpers. Use it
      for anything schedule-shaped; `newsFormat.ts` remains the formatter for an
      instant you already have.
  - **Market News** (`news`, `workspaces/trading/MarketNews.tsx` — now a
    **My Terminal** section, files unchanged) is two things:
    the **headline feed** and an embedded **YouTube live-stream wall**. The feed
    is every story the desk's feeds carry (`GET /api/trading/news` — the same
    shared `trading_news` rows; the payload's `calendar` is now read only by
    Market Data), newest first, bucketed by recency (Last hour / Earlier today /
    Yesterday / dated days), each row tagging the instruments it mentions
    (`newsRelevance.affectedInstruments`) and filterable by topic pill or by the
    Sources rail. One **tape-read glyph** (`SHOW_BIAS`) is the only directional
    cue, and it is drawn **only when headline tagging is actually running** — the
    news payload carries `aiTagging` and both news surfaces gate on it. A
    headline stored while tagging was on keeps a real bias forever, while
    anything ingested since reads `neutral` because that is the column default
    rather than an assessment, so drawing it regardless would mix genuine cues
    with placeholders in one list. All-or-nothing is the honest rendering. The
    same gate covers the Live Wall news tile's bias label and border; its
    **High/Med/Low chip is deliberately not gated**, because that value comes
    from the feed's own per-source setting and is real either way. `tradeNote`
    was already conditional and degrades to the headline's excerpt on its own. Deliberately **removed and not to be reintroduced**: the AI
    overview brief, the "how it could affect us" note, the impact dots/chips, the
    "Most mentioned" rail, and the Trump/Truth Social tab — an "informational
    only, not investment advice" line sits under the feed instead. The economic
    calendar lives on Market Data now, not here.
    - The **live-stream wall** lets a trader follow YouTube channels (plus a
      dockable corner mini-player), so a press conference plays beside the
      headlines. **How many play at once is a tier question** (owner decision,
      2026-08): a free account plays **one**, Premium and above up to **four**
      (`MAX_WATCHING_FREE` / `MAX_WATCHING_PAID`). At one the rail is a
      **selector rather than a set of checkboxes** — picking a channel replaces
      what is playing, the way a television does; above one it adds, and at the
      cap the longest-open tile makes way rather than the click doing nothing.
      Picking the playing one again closes it either way. **The grid is computed,
      never chosen** — one tile takes the full column, more go two across and
      wrap, and two is the ceiling because a quarter-width tile is not a player.
      Do not reintroduce the layout picker. `sanitize` enforces both the count
      and *which* channels the account may play, so a hand-rolled request — or a
      view saved while the account held a higher tier — collapses to what it is
      entitled to.
      - **Yahoo Finance leads the rail** (`inRailOrder`): the one channel a free
        account can play should not sit last under three it cannot open. The
        table has no ordering of its own and the seeded four share a `createdAt`
        (one batch insert), so without that sort the order was whatever SQLite
        happened to return.
      - **Knowing a channel is live and knowing what to play are separate facts,
        and the tile treats them separately.** `live_stream?channel=ID` — the
        keyless channel embed — is the **workhorse player**: it plays these
        channels reliably, needs only the channel id, and shows YouTube's own
        card when the channel is dark. A specific `youtube.com/embed/<videoId>`
        is used **only when the server resolved an id it trusts** (the watch
        page's canonical link, or the Data API), which is what makes a *scheduled*
        broadcast playable — the channel embed cannot show a waiting room.
      - **Never point the player at a guessed id.** That renders "This video is
        unavailable" on a channel broadcasting perfectly well, which is strictly
        worse than the channel embed. It shipped once, from the embed-page route
        below: that page proves a channel is live but carries several ids, so it
        deliberately reports `live: true` with **no** `videoId`.
      - `liveChecked` on the payload is what lets the client tell "we looked, it
        is dark" from "we have not looked" — two states that want opposite tiles.
        Only a positively-dark channel gets the offline card; unknown still
        plays.
      - **A channel can be live and still refuse to play here.** Bloomberg
        Television restricts embedding, and YouTube's way of saying so is the
        bare "Video unavailable" box — on screen, identical to a broken tile. So
        `playableInEmbed` is read server-side (`embeddableFrom`) and surfaced as
        `embedBlocked`, and that tile shows "Live now · does not allow playback
        outside YouTube" with a watch link instead of a dead player. **Absence of
        the flag is not a refusal** — an unmentioned value leaves the tile free
        to try. Nothing here attempts to defeat the restriction; it is the
        broadcaster's setting to make.
      - YouTube does not always state that flag where it can be read, so
        `EMBED_RESTRICTED_CHANNELS` (`marketNewsStreams.ts`) carries the ones
        established by observation instead. Bloomberg is in it on direct
        evidence: it failed through *both* embed routes across several deploys
        while Yahoo Finance played through the identical path each time. Treat
        the list as a statement of fact about a channel — remove an entry as soon
        as it starts allowing embedding.
      - The 16:9 media box is `overflow: hidden` and a container query root, and
        `FedMeetingCard` is sized to fit the ~155px-tall box left by **four tiles
        across**. It once carried an explanatory sentence that wrapped to three
        lines and pushed the card over the tile's own caption. Anything added to
        a card in that box has to survive the narrowest tile.
      - **A scheduled broadcast is embedded too** (`upcoming: true`, never badged
        LIVE). The Fed puts its stream up as a waiting room before a press
        conference; embedding that means the tile rolls into the broadcast by
        itself rather than needing someone to catch the moment it starts.
      - `parseLivePage` reads **only present-tense flags** (`isLiveNow`,
        `liveBroadcastContent`). `isLiveContent` / `isLiveBroadcast` stay true
        forever on the *recording* of a stream that ended, and `/live` on a dark
        channel sometimes lands on exactly that — reading it as live would park a
        replay of the last press conference in the tile, badged LIVE. Keep that
        distinction.
    - **The channel list belongs to the desk, not to the code.** A trader pastes
      a YouTube link and the channel appears for their whole **team** — rows in
      `market_news_channels` scoped by `team_id` (a trader on no team gets
      `user:<id>`, matching `scopedTraderIds`). `SEED_CHANNELS` in
      `trading/marketNewsStreams.ts` (Yahoo Finance, Bloomberg, the Fed, Reuters)
      is a **one-time seed per desk**, not a catalog: once seeded those are
      ordinary rows that can be renamed or removed like any other — the pencil on
      a rail row opens `ChannelEditForm` (rename + the 24/7 tick), and the add
      form carries the same tick. Adding, editing and removing are all on
      `requireMarkets` — **signed in**, deliberately not the trading write guard,
      since Market News is included with every account and demanding the Advanced
      Trading opt-in would lock a user who has not turned the desk on out of
      their own team's wall. The demo is refused by `demoGuard` (every non-GET),
      which is what `canWrite` mirrors on the client.
      `MAX_TEAM_CHANNELS` (24) guards against a runaway list.
    - **`alwaysOn` has to be settable, or it only ever describes the seed.** It
      is what makes a tile keep playing when the server's own live reading says
      dark — the reading a datacenter gets wrong most often (see the player rules
      below). It shipped reachable on the three seeded 24/7 rows and unreachable
      on everything a trader added, so a user-added round-the-clock channel was
      stuck on the "not live right now" card with no remedy. Renaming leaves
      `key` alone (it is derived from the handle and id), so `watching`,
      `docked` and `notify` survive an edit.
    - **Any YouTube URL works** — the link is parsed server-side
      (`parseYouTubeRef`), never by the client, so a hand-rolled request cannot
      smuggle in an arbitrary embed target. `resolveChannelId` then goes
      cheapest-first: the id straight out of a `/channel/UC…` URL (free), then the
      channel's own page (`resolveHandleKeyless`, free, no key), then the Data API
      (`forHandle`, 1 unit, only if a key is set). A channel that resolves is
      watchable immediately; one that doesn't is still saved and filled in later —
      `persistResolvedIds` writes the poller's answer back to the row so it
      survives a restart instead of living only in this process's cache, and
      `resolveMissingIds` retries any id-less row in the background on read.
      **That on-read retry is what makes a keyless install work at all**: the
      poller is production-only *and* needs `YOUTUBE_API_KEY`, and the seeded
      starter channels never pass through the add path, so without it a desk with
      no key sits on "channel ID is still being looked up" forever. It is
      fire-and-forget (a screen load never waits on YouTube) and paced by a
      30-minute per-handle cooldown, so a handle that will not resolve is tried
      once, not on every poll.
    - **Why user-added channels are affordable, given quota used to forbid them.**
      Watching costs nothing: the embed player is keyless, plays when the channel
      is live and shows its own offline card otherwise. Quota is only spent on the
      things *around* the player — the LIVE badge, viewer counts and go-live
      pushes — and that spend is already bounded by the round-robin
      (`YOUTUBE_CHANNELS_PER_TICK`) and the daily ceiling: more channels lengthen
      each one's refresh interval rather than multiplying the daily bill, and the
      poller dedupes across every desk so cost tracks *distinct channels*, never
      headcount. Past roughly 15–20 distinct channels what degrades is how quickly
      a LIVE badge appears, never the ability to watch. **Keep that property** —
      it is the whole reason this list can be user-editable.
    - A channel carries `alwaysOn` for the ones that **broadcast around
      the clock** (Yahoo Finance, Bloomberg, Reuters), shown as a `24/7` tag.
      **Of the starter set the Fed is the only one that is not**, and that is the
      point of it: it is dark between meetings and live for a few hours eight
      times a year, and those are the hours this wall exists for.
      - Because it is dark nearly always, **its tile shows the FOMC countdown
        instead of a dead player** — how long until the next rate decision and
        how long since the last (`FedMeetingCard`, matched by channel id in
        `isFedChannel`). The dates come from `FOMC_MEETINGS_2026` in
        `trading/marketData.ts`, sent on the streams payload as `fomc`, so the
        countdown and Market Data's bar read **one** schedule. Update that list
        each year and both follow.
      - The starter channels' **ids are seeded outright** rather than left to the
        background resolver (migration `0088` backfills desks seeded before
        that). A row with no id cannot embed at all, so the set every desk starts
        with must not depend on a lookup that can fail. *(`0086` was written to do
        that backfill and was never registered in the drizzle journal, so it never
        ran; its file is gone and `0088` carries the work.)*
    - Only the trader's **view state** persists per user in `market_news_streams`
      (`watching` order, `docked`, `cols`, `notify`; migration `0081` dropped the
      old per-user `channels` column). `GET|PUT /api/trading/market-news/streams`;
      in the `admin/service.ts` per-user delete list. Nothing a client sends can
      introduce a channel — every key is checked against the catalog in
      `sanitize`.
    - **Whether a channel is playing no longer depends on the API key.** The
      keyless `/live` read above answers that for every channel, on a short TTL
      (90s live, 2 min dark, 1 min after a failed read), with the screen polling
      the streams endpoint every 45s — so a channel going live reaches an open
      tile in under about three minutes without anyone reloading. There are
      deliberately **two independent routes to a playable tile**: that keyless
      read, and the Data API poller, which now records the live video's own id in
      `LiveState.videoId`. Either producing an id is enough. Do not collapse them
      into one — the wall has to work for a press conference that happens eight
      times a year and cannot be rehearsed.
      - **Those TTLs decide when to re-read, never what to show.** The cache is
        stale-while-revalidate (`cachedLiveRead`): the last answer stands until a
        new one replaces it or it passes `LIVE_VIDEO_MAX_AGE_MS` (15 min). Tying
        the two together is a bug with teeth — a stream playing perfectly well
        drops out of the payload the moment its 90-second reading expires, so the
        tile blanks, and a page refresh timed into that gap makes a working
        stream vanish. That shipped once; do not re-tie them.
      - **A failed read is not darkness.** `readLivePage` returns `{video, ok}`:
        a page understood says either "here is the broadcast" or "this channel is
        dark" (both `ok: true`), while a consent wall, bot check or moved markup
        carries no canonical link at all and is `ok: false`. Only `ok: true`
        reaches the client as `liveChecked`. Collapsing the two tells a client a
        channel is off air on the strength of never having looked, and takes away
        the fallback embed that would have played it — which is exactly how three
        working tiles came to read "not live right now".
      - A channel **never read before** is the one case the response waits on
        (`COLD_READ_BUDGET_MS`, 2.5s), so a cold process paints real state instead
        of a wall of empty tiles for a whole poll cycle. Steady state never waits.
      - **Two pages are tried, and the headers are load-bearing.** A datacenter
        address gets handed YouTube's consent interstitial far more often than a
        laptop does, and that interstitial parses as "could not read" — so the
        keyless fetches send `Cookie: CONSENT=YES+cb; SOCS=CAI` alongside the
        browser-ish UA. If the watch page is still refused, `fetchLiveVideo` falls
        through to the **embed** page (`readEmbedPage`), which is the same
        keyless player the tile itself renders and is built to be served to third
        parties. Observed in production: the browser could play the embed while
        the server could read nothing, which is exactly the gap this closes.
      - **A reading must never suppress the player.** The embedded player is the
        one authority on whether a stream is on — it plays when the channel is
        live and shows YouTube's own card when it is not. A server-side reading
        is a guess by comparison: from a datacenter a consent or redirect page is
        indistinguishable from a dark channel, so "dark" is the answer it gets
        wrong most often. So an `alwaysOn` channel **always attempts to play**,
        whatever the reading says; only a channel that is genuinely dark most of
        the time (the Fed) may skip the player on a negative reading, because
        there the countdown is the better thing to show. Letting the guess win
        replaced a visibly-broadcasting 24/7 channel with "not live right now".
      - **Never say "Offline" about a channel whose state was not established.**
        `liveKnown(c)` (i.e. `liveChecked`) gates every status string and the
        "N live" header count. A tile can be playing via the fallback embed while
        the server has no reading — labelling that "Offline" is the one thing
        that is certainly false, and it shipped once.
      - The Fed tile keeps its countdown when its state is merely *unknown* (dark
        is the overwhelmingly likely truth), **except inside the meeting window**
        (`inFedMeetingWindow`, −2h/+8h around a statement), where it attempts to
        play instead. The countdown must never be what hides the press
        conference.
    - **`YOUTUBE_API_KEY` still governs the extras** (`trading/youtube.ts` +
      `trading/youtubeWatch.ts`): viewer counts and the go-live push.
      `liveStreamsConfigured()` just reports whether that key exists. The watch is
      production-only,
      polls the **union of every trader's channels** deduped (so cost scales with
      distinct channels, not headcount), resolves `@handle → channelId` once and
      caches it — which is what makes a handle-only channel embeddable without the
      trader re-saving it — and buzzes whoever armed the bell on a genuine
      **offline → live edge** (never on the first observation after a restart,
      which would buzz about an already-running stream).
    - **Quota is the whole design constraint, so do not "simplify" the detection
      path.** The Data API allows 10,000 units/day and
      `search.list?eventType=live` — the obvious way to find a live video — costs
      **100 units per channel per check**: 4 channels every 5 minutes would burn
      ~57,600/day and die before lunch daily. Detection instead goes
      `channels.list` (uploads playlist id, cached forever) →`playlistItems.list`
      (recent video ids) → `videos.list` (`liveBroadcastContent === 'live'` plus
      concurrent viewers), which is **2 units** steady-state — a 50× saving, and
      the only reason a real cadence fits. `search.list` survives as an opt-in
      fallback (`YOUTUBE_USE_SEARCH=true`) for a channel whose stream never
      appears in uploads. On top: a daily unit ledger with a hard ceiling
      (`YOUTUBE_DAILY_QUOTA`), a stop-for-the-day on a `quotaExceeded` 403, a
      round-robin `YOUTUBE_CHANNELS_PER_TICK` cap so adding channels lengthens
      each one's refresh interval instead of multiplying daily spend, and a
      negative cache on unresolved handles (else a typo'd handle is re-queried
      every tick forever). A cached live reading older than 30 min is treated as
      unknown, so a stalled poller can never leave a channel stuck showing LIVE.
- **Finances** (green, key `finances`) — personal money for an ordinary person.
  **Deliberately separate from Investments** (owner decision, 2026-08):
  Investments answers "what do I own", Finances answers "what do I earn and
  spend". Folding them together makes one very long sidebar list in which
  neither job is obvious, and Finances is the workspace the average public user
  opens first.
  - **Net Worth** (`fin_networth`) moved here from My Terminal. The screen and
    its route are unchanged; `my_networth` still resolves, so in-app links keep
    working.
  - **Budget** (`fin_budget`, `workspaces/finances/Budget.tsx` over
    `finances/budget.ts` → `/api/finances/budget/*`, migration `0104`).
    - **Money is CENTS, as integers, everywhere below the route.** A budget adds
      and subtracts the same figures repeatedly and binary floats accumulate
      visible error doing that. Dollars are converted to cents at the route and
      back at the formatter, so nothing in between can drift.
    - **An amount is ALWAYS POSITIVE; the category's `kind` carries the sign.**
      Same rule `net_worth_items` follows, for the same reason: a negative
      stored amount reads fine until something sums the column without checking
      the kind, and then the mistake is invisible.
    - **A month is Eastern**, like History's day buckets. A month boundary has to
      be one fact rather than a per-reader one — otherwise December's spending
      moves into November when somebody changes their display zone, and the
      figures appear to change with nothing entered or edited.
    - `occurred_on` is a **date string** (`YYYY-MM-DD`), not a timestamp: the
      feature buckets by month and nothing cares what time of day a coffee was
      bought, so storing an instant would mean picking a zone on every read.
      String comparison then works because that format sorts chronologically.
    - **Archiving keeps history; deleting removes it.** An archived category with
      activity in the month being viewed is still listed, because dropping it
      would silently change a past month's total — the one thing a record of what
      you spent must never do. Delete is for a category created by mistake.
    - **Everything is per user**, like Investments and unlike Trading. Every query
      filters on the caller and no function takes a "whose" parameter. Do not add
      a team dimension.
    - **The aggregator seam is already there**: an entry carries `source` and a
      unique `(user_id, external_id)`, so a read-only provider lands as a second
      writer into the same tables rather than a rewrite. The client can never set
      `source`.
    - **It gives no advice.** No "you are overspending on dining", no suggested
      budgets. A budgeting screen is the easiest place in a finance app to cross
      that line by accident. It states what is true and stops.
- **News** (slate-blue, key `news`) — Market News moved out of My Terminal
  (owner decision, 2026-08), and the workspace is built to grow past markets.
  - **Market News** (`news`) is the same screen with the same key and route —
    only the workspace around it changed, so the `howto` wording and every
    in-app link keep working. **Market Data stayed in My Terminal**: it is a
    board of rates and prices rather than a feed of stories.
  - **World** (`news_world`) and **Politics** (`news_politics`) are one component
    (`workspaces/news/GeneralNews.tsx`) parameterized by topic.
    - **WIRE SERVICES ONLY** (owner decision). Reuters and AP report rather than
      opine, which is the one editorial position defensible to everybody —
      whichever outlets appear here are read as a stance by somebody. **Do not
      add opinion or commentary outlets to these categories.**
    - **No bias glyph, no impact chip, no read-through, no AI summary.** Market
      News earns those because a rate decision genuinely moves an instrument; a
      flood or an election has no read-through the terminal can honestly supply,
      and inventing one is exactly the advice-flavoured surface the product
      avoids.
    - They share `trading_news` — one ingest path, one table — so
      `getMarketNews` **excludes** them explicitly via
      `GENERAL_NEWS_CATEGORIES`. Without that, a Reuters world feed quietly puts
      "Floods displace thousands" in the middle of a trader's headline list.
      The `category` column is plain TEXT (drizzle's `enum` is a TS type, not a
      DB constraint), so widening that list needs no migration.
- **Investments** (teal, key `investments`): a read-only, layman-friendly
  **long-term portfolio tracker** — 401(k), IRA, ESA, and general holdings. This
  is the platform's intended "bread and butter" for a future public/App Store
  launch. **All eight sections are built** (`workspaces/investments/`, one lazy
  chunk via `index.tsx`; `screens.ts` holds the key set separately so `Portal`
  can route without pulling the workspace into the main bundle): Portfolio
  Overview (`inv_overview`), Accounts (`inv_accounts`), Holdings
  (`inv_holdings`), Allocation (`inv_allocation`), Performance
  (`inv_performance`), Dividends & Income (`inv_dividends`), Contributions &
  Goals (`inv_contributions`), Projections (`inv_projections`). Server side is
  `apps/api/src/investments/*` over `routes/investments.ts`. Full build notes and
  the open provider decisions are in `docs/design/investments/NOTES.md`.
  **Regulatory posture (decided with the owner):** strictly a *tracker that
  displays and educates* — no in-app trade execution or money movement (stays in
  Apple's 3.2.1(viii) portfolio-tracker lane) and **no personalized
  buy/sell/rebalance advice** (avoids RIA/adviser exposure). Deliberately **no**
  rebalancing or tax-advice sections, and **no target allocation to measure
  against** — Allocation states what is true ("68% is in one holding"), never
  what to do about it. Every advice-flavored surface carries an "informational
  only, not investment advice" disclaimer (`Disclaimer` in
  `workspaces/investments/ui.tsx`).
  - **Everything is personal, never team-scoped.** An investment account belongs
    to one user:
    every table carries `user_id`, every query filters on the caller, and
    `scopedTraderIds` deliberately does not appear in this workspace. Do not add
    a team dimension here.
  - **Tables** (migration `0087`): `investment_accounts`, `investment_holdings`,
    `investment_transactions`, `investment_snapshots`, `investment_goals` — all
    five in the `admin/service.ts` per-user delete list. **No credential column
    exists anywhere in them**, deliberately: the workspace never places an order,
    so there is no table here that could hold a broker secret. A holding's
    `symbol` is **nullable** because 401(k) menus are full of collective trusts
    and target-date funds with a name and no ticker; a transaction's `tax_year`
    is separate from `occurred_at` because a January contribution can be
    designated to the previous year.
  - **An unpriced holding is never worth zero.** It is excluded from every total
    and *counted*, and the payload carries `unpricedCount` so the screens can say
    how much they could not see. Treating unpriced as zero silently understates a
    portfolio, which is the most misleading thing a tracker can do. Same family
    of rule: a **day move** is only rendered when live quotes cover ≥60% of the
    book, **market gain** is always separated from money that was merely added,
    and dividend **yield is trailing** (what was received) rather than a forward
    figure no available source could support.
  - **Prices come through one seam** (`investments/prices.ts`). Crypto is live
    and keyless; equities/ETFs are live only when `FINNHUB_API_KEY` is set;
    mutual funds and collective trusts have **no free provider** and stay on the
    price the user typed, stamped with when. Every holding reports `live` /
    `manual` / `none` and the UI shows it — the same honesty rule as Market
    Data's `sample: true`. Adding a provider means another entry in that seam,
    not a branch in the service.
  - **Account connection is still manual entry only.** The designed path is a
    **read-only aggregator (Plaid / SnapTrade)** — most retirement providers
    (Fidelity, Vanguard 401k) don't expose per-user API keys the way OANDA/Kraken
    do — and it needs a paid provider account, so it is an owner decision rather
    than a build. `investment_accounts.source` already carries `plaid` /
    `snaptrade` values for it; the client can never set `source` (a manual
    account must not be able to claim it is a verified connection).
  - **Contribution limits are a hand-maintained catalog** (`investments/
    limits.ts`) keyed by tax year, last checked against the IRS notices on
    2026-08-02. A year not in the table reports **no limit** rather than
    borrowing a neighbouring year's, and catch-up amounts are a separate line
    because the terminal has no birthdate. **Update it every year** — it is the
    one figure here where being stale has a real cost. Three traps the checking
    turned up, all asserted by `verify:investments`:
    - a catch-up's starting age is **not always 50** — an HSA's extra $1,000
      begins at **55**, so `catchUpFromAge` is stored per entry rather than
      baked into a field name (it was `catchUp50`, and the screen duly told
      52-year-olds they had room they did not have);
    - SECURE 2.0's **ages 60–63** amount exists from tax year **2025** and
      **replaces** the ordinary catch-up rather than adding to it, so the two
      must never be shown summed;
    - a **SIMPLE** plan at a small employer may run a higher limit than the
      published standard one, which is why that entry carries a note.
  - **Performance history is built forward, never back-filled**: one whole-
    portfolio reading per ET day, written on portfolio read (skipped for the
    demo, which must not accumulate rows). Nothing available can price a 401(k)
    fund as of last March, so any earlier curve would be one that never happened.
  - `npm run verify:investments` checks the portfolio math offline against
    hand-computed fixtures (same spirit as `verify:market-macro`). Run it after
    touching `math.ts` or `limits.ts`.
- **Settings** (slate, key `settings`) — **its own workspace** (owner
  instruction, 2026-08), holding the three rows that were inside My Terminal:
  **Settings** (`my_settings`), **Preferences** (`my_prefs`) underneath it as
  instructed, and **Premium Features** (`my_access`). Every key is unchanged —
  rename a label, never a key — so `howto.*`, the home-screen picker and every
  in-app link still resolve. Last in the sidebar, under Site Help.
  - **The split against Site Help is the thing to keep straight: Settings is
    what YOU can change; Site Help is what the terminal tells YOU.** So the
    legal documents, the announcements, the patch notes and the two intake forms
    all stay in Site Help — none of them is a setting — and nothing that changes
    the account's behaviour lives there.
  - **Site Rules (`my_rules`) stayed on My Terminal** rather than moving here. It
    is the same Rules & Conduct document Site Help carries, surfaced a second
    time by an owner decision; it is a document, not a setting, and My Terminal
    is customizable now, so anybody who does not want it can take it off.
- **My Terminal** (emerald) — **THE ONE CUSTOMIZABLE WORKSPACE** (owner
  instruction, 2026-08). Sections from anywhere else in the terminal can be
  pinned onto it and its own rows taken off — see its own section below. The
  Live Wall left for Advanced Trading, Net Worth for Finances, Market News for
  News, and Premium Features / Preferences / Settings for the Settings
  workspace; every one of those keys still resolves, so in-app links and the
  `howto` wording are unaffected. `DEFAULT_SCREEN.myportal` is **To Do**
  (`td_trading`) — the one remaining row every account can reach. Plus one
  personal roll-up section:
  - **Removed: Investment Holdings** (`my_holdings`). Owner decision, 2026-08 —
    the Investments workspace already tracks the portfolio, so a second screen
    saying the same thing was duplication rather than a roll-up. The screen, its
    nav entry, `GET /api/my-portal/holdings` and the client method are all gone.
    **`myportal/holdings.ts` is NOT dead** and must not be deleted: `getNetWorth`
    reads the portfolio and trading equity through `getMyHoldings`, deliberately
    via that one function so two screens can never disagree about what a
    portfolio is worth. The rules it enforces still matter and still apply:
    - **What may be added together is the whole design.** A trading position's
      **notional is not money anyone owns** — 100,000 units of EUR/USD is a
      leveraged exposure, not $100k of savings — so adding it to a portfolio
      value would overstate by an order of magnitude while looking entirely
      plausible. The combined figure is portfolio value **+ trading account
      equity (NAV) + coins held outright on a spot account**, and nothing else.
      Open positions are exposure and are **never** summed into the total (their
      `value` is deliberately `null`). Do not "fix" that by populating it.
    - **Everything is the caller's own**, not the team's: every trading read
      passes `teamId: null` so `scopedTraderIds` resolves to just this user.
    - **Nothing is silently dropped.** A hand-kept Manual Trades book (no balance
      to read) and a **funded challenge account** (whose balance is the *firm's*
      capital — counting it would be the most flattering error possible) are
      excluded and named. Checked against the tables, never the opt-in flag.
    - A trading account reporting a **non-USD** currency makes `combinedValue`
      null with a note, rather than adding currencies. `getLiveWall`'s **sample**
      fallback is ignored — a made-up position has no place in a figure about
      what someone actually owns.
  - **The screen the terminal OPENS ON is a setting** (`users.home_workspace` /
  `home_screen`, migration `0122`; `theme/homeScreen.ts`, picked in My Terminal ▸
  Settings). Both null = never chosen, which keeps the original behaviour
  (`pickInitialWorkspace`, then that workspace's `DEFAULT_SCREEN`) — nobody who
  ignores the setting notices it shipped.
  - **`homeScreen.ts` is ONE module because the picker and the launcher have to
    agree.** Both call `homeOptions`, so a screen the picker offers is one the
    launcher will open, and the section filters mirror `Sidebar.tsx` exactly — a
    row hidden there must not be offerable as a home page.
  - **A stored choice means "go here if you still can", not "go here".** Roles,
    opt-ins and membership all move after it is saved, so `resolveHome` re-checks
    on every launch: an unreachable *section* falls back to its workspace's
    default screen (closer to what was asked for than leaving entirely), an
    unreachable *workspace* falls back to the old behaviour. The pair moves
    together — a section key means nothing without its workspace — so a
    half-stored choice resolves as no choice.
  - Resolved once in a **lazy initializer**, so it is a starting point rather
    than something that yanks the screen back whenever the user record refreshes.
- **Net Worth** (`my_networth`, `workspaces/myportal/NetWorth.tsx` over
    `myportal/netWorth.ts` → `/api/my-portal/net-worth`) — everything you own
    minus everything you owe, tracked over time. **Built.** Lives in My Terminal
    rather than Investments as a personal cross-workspace summary, keeping the
    Investments workspace a pure portfolio tracker. Tables (migration `0089`):
    `net_worth_items`, `net_worth_snapshots`, both in the `admin/service.ts`
    per-user delete list.
    - **Most of the number is not stored.** The portfolio and the trading
      account are read live through `getMyHoldings` — the one function that
      knows how to total them — rather than recomputed or copied into a row. Two definitions of "what my portfolio is worth" would drift and show
      two different totals on two screens with no way to say which was right.
    - **There is deliberately no category for "brokerage" or "investments"**
      among the hand-entered assets. Offering one invites somebody to type the
      biggest number on the screen in a second time, and nothing could detect
      that afterwards. The screen says outright which parts are automatic.
    - **`value` is always stored POSITIVE**; `kind` (`asset` | `liability`)
      carries the sign. A debt stored negative reads fine until something sums
      the column without checking `kind`, and then the mistake is invisible.
    - **An incomplete total is refused, not approximated.** When the tracked side
      cannot be totalled — a broker that will not answer, an account in another
      currency — `netWorth` is `null` and the screen shows no headline figure. A
      net worth missing a chunk looks complete when it is not. **No snapshot is
      recorded in that state either**, or the history gets a permanent dip that
      never happened.
    - History is built forward, one ET-dated reading per day (last of the day
      stands), never back-filled — nothing can know what a house or a fund was
      worth last year. Skipped for the demo.
- **Studies** (violet): Study Game (`st_game`), Flashcards (`st_cards`),
  Practice Tests (`st_test`), Study Presentations (`st_guides`), Progress
  (`st_progress`), Study Creation (`st_decks` — **last**). **All study content is
  team-built** — there is no hardcoded subject. **Removed: Subjects** (`st_home`,
  `StudyHub.tsx`) — owner decision, 2026-08: with six sections in the workspace a
  landing page listing them was redundant. The screen, its nav entry, its route,
  its how-to entry and the file are gone, and `DEFAULT_SCREEN.studies` is now
  `st_game`. **Study Game / Test Mode /
  Progress** are the same launcher (`StudyGameHub`, parameterized by `target` =
  `play` | `test` | `progress`): each lists the study games in your list and, when
  you pick one, opens the chosen experience — the quiz+leaderboard player
  (`TeamStudyGame`), a graded test (`DeckTestMode`, configurable size + pass line),
  or a progress summary (`DeckProgress`). The list separates games by source with
  two colors — your own games (violet) vs. the terminal's built-in example
  games (blue, `isSample`). Built-in games are **not** shown by default: a **Browse
  Study Games** tile in the grid opens a gallery of them, and the learner adds
  the ones they want into their own list. That add/remove set is a personal,
  device-local preference in localStorage (`sampleGames.ts`, keyed by user id),
  never team data. **Flashcards** (`FlashcardsHub`) is the
  matching launcher for flashcard sets — pick one and study it with the auto-rotate
  `FlashcardSetPlayer`. **Study Creation** (`StudyCreation`) is the make/manage-only
  section (no playing/studying inline), and is a **chooser**: three tiles — study
  games, flashcard sets, study presentations — each opening one maker with a way
  back. Stacked down one page (as it was) every maker's list and form loaded at
  once, so the screen opened three feet long with the thing you came to build
  somewhere in the middle. The makers are the study-game maker+editor
  (`TeamStudyDecks` → `GameWizard` / `DeckEditor`, plus combine-games), the
  **flashcard-set maker** (`TeamFlashcards` — type cards in, AI-generate from a
  topic, or upload a `.txt`), and the study-guide builder (`StudyGuideCreator` —
  build with VTS AI or upload a `.pptx`, parsed client-side in `lib/pptx.ts`).
  **Study Presentations** (`StudyGuidesLibrary`) is the present/manage side — the
  finished guides only, ending with a **Build a presentation** tile.
  - **BUILDING A STUDY GAME IS A WIZARD, IN THE SAME FORMAT AS CREATE A STUDY
    PACKAGE** (owner instruction, 2026-08; `wizard/GameWizard.tsx`). One thing
    per card — how to build it, the name, the topic, how many questions, any
    instructions — ending at a review that restates the answers before anything
    is made. It replaced a single stacked form with three mode tabs, where every
    field for every mode was on screen whether or not it applied.
    - **It is NOT a second package wizard, and must not become one.** That one
      describes the SHAPE of a package, writes nothing, and calls no VTS AI —
      the content comes from the creator's own model. This one builds one
      standalone study game and calls VTS AI to do it. Same format, different
      job, which is why its plan is its own small type rather than a
      `StudyPackageBlueprint`. What they share is `wizardUi.tsx`, so the two
      cannot drift into two different-looking workflows for what a creator reads
      as one job.
    - `TeamStudyDecks.tsx` is the **list and the management** around it; the
      wizard is what creates. The old `DeckComposer` is gone. `errorText` moved
      to `studies/studyErrors.ts` so the wizard and the combine-games form can
      both read it without importing each other.
    - **FOUR ROUTES, AND ONE OF THEM CALLS NO VTS AI** (`gameHandoff.ts`,
      `gameDraft.ts`; owner report, 2026-08). The `handoff` route composes a
      prompt for the creator's **OWN** AI and reads the file it produces — the
      route somebody with a question bank of their own wants. They had to go to
      the package wizard for it and came to the study-game maker instead, which
      is where they were looking; "build them from a file of mine" gave them an
      upload box and no handoff. All four routes land on the same **Check the
      questions** screen and create an ordinary study game.
      - **It is deliberately NOT the package handoff, and must not be folded
        into it.** That one describes a whole package — categories, flashcards,
        slides, lessons — and commits through the package importer, which would
        answer a question the creator did not ask: they are in the study-game
        maker making a study game. This one asks for a list of questions and
        creates a plain deck through `confirmStudyDeck`. What the two share is
        **`RIGHTS_BLOCK`**, because the terminal's position on what it is asking
        an outside model to do is one position, stated once.
      - **THE HANDOFF IS A SCREEN SOMEBODY IS MEANT TO WALK AWAY FROM**, so the
        wizard has a draft (`gameDraft.ts`, per user, on the device, versioned,
        debounced) that records the plan, the step and the **stage**. Leaving and
        coming back reopens on the handoff **with the same Game ID**, so the file
        their AI built overnight is still the one being checked. That fault has
        already been paid for once in the package wizard — do not rebuild it by
        keeping the paste box in React state. `TeamStudyDecks` draws a "waiting
        on your AI" row from the same draft, because reopening the wizard and
        hoping is not a route back.
      - **Backing out of the handoff returns to the questions and changes
        nothing else** — the answers stay and so does the Game ID. **Start over**
        is the one control that mints a new one.
      - **`gameId` is import identity only.** Nothing stores it, and a file
        carrying a different one is a **warning, not a refusal** — the same rule
        the package importer settled on, because everything that establishes the
        CONTENT is checked on the content. Refusing on the id alone only ever
        punished somebody whose saved plan had gone.
      - **Every problem names the thing.** "Question 47 is missing option D",
        not "invalid JSON" — a creator can act on the first and not the second.
        `readGameDocs` strips **one** surrounding code fence and nothing else:
        no brace hunting, no quote repair. A file needing guesswork is a file to
        send back, which is what `buildGameRepairPrompt` is for (the problems
        and the schema, deliberately **not** the whole game — it is enormous and
        is already in the AI's own conversation).
      - **A game too long for one reply arrives as numbered PARTS.** Parts must
        share one `gameId` — a set mixing two is refused rather than combined —
        and a set missing one says **which** parts are still needed instead of
        importing what it has. Parts are ordered by `partIndex` so the questions
        keep their run.
      - **THE QUESTIONS IN HAND ALWAYS WIN, in the body AND in the footer.**
        On this route both are true at once — the stage is still `handoff`, and
        what was read out of the file is sitting in `preview` — so a branch that
        tests the stage first leaves the review screen offering "Check the
        questions" again with **no way to create the game at all**. That shipped
        (Beta V 7.35, fixed in 7.36) because the body already tested `preview`
        first and the footer did not, so the right screen was drawn under the
        wrong button. Test `preview` first everywhere.
        - Worth knowing about how it got through: the browser pass drove the
          route, read the headings, and never looked at the footer on the last
          screen. **Drive a new route to the act it exists for** — the create,
          the save, the send — not to the screen before it.
      - **Nothing is created by checking.** Reading and checking are local and
        repeatable; only **Create study game** writes. A duplicate question is a
        **warning that keeps both**, matching the editor's own repeat marking —
        which of two copies to lose is the author's call.
      - The count step's "however many my material has" is a **stated answer**
        on this route, not a missing one, which is why `stepError` accepts a null
        count there and nowhere else.
    - **THERE IS NO CAP ON HOW MANY QUESTIONS AN AI GENERATION MAY ASK FOR
      BELOW WHAT A GAME CAN HOLD** (owner instruction, 2026-08). The ceiling is
      1,000 — the same figure the deck confirm route and the package blueprint's
      `MAX_QUESTIONS` use — so a game can never be generated at a size that
      could not be saved. It was **50**, which was the bound on ONE model call
      and long outlived the single call: `generateDeckQuestions` batches
      (`DECK_BATCH_SIZE` 8, `DECK_BATCH_CONCURRENCY` 8), so a large number is
      many short calls rather than one long one. **Do not reintroduce a lower
      cap** — an exam bank is as long as the exam behind it.
      - What is real is the **request timeout**, not a policy limit: past
        roughly 150 questions one generation can outrun the hosting gateway.
        The count card says so, in amber, above that figure. That is a fact the
        control cannot state itself, so it is not a tip — and it is a warning,
        never a refusal.
    - **A CUSTOM COUNT'S BOX IS SHOWN FROM LOCAL STATE, NEVER DERIVED FROM THE
      NUMBER.** Derived, the field vanishes the moment what is typed happens to
      equal a preset — typing 50 loses the box at "50", mid-keystroke. The same
      fault was in the package wizard's own count step, which is why that case
      is now `QuestionCountStep` with its own `custom` flag. Reported by the
      owner, 2026-08.
    - **The count and card-count boxes go through `NumberField`.** The obvious
      controlled spelling (`Number(e.target.value) || 1`) cannot represent an
      empty box, so clearing it paints a 1 back and the next digit lands after
      it. See the rule under "A number input must be able to be EMPTY".
  - **Leaderboards changed shape (owner decision, 2026-08).** The terminal's
    **built-in** games have a **PUBLIC** board spanning every account on the
    install; **user-made games have none at all**.
    - **A built-in game is not one deck**, which is the whole design problem.
      `bakedGames.ts` seeds a copy into every scope, so "Market Terminology 101"
      exists once per user and once per team, each with its own id — ranking on
      one id would rank somebody against nobody. `leaderboardDeckIds` resolves a
      built-in deck to **every copy of itself**, matched on the name that
      identifies it in code, and the board spans all of them.
    - A **user-made** deck resolves to no ids, and the route answers **404 rather
      than an empty list** so the client hides the tab instead of opening an
      empty board that reads as broken. The caller must still own a copy of the
      deck to ask, which stops this being a way to probe deck ids.
    - **Opting out** is `users.hide_from_leaderboards` (migration `0103`), set
      from My Terminal ▸ Preferences. Default **off** — a board nobody is on is
      not a board, and what it shows is a display name and an accuracy percentage
      on a study game, not anything about money. An opted-out player is filtered
      from everyone else's board but **still sees their own row**: it is about
      being findable, not about losing your standing.
    - On `users` rather than `user_features` deliberately: the leaderboard join
      already reads `display_name` off that row, so a second table for one
      boolean would be a join for nothing.
    - The Live Wall's leaderboard tile lists **only built-in games** in its
      picker, for the same reason the tab hides — every other option would sit in
      front of an endpoint that 404s.
  - **A game's categories can carry WEIGHTS — the exam blueprint**
    (`studyDecks.category_weights`, migration `0111`; math in
    `workspaces/studies/examWeights.ts`). A category list said which topics a
    game covered and never that the exam behind it gives them **different shares
    of the paper** — the Series 65 devotes a set percentage to each area — so a
    raw "18 of 20" on a sample that drew eight questions from one easy area was
    not the score that exam would give. Set from the game editor's Categories
    card ("Weight categories for scoring"); **null means unweighted**, which is
    every game that predates this and is deliberately *not* the same as every
    weight being zero.
    - **The weights do TWO separate things, and merging them is the mistake.**
      They compose the **draw** (a 20-question sitting on a 15% category takes
      about three from it — `allocateDraw`, highest-averages so a category that
      cannot supply its share hands the rest to whoever is next most
      under-served, capped by what the deck actually holds, always summing to
      the test length), and they compute the **score** (each category's accuracy
      times its share). The score does **not** depend on how many questions were
      drawn — four of five right in a 15% area is worth 15% × 80% whether the
      draw took five questions or fifty. The draw only decides how *precise*
      each estimate is.
    - **An uncovered category is rescaled OUT, never scored zero**, and named on
      the result. Scoring a category the learner was never asked about as zero
      marks them down for questions that were not on their paper — on a short
      sitting that is most of the exam, and the number would read as a real
      result while being nothing of the kind. Same family of rule as Market
      Data's `sample: true` and the Live Wall's `unavailable`: **a figure that
      could not be measured must never be reported as a measured one.**
    - **Weights are stored RAW and normalized on read.** Nothing forces them to
      total 100 — a total half-typed must not block a save — so a list totalling
      95 still scores correctly, and a category renamed or removed cannot leave
      a weight behind that still counts toward the denominator (`resolveWeights`
      re-filters against the category list on **every** category change, not
      only when weights are the thing being patched).
    - **The choice is per sitting**: the Practice Test intro offers weighted or
      plain scoring, and only when the game carries usable weights. Both scores
      are shown at the end whichever was chosen — the gap between them says the
      sample was kinder or harsher than the exam's own mix, which is the one
      thing a plain percentage cannot tell you. A **merged** game is deliberately
      unweighted however its sources were: two blueprints do not add up to a
      third.
    - **Progress shows the weighted score too**, beside the lifetime accuracy,
      for any weighted game. Playing draws evenly across the deck unless the
      learner asks otherwise (below), so this is the figure that says what the
      exam would give for the understanding shown so far however lopsided the
      practice was — on a book of practice heavy in one easy area it reads far
      below the plain accuracy, which is the whole point of it being there.
      - It is **lifetime**, from `cats[c].correct/answered`, because it sits
        beside the Lifetime accuracy card and must be measured over the same
        answers. So the weighted breakdown **restates each category on that same
        lifetime basis** rather than the 100-answer window the plain bars use —
        a breakdown that cannot reconcile with the headline above it is worse
        than no breakdown. An **unweighted** game's bars are untouched.
      - `sum(pointsEarned) === score` and the covered categories'
        `sum(pointsAvailable) === 100` are the invariants that make it
        reconcile; they hold by construction in `weightedResult`.
    - The Study Game **player** and the **leaderboards** stay on raw accuracy.
      The public board spans every copy of a built-in game
      (`leaderboardDeckIds`), and those copies could carry different weights, so
      a weighted board would rank people against different papers.
    - **THE BREAKDOWN IS ON THE GAME SCREEN TOO, AND IT IS ONE COMPONENT**
      (owner request, 2026-08; `workspaces/studies/CategoryBreakdown.tsx` —
      `buildCategoryReport` computes, `CategoryBreakdown` draws). Weights could
      be set in the editor and then said nothing anywhere a learner could see
      while playing: the weighted score and the per-category standing lived only
      on Progress, a screen you have to leave the game to reach. **Both screens
      now render the same component from the same report** — `DeckProgress` was
      rewritten onto it rather than copied from, since two screens computing one
      learner's standing separately is how they come to disagree about it.
      - **`askedShare` is the figure that is genuinely new**: what share of the
        learner's answers came from each area, printed beside what share of the
        exam it carries. A deck holding a different mix of questions than the
        exam does serves a different mix, and until this was drawn there was no
        way to see that from inside the game — the owner noticed one area
        "feeling rare" and the terminal could not say whether it was.
      - **The exam share is the BLUEPRINT share, never `pointsAvailable`.** The
        points are rescaled across the areas actually covered, so before
        everything has been practised the two differ — and reading one as the
        other would claim the exam had changed shape. The rescaling is still
        what the points reconcile against, and the panel names the unpractised
        areas that caused it.
      - **Every weighted area is listed whether or not it has been practised.**
        An untouched one is exactly what the panel exists to surface, so it must
        not be the thing missing from it, and it still shows no accuracy and no
        points rather than a zero.
      - On the game screen it is **folded away by default**, with the weighted
        score and the costliest area on its header — a closed panel still says
        something rather than only offering to. Open or closed is remembered
        (`studyPrefs.categoriesOpen`), since somebody who wants the detail wants
        it every time.
      - The Live Wall's **Study Progress tile** states the weighted score and
        the costliest area too, off the same report. A tile showing only the
        plain accuracy on a game that carries a blueprint is showing the
        flattering half of two numbers.
    - **THE DRAW CAN FOLLOW THE BLUEPRINT, AND IT IS THE LEARNER'S CHOICE**
      (`workspaces/studies/deckDraw.ts`; "Draw by exam weight" in the game's
      Settings panel, stored per deck in `studySession.blueprintDraw`).
      - **`even` is the default and is exactly what the game always did**: one
        shuffled pass over every question, so each is asked once before any is
        asked twice. The mix that produces is whatever mix the DECK holds — four
        areas of 100 questions serve a quarter each however the exam splits — so
        a deck already shaped like its blueprint plays identically either way
        and nobody's game changed on deploy.
      - **`blueprint` picks the area first and the question second**: whichever
        weighted area is furthest behind its share (highest averages, the same
        rule `allocateDraw` composes a practice test with), then from that
        area's **own** shuffled pass. That second half is what stops a
        heavily-weighted area becoming the same handful of questions over and
        over.
      - **An area carrying no weight is never drawn** — it is off the exam — and
        a blueprint no question in the deck matches **falls back to the even
        pass** rather than leaving the game with nothing to ask.
      - Changing it takes effect from the **next** question: the one on screen
        has already been asked, and swapping it out would throw away an answer
        in progress.
      - **THE PASS IS SAVED, AND THAT IS THE POINT OF THE MODULE EXISTING**
        (`vts_deck_draw_<user>_<deck>`, written after every draw). It lived in a
        React ref, rebuilt on mount — so opening the game, answering twenty and
        leaving reshuffled the deck and started again from the top. Across
        sittings that is sampling **with replacement**: on the owner's
        400-question deck, 237 answers reached about 180 distinct questions
        rather than 237, which is exactly what "a lot of repeats, and questions
        I never see" is. Nothing about the shuffle was wrong — it was being
        thrown away. Reported by the owner, 2026-08.
      - **It is keyed by question `seq`, NEVER by array index.** A stored index
        means a different question the moment one is added or deleted, so a
        saved pass would quietly start pointing at the wrong questions. `seq` is
        the stable id the saved session already restores the current question
        by; anything no longer in the deck simply drops out of the pass and the
        rest of it is kept.
      - **A pass saved in one mode is not carried into the other**, and
        switching is the one deliberate act that starts a mode fresh. Blueprint
        mode also carries each area's `served` count across visits — that is
        what keeps the proportions right, or every visit would begin by serving
        the heaviest area again.
      - **Resetting progress clears it**; the game screen states where the pass
        is up to ("312 of 400 not yet asked this round"), which is what makes an
        unexpected repeat legible rather than looking like a fault.
      - **Scoring, levels, streaks and the leaderboard are untouched by any of
        this.** The draw decides what is asked, never what an answer is worth.
    - **The EDITOR flags questions that ask the same thing** — matched on the
      stem alone, with a "Show only repeats" narrowing beside the count. A game
      built by merging two others, or by importing one set twice, holds literal
      duplicates, and nothing anywhere said so: the learner meets them as the
      game repeating itself, which is indistinguishable from a broken draw. It
      **reports rather than hides** — the player still serves every question the
      deck holds, because which of two copies to lose is the author's call.
    - `npm run verify:study-categories` checks all of it offline — the draw's
      proportions over a thousand questions, that an area is never re-asked
      before its pass completes, that a 0% area is never served, that a whole
      deck is worked through across many visits with **nothing asked twice**,
      that a deleted question leaves a saved pass without resetting it, and that
      the report's points reconcile (`sum(pointsEarned) === score`, covered
      `sum(pointsAvailable) === 100`) with an unpractised area named rather than
      scored. None of it can be checked by looking at the running app: the draw
      is a proportion that only appears over hundreds of questions, and the pass
      bug was invisible from inside a single sitting. In `verify`, so CI runs
      it.
  The shared level ladder / streak / scoring math lives in `gameEngine.ts` (used
  by `studyEngine.ts` for per-deck state and mirrored server-side in
  `gameStats.ts`). Studies is lazy-loaded.
  - **THE LEVEL BAR IS SCALED BY WHAT EACH SUB-LEVEL COSTS, NEVER INTO EVEN
    FIFTHS** (`mainLevelProgress` in `gameEngine.ts`, drawn by `LevelBar.tsx`).
    A full bar is the whole **main** level — on 🍊 Orange it fills across all
    five of Orange's stars and completes as 🌽 Corn begins — with a tick at each
    sub-level.
    - A sub-level costs one more correct answer than the one before it
      (`subLevelCost`, 10, 11, 12, … continuously up the ladder), so the ticks
      are deliberately uneven: Lv1's land at 16.7 / 35 / 55 / 76.7%, not at
      20 / 40 / 60 / 80. Five equal fifths would tell a learner their remaining
      work was smaller than it is, on the one screen that exists to say how far
      off the next level is. The bar's span is per level too — Lv1 is 60 correct
      answers, Lv12 is 335.
    - **The segment boundaries are built from the per-sub-level costs and the
      span is their sum**, rather than a start/end subtraction, so the last
      segment ends at exactly 100% and the drawing cannot drift from the ladder
      it is drawing.
    - **The top of the ladder reads FULL.** There is no sixth sub-level to work
      toward at Lv12 ★★★★★, so `isMax` fills the bar rather than parking it at
      the fourth tick for good.
    - **It is fed `levelCorrect`, never `totalCorrect`.** The ladder advances on
      the streak-scaled count; the raw one is lower, so reading it draws a bar
      that disagrees with the level badge beside it. That is exactly what the
      Live Wall's Study Progress tile was doing before this landed.
    - **Ticks sit INSIDE the track, alongside the fills.** Positioned outside
      it they are shifted by the track's own 1px border, so a tick lands a pixel
      or two off the colour change it marks and reads as a rendering fault.
    - Purely a drawing of state that was already stored: no state field, no
      route and no migration, so nobody's progress moves.
  - **STUDY PACKAGES — study content can belong to a PERSON, not a group**
    (`study_packages`, migration `0114`; `studies/packageStore.ts` over
    `studies/packageAccess.ts`, routes `/api/studies/packages/*`). A package is
    a container for one study game, one flashcard set, one presentation, its
    lesson plans and its category blueprint. **Foundation only so far** — the
    creation wizard, the external-AI handoff, the import parser, direct sharing
    and the public library are later stages, and none of them exists yet.
    - **Two ownership models run side by side, and `packageAccess.ts` is the ONE
      place that picks between them.** Legacy content (`package_id = null` —
      everything that exists today) is scoped by `contentScopeId(viewer)` and is
      completely untouched. Package-backed content is reached by owning it, by
      being shared with it, or by it being published, and **never** by being in
      the owner's private group. That is what makes Study sharing work for a
      public signup, who is in no group and cannot be put in one.
      - `resolveContentScope(viewer, kind, id, right)` is the seam that let every
        existing store stay exactly as it was: they all take a scope key, so a
        route passes whatever this returns instead of `contentScopeId(me)`.
        Legacy content resolves to that same value byte for byte; package-backed
        content is decided here and resolves to the row's own stored scope. **Do
        not add `if (packageId)` exceptions to route handlers** — a guard
        exception copied into eleven places will be wrong in one of them.
      - **Package-backed rows are stored under the OWNER'S PERSONAL scope key**
        (`packageScopeKey`), never `contentScopeId(owner)`. Using the latter
        would look natural and would hand every teammate access through the
        legacy path, quietly making a user-owned package group-owned.
    - **Categories have STABLE IDS, and that is the correction the layer exists
      to make.** Legacy categories are identified by NAME everywhere — on the
      deck, on each question's `topic`, in the weights map, and in each learner's
      own per-category statistics — so renaming one silently resets everybody's
      history for it. Here the row id is the identity and the name is what it is
      currently called.
      - The old name-keyed fields are **kept and kept in step** (`topic`,
        `study_decks.categories`, `category_weights`), which is why no player,
        editor or test code had to change. `syncPackageCategories` is the one
        writer of that projection; run it after any category change.
      - A category removed, or a package deleted, **clears the link and leaves
        the `topic` text**, so the content degrades exactly to a legacy
        name-keyed game rather than losing its categories.
    - **`category_weight_mode` states what weights are FOR** (`tracking_only` /
      `draw_only` / `score_only` / `draw_and_score`). Null keeps the legacy
      reading — no weights means unweighted, any weights mean both — so nothing
      already stored changes meaning.
    - **Progress is untouched**: still keyed `(userId, deckId)`, and a shared
      package is the SAME deck id for everybody, so each person keeps their own
      row against it. The headline state fields (`totalAttempted`,
      `totalCorrect`, `levelCorrect`, `bestStep`, `recent`) mean what they always
      did — changing them is a separate scoring project.
    - **REMOVING a package is ARCHIVING it, and archiving changes ONE COLUMN**
      (`archived_at`, migration `0115`). The package, its components, every
      learner's progress, the stable category ids and every future sharing
      relationship are left exactly as they are, so unarchiving is instant and
      lossless. What the flag governs is **listing**: `readablePackages`
      excludes archived ones by default, and since that same set of ids is what
      widens the content lists, an archived package's game, set and presentation
      drop out of the ordinary Study Library and creation views with it. Reading
      one **by id still works**, so a direct link and a restore both do.
      - **Do NOT go back to detaching the content** (`package_id → null`), which
        is what the first cut did. It turns package-owned content into unrelated
        standalone content — severing the stable category links, stranding the
        lessons, breaking what sharing and versioning need — and nothing records
        what the package held, so it cannot be undone. It is destructive in a way
        that does not look destructive.
      - **`purgePackage` is the separate, genuinely destructive path**: it
        deletes the package's content too (the game with its questions, state
        and banked runs; the set with its cards; the presentation), so nothing is
        left carrying a package id that resolves to nothing. **There is no route
        to it and no user-facing workflow** — its one caller is account deletion,
        where a personal package goes with the person like their Investments and
        Net Worth rows do.
    - **The two ownership models are DISJOINT in the list queries**, and the
      `package_id IS NULL` half of each `WHERE` is what makes them so. A
      package-backed row is stored under its owner's personal scope key, which
      for an owner on no team is the *same string* `contentScopeId` gives them —
      so without it the scope test matches package content too and the package
      stops being what decides. Archiving is exactly when that shows: the ids
      drop out and the row would go on being listed by scope alone.
    - **Foreign keys never fire on this database** (`PRAGMA foreign_keys` is
      never turned on — see `db/index.ts`), so a declared `ON DELETE` action is
      documentation, not behavior. Every cleanup is explicit: in `purgePackage`,
      and in the per-user delete list in `admin/service.ts`, which owns the
      package rows an account holds.
    - **THE CREATION WIZARD is the default way to build a study game**
      (`workspaces/studies/wizard/`, opened from the "Create a study package"
      tile on Study Creation). One structural question per card, branching on
      the answers, ending at a review screen. The three existing makers stay
      exactly as they were, directly reachable underneath — they are also where
      the wizard's manual path lands.
      - **It calls no VTS AI endpoint, and that is the point of the workflow**
        (owner decision): the content comes from the creator's OWN third-party
        AI, or from their keyboard. The wizard produces a blueprint describing
        the SHAPE of a package — how many questions, which categories, whether
        there are flashcards — and never a word of the content.
      - **It writes nothing.** No route is called at any point, so nothing
        exists in the database because somebody opened the wizard or reached the
        last card. Creation happens in what comes after: the AI handoff/import,
        or the manual maker.
      - **`blueprint.ts` is the whole model** — the type, `stepsFor` (the path,
        recomputed from the answers, which is what makes the branching work),
        `stepError` (plain-language, local to a card) and `nextStep`. **Add a
        question by adding a `StepId` and a case, never by threading a
        conditional through the shell.** `nextStep` sweeps for anything still
        unanswered before it will open Review, so a step that becomes relevant
        after the user has walked past its place in the path cannot be missed.
      - **The draft is per user, on the device** (`vts_study_package_draft_<id>`,
        debounced, flushed on unmount, restored on open). Navigation here is
        state-based, so leaving the section used to lose everything silently. A
        draft carries its schema version and is DISCARDED rather than repaired
        when that version moves — replaying half-understood answers into a
        changed set of questions produces a package nobody described.
      - **THE DRAFT ALSO RECORDS WHICH SCREEN THE CREATOR IS ON**
        (`DraftStage` = `wizard | ending`, `setDraftStage`; `resumeEnding` in
        `StudyCreation.tsx`). **The AI handoff is the one screen in the terminal
        somebody is MEANT to walk away from** — they take the prompt to their
        own AI and come back, sometimes the next day — and its paste box lived
        only in `StudyCreation`'s React state, so leaving took it with it and
        **nothing anywhere else in the terminal can paste a package in**.
        Reopening the wizard was not the way back either: it restored the
        questions, and finishing them again minted a **new draft id**, which the
        importer then refused the creator's file for. A day's work in somebody
        else's model, unusable, with nothing on screen explaining why. Reported
        by the owner, 2026-08.
        - `pending` is resolved **in a lazy initializer**, like `resolveHome` —
          a starting point, not something that yanks the screen back on every
          re-render.
        - **The route is DERIVED, never stored**, from the same
          `needsExternalAi(bp)` the wizard's finish button reads, so a resumed
          ending can never be a different ending than the one that was left.
        - **Backing out returns the stage to `wizard` and touches nothing else**
          — the answers and the draft id both stay, so the creator is not
          trapped on a handoff they have finished with and has not lost the id
          their file is stamped with.
        - **An absent or unrecognised stage reads as `wizard`.** A draft written
          before this existed resumes to the questions, which costs a few
          clicks; resuming it to a paste box would offer one for a plan that was
          never finished.
      - **A category gets its stable id the moment it is added**, so renaming it
        in the editor is a rename. Same rule as the stored package categories,
        for the same reason.
      - The provider preference and the one-time AI walkthrough are per-user
        device state too, deliberately not package content. The walkthrough is
        an explicit exception to the no-how-to-copy rule (owner instruction),
        and stays reachable afterwards from the handoff step.
    - **THE CONTENT COMES FROM THE CREATOR'S OWN AI, AND VTS VALIDATES IT.**
      That is the economics of the whole workflow: the terminal defines the
      structure and checks the answer, and somebody else's model does the
      writing. **Zero VTS AI calls** in the questionnaire, the handoff, the
      parsing, the validation or the repair instructions.
      - **`wizard/handoffPrompt.ts` composes the handoff locally** from fixed
        sections plus blueprint values, and the behavioral contract is identical
        for every provider — only a heading and a line of onboarding differ,
        because a package written against ChatGPT has to import exactly like one
        written against Claude. It also builds the **repair prompt** the same
        way when validation fails: the failures and the affected import ids, and
        deliberately not the creator's whole package.
      - **Exact per-category question targets are computed, not described.**
        `questionTargets` reuses `examWeights.allocateDraw` — the same
        highest-averages allocator a weighted practice test already draws with —
        so the handoff asks for a split the terminal itself would produce, and
        the importer checks the counts against those same numbers. One
        allocation used twice; a second implementation is how the prompt and the
        validator come to disagree.
      - **The transport format is versioned JSON** (`studies/packageFormat.ts`,
        `format: "vts-study-package"`, `schemaVersion`), because one package
        carries metadata, categories, weights, questions, flashcards, slides and
        lessons at once and a flat table cannot say that. **CSV is untouched**
        and stays the advanced/round-trip route for questions and cards.
      - **Validation is deterministic and lives in `studies/packageValidate.ts`.**
        It reports what PASSED as well as what failed, and every failure names
        the thing — "Question 47 is missing option D", "Expected 15 questions in
        Regulations; found 14". "Invalid JSON" tells a creator nothing they can
        act on. The paste path strips **one** surrounding code fence and nothing
        else: no brace hunting, no quote repair, no fuzzy fixing.
      - **A package too large for one reply arrives as PARTS**
        (`vts-study-package-part`, a `manifest` part plus component parts).
        Every part must carry the same `blueprintId`; a set mixing two is
        **refused rather than combined** (`mixed_blueprints`, still an error —
        one plan's categories with another's questions is a package nothing
        downstream could untangle), and a set missing one says how many are
        still needed instead of importing what it has.
      - **A `blueprintId` that does not match the plan being imported into is a
        WARNING, not a refusal** (`wrong_blueprint`). The id is **import
        identity — never stored, never read after the commit**, and all it
        establishes is that the parts came from one handoff, which the check
        above has already settled. Everything that can establish the CONTENT
        belongs here — the categories, the per-category counts, the limits, the
        structure — still runs and still blocks, so a genuinely wrong file is
        refused on what is in it. Refusing on the id alone had one victim and no
        beneficiary: a creator whose saved plan was gone (cleared browser,
        second device, a package created since) could re-enter an equivalent
        plan and still never import the file their AI had already built, because
        re-answering mints a new id. **Do not put it back to an error.**
      - **Nothing is created by validating.** Validate reads and reports;
        confirm writes. That is what lets a creator paste, read the errors, have
        their AI fix them and paste again with nothing left behind.
      - **`studies/packageImport.ts` commits the whole package in ONE
        transaction** — package, categories, deck and questions, flashcard set
        and cards, presentation, lessons. The inserts are written out there
        rather than delegating to `createDeck`/`createFlashcardSet`/`createGuide`
        because each of those opens its own transaction and they cannot compose;
        the mirroring is deliberate. A failure part-way leaves **nothing**
        (verified, not assumed). **Ids and sequence numbers are assigned by the
        server** — the ids in the file are import identity only and are never
        stored.
      - **The MANUAL ending creates a package too.** It edits a pending draft in
        client state and commits through that same transactional creator, so the
        deck carries `package_id` by construction rather than by a second code
        path remembering to set it. It deliberately does **not** route into the
        standalone maker. The standalone makers stay reachable on their own for
        building one piece outside the wizard.
      - **FINISHING A PACKAGE — adding a part it was created without**
        (`addToPackage` in `packageImport.ts`, `POST /api/studies/packages/:id/add`;
        `wizard/PackageFinish.tsx` and `YourPackages.tsx` on Study Creation).
        `commitPackage` only builds a deck **if questions came with it**, so a
        blueprint asking for none produces a package with no study game — and
        until this existed there was **no route back**: nothing could attach a
        component to a package that already existed. A creator whose AI had
        already written the questions had nowhere to put them, and the package
        could never be finished. Reported by the owner three times before it was
        understood; the first two diagnoses (the vanishing paste box, the plan-id
        refusal) were real bugs and neither was this one.
        - **It ADDS and never REPLACES.** A part that is already there is
          refused **by name** ("This package already has a study game"), because
          replacing is a different act with a different risk — people may
          already have studied the component being thrown away.
        - **A CATEGORY THE PACKAGE ALREADY HAS KEEPS ITS ROW AND ITS ID.**
          Incoming categories are matched on the trimmed, lowercased name — the
          same comparison `syncPackageCategories` makes — and the existing row
          wins, name and weight included. That id is what every learner's
          per-category history hangs off and what the stored weights (the exam
          blueprint) are attached to, so minting a new row for the same name
          would silently reset both. A genuinely new name is **appended** at the
          next `seq`. This is the invariant `db:check-package-add` exists for.
        - **The blueprint is built from the package, not from a saved draft**
          (`finishBlueprint`): its name, subject and above all its categories
          with their stored ids and weights. So the handoff asks the creator's
          AI for exactly what fits, and the importer checks the answer against
          the same thing. **Zero VTS AI calls**, like the rest of this path.
        - **"I ALREADY HAVE THE FILE" IS A SECOND ROUTE, AND IT IS PERMISSIVE**
          (`finishBlueprint(…, permissive)`). Somebody whose AI has already
          written the content does not need a prompt composed for them — and
          the strict blueprint then **refused their file**, because it locks the
          categories to the package's own and demands an exact question total,
          neither of which a file written against a different plan can satisfy.
          A package carrying one category met a file carrying four and was told
          the categories did not match. So this route sets `categoryAuthor: 'ai'`
          (unlocks the categories, and drops the per-category targets with it)
          and `questionCountMode: 'ai_recommend'` (drops the exact total).
          - **It drops the plan-CONFORMANCE half only.** Every limit, every
            structural rule and the schema version still block, and a part the
            package already has is still refused — the checks that keep the
            package sound are untouched. What goes is the set of demands that
            could only ever be true of a file written against this very plan.
          - **`addToPackage` is what makes it land correctly**: a category the
            package already has is reused by name, and the file's own are
            appended. The file's structure survives intact rather than being
            merged into whatever the package happened to carry.
          - Verified end to end — the web's `finishBlueprint` and
            `toImportBlueprint` against the server's `validateDocuments`, on a
            one-category package meeting a four-category file, with the strict
            blueprint asserted to refuse the same file. The paired service-side
            case is in `db:check-package-add`.
        - **One importer, not two.** `PackageImport` takes an optional
          `addToPackageId` and changes only where the confirmed content is
          written; the reading, checking and editing are identical. A second
          importer for the same job is how the two come to validate differently.
        - Guarded by `create` **and** `canEditPackage`, which is what makes a
          **published** package refuse — its content is locked while it is in
          the library. The row says so instead of drawing a button the server
          would reject.
        - `npm run db:check-package-add` walks it through the real service
          against a scratch database (in `verify:db`, so CI runs it). Like the
          other writing checks it refuses any database that already holds a user.
      - **Package CONTENT is edited in the ordinary makers**, which list
        package-backed rows alongside standalone ones — every list route passes
        `readablePackageIds`, and `listDecks`/`listFlashcardSets`/`listGuides`
        widen on it. That was true and completely undiscoverable, so the Update
        panel on Study Creation now says it and opens the right maker. **The
        package layer itself** — its name and subject — is the `PATCH` route,
        which had existed with no client method at all.
      - **A SLIDE HAS ITS OWN IDENTITY, and a lesson points at that** — never at
        a position (`studies/slideIdentity.ts`, migration `0117`). A guide keeps
        its slides as one JSON blob, which is a fine way to hold a presentation
        together and a hopeless way to identify a slide: the editor can move one
        up the deck, and every lesson mapped by position would silently start
        describing different slides. So each slide carries an `id` inside the
        blob, minted by the server the first time it is written, and
        `study_package_lessons.slide_ids` holds those ids.
        - **`keepSlideId` never mints and `withSlideIds` only mints for a slide
          that has none.** The split matters because sanitizing runs on READ too,
          and a read that invented identity would hand out a different id every
          time.
        - **The id has to round-trip through the editor**, or every save looks
          like a deck of brand new slides. That means `getGuide` returns it, the
          route's Zod schema accepts it (zod strips what it does not declare —
          this is the easiest place to break the whole mechanism), and
          `GuideEditor` carries it in its state and sends it back.
        - **Legacy presentations are not migrated.** Their slides simply have no
          id, read and edit exactly as before, and gain ids the next time they
          are saved. A presentation with no lessons is unaffected either way.
        - The blob stays one guide deliberately: a slides table would also give
          identity, and would be a rewrite of a storage model that works.
      - `npm run verify:study-packages` checks the contract offline against
        hand-built fixtures — valid packages, every validation failure,
        multipart assembly, and the slide-identity rules. Run it after touching
        the format, the validator or slide identity.
    - **SHARING IS BY USERNAME, AND IT JOINS NOBODY TO ANYTHING**
      (`studies/packageSharing.ts`, `study_package_shares`, migration `0118`;
      the **Study Packages** section, `st_packages`). One person names another
      and hands over a package. There is no chat attached, no feed, no follow,
      and above all **no group** — which is the whole reason the package layer
      exists, because a public signup is in no trading/private group and none
      can be invented for them.
      - **The recipient is resolved server-side** against the real user table,
        by username or display name (both unique). A typo finds nobody and says
        so rather than reaching whoever was closest. The lookup answers with the
        display name and username and **nothing else** — no email, no roles — so
        a share form cannot become a way to read the user table.
      - **The unique index `(package_id, recipient_user_id)` is what makes a
        repeat share idempotent.** Sharing twice re-offers the same one and the
        client says so; re-sharing to somebody who DECLINED puts it back to
        pending, because an owner asking again is a real thing to want.
      - **Only an ACCEPTED share is access.** A pending one is an offer nobody
        answered, and treating it as access would hand out content on the
        strength of a click that never happened. `respondToShare` matches on the
        recipient as well as the id, so a guessed share id cannot be answered on
        another person's behalf.
      - **REVOKING NEVER TOUCHES PROGRESS.** The share row goes; the recipient's
        `(user, deck)` rows are their own record of work they actually did.
        Deleting somebody's history to enforce a permission that is already
        enforced would be destroying data for nothing.
      - **An archived package grants nothing through a share**, and does not
        appear in anybody's Shared-with-me list. The share row survives, so
        restoring brings it all back exactly as it was.
      - `visibility` is kept honest by `refreshShareVisibility`, which moves a
        package between `private` and `shared` on its own as recipients come and
        go. It deliberately **never** touches `submitted` or `public`: those are
        set by the review workflow, and a share arriving on a published package
        must not quietly unpublish it.
    - **THE VTS STUDY LIBRARY — SUBMITTING IS NOT PUBLISHING**
      (`studies/packageLibrary.ts`, `study_package_submissions`,
      `study_package_adds`; **Admin ▸ Study Library**, `ad_studies`). A creator
      asks; an administrator reads it and decides. Nothing becomes public on a
      timer, and nothing becomes public because it was shared privately with
      somebody.
      - **Three outcomes, and two of them are the same act with different
        words.** Approve publishes it. Reject and "ask for changes" both hand it
        straight back with the package untouched — kept apart because the
        creator reads them completely differently, and a note saying "fix the
        third category" filed as a rejection reads as a refusal.
      - **The attestation is recorded as a VERSION, not a boolean**
        (`ATTESTATION_VERSION`, stored per submission). The wording will change,
        and "they ticked the box" would not say which wording was actually put
        in front of them.
      - **A published package's content is FROZEN** (`locked` in
        `packageAccess.ts`): the owner keeps `manage` but loses `edit`. It is
        public on the strength of what a reviewer read, so letting it be edited
        in place would let what people study drift away from what was approved
        with nobody seeing it happen. Withdrawing or unpublishing is how it
        unlocks.
      - **Reading the library is not joining it.** Anyone signed in may read a
        published package; `study_package_adds` records somebody actually taking
        one up, which is what puts it in their own list and puts them on its
        leaderboard. **No copy is made** — they study the same deck everybody
        else does, and their progress is their own because progress has always
        been keyed by `(user, deck)`.
      - `readablePackages` is therefore **owned + accepted shares + added
        published ones**, deliberately *not* every public package. Dropping the
        whole library into everyone's study game list is not a library; it is
        noise that grows without limit.
      - **An add row is a right of its own, not merely a listing.** `rightsFor`
        grants `read` to anybody holding one, so somebody who took a package up
        keeps it after it stops being public. Without that branch the two halves
        disagreed — the package stayed in their list and then refused to open.
      - **A CREATOR CAN WITHDRAW THEIR OWN PUBLICATION**
        (`withdrawFromLibrary`, `POST /api/studies/packages/:id/withdraw-from-library`;
        `withdrawn_at` / `withdrawn_by_user_id`, migration `0120`). Stopping the
        distribution of your own work must not depend on an administrator being
        available. It is on `guard` and `manage` rather than `create` and
        `edit`, deliberately: a published package is locked against edits and
        withdrawing must not require breaking that lock — or paying, on a
        membership that has since lapsed.
        - **It is its own publication-state transition and NOT an archive or a
          delete.** Nothing is removed: not the package, its game, cards,
          presentation or lessons; not anybody's progress; not the explicit
          username shares, which keep working until separately revoked; not the
          package, category, deck or slide ids. `refreshShareVisibility` then
          settles it at `private` or `shared` depending on what shares it still
          has, so a withdrawal never silently converts it back to legacy
          content.
        - **It stops PUBLIC distribution only.** It leaves library browsing and
          `addToLibrary` immediately, and anyone who had already taken it up
          keeps it — which is the whole point of the add-row branch above.
        - **The record is preserved, and the withdrawal is stamped ONTO the
          approval that ended** — the newest approved submission still carrying
          no `withdrawn_at`. The `status` stays `approved`, because that is what
          was decided; what is added is when the publication ended and who
          ended it. So a package published, withdrawn and published again has
          two independent records rather than one overwritten one, and the
          moderation queue reads both.
        - **`unpublishPackage` (the admin action) DELEGATES to it**, so there is
          one transition with one record whoever performs it. An admin acting on
          somebody else's package additionally writes an Administrator Log
          entry; the owner withdrawing their own does not, since it is not an
          administrative act.
        - **A withdrawn package does not go back on its own.** The content
          unlocks so the creator can work on it, and returning to the library
          takes a fresh submission and a fresh approval — a new attestation
          included. Refused with **409** if it is not currently public, so
          withdrawing twice cannot overwrite the first publication's record.
    - **LEADERBOARD MEMBERSHIP FOLLOWS PACKAGE ACCESS** (`packageAudience`,
      `getPackageLeaderboard`). Two kinds of game have a board and they are
      ranked by the **same code** (`rankDecks` in `deckGame.ts`, which
      `getDeckLeaderboard` also calls, so a percentage means one thing):
      - a **built-in** game, spanning every copy of itself on the install;
      - a **package-backed** game, among the package's own audience — the owner,
        whoever accepted a share, and whoever added it from the library. Never
        trading/private-group membership.
      A legacy user-made game still has none. **Scoring is untouched** — level,
      streak, weighted scoring and every progress calculation are exactly as
      they were; only who appears changed. `DeckSummary.hasLeaderboard` states
      the rule once so the game screen's tab and the Live Wall's leaderboard
      tile cannot offer a game whose endpoint would 404.
    - `npm run db:check-sharing` exercises all of the above through the real
      services against a scratch database. It WRITES (four accounts and a
      package), so it refuses to run against any database that already holds a
      user. **Do not weaken that guard.**
    - **COMPLIANCE COPY IS CENTRALIZED, AND THERE ARE FOUR SENTENCES OF IT**
      (`workspaces/studies/compliance.ts`). The rule is not "say more", it is
      "say it once, where it matters": a wall of disclaimers is worse than a
      short notice at the point of risk, because people stop reading it and it
      makes an educational product look like a legal one.
      - `EDUCATIONAL_NOTICE` + `AFFILIATION_NOTICE` — the standing position,
        drawn by `StudyDisclaimer` at the foot of the study surfaces.
      - `RIGHTS_NOTICE` — `RightsNote`, at the handoff step and nowhere else.
        That is the one point in the wizard where "am I allowed to use this?"
        arises, because it is where a creator hands a brief and possibly their
        own material to somebody else's model.
      - `SCORE_NOTICE` — `ScoreNote`, on the leaderboard and nowhere else. A
        ranked list of people is the one place a study percentage could be read
        as a claim about investment ability, so the correction belongs there.
      The **attestation** is deliberately NOT in that file: it lives server-side
      in `packageLibrary.ts`, versioned, because it is *recorded* against a
      submission rather than merely displayed, and what somebody agreed to has
      to survive the wording changing.
    - **The external-AI handoff carries a standing rights block**
      (`RIGHTS_BLOCK` in `wizard/handoffPrompt.ts`), on the first handoff and on
      the repair instructions alike. Original questions; no copyrighted question
      banks, books or courses; supplied material only where the creator may use
      it; finance content educational; no personalized recommendations; no
      individualized buy/sell/hold; follow the format exactly. Composed locally
      like everything else in that file — **zero VTS AI calls**.
    - **STUDY BUG REPORTS CARRY MACHINE CONTEXT, NEVER STUDY CONTENT**
      (`support/studyContext.ts`, `lib/reportProblem.ts`). "Report a problem" in
      the wizard's validation error and in the import failure opens the
      terminal's EXISTING bug flow — the chat bubble's Support tab, the AI
      intake, `bug_reports`, Admin ▸ Bug Reports — with the diagnosis attached.
      There is deliberately no second, Study-only ticketing system.
      - The point is that the reporter does not have to explain any of it: they
        know the screen said no, not the wizard step id, the schema version, the
        validation codes, or whether they pasted or uploaded.
      - **The schema is a closed list of short scalars** and there is no field a
        package could arrive in. Anything else the client sends is stripped
        server-side, which is the enforcer — the client's list is a mirror.
      - **`sample` is the one exception**, filled only by an explicit press of
        "include a small sample" and capped at `MAX_SAMPLE` (2000). Over-length
        is DROPPED rather than truncated: the client only ever offers 400
        characters, so more could only come from a hand-rolled request, and a
        bug report is never worth refusing over its diagnostics.
      - The context is appended as its own message rather than folded into the
        reporter's words, and is deliberately **not** shown to the AI triage —
        the intake's job is to get a usable description out of a human, and a
        wall of version numbers would give it something else to talk about.
      - It is honoured on a **bug** only. A suggestion or a support question has
        nothing to diagnose.
    - **Developer diagnostics are in the REAL screens, founder-level only.**
      `ValidationDiagnostics` rides on every validation result (versions, ids,
      counts, part indices — no content, on a pass or a failure), and the import
      panel draws it for a founder while an ordinary user gets the
      plain-language errors. `dev/fixtures.ts` builds known-good and known-bad
      packages **against the open blueprint** — generated rather than checked in,
      because a fixture written against last month's plan fails for the wrong
      reason — and each bad one breaks exactly ONE thing. A fixture returns TEXT
      and goes through the ordinary validate-then-confirm path, so a fixture
      behaving differently from a real package is a finding rather than a quirk.
- **Site Help** (blue): How to, Announcements, Patch notes, Report a bug,
  Suggestion, Rules & Conduct, Terms, Privacy. Available to **every** signed-in
  user.
  - **Rules & Conduct is ONE document rendered in two places** — here and My
    Terminal ▸ Site Rules (`my_rules`), both returning `HelpRules` from the same
    `RULES` object in `legal/content.ts`. Deliberately not a copy: two rules
    pages disagree within a month, and the one people read is always the wrong
    one. Edit `RULES` and both follow.
- **Admin** (rose): Users, **Administrator Log**, **Admin Guidelines**, Rule
  Breaking, **Study Library**, Teams, Badges, Message Templates, Patch Notes,
  Early Access, Bug Reports, Support. **Admins only.**
  - **Study Library** (`ad_studies`, `AdminStudyLibrary.tsx`) is the moderation
    queue for the public Study Library — the screen that makes "submitting is
    not publishing" true. See Studies ▸ Study Packages for the whole workflow.
  - **Administrator Log** (`ad_log`, `AdminLog.tsx` over `admin/adminLog.ts`) —
    what administrators have done, and what is waiting on one. **Red = open**
    (still needs somebody), **green = resolved**, **gray = a record that asks
    nothing of anyone**. Grouped into collapsible lists with the open one expanded,
    since the only question the screen exists to answer at a glance is "is anything
    waiting on me".
    - **Two storage models, deliberately.** Administrative **actions** (a manual
      membership grant and its stated reason; a broker connection removed on
      somebody else's behalf) are **stored** in `admin_log` — they
      have no other home and the point is that they cannot be un-recorded.
      **Tickets are projected, not copied**: bug reports, support requests and
      early-access leads are read from their own tables at request time. Closing a
      bug report in Bug Reports turns its entry green here **by itself**. Copying
      them in would mean two rows both claiming to know whether a ticket is open,
      and no way to say which is right the day they disagree. Only a stored entry
      has a Close button; a projected one names the section that closes it.
    - **Suggestions are deliberately absent** — they go to the software developers
      (Developer Terminal ▸ Suggestions), not to admins. Owner decision, 2026-08.
    - `early_access_requests.status` (`new` | `handled`, migration `0090`) exists
      for this: before it, the only way to clear a lead was to delete the person's
      contact details.
  - **Admin Guidelines** (`ad_guidelines`, `AdminGuidelines.tsx`) — the rules
    admins work to and how to handle common situations. **Hardcoded text**, and
    that is the point on this screen in particular: the rules an administrator is
    held to should not be editable from inside the running app by the people they
    govern. Anything stated there as a hard rule (the six-month cap, the required
    note) **is** enforced in `memberships/service.ts` — keep the two in step. **Message Templates** (`ad_templates`,
  `AdminMessageTemplates`) is a shared copy library of reusable text-message
  (SMS) and email templates (`message_templates` table,
  `messageTemplates/service.ts`, routes in `routes/messageTemplates.ts`).
  Reading/copying is open to any admin (`GET` behind `requireAdmin`); only
  software developers / founder-level users may create, edit, or delete
  (`POST|PATCH|DELETE` behind `requireFounder`). A right-click context menu on
  each template (with a visible Copy button as the touch fallback) copies it to
  the clipboard. Templates are site-wide, not per-user — `created_by` is set
  null on author deletion, so they are **not** in the `admin/service.ts`
  per-user delete list.
- **Developer Terminal** (`founder` key/role, amber): **Developer Blog**,
  AI Instructions, Site Wording,
  **Suggestions** (`ad_suggestions` — moved out of the Admin Terminal; the
  `/api/admin/suggestions` read/patch/delete routes are `requireFounder` to
  match, while *sending* a suggestion from Site Help stays open to everyone).
  **Founder-level only** (`isFounder`). Displayed as "Developer Terminal";
  the internal key and role are still `founder` (unchanged gating).
  - **View as role left this workspace** (owner decision, 2026-08) and is now in
    the **account menu**, under the zoom control — `ViewAsRole` in
    `components/TopBar.tsx`, fed by `changeActingRole` in `Portal.tsx`. It was the
    `ad_viewas` section here, and a preview control is the one thing that cannot
    live in a workspace a preview hides: choosing Member removed the Developer
    Terminal and the way back out with it. The menu is on every screen in every
    role, so getting in and getting out are the same two taps.
    - It gates on the reader's **real** roles (`isFounder(user.roles)`), never the
      effective ones — reading the effective roles would rebuild the trap exactly.
    - `changeActingRole` moves you to a workspace the previewed role can reach
      when the current one goes out of reach, so the screen never blanks.
    - The section key `ad_viewas` and `AdminViewAs.tsx` are **deleted**, not
      aliased: nothing in the terminal linked to that screen.
  - **PREVIEW AS — a second axis beside "View as role", and SERVER-SIDE**
    (`dev/preview.ts`, `routes/dev.ts`, `sessions.preview_as`, migration `0119`;
    `PreviewAsTier` in the account menu, `PreviewBanner` in `Portal.tsx`).
    A role says what you are trusted with; this says what you have paid for. Four
    modes: `free`, `premium`, `max`, and `public` (free **plus** the elevated
    roles stripped, which is the only way to see what an ordinary signup meets).
    - **It is authoritative, and that is the whole point.** A client-side flag
      would be a costume: the screen would draw a padlock and the API would go on
      serving the paid answer behind it, so the one thing being tested — does the
      boundary hold — is the one thing it could not show. A preview lives on the
      SESSION, so every request in it is answered for the previewed account:
      guards refuse, payloads narrow, 402s fire.
    - **It never writes to the account.** Temporarily downgrading a real
      membership would be visible to anything else reading that account, and a
      browser closed mid-preview would leave the owner locked out of their own
      terminal with no obvious cause. Signing out ends a preview; a second
      browser is unaffected.
    - **It only ever REDUCES.** Every mode resolves to a tier at or below what
      the account already had. That is what makes it a testing tool rather than
      the generic "turn the safeguards off" switch — there is nothing to turn
      off, only privilege to give up. **Do not add a mode that grants anything.**
    - **One guard reads the REAL roles** — `requireRealFounder`, used by the
      preview and diagnostics routes and nowhere else. Everything else reads the
      effective roles deliberately, because while previewing as the public the
      terminal must refuse exactly as it refuses a member. **Leaving a preview is
      on `requireAuth`**, not the founder guard: previewing as the public makes
      the caller a member, and a guard there would be a one-way door.
    - **The client draws the banner and the controls on `user.preview` /
      `user.canPreview`, never on a role check.** The server computes
      `canPreview` from the real roles, so its presence is itself the authority —
      a role check would take away the way out at exactly the moment it matters.
    - `applyPreview` is applied in `getUserForToken`, the one place a request's
      user is resolved, so nothing downstream knows a preview exists. Rows loaded
      from the database elsewhere carry no `preview` field, which is what keeps a
      preview strictly the previewer's own view of their own account.
    - The demo can never preview, and neither can anybody who is not
      founder-level — checked on every request, so a revoked role drops the
      preview with it.
    - **Developer capabilities live in the real screens**, gated on the
      *effective* roles so a preview hides them: the wizard's `WizardDevPanel`
      (step id, jump, blueprint JSON, clear draft), the importer's fixtures and
      `Diagnostics`, and `PackageStatePanel` on a package. There is deliberately
      no second, developer-flavoured copy of Studies.
  - **Developer Blog** (`ad_blog`, `workspaces/admin/DevBlog.tsx` over
    `devBlog/service.ts`, routes `/api/dev-blog/*`) — the idea board. Posts with
    replies, founder-level throughout including reads. Tables `dev_blog_posts` /
    `dev_blog_replies` (migration `0090`).
    - **"VTS Development" is an `authorKind`, not a user row.** There is no account
      to sign in as, so nothing can authenticate as it and there is no password to
      leak — it is a label plus the `/brand/vts-development.svg` avatar, and the
      authority to write a post still comes from a real founder-level session or
      from a checked-in seed entry. A post attributed to it still records who
      actually wrote it, so the attribution is a display choice rather than
      anonymity.
    - **How a coding agent posts here.** It edits the repository; it has no session
      and no runtime route into production. So a post it writes is an entry in
      **`devBlog/seeded.ts`**, and the deploy that carries the entry publishes it
      (`seedDevBlog` on boot). Keyed on `seedKey`, so a restart **updates** that
      post rather than stacking duplicates, and editing the title or body updates
      the live post next deploy. Deleting a seeded post from the screen means the
      next boot brings it back — remove its entry to be rid of it.
    - **Posts must be brief.** A few sentences. See the brevity rule under
      Reporting back to the owner — it applies to everything an agent writes,
      and this board most of all.

Removed and gone (do not reintroduce or reference): the standalone To-Do
workspace, Vitalis Wealth Management, Personal Finance, the Vitalis LLC business
workspace, and Kia Sales.

## Memberships — the paywall (`memberships/`)

The terminal is invite-only today and is **being opened to the public as a paid
product** (see Product direction). This is the layer that makes that possible, and
it landed before billing did — deliberately, so every feature is already asking
the right question by the time money is involved.

**Three tiers: `free` → `premium` → `max`.** `memberships/tiers.ts` is pure data
(no DB, no roles) and holds all of it; `memberships/service.ts` is the DB half.
They are split because `service.ts` asks `rbac.ts` who is an admin and `rbac.ts`
needs the membership *type* for the public user — importing each other would be a
cycle.

- **`FEATURE_TIER` is the entire paywall, in one object.** Twenty paid features
  (owner decisions, 2026-08). **Max:** `ai`, `studyAsk`, `tradeDesk`, `teams`,
  `teamChat`, `customStreams`, `brokerConnections` (**Trade History ▸ Live
  Brokers carries its diamond**), `pushover`. **Premium:** `funded`,
  `studyExplain`, `studyCreation`, `customBoards`, `premiumBadges`,
  `strategySessions`, `marketData`, `presetStreams`, `suggestions`,
  `supportChat`, `alertSettings`, `tradingNotes`. Everything absent
  from that map is included with every account. **Moving a feature between tiers
  is a one-word edit there** and every guard, lock icon and upgrade prompt
  follows — that is the whole reason features ask `hasEntitlement(user, 'ai')` and
  never "is this user premium". The owner is still deciding what belongs where, so
  keep it editable like this.
- **Adding a paid feature is FOUR maps, not one, and the fourth is what the user
  reads.** `PREMIUM_FEATURES` (the key), `FEATURE_TIER` (what it costs),
  `FEATURE_LABELS` (what it is called) and `FEATURE_BLURBS` (one line on what it
  buys) — plus the same four mirrored in the web's `api/types.ts` and
  `auth/access.ts`. **My Terminal ▸ Premium Features is generated from exactly
  those**, so a feature is only listed on the screen that exists to say what
  Premium and Max include once the label and the blurb are written. **Never make
  something paid without adding it there** (owner instruction, 2026-08): a lock
  the user meets in the terminal but cannot find on the memberships screen reads
  as a fault rather than a price. `Record<PremiumFeature, string>` makes the two
  maps a compile error to forget — do not weaken those types to a partial.
  Then mark it (see the sidebar/table below); a paid feature with no visible mark
  is the same failure one screen further along.
- **Anything that takes the user's own API key or credential is Max** (owner
  instruction, 2026-08). Not for what it costs to run — for what it means to
  hold. A key of somebody else's is a responsibility, and the worst case is their
  money or their account rather than their screen, so the terminal only accepts
  one from the top tier. **The test when adding a feature is simply: does the
  user paste something of theirs into it?** Today that is exactly two surfaces —
  `brokerConnections` (the OANDA token, the Kraken key/secret, AES-encrypted via
  `security/secretbox.ts`) and `pushover` (their Pushover user key). Nothing else
  in the terminal accepts a credential; the FRED, Finnhub, YouTube and Anthropic
  keys are all server-side env, and the Investments workspace has **no credential
  column at all** by design.
  - **Two things stay ungated on a credential feature**, and both matter:
    **reading its status**, so a free account can see what the tier buys rather
    than a blank panel, and **disconnecting**. Blocking the disconnect would
    strand a lapsed member's key in the database with no way for them to remove
    it — the exact custody problem the tier exists to limit. Taking your own
    credential back is always allowed.
  - **Delivery is filtered at send time too**, not just at connect
    (`entitledUserIds` in `memberships/service.ts`, used by `sendPushoverToDesk`).
    Gating only the write would leave a key connected while paying still working
    forever after the tier lapsed. The row is left alone, so it comes back with
    the tier.
  - **Web push is deliberately NOT in `FEATURE_TIER`** and must stay out of it.
    It needs no credential from anyone — the browser issues the subscription — so
    a free account is still told when its price alert fires. That is what makes
    charging for Pushover honest: what Max buys is the Pushover channel and its
    custom sound, never being notified at all.
- **AI is paid except customer support.** Support intake (`routes/support.ts`,
  `routes/feedback.ts`) stays free on purpose: a user who cannot reach help is a
  user who cannot tell you their payment failed. Never put the complaints channel
  behind the thing being complained about.
- **Roles win over rows.** `getMembership` checks `isAdmin(roles)` **first** —
  admins, software developers and founders are **always Max** and never have a
  stored grant. So a missing row does **not** mean Free, and anything listing
  memberships has to resolve the same way (`membershipForRow` in
  `admin/service.ts`). The demo is forced to Max so the tour is complete.
- **`requirePremium(feature)` answers 402, not 403**, and the distinction is
  load-bearing: the client shows an upgrade prompt on a 402 and an error on a 403.
  A paid feature answering 403 would tell a would-be customer they are forbidden
  instead of offering them the thing they would buy. Guards **compose** —
  the Funded tracker is `requireWorkspaceWrite('trading')` + `requireFunded` +
  `requirePremium('funded')`, three different questions.
- **Three axes, and confusing them is the classic mistake here:** a **role** says
  what you are trusted with, a **Premium Features opt-in** says what you have asked
  to see, a **membership** says what you have paid for. A Max member can have
  Advanced Trading switched off; a Free member can have it on and still find the
  paid parts locked. Both are correct.
- **Granting** (`assertCanGrantMembership`): founder-level may grant any tier for
  any length **including indefinitely**; a plain **admin is capped at six months**;
  nobody else may grant at all. **A note saying why is required** — enforced by the
  Zod schema, the service, and the Admin Guidelines screen. `grantMembership` in
  `admin/service.ts` writes the grant **and** its Administrator Log entry in one
  function, so the rule cannot quietly become optional by somebody forgetting the
  second call. Granting to an admin/developer is refused outright rather than
  stored and never read.
- **Storage:** `user_memberships`, one row per user (migration `0090`), in the
  `admin/service.ts` per-user delete list. `expiresAt` null = indefinite; a lapsed
  row is **kept**, not deleted (it is the record of what was granted and by whom),
  so every read checks the date rather than trusting the row exists.
- **Grandfathering:** migration `0090` gives every active account **Max,
  indefinitely**, sourced `grandfather`. Nothing locks up for anyone who was on the
  terminal before it became a paid product. To see what a paying user sees, drop
  your own account's tier from **Admin ▸ Users**.
- **Badges by tier, not by hand.** `premium` (gold star) and `max` (diamond) are
  excluded from `assignableBadgeKeys()` and appended on read in `toPublicUser`, so
  they appear and disappear with the membership and no admin can hand one out as
  decoration. Free has **no** badge — a badge meaning "has not paid" is a mark, not
  recognition. The admin picker in `AdminUsers` mirrors that exclusion; before it
  did, Premium and Max were offered as toggles the server then dropped in silence.
- **One account-status badge, and it leads the row** (owner decision, 2026-08).
  `STATUS_ORDER` in `components/UserBadges.tsx` ranks founder → software developer
  → admin → Max → Premium, and `effectiveBadges` shows **only the highest** of
  them, first, with the recognition badges (Early Release, the designations)
  after. A rung is matched on a badge's `autoRole` where it has one and its `key`
  otherwise — the role badges are the only rows carrying an `autoRole`, and
  `premium`/`max` are the two membership keys, neither of which an admin can edit.
  - **A role badge replaces a tier badge**, because `getMembership` resolves
    admins, software developers and founders to Max without a stored grant — so a
    crown beside a gem states the same fact twice. For the same reason a founder
    shows no admin shield: founder-level is a superset of admin.
  - The tier badge is still **appended server-side** and only suppressed for
    display, so nothing about who holds what changes — this is which of the
    earned badges gets drawn.
- **The web mirror** is `auth/access.ts` (`hasEntitlement`, `TIER_LABELS`,
  `FEATURE_LABELS`, `TIER_COLORS`) reading the maps the **server** computed, rather
  than comparing tiers itself — so moving a feature between tiers never leaves the
  client stale. `components/UpgradeNotice.tsx` is the one upgrade prompt.
- **The sidebar is MARKED by tier, not coloured by it** (owner decision,
  2026-08 — colouring the rows was tried first and reverted). Every row keeps its
  workspace accent; a section that costs something carries a small **star**
  (Premium, `#EBCB74`) or **diamond** (Max, `#B9F2FF`) at the **right** of the
  row. Shown to **everyone**, including a Max member — the nav's job here is to
  say what each part costs, not to act purely as a lock.
  - `SECTION_FEATURE` / `WORKSPACE_FEATURE` (`auth/access.ts`) map a nav key to
    the paid feature gating it; `tierForKey` resolves the tier through
    `membership.featureTiers`, which the **server** sends. That is why
    `MembershipView` carries `featureTiers` as well as `entitlements`: the two
    answer different questions — what this account can REACH, versus what a
    feature COSTS. The badge needs the second.
  - **Sections stack Max → Premium → free** inside each workspace — the paid rows
    lead (owner decision, 2026-08; it was free → Premium → Max until then) — in
    the `NAV` array itself, which is the sidebar's only source of order.
    - **Where a workspace's list starts is NOT what it opens on.** `DEFAULT_SCREEN`
      (`theme/themes.ts`) is separate and deliberately unchanged by this: Studies
      still opens on Study Game, because landing a free
      account on the paid screen now sitting at the top would open the workspace on
      something it cannot use. Advanced Trading already opened on `tradedesk`, so
      there the two now agree by coincidence rather than by rule.
    - Consequence in My Terminal: **My Group, Market Data and Market News sit
      above the Live Wall**, which
      still opens on sign-in (`DEFAULT_SCREEN.myportal` is `live`). The Live Wall
      is no longer the first *row* of the first workspace; it is still the first
      *screen*.
    - The Live Wall's **tile picker deliberately orders the other way** (free →
      Premium → Max, `tileCatalog.ts`): a nav row is a destination, so the paid
      ones lead, while the picker is a catalog being read through and opens on
      what the reader already has.
  - **Only wholly-gated sections are marked** in the sidebar. Several paid
    features have no section of their own, and each is marked **at its own
    control** instead (audited 2026-08 — every one of the paid features
    now carries its mark somewhere a user can see before they hit the paywall):
    | feature | where it is marked |
    | --- | --- |
    | `ai` | the Ask VTS AI panel header |
    | `teamChat` | the chat bubble's Team chat tab |
    | `suggestions`, `supportChat` | the intake choices in `SupportTab` |
    | `brokerConnections` | Trade History ▸ Live Brokers, **and** the Settings section |
    | `pushover` | its panel on Advanced Trading ▸ Alert Settings |
    | `premiumBadges` | the **Badge** button in My Terminal ▸ My Group |
    | `customBoards` | the Live Wall's "Build your own" button |
    | `studyCreation` | the Studies **Create** `ActionTile` |
    | `studyExplain` | the tutor's one-tap opener ("Break this down" / "More Details") |
    | `studyAsk` | beside the tutor's send button, on the field you type into |
    | `presetStreams`, `customStreams` | the Market News channel rail |
    Everything else is a nav row (`tradeDesk`, `teams`, `marketData`,
    `strategySessions`, `funded`, `studyCreation`, `alertSettings`,
    `tradingNotes`) and marked there.
    `customBoards` is deliberately **not** in `SECTION_FEATURE`: the Live Wall
    section itself is free — a free account gets the three built-in layouts, a
    working screen — and only *saving your own* arrangement is paid, so marking
    the whole section would overstate the paywall.
  - **Live Wall tiles are marked in the picker**, every kind listed with the tier
    it costs (or a padlock where the fix is an opt-in rather than a payment), and
    a tile already on a board the reader can no longer reach draws its mark on
    the locked tile itself.
  - **`TierMark` is the mark**, and new code should use it rather than reading
    `TIER_GLYPHS`/`TIER_COLORS` by hand. Two older surfaces predate it and draw a
    *labelled pill* from the same two maps — `ActionTile`/`TierPill` (Studies) and
    `SupportTab`. That is a deliberate size variation on a large tile, not a
    second meaning: same glyph, same colour, same source.
  - `WORKSPACE_FEATURE` is **empty**, and that is correct rather than unfinished:
    no workspace is entirely paid, and marking one that is not would be a false
    claim about every free section inside it.
  - **`gem`, not `diamond`.** In this icon set `diamond` is a rounded tilted
    square; `gem` is the brilliant-cut jewel. Migration `0091` corrects the badge
    row seeded with the wrong one, guarded on the old value so an admin's own
    choice from Admin ▸ Badges is not overwritten.
  - The **badge colours are the same two values** (`badges/service.ts`): the
    Premium star is `#EBCB74`, the Max gem `#B9F2FF`. Change one and change the
    other. Both are kept icier/warmer than the sky blue the terminal signals
    market-watching with (`#5AC8FA`) so a tier marker is never read as one.
- **Three splits worth keeping**, each of which exists so a free account is a
  working product rather than a teaser:
  - **Market Data** — the series board is Premium; the **economic calendar and
    the FOMC countdown on that same screen are free**. A free account renders the
    calendar on its own return path in `MarketData.tsx` rather than threading a
    null payload through every board computation.
  - **Market News streams** — **Yahoo Finance is free**, the rest of the seeded
    wall is Premium (`presetStreams`), and adding your own channel is Max
    (`customStreams`). A free account is sent the **whole** channel list and may
    only play Yahoo: the paid rows are **marked with their tier, not hidden**
    (`FREE_CHANNEL_KEYS` sets each channel's `free` flag, the rail draws a
    `TierMark`, and "+ Add a channel" carries the Max diamond) — the same rule
    the sidebar rows and the Studies tiles follow. Filtering them out of the
    payload was the old behaviour and the wrong shape: somebody on a free account
    could not see what upgrading would give them. The gate is `watchable` in
    `routes/trading.ts`, enforced by `sanitize` on every read and write.
  - **The chat bubble** — **reporting a bug is free on every account and must
    stay that way**: a bug report is the user doing you a favour, and charging
    for it means never hearing about the bug. Suggestions and general support are
    Premium, gated **by kind inside** `/api/support/message` rather than by a
    preHandler, since one endpoint serves all three intake types.
- **Studies: making is paid, playing is not.** A free account works through every
  built-in game, flashcard set and guide and keeps its progress, streak and
  level; authoring is `studyCreation`. Each launcher ends with a **Browse tile**
  and a **Create tile** in the grid rather than buttons in the corner (owner
  decision, 2026-08), and a locked tile is **shown with its tier badge, never
  hidden** — somebody on a free account has to be able to see what upgrading
  would let them do. `workspaces/studies/ActionTile.tsx` is that tile.
  - **The tutor is the exception, and it is split across two tiers** (owner
    decision, 2026-08). `TutorChat` is one component serving both the study game
    and the flashcard player, and its two controls cost different things: the
    **one-tap opener** — "Break this down" / "More Details" — is `studyExplain`
    (**Premium**, star), while **typing your own question**, opener or follow-up,
    is `studyAsk` (**Max**, diamond). The everything-else-about-Studies rule still
    holds: answering questions, keeping your streak, level and progress stay free.
  - **The server splits them on the SHAPE of the request, not the client's word
    for it** (`neededForTutor` in `routes/ai.ts`). One endpoint serves both, so it
    gates inside the handler the way `/api/support/message` gates by intake kind
    rather than by a preHandler. `explain` is the structured form whose prompt the
    route composes, so it carries no user text at all; `seed` is the canned opener
    and only counts as one on an opening turn. Everything else — free text, a
    running thread, a `seed` flag on a conversation already underway — is the Max
    half. **The tutor is therefore no longer part of `ai`**, whose blurb said "and
    the study tutor" and no longer does.
- **The Ask VTS AI button stays in the top bar for everyone** (owner instruction).
  Hiding it would leave a free account unable to discover the feature exists, so
  the panel opens as normal and the composer is replaced by the upgrade notice.
- **Not built yet:** billing. There is no Stripe and no StoreKit — a tier is
  granted by an administrator. `user_memberships.source` already carries
  `'billing'` for when there is. See Product direction for why iOS must use
  StoreKit and the web a separate path.

## Premium Features — the per-user opt-in (`features/service.ts`)

**My Terminal ▸ Premium Features** (`my_access`,
`workspaces/myportal/PremiumFeatures.tsx`) is where a user sees what their
membership includes and turns the optional parts of the terminal on and off for
themselves. The opt-ins are self-service and immediate — there is no approval
queue and no route that changes anyone else's account.

> **The label changed, the key did not.** It was "Feature Access" until 2026-08;
> the section key is still `my_access`, so in-app links keep working — the same
> reason `desk` stayed `desk`. The screen now covers
> **two different things** and keeps them visibly apart: the **membership** (what
> you are allowed to use — see Memberships above) and the **opt-ins** (what you
> have asked to see). Holding Max does not switch an opt-in on for you.

Only two things are optional, and both are the trading desk:

- **Advanced Trading** — the whole `trading` workspace.
- **Funded Account** — **nested under** Advanced Trading. `setUserFeatures`
  refuses `funded: true` while the desk is off, and `getUserFeatures` masks it to
  false regardless of the row — but the user's own tick is **kept** in the row,
  so switching the desk off and back on brings Funded back rather than silently
  forgetting it.

Everything else — **Investments, Studies, My Terminal (including Market Data and
Market News), Site Help** — is included with every account and deliberately has nothing to opt into: none of it
holds money or places an order, and a terminal without it is worth nothing to an
average user. The Premium Features screen lists them as "Included with every
account" rather than hiding them, so the screen reads as the whole picture.

- **Storage:** `user_features`, one row per user (migration `0083`), in the
  `admin/service.ts` per-user delete list. Everything defaults **off** for a new
  account. `tradingAckAt` stamps the acknowledgement that the desk places real
  orders with the user's own broker — **the desk cannot be enabled without it**
  (`FeatureError`), and the stamp survives an opt-out so returning does not ask
  twice.
  - **The table also holds two things that are NOT opt-ins and are NOT edited
    from this screen.** `shareBook` / `bookAckAt` (migration `0093`) is retired
    private mode — stored, never read, see Teams above. `tradingTeams`
    (migration `0100`) is the **grant**: `setUserFeatures` refuses it and the
    route's schema omits it, so the only writer is `setTradingTeamsGrant` from
    Admin ▸ Users. Both ride this row because the plumbing is identical (one row
    per user, already in the per-user delete list, already carried to the client
    on `user.access.features`).
- **Turning a feature off only hides it.** No trade, account or setting is
  touched, so re-enabling restores the workspace exactly as it was. Do not add a
  destructive opt-out.
- **Grandfathering:** migration `0083` gives every pre-existing account
  Advanced Trading (everyone reached it before) plus a stamped acknowledgement,
  and Funded to whoever passed the old role gate. `seed.ts` does the same for the
  first-boot owner, since on a fresh install the migration has nobody to carry
  over.
- **Enforcement is server-side.** `requireWorkspace('trading')` /
  `requireWorkspaceWrite('trading')` check the opt-in as well as the role, so
  every endpoint already behind them inherits the gate. `requireFunded` checks
  the nested opt-in. `requireMarkets` is the always-on guard for the
  market-facing endpoints (news, calendar, market data, boards, price alerts).
  The demo is forced to `advancedTrading: true` (so the tour is complete) and
  `funded: false`, and its writes are refused by `demoGuard` anyway.
- **Routes:** `GET|PUT /api/features` (`routes/features.ts`). The client reads
  the same values off `user.access.features`; `AuthContext.refreshUser()` re-reads
  the user after a toggle so the sidebar and routing update without a reload.
- **The sidebar draws an un-opted workspace dimmed with a padlock** rather than
  hiding it (`OPT_IN_WORKSPACES` in `theme/nav.ts`, `lockedWorkspaces` in
  `Sidebar.tsx`); clicking it opens Premium Features instead of the workspace.
  Keep that — discoverability is the point, and it is where a paid tier would
  surface later.

### My Terminal is customizable (`theme/myTerminal.ts`)

**Sections from anywhere else in the terminal can be pinned onto My Terminal, and
its own rows taken off** (owner instruction, 2026-08 — "put Closed Trades &
Metrics on it if you want it there, and take it off again"). Per user, stored on
the account (`users.my_terminal_sections`, migration `0138`), so the personal
board follows somebody between their phone and their desk.

**THIS IS NOT A NAV ORDER OVERRIDE, and the stored shape is what makes that
true.** AGENTS.md already records why the Developer Terminal's Sidebar Layout
editor was removed and must not come back: it stored a complete ordering
install-wide, so a code change to the nav silently lost to the stored one and
looked like it had not deployed. Nothing here can do that:

- `NAV` still decides the order of every workspace and of every section inside
  one, My Terminal's own rows included.
- **What is stored is only what the account CHANGED** — `{add:[…],hide:[…]}`,
  a diff. `add` is section keys pinned from elsewhere, in the order they were
  added (the only order the user themselves chose); `hide` is My Terminal's own
  rows taken off.
- **So a section added to `NAV` in a later deploy APPEARS**, for everybody,
  customized or not, because nothing stored claims to be the whole list.
- An empty diff is stored as **NULL**, so "never customized" and "customized
  back to the default" are one row with one meaning.

**THE ROWS CAN BE DRAGGED INTO AN ORDER, AND THAT ORDER IS A PARTIAL ONE**
(owner request, 2026-08; `order` on the layout, `applyOrder` /
`reorderMyTerminal` / `nudgeMyTerminal`). The editor lists the board and it is
rearranged by dragging — **or by a pair of arrows on every row**, because HTML5
drag events do not fire on touch at all, so a drag-only list is one a phone
cannot use, and the arrows are also what makes it work from a keyboard.

**`order` LISTS ONLY THE ROWS THE USER POSITIONED, NEVER THE WORKSPACE.** That
is what keeps this on the right side of the rule above rather than a rebuild of
the editor that was removed. A key absent from `order` is not "unplaced and
therefore gone" — it renders after the positioned ones, in its ordinary order.
**So a section added to `NAV` in a later deploy still appears on a board
somebody has arranged**, which is the exact property the install-wide Sidebar
Layout editor destroyed. It arrives at the END, the same rule a pin already
follows: a new row lands where somebody who just gained one looks for it.

- **A key whose row is currently hidden or unpinned is KEPT, not pruned**, so
  turning a row off and on again returns it to where it was put instead of
  dropping it at the bottom of a board that was arranged around it.
- **Both write paths rebuild the stored object by hand**, so a field added to
  the layout and not to them is accepted, validated and then silently dropped —
  which reads as a setting that will not save. The public side tests
  `isDefaultMyTerminal` rather than the fields for that reason; the private
  route cannot import it and names all three explicitly instead. Ordering was
  caught by exactly this: an arrangement with nothing added or hidden read as
  "default" and was written as null.
- `npm run verify:my-terminal` checks it, and the check that matters is **a
  section added in a later deploy still appears** — that only ever shows up on a
  deploy, by which time the person whose board it is has already lost their
  arrangement. Proved by breaking it five ways.

**A pin is a SECOND entry point, never a move.** The section keeps its home in
its own workspace, so taking it off My Terminal can never make it unreachable —
and that is why two navigation rules exist, neither of which is visible from the
editor:

- **`selectScreen` must not resolve the pinned key's owning workspace.** It
  normally does, which is right for an in-app link; on My Terminal it would jump
  the reader to Advanced Trading the moment they clicked the row they had
  deliberately put on their own board.
- **The effect that keeps workspace and screen consistent must accept a pinned
  row.** It tests `nav.sections`, and a pinned key is not in My Terminal's, so
  without the exception it bounces straight back off and the pin appears to do
  nothing.

Both read the same `myTerminalKeys` set Portal computes once, from the same
function the Sidebar uses, so the three cannot disagree.

**MY TERMINAL MAY NEVER BE EMPTIED** (`canApplyMyTerminal`). A workspace with no
rows draws a heading over nothing, and the control that emptied it lives under
that list. The rule is about the RESULT, so it holds however the two lists are
edited.

**The section filters MIRROR `Sidebar.tsx` exactly** — the Funded opt-in and the
Trading Teams grant — which is the same rule `homeScreen.ts` follows for the home
picker: a row hidden in the sidebar must not be offerable here, and a row pinned
here must not be one the sidebar would refuse to draw. A pin whose section no
longer exists is **dropped on read**, like the Market Data layout, so a nav
change never strands a board.

**EVERY FUNCTION TAKES THE NAV IT IS WORKING ON.** The private terminal passes
`NAV`; the public terminal passes its own compile-time allowlist, which is a
deliberately narrower list. One set of rules over two navs — a second copy for
the public shell is how the two come to disagree about what "customized" means.
`MyTerminalCustomizer` takes `nav` as a **required** prop for the same reason: a
default would be the private array, and this component ships in the public
bundle.

**`theme/navGates.ts` EXISTS FOR THE BUNDLE, NOT FOR TIDINESS.**
`FUNDED_ONLY_SECTIONS` and `TEAM_ONLY_SECTIONS` moved out of `nav.ts` because
`myTerminal.ts` needs them and importing them from `nav.ts` pulls the **entire
private `NAV` array** into the public bundle with them. That shipped: "Live
Trades", "Funded Trades", "Strategy Sessions", "Alert Settings" and "Developer
Terminal" were all readable in the public JavaScript while no public screen could
reach any of them. `nav.ts` re-exports both, so every existing importer is
unchanged, and `verify:public-imports` now denies those labels **as nav labels**
(`label:"…"`) rather than as loose prose — "Market hours, strategy sessions and
the Fed schedule stay on Eastern Time" is a real sentence on the Preferences
screen, and a guard that fails on it is one people widen until it catches
nothing.

**The public side stores it too** (`public_preferences`, migration `0013`) — one
jsonb blob per account holding the time zone, the leaderboard opt-out, the home
screen and this. `PATCH /public/v1/preferences` **merges**, because the public
terminal is a cached bundle and an older one saves the subset of settings it
knows about; a key set to null is cleared rather than stored as a null. It rides
`/auth/session` so the shell has it before it draws anything. That route is also
what finally made **Preferences work publicly at all**: `Preferences.tsx` reads
`updateProfile` off `useAuth()` and the public adapter did not provide one, so
picking a time zone threw, silently, on the one screen whose job is changing it.

### The Live Wall — one centralized board (`live`)

**The terminal's one board, and the screen a sign-in lands on** (owner decision,
2026-08). Every part of the terminal can be put on it, which is why it is the
landing screen. There is no lite duplicate to keep in sync — one screen serves a
free account and a full desk alike.

**It LEADS the Advanced Trading workspace** (owner instruction, 2026-08 — it was
the top of My Terminal until then). The key is still `live`, so `howto.live` and
every in-app link resolve unchanged; what moved is the workspace around it.
`DEFAULT_SCREEN.trading` is `live` and `pickInitialWorkspace` prefers `trading`,
so a sign-in still opens on the board. **Consequence to keep in mind rather than
rediscover:** Advanced Trading is an **opt-in**, so the wall now sits behind that
switch — an account that has not turned the desk on cannot reach it, and lands on
My Terminal ▸ Premium Features instead (which is the screen that turns the desk
on). Before the move the wall was reachable by everyone.

> ### CHANGE A SECTION, CHANGE ITS TILE (owner instruction, 2026-08)
>
> Almost every screen in the terminal has a Live Wall tile that restates it —
> Closed Trades & Metrics has Desk Metrics, Live Trades has the Order Ticket,
> Net Worth, Portfolio, Market Data, Market News, To Do, the study launchers and
> the group chat all do too. **The wall is not a separate feature; it is the
> same features in a smaller box.**
>
> So whenever you change what a section shows, computes or is called, **check its
> tile in the same change and bring it with you.** A figure added to a screen and
> not to its tile means two surfaces answering one question differently, which is
> the failure this repo has paid for more than once. The rules that make a
> figure right — what may be summed, whose data it is, what "not measured" looks
> like — travel with it.
>
> Concretely, before you finish: find the tile in
> `workspaces/trading/tileCatalog.ts` (the tile kinds and what each is called),
> render it from `workspaces/trading/tiles/`, and ask whether the change you just
> made is visible there. If the section has no tile, that is fine — say so and
> move on. If it has one and the change does not apply to it, say why. What is
> not acceptable is not looking.
>
> **Reuse the component rather than re-implementing it** wherever the screen's
> own component can take the tile's inputs — the Order Ticket tile renders the
> Live Trades `OrderTicket` itself, and Desk Metrics computes through the same
> `tradeStats.ts` functions the Trade Log calls. A tile that shares the code
> cannot disagree with the screen.

**A POSITION IS MANAGED FROM THE WALL, THROUGH THE SAME CODE THE DESK USES**
(owner request, 2026-08). A trade is watched on the board and was only editable
on Live Trades, so moving a stop meant leaving the screen it was being watched
on. The stop/target editor and the Close control are now on the wall's trade
cards (`TradeCard`, so both the Positions view and the Open Positions tile's
cards layout) and on that tile's compact list.

- **`workspaces/trading/positionEdit.tsx` is the one place that decides who may
  act and what a save does** — `positionEditKind`, `usePositionEditor`,
  `PositionActions`, `ProtectionEditor`. Live Trades' desk book
  (`DeskPositions.tsx`) was rewritten onto it rather than copied from, so the
  three save paths (`modifyDeskPosition` for a broker trade,
  `setFundedTradeProtection` for a funded one, `updatePosition` for a manual
  one) exist once. **Two screens deciding this separately is how one of them
  comes to offer a Close the server refuses, or send a level to the wrong
  endpoint.**
- **Nothing about the boundary moved.** Only the viewer's **own** positions are
  actionable, every write is owner-scoped server-side, a Kraken margin row stays
  watch-only, and a **sample** row carries no controls at all — there is no real
  position behind it. `TradeCard` takes `sample` for exactly that reason; the
  desk book already had it.
- **A broker position's controls are gated on `tradeDesk` here, unlike on Live
  Trades.** That screen is behind `requirePremium('tradeDesk')` in its entirety;
  the wall is reachable on any membership, so without the check a Premium member
  would meet a Close button that only ever answers 402. A hand-kept stop is not
  an order and is not gated.
- The desk's own money formatters moved to `tradeFormat.ts` (re-exported from
  `TradeCard`) so the card and the editor do not import each other.

**`source` has THREE states, and the third one is the point** (`trading/types.ts`,
mirrored in the web `api/types.ts` and on the widget payload):

- **`live`** — a broker was read; these are real positions.
- **`sample`** — this desk has **never connected a broker**, so the wall previews
  itself with representative trades. This is the only case a made-up position is
  honest, and it is a first-run preview rather than a fallback.
- **`unavailable`** — a broker **is** connected and could not be read: the row was
  deactivated (migration `0094`'s credential reset does exactly that), or its
  stored secret will not decrypt under the current key. **No trades are invented
  here.** The wall says the feed is not being read, names the trader's *own*
  broken connections with the reason already recorded on the row, and points at
  Trade History ▸ Live Brokers.

The last two used to be one state — `conns.length === 0` → sample — and merging
them was a real fault. After the credential reset a desk with a perfectly good
OANDA account was shown six invented positions with invented P/L, chipped
"sample", while the one thing the trader needed to read ("re-enter this account's
key") went unsaid. It is the same rule Net Worth already follows when it refuses
to count the sample, and Market Data follows with `sample: true`: **a fabricated
figure must never stand in for one that could not be read.** Do not collapse them
again, and do not make a new surface treat "not sample" as "live".

- The detection reads connection rows **without decrypting**
  (`listStoredConnections` in `trading/connections.ts`): a credential that will
  not decrypt is precisely the case being detected, so the detection cannot
  depend on reading one. It also writes no audit row and cannot mark a connection
  unreadable — it is metadata only.
- Every "nothing to show" string on the affected surfaces is gated on it, because
  **"No open positions" is a claim about the book** and may only be made when the
  book was actually read. Call sites: `LiveWall.tsx`, `PositionsTile.tsx`,
  `TradeDesk.tsx`'s team book (via `sample`), and the Scriptable widget script in
  `DeviceSettings.tsx` — the widget most of all, since a Home Screen glance has no
  surrounding screen to qualify it and "No open positions" there reads as flat.
- Hand-kept **funded** positions are real and still shown in this state.
- The **demo** is unaffected: it is forced down the sample path so its tour is
  complete.

**A hand-kept position is marked from the rest of the desk, and that backfill is
a safety net rather than a nicety** (`fillHandKeptMarks` in `trading/service.ts`).
"Hand-kept" is `manual` **and** `ftp` — a prop-firm position imported from a
screenshot has no more of an API behind it than a manual one does.

- Funded rows are marked by `loadFundedLiveTrades` through the **install's OANDA
  pricing account**, which is best-effort and yields nothing when that account is
  unset, unreachable, or does not carry the instrument (most OANDA entities are
  narrower than you would guess — see Market Data ▸ Prices). When it yields
  nothing the row keeps a null price, so it renders "now —" with no P/L.
- So the backfill runs **twice**: once inside the cached desk snapshot (broker
  rows only, which is what reconcile reads), and again over
  `[...snap.withSlip, ...fundedLive]` — the first point at which the funded rows
  and the broker rows are in the same array. Filling is idempotent, so the second
  pass leaves the first pass's work alone. Funded stays out of the snapshot on
  purpose: it is per-viewer and must not pollute a team-shared cache.
- **Never run it over the sample feed.** Sample trades carry prices, and letting a
  real hand-kept position borrow one would put an invented mark and an invented
  P/L on a trade somebody actually holds — the same rule the `source` union above
  exists to enforce.
- Matching is on the **normalized** symbol (`normSym`), not the raw string: a
  funded instrument is written by an AI reading a screenshot and a broker's is
  written by the OANDA feed, so "EURUSD" and "EUR/USD" have to meet.
- Consequence worth stating: a funded row's P/L is **the market move only**,
  derived from pip math against an OANDA mid. It carries no commission and marks
  off a different feed than the prop firm's, so it will not tie out to the
  platform's own figure to the cent.

**A funded position carries the stop and target it is sitting behind**
(`funded_trades.stop_loss` / `take_profit`, migration `0106`). The screenshot
parser (`ParsedPosition`) had always read both; there was nowhere to put them, so
the route dropped them and `loadFundedLiveTrades` hard-coded a null stop on every
funded position. That is worse than an omission — the desk draws "Stop loss:
none" deliberately, because a position with no protection on it is the most
important thing that panel can say, so a protected trade was being reported as a
naked one in the words reserved for genuine danger. Do not re-hardcode them.

- **Re-pasting an active-trade screenshot UPDATES the protective levels**
  (`onConflictDoUpdate` in `addFundedTrade`). An open position dedupes on
  instrument + side + fill price and deliberately not on time, so a re-paste is
  the same row; doing nothing was right only while the row held nothing that
  could change. It is how a stop moved at the prop firm reaches the desk, and it
  was the only remedy for a position imported before the columns existed. **Only**
  the stop and target are refreshed — the fill, size and open time identify the
  position, so a re-paste must never quietly rewrite those.
- A **closed** trade keeps `onConflictDoNothing`: those dedupe on time + profit,
  and re-posting a history batch must never rewrite what was already logged.
- **The stop and target can also be typed in by hand**, from the Stop / target
  control on each row of Manual Trades ▸ Live funded trades
  (`setFundedTradeProtection` → `PATCH /api/trading/funded/trades/:id`, guarded
  by the same `write` the sibling funded routes use, and owner-scoped in the
  service so it can only ever reach a row the caller entered). A parser that
  misreads a level, or a platform that shows it somewhere the screenshot does not
  reach, otherwise left deleting and re-importing as the only remedy.
  - **Protection only, deliberately.** The fill, size, side and open time
    identify the position and three of them build the dedupe key, so letting them
    be typed over would detach the row from the screenshot it came from and
    quietly break the re-paste path. Correcting one of those is still a delete
    and re-import.
  - **`undefined` leaves a level alone, `null` clears it** — through the Zod
    `.nullish()`, the service patch and the client method alike. Saving after
    changing only the stop must never blank the target by omission.
  - **Not offered on the Trade Desk**, whose row controls send an instruction to
    a broker (`actionable` is `oanda`-only). Editing a note about what a prop
    firm is holding is a different act, and one button meaning both would be
    worse than the walk to the screen that owns the position.

**The three built-in layouts now live in the DATABASE** (`wall_templates`,
migration `0105`), edited from **Developer Terminal ▸ Live Wall Templates**, so
the owner can change the default boards without a deploy.

- **DRAFT THEN PUBLISH.** Every edit writes `draftTiles`; only Publish copies it
  to `publishedTiles`, and `listPublishedTemplates` — the only thing a member's
  picker reads — never touches a draft. Without the split, a half-moved tile is
  what every unpaid account opens on for as long as somebody is arranging the
  board, and arranging takes a few passes.
- **`hasDraft` compares against what is LIVE**, not against the previous draft,
  so dragging a tile and dragging it back leaves the template reading as
  unchanged — because it is.
- **The code presets are the SEED, not the source** (`wallTemplateSeed.ts`, plus
  the web's `presetLayouts.ts` as the client's fallback). `seedWallTemplates`
  creates what is missing on boot and **never overwrites**: once a template is in
  the table it belongs to whoever edits it, and re-applying the code version each
  deploy would silently undo their work. Consequence worth knowing: deleting one
  of the three seeded keys is not really a delete — it returns on the next boot.
  **Hiding is the action that sticks.**
- The web keeps `PRESET_LAYOUTS` as a **fallback** for before the request answers
  and for when it fails. A picker showing three finished layouts from memory is a
  far better failure than an empty one.
- A template with **no tiles stays hidden** however many times Publish is
  pressed, so an empty board is never offered.
- `parseTiles` **clamps** geometry rather than rejecting a layout (a template is
  authored by dragging; refusing the lot over one stray pixel is hostile) but
  **drops an unknown kind** outright — that is not a near-miss, it is a tile the
  terminal cannot render, and keeping it puts a hole in every free board.

**Resizing is from all four CORNERS** (owner instruction, 2026-08), not just the
south-east one. Dragging only from the bottom-right means a tile at the right
edge can be grown but not shrunk from the side you are looking at, and a tile low
on a long board has its one handle off screen. **Corners only, not edges**: an
edge handle runs the whole side of a tile and overlaps its scrollable body, so a
drag meant for the content starts a resize instead. `react-resizable` ships
visuals for the SE handle alone, so `PLACEHOLDER_CSS` draws the bracket on all
four — an invisible hit area is worse than no handle, because the tile resizes
from a corner with nothing to say so.

**Edit mode has to look different from reading mode.** Tiles carry a dashed
outline while editing and the header takes a `grab` cursor; **Escape leaves edit
mode**. Before that the two states were visually identical and the only clue
anything could be dragged was the cursor changing once you were already over a
header.

**The workspace area — a board's width is its own saved setting** (`layout.cols`,
default 12; owner request, 2026-08). Twelve columns is the "mobile width" every
earlier board was built on and stays the default. In edit mode a dotted outline
draws the workspace around the grid.

- **A COLUMN IS A FIXED SLICE OF WIDTH, NOT A FRACTION OF A FIXED BOARD**, and
  this is the whole point of the feature. The Live Wall screen is capped at
  `WALL_W` (1280) and centred (`LiveWall.tsx`), so on a television the board was
  a strip down the middle with most of the screen unused. Widening the workspace
  therefore **lifts that cap** — 12 columns asks for 1280, 18 asks for 1920 —
  via `baseWidth` / `onWorkspaceWidth` between `LiveWall` and `ChartBoard`. The
  dotted box **grows** and the tiles keep their size.
  - The first cut got this backwards: it added columns *inside* the 1280 cap, so
    every extra column made all the existing ones thinner and the whole board
    shrank — the opposite of what widening is for. Shipped in Beta V 6.80 and
    fixed in 6.81. **Do not reintroduce a width that subdivides a fixed board.**
  - Consequence worth knowing: the two numbers must stay one number. `WALL_W` is
    both the screen's default cap and the pixel width of the default 12-column
    workspace, which is why it is **passed into** `ChartBoard` rather than
    restated there. `LiveWall` is also where the cap is applied, so the
    **Positions view keeps the default width** whatever the board is set to.
- **The screen is the ceiling, and it is clamped against rather than discovered
  by overshooting it.** `availWidth` — the content area measured on a full-width
  wrapper *outside* the capped wall, since the wall can never report space it is
  not allowed to occupy — gives `maxCols = floor(availWidth / (WALL_W / 12))`.
  Growing stops one column before anything would have to get thinner, so
  reaching the edge of the screen costs no tile width at all. (Reacting to a
  board that came back narrower than it asked for also works, and was tried; it
  costs a visible column of shrink every time somebody reaches the edge.)
- **Only growing is capped, never rendering.** A board arranged on a television
  and opened on a laptop still renders — it fits itself to the width, denser,
  exactly as before — and its stored `cols` is left alone. Nothing on a smaller
  screen may rewrite the width a board was built at.

- **The workspace is LOCKED even in edit mode**, deliberately: arranging tiles
  and sizing the canvas are different acts, and a drag meant for a tile must
  never change the canvas under it. The tiny pencil on the frame's top-right
  corner is the only way in. While unlocked the mirror rule applies — the
  **tiles freeze** (RGL drags off, pointer-events off) — and **Escape locks the
  workspace back up before it will leave edit mode**. Leaving edit mode, or
  switching layouts, always relocks.
- **Sizing is by whole columns from either side**: drag a side handle (notched,
  ~48px per column) or step with the − / + beside the width readout. Growing the **left** inserts columns there
  and shifts every tile right, so the arrangement keeps its place; shrinking
  only ever removes **empty** columns, clamped against the geometry recorded at
  pointer-down (a left drag shifts the tiles, so mid-drag geometry is the wrong
  clamp). Bounds 6–36, and the screen's own ceiling above. While unlocked the
  board pulls in 44px from each side (plain padding — deliberately no transform,
  which would reopen the two-coordinate-space trap `lib/measure.ts` closes) so
  the frame's handles sit in reachable gutters rather than against the edge of
  the screen.
- **Phones are untouched.** The flatten-to-one-column render ignores `cols`
  entirely, and `canEdit` already keeps the whole editor off phones, so nothing
  on a phone can write a width back.
- `cols` rides in the layout blob: capped 6–36 in `boardLayoutSchema`, carried
  through `allowedLayout` and `shareableLayout` (a share or a copy keeps the
  width it was arranged on), re-clamped in `parseLayout`, and normalized on the
  client (`workspaceCols` floors it to the tiles' own extent, which is what the
  resize clamps get to assume). The **dirty baseline is `{cols, tiles}`**, so a
  width change is an unsaved change like any other. The three built-in
  templates stay at 12 — `wall_templates` and the template editor are
  untouched, and `buildPreset` is width-agnostic.

**The ORDER TICKET is on the wall** (`ticket`, `tiles/TicketTile.tsx`; owner
request, 2026-08). It renders the **same `OrderTicket` component the Live Trades
screen renders**, given the same inputs, rather than a board-sized imitation —
this is the one tile that can move money, so every rule about sizing, protective
levels, venue precision, the double-click guard and the review-then-confirm step
has to be one set of rules. A second ticket is a second place for those to
drift, and the failure mode is a real order at a size or a stop nobody meant.
- What the tile adds is **which account and which instrument, both stored on the
  tile** (`accountId` / `instrument`), so a board can carry a forex ticket on one
  account beside a crypto ticket on another, each opening where it was left. A
  stored account id that is no longer connected falls back (practice first,
  matching the screen); an instrument the chosen account cannot trade re-resolves
  rather than sitting on a symbol that would only ever be refused.
- Gated `desk: true` + `tradeDesk` and carrying the `tradeDesk` **review mark**,
  like the screen. The gate is belt and braces — every write goes to
  `/api/trading/desk/*`, which is behind `requireWorkspaceWrite`,
  `requirePremium('tradeDesk')` and refuses the demo twice.
- A fill **invalidates the shared feeds** (`invalidateFeed`), so the rest of the
  board is not still reporting the pre-trade state until each tile's own poll.

**A Desk Metrics tile remembers WHOSE figures it shows** (`BoardTile.trader`;
owner request, 2026-08) — a board can carry several, one per trader plus the
whole desk, and each stays where it was left. It is **emptied when a board is
shared**, for a different reason than the notes tile: not privacy (only an id
travels) but meaning — the tile narrows rows the READER'S own desk returned, so
a teammate opening it would get a tile of zeros. A pinned trader who is no
longer on the desk falls back to the whole desk rather than filtering to
nothing, since the picker's label falls back too and "Whole desk" above a tile
of zeros is indistinguishable from a flat month.

**Which board opens is per DEVICE CLASS** (owner instruction, 2026-08). A board
is arranged against a screen: twelve columns read well at a desk and flatten to
one full-width column in the hand, so the board somebody wants on a phone is
usually not the one they want on a desktop.
- **`trading_boards.is_default_phone`** (migration `0112`) sits beside
  `is_default`, which keeps its meaning exactly — the account default, and what a
  desktop opens on. The two are cleared **independently** (`clearOtherDefaults`
  takes which), so setting one never disturbs the other and one board may hold
  both. No phone default set anywhere falls back to `is_default`, which is the
  behaviour every board had before the column existed.
- **Both are set from the desktop**, as two rows in Preset Settings. That is not
  a shortcut: `canEdit` is false on a phone, so a phone never reaches that menu
  at all — a single "Set default" could only ever name the screen you were
  standing at, which is the desk every time.
- The remembered last-opened board (`vts:lastBoard:<user>:<phone|desktop>`) and
  the built-in choice are **device-scoped keys** for the same reason. Separate
  browsers already had separate storage; this also stops one browser carrying a
  phone-shaped choice back to the desk when a window is narrowed. Resolution
  order is unchanged otherwise: last opened on this device → this device's
  default → the account default → the first board.

**Four files carry the design, and adding a tile kind touches all of them:**

- **`workspaces/trading/tileCatalog.ts`** — the single source of truth for what a
  tile IS: its label, group, icon, one-line blurb, starting size, minimum size,
  and **what it costs** (`feature`, `desk`, `funded`). `tileLock()` answers "can
  this reader have it", and `newTile()` builds one. The board itself no longer
  knows what kinds exist.
- **`workspaces/trading/DeskPositionRow.tsx`** — the ONE open-position row, drawn
  by both surfaces that list positions densely: Live Trades' "Desk right now"
  panel and the Live Wall's Open Positions tile in its **list** layout (owner
  request, 2026-08). The tile had a thinner row of its own, so the same position
  read as two different amounts of information depending on which screen it was
  watched on — and the half a trader acts on (what a pip is worth here, where
  the stop sits, what that stop costs) was on the screen they were not looking
  at. `onPick` (load into the ticket) is optional, since only Live Trades has a
  ticket; everything about who may act still comes from `positionEdit.tsx`.
- **A position's SIZE reads in the unit the instrument is sized in**
  (`fmtSize` / `sizeTitle` in `pips.ts`): **lots** on a genuine currency pair —
  1.00 lots, not 100000 — and units on anything else, with the raw units on the
  hover. It splits on the same `forexPair` test the pip/point reading does, so a
  size in lots is never quoted beside a per-point figure. Drawn on the full
  card and the shared row above. **The order ticket stays in units**
  deliberately: that is the number sent to the broker.
  - **CLOSED TRADES & METRICS READS IN UNITS, NOT LOTS** (owner instruction,
    2026-08; `fmtUnitSize` / `lotsTitle`, the mirror pair). The log is read
    against the order that was placed and the ticket that placed it, so it
    states the same number those do; the lot count moves to the hover. Beside
    it sits **what one pip was worth at that size** — `perPipForSize`, the
    figure that makes a size mean something without doing the arithmetic.
    - **That per-pip is derived from the SIZE, never from the trade's realized
      P/L.** Dividing the P/L by the pips would carry commission and financing
      into it, inflating the number on exactly the trades a trader is checking
      it against.
    - **It is null unless the pair is quoted in the desk's own money.** 90,000
      units of USD/JPY is ¥900 a pip, not $900, and the log carries no rate to
      convert with, so nothing is drawn rather than a figure wrong by two
      orders of magnitude. (The Live Wall's per-pip comes from the server,
      `trading/forex.ts`, which does have the rates.)
    - The tape's Size column is too narrow for it, so there it rides the hover
      with the lot count — **and the money half of that hover is dropped while
      balances are hidden**: a tooltip is not an exception to Hide $.
- **`workspaces/trading/tiles/`** — one renderer per kind, over the shared
  `TileFrame` (header, drag handle, per-tile settings, scrolling body) and
  `useTileData` (poll, keep the last good data on a failed refresh, write nothing
  after unmount). `tiles/index.tsx` maps kind → component.
- **`apps/api/src/trading/boardTiles.ts`** — the server's mirror of the *gate*
  half only. `BOARD_TILE_KINDS` is a tuple the route's Zod schema reads directly,
  so the validator cannot drift from the list.
- **`workspaces/trading/presetLayouts.ts`** — the three built-in layouts.

**Three axes decide what a given account gets, and confusing them is the classic
mistake here:**

- **The Advanced Trading opt-in** decides whether the desk-reading tiles exist at
  all (`positions`, `metrics`, `alerts`, `tradelog`, `closed`, `sessions`,
  `funded`), plus the Positions view, Connections and desk settings. Without it
  `LiveWall` never even calls `/api/trading/live`.
- **`customBoards` (Premium)** decides whether the board can be **arranged and
  saved**, and **how many boards may be kept**. Without it the reader gets the
  **three built-in layouts** — Markets, Trading Desk, My Terminal — chosen from
  the same picker a member uses, with the choice remembered per device (there is
  nothing saved server-side to hold it). That is what makes a free account a
  working board rather than an empty grid behind a locked save button.
  - **Named presets follow the membership, NOT the desk opt-in.** The create
    route used to cap a non-desk user at one board, from when the wall was a
    charts screen and presets read as a desk feature. They are not: saving your
    own arrangement *is* `customBoards`, which `boardWrite` has already checked —
    so the cap charged a Premium member for presets and then gave them one, on
    the strength of a switch that has nothing to do with it. What the desk still
    decides is which **tiles** a board may carry.
- **Individual tiers** gate individual tiles (`marketdata` → Premium,
  `teamchat` → Max, and so on).
  - **`funded` and `challenge` are two different tiles**, matching the two
    different screens. `funded` is the hand-kept **Manual Trades** book
    (`/api/trading/funded`, desk-gated only) and is deliberately independent of
    the Funded opt-in — plenty of traders keep a manual book without ever running
    a challenge. `challenge` is the prop-firm **Funded Account**
    (`/api/trading/challenge`, `fundedRead` = desk + `requireFunded` +
    `requirePremium('funded')`). They were briefly one tile labelled "Funded
    Account" that read the manual book, which is wrong in both directions.
  - **A tile can be MARKED with a tier it is not GATED by** — `markFeature`
    beside `feature` in the catalog. Broker Capital is the case: connecting a
    broker is Max, but *reading* an account you already connected is not. Its
    endpoint serves any desk user and Trade History ▸ Live Brokers shows the
    same figures behind nothing but a marker, so gating the tile would have
    locked a lapsed member out of a connection they still hold — the exact thing
    "reading its status and disconnecting stay open" exists to prevent. Reach for
    `markFeature` whenever the tier buys the *setup* rather than the *reading*.

**Two rules about stripping that are NOT the same, and must not be merged:**

- **Desk tiles ARE stripped server-side** from anything a non-desk user saves
  (`allowedLayout` in `routes/trading.ts`, over `DESK_TILE_KINDS`). The desk is an
  opt-in the reader controls, so a board saved without it never meant to carry
  them.
- **Paid tiles are NOT stripped.** A membership lapses on its own — stripping on
  save would quietly delete the arrangement of somebody whose card expired, and
  they would return to a board missing tiles they had built. The tile stays in the
  row and the client draws it **locked**, so the board is intact the moment the
  membership is. Nothing leaks by keeping it: every paid tile's **data** is gated
  at its own endpoint, which is what makes the tile a shell rather than a hole.

**A built-in layout is filtered, not padlocked.** `buildPreset` drops what the
reader cannot reach and closes the vertical gap, so a layout they did not build
never opens as a wall of locks. What they are missing is discoverable from the
**tile picker**, which lists *every* kind with its star/diamond — that is the
surface whose job is to say what a thing costs.

**Two shared modules exist so a rule is not written twice:**
`streamEmbed.ts` (what a live-stream tile plays, and the "never point the player
at a guessed id" rule — read by both Market News and the wall's `streams` tile),
and the tile catalog above.

**A phone renders ONE column, and never writes that back.** The grid is a desktop
idea — at twelve columns a four-wide tile is a third of a 390px screen. So on a
phone the same tiles stack full-width, ordered `y` then `x` (how the desktop
board reads anyway), each with a height floor. The stored `x`/`y`/`w` are
untouched: the phone changes what is **rendered**, never what is saved. That is
also why `canEdit` is `customBoards && !isPhone` and why `isDraggable` tests
`canEdit` as well as `editing` — a drag on the phone would write the flattened
order over the real arrangement, including for a board merely left in edit mode
on a desktop and then narrowed.

**Any tile can be expanded to fill the screen**, and the control is in the grid
**cell**, not the tile header. Deliberately: there is a component per tile kind,
seven of which predate the shared `TileFrame`, so putting the control in the cell
gives every kind the behaviour with no per-tile change. The bottom-right
corner is free exactly when it is offered — while editing, that corner is the
resize handle and the button is hidden. It is hover-revealed on a pointer device
and permanently visible under `@media (hover: none)`, since a touch device gets
no chance to discover a hover-only control.

**Each tile carries its own zoom** (`BoardTile.zoom`, 0.5–2, absent = 1; owner
request, 2026-08) — how large its contents are drawn, independently of how big
the tile is on the board. Zoomed out a feed tile carries more rows in the same
cell; zoomed in a chart or a P/L figure is legible across a room. Both are what a
wall on a television is for.

- **`transform: scale` on a box sized `1/z`, NEVER CSS `zoom`**, and that is the
  whole implementation decision. `zoom` and a nested browsing context do not
  compose in WebKit — the trap `global.css` documents and cancels for the
  terminal's own zoom — so a per-tile `zoom` would leave the chart, watchlist and
  live-stream embeds painted across a fraction of their tile with the browser's
  white backdrop beside them, and **the global `#root iframe` rule cannot cancel
  a factor it does not know about**. A transform scales the framed document
  whole. Verified in Chromium that the embedded document re-lays out at the
  compensated size (a 600px box at 70% frames a document 857px wide and paints it
  down), which is what makes zooming out show *more* chart rather than a squashed
  one.
- The compensating width/height is what makes this a **zoom rather than a
  shrink**: the content still lays out to fill the tile, so zooming out fits more
  in. Without it the tile would just have smaller content and empty space.
- **In the CELL, like the expand button**, for the same reason — a component per
  tile kind, so this way every kind zooms with no per-tile change. The wrapper is
  **always rendered**, identity styles and all: swapping it in and out with the
  zoom changes the tree shape, which remounts the tile — and remounting a
  TradingView embed reloads the chart on every press of the button.
- The control is **bottom-centre and edit-mode only**: all four corners are
  resize handles while editing, the header is what a tile is dragged by, and this
  writes to the tile like every other tile setting — Save is what keeps it, and
  Save only exists in edit mode. It is deliberately **not** applied to the
  maximized overlay, which is already the "show me this bigger" action.
- **A content-measured tile must scale its measurement** (`px * z` in
  `ChartBoard`): the tile reports its height in its own stretched space, so the
  rows the cell needs is that height *painted*.

**A content-sized tile's measurement is a FLOOR, not a pin** (the positions tile
in its `-expand` views). Two rules that read as one and are not:

- The rule worth keeping is "every trade is visible without an inner scroll",
  which only requires the cell never be **shorter** than the content (`minH`).
  Pinning `maxH` to the same figure additionally forbade dragging the tile
  **taller** — a different rule, never wanted, and a resize handle that refuses
  to move reads as broken.
- **Measure the CHILDREN, never the wrapper** (`PositionsTile`). The wrapper
  carries `minHeight: 100%` so a near-empty tile still fills its cell, which
  means its own `scrollHeight` is the CELL's height whenever the content is
  shorter. Read that way, "how tall is the content" always answered "exactly as
  tall as it already is", so the board pinned the cell to whatever height it
  happened to have and the tile could not be resized in **either** direction —
  the fault the owner hit on a tile showing no open positions. The body is
  `flex: 0 0 auto` in this view, so the children are the real content, and the
  `ResizeObserver` watches them for the same reason: the wrapper's box never
  changes when a trade arrives, so an observer on it would simply never fire.
- `onResizeStop` is then the **only** writer of such a tile's stored height —
  `onLayoutChange` cannot tell a deliberate drag from a content reflow, so it
  keeps ignoring `h` for them, and a drag is the trader stating what they want.

**A layout can be published to the team** (`shared_team_id`, migration `0097`).
`GET /api/trading/boards` answers with `{ boards, teamBoards, onTeam }` — one
shape every board route returns via `boardsPayload`, so no route can hand the
client an undefined list — and the picker draws "Shared with your team" naming
the author.

- **Only the ARRANGEMENT travels.** Every tile fetches as the signed-in reader,
  with their own credentials and their own team scope, so a teammate opening a
  shared board sees **their** net worth and **their** trades in it. That is what
  makes sharing safe, and it is a consequence of how tiles fetch rather than
  something enforced at the boundary.
- **The one exception is the notes tile**, whose text rides in the layout blob.
  `shareBoard` empties it on the way out (`shareableLayout`) — the tile is kept,
  because the arrangement is the point, but a board must never publish somebody's
  scratchpad.
- **One shared board per person**, enforced by unsharing their others. A
  five-person team each publishing four layouts turns the picker into a
  directory; the cap is what lets *anyone* on the team publish without inventing
  a permission for it.
- **Reading the shared list is free; copying is `customBoards`.** A free account
  cannot build a layout but can open the one its desk already uses, which is the
  most useful thing a team can hand a new member. Copying **creates** a board, so
  it sits on the paid guard. A copy rather than a reference, so the author
  editing theirs later never reaches into somebody else's board.

**"Create New Layout" is the LAST row of the layout picker** (owner request,
2026-08) — everything above it is a layout to open, and this is the one row that
makes one, so it sits under a divider the way the Studies launchers end with
their Create tile.

- **It is CREATED ON THE SERVER, named up front, rather than left as an unsaved
  blank.** The board has an id from the moment it exists, so it appears in Your
  boards, the device remembers it as the last one opened, and the draft
  mechanism keeps whatever is arranged on it. An unnamed blank board would have
  none of those: leaving the screen before the first save would land the trader
  back on their previous board with nothing to return to. It opens straight
  into edit mode, since an empty board has nothing to read.
- **It must never clear the outgoing board's draft.** `confirmName`'s `create`
  branch does clear it — that mode stores the arrangement on screen under a new
  name, so the board it came from is genuinely clean afterwards. The `blank`
  branch stored none of it, so creating a new layout must not be what discards
  the unsaved work on the board you were looking at.
- **Marked, not hidden, for a free account** (it lands on the membership screen)
  — the rule the sidebar rows and the tile picker follow. The one case the row
  is dropped is a **member on a phone**: `canEdit` is false there, so a blank
  board would be one they have no way to fill.

**`dirty` means MODIFIED, not merely unsaved.** A built-in layout is permanently
unsaved and nonetheless untouched, so `applyBuiltIn` / `applyShared` baseline
`savedTilesJson` against what they just applied. Conflating the two made every
layout switch ask "discard unsaved changes?" about changes nobody had made.

**An unsaved arrangement is KEPT, per board, on the device** (`vts:wallDraft:…`;
owner request, 2026-08). The board used to be rebuilt from the server on every
mount, so an arrangement in progress vanished the moment the trader opened
another sidebar section — silently, which is the part that made it a fault
rather than a limitation. Now leaving the screen, reloading, or coming back the
next day all land on exactly what was left.

- **A draft is stamped with the baseline it was edited FROM** and dropped if that
  no longer matches — the board was saved elsewhere, a template was
  republished. An arrangement only means anything against the board it was made
  on, and replaying old tile positions over different content loses the newer
  version without asking.
- **So a built-in layout has to compare equal to ITSELF between two visits**, and
  it did not: `buildPreset` minted tile ids from `newTile`'s monotonic counter,
  so the same layout produced different ids every mount and the draft was
  discarded every single time. Preset and template tiles now carry
  **deterministic ids** (`<layoutKey>-<i>-<kind>`). It also stops React
  remounting every tile on re-entry, which reloaded each TradingView embed.
- **`load()` reads the templates BEFORE it applies one**, for the same reason:
  fetching them in a separate effect meant the code fallback was applied first
  and the server's version a moment later — two baselines for one layout.
- **Switching layouts no longer asks.** Nothing is lost, so a "discard unsaved
  changes?" prompt was warning about something untrue. **Load layout** is the
  one control that destroys work and the one that asks.
- The write is debounced (a drag fires it per frame) and **flushed on unmount**,
  since leaving the screen is the exact case the whole mechanism exists for.

**Everything you can do to the open preset is behind one "Preset Settings"
menu** while editing (owner request, 2026-08): rename, set default, share with
the team, save as new, save, delete. They were six buttons in the toolbar, which
on anything narrower than a desktop wrapped into a second and third row of
controls stacked above the board being edited. Its Escape handler is in the
**capture** phase and stops propagation — the board's own Escape handler is
registered first, so a bubble-phase listener let one keypress both close the menu
and drop out of edit mode.

**The toolbar marks who each control is for.** "Edit layout" carries the
**Premium star** rather than a pencil, because arranging your own board is what
`customBoards` buys. Beside it, **"Edit default layout" carries the crown** — the
Developer Terminal's own mark — is drawn only for founder-level readers, and only
while a built-in layout is open, since that is what it edits.

**A built-in layout can be authored on the wall itself** (founder-level; the
routes behind it are all `requireFounder`, which is the enforcer). It loads the
template's **draft**, arranges it on the real grid, and publishes from there —
the same `wall_templates` rows the Developer Terminal's list editor writes, so
**draft-then-publish is unchanged** and a half-moved tile still never reaches a
member. The workspace width control is hidden in this mode: templates are stored
on the default 12-column canvas (`parseTiles` clamps to it), so offering a width
there would offer a setting that cannot be saved.

**Tiles fetch through `tiles/tileFeed.ts`, so two tiles reading one endpoint make
one request.** The wall changed the economics of a poll: a realistic board has
Trade History beside Closed Trades (both the closed-trade history), Net Worth
beside Portfolio, two Market Data tiles off one catalog. `sharedFetch` shares an
**in-flight** request (the mount case — a board opens and fires everything at
once) and an answer younger than the **caller's own** staleness bound (the
steady-state case — two tiles on the same interval drift into lockstep). A failed
request drops the in-flight marker but **keeps the last good answer**, which is
what lets a tile go on showing the previous reading. `useTileData`'s first
argument is the key, and it must name everything that varies the request —
`studies:leaderboard:<deckId>`, never `studies:leaderboard`, or every leaderboard
tile shows the first deck's standings.

## Review marks — status, not price (`auth/reviewMarks.ts`)

A second, separate axis from the tier marks. A tier mark says what a feature
**costs**; these say something about its **status**. They are **additional, never
a replacement** — a row draws its star or gem and then one of these beside it, so
it can state both that it is paid and that it is not finished. `REVIEW_MARKS` is
one map, readable in one screen, and is the only place that decides what is
marked. `components/ReviewMark.tsx` draws it.

**Two kinds, with OPPOSITE audiences. Confusing them is the expensive mistake
here:**

- **`wip` — a dashed speech bubble, shown to EVERYONE.** "This part of the
  terminal is still being built ahead of launch." Today that is the group
  features (`teams`, `teamChat`), per the owner's instruction that anything to do
  with private groups says so until launch, plus three whole areas the owner is
  still filling in (owner instruction, 2026-08): **Finances** and
  **Investments** — each marked on the workspace row *and* on every section
  inside it — and **News ▸ World / Politics**. Marking only the workspace would
  leave a reader who is already inside it with nothing on screen to say so,
  since the workspace row is out of sight the moment its sections are showing.
  News itself is **not** marked: Market News is finished and lives there.
- **`risk` — an amber exclamation, FOUNDER-LEVEL ONLY, and that is not
  negotiable.** It is the owner's own note that a feature has compliance
  questions still awaiting attorney review, and it exists so those features can
  be found again. A product that publicly labels its own features as legally
  risky is worse than one that marks nothing: it tells customers to worry, and it
  writes a record pointing at itself. An ordinary user, a paying member and a
  plain admin all see nothing. `ReviewMark` reads the signed-in user **itself**
  rather than taking one as a prop, so the gate cannot be lost by a call site
  forgetting to pass something.

**Nothing is gated, hidden, disabled or degraded by a mark.** It marks; it does
nothing else. Adding a key can never change what an account may do.

**The flagged list is the owner's compliance judgment, not a guess to extend.**
Do not add or remove a `risk` entry without being asked — say so in the report
instead. The entries and their notes came from the compliance handoff, plus
`tradingNotes` added on the owner's instruction (2026-08).

- Colours: risk `#FF9F45` (amber), wip `#8FA0C9` (quiet slate). Deliberately none
  of the three already carrying meaning — Premium gold `#EBCB74`, Max gem
  `#B9F2FF`, market-watch blue `#5AC8FA`.
- `SECTION_REVIEW` maps a nav row to a mark, the same shape as `SECTION_FEATURE`
  and read in the same place in `Sidebar.tsx`; **`WORKSPACE_REVIEW`** does the
  same for a workspace row. That one has entries where the tier equivalent
  (`WORKSPACE_FEATURE`) is deliberately empty — no workspace is entirely paid,
  but a workspace genuinely can be entirely unfinished. `TILE_REVIEW` does the
  same for a Live Wall tile kind. Flagged features with no row of their own are marked at
  their own control (the Ask VTS AI header, broker connections in Settings, the
  Team chat tab, the news feed's footer, the funded AI read, the "Lead Trader"
  badge preset, the Live Wall's share row).
- **Developer Terminal ▸ Under Review** (`ad_review`, `AdminReviewList.tsx`)
  lists every entry with its note and where it is marked. It is a **read of the
  map and nothing else** — no state, no route, no stored copy — so it cannot fall
  out of step with what the terminal actually draws.
- **Gated on the reader's REAL roles**, like the "View as role" control. Previewing
  as a member is for checking what a member reaches, not for hiding the owner's
  own notes from the owner.
- `legalCredentials` has no control anywhere: it records that Terms and Privacy
  both describe broker credentials as read-only, which is false. It lives in the
  map so the review list is complete.

## Identity — display names and email

**Display names are unique across the platform** (migration `0102`, a unique
index on `lower(trim(display_name))`). They are the terminal's one public
identity: the name on a public study leaderboard, in a roster, on an invite. Two
people called "Andrew" is a confusion the moment any of that is visible to a
stranger.

- **Enforced in three places and they must agree:** the index, and
  `assertDisplayNameFree` called from both write paths (`admin/service.ts`'s
  create/update and `PATCH /api/auth/profile`). The service compares
  `lower(trim(…))` because the index does; if they drift, a user meets a raw
  SQLite error on one path and a readable message on the other.
- **The migration resolves collisions BEFORE building the index**, and that
  ordering is the whole file — a unique index added to a table that already
  violates it fails, and a failed migration on boot is an outage. The oldest
  holder keeps the name exactly as typed; later ones get a number appended.
  A second pass falls back to the row id for exact `created_at` ties, which is
  what guarantees the index can build.
  - **`||` binds tighter than `+` in SQLite.** `name || ' ' || (SELECT …) + 1`
    parses as `(name || ' ' || count) + 1`, coerces the whole string to a number
    and yields `1` — so every duplicate was renamed to "1" rather than
    "Andrew 2". Caught only by applying the migration to a database seeded with
    real duplicates. **Test a data-rewriting migration against data**, not
    against an empty schema.

**Email is already private between users, and that is a property of the payloads
rather than a rule somebody enforces.** `toPublicUser` is used for exactly one
thing — the signed-in user's own record (`routes/auth.ts`) — and every
member-facing view (`userTeams/service.ts`'s `TeamMemberView`, chat authors,
leaderboard rows) carries `username` and `displayName` and no email column. The
only other place an address leaves the server is the Admin ▸ Users list, behind
`requireAdmin`. **Do not add an email field to a member-facing payload**; there
is no screen that needs one.

## Roles & access (`auth/rbac.ts`)

Assigned roles (JSON array in `users.roles`); a user may hold any combination.
**`ROLE_KEYS` is the whole list** — five roles, and they are a ladder of trust
rather than a set of workspace keys:

- `founder` — the terminal's owners. Sits **above** admin and carries every
  admin capability plus the founder-only tools (Developer Terminal).
- `software_developer` — **permission-equivalent to `founder`**; the two are
  tested together by `isFounder()`. Not a lesser tier.
- `admin` — user/team management and the Admin Terminal. `isAdmin()` is
  `admin || isFounder()`, so founder-level passes every admin guard.
- `employee` — reveals **My Terminal ▸ Employee Portal** and permits the separate
  sign-in at `/employee`. **Not** implied by admin or founder level — it must be
  granted outright, by a founder. It unlocks nothing inside the main terminal, and
  on its own it is not enough: a **company-domain sign-in email** is required too
  (`canAccessEmployeePortal(roles, email)`). Never the demo.
- `member` — the baseline. Every signed-in user is at least a member and reaches
  every non-admin workspace.

**Who may grant what** (`assertCanAssignRoles` in `admin/service.ts`): only the
**owner** (`isOwnerUser`, matched on the immutable `createdUsername` against
`ADMIN_USERNAME`) may grant or revoke `founder` / `software_developer`; only a
**founder-level** user may grant `admin` / `employee`.

**A role no longer decides which workspace you see — the opt-in does.** This is
the single most important thing about the current model, and the thing most
likely to be misremembered:

- **Retired: `trading`, `trading_viewer`, `studies`, `funded`.** All four are
  gone from `ROLE_KEYS` and the admin pickers. What gates Advanced Trading and
  Funded Account is the per-user **Premium Features opt-in** (see above), and
  Investments / Studies / My Terminal / Site Help are included with every
  account.
- `canAccessWorkspace()` therefore returns **true** for everyone, and
  `isWorkspaceReadOnly()` returns **false** for everyone. Both are kept as stable
  exports so the write guards still compile and so a paid/read-only tier has an
  obvious place to land later — they are not dead by accident.
- **There is no read-only role.** The only read-only presentation in the terminal
  is the **demo**, and it is enforced by `demoGuard` (which refuses every
  non-GET), not by a role. So do not write a comment claiming a guard stops "a
  view-only role" — nothing holds one. Say the demo, or say nothing.
- Consequence for `requireWorkspaceWrite(ws)`: today it differs from
  `requireWorkspace(ws)` only by a read-only check that cannot currently fire. It
  is still the right guard on every write — it is where the check goes back when
  a tier returns — so keep using it; just do not describe it as blocking a role
  that no longer exists.

`WorkspaceKey` server-side is only `'trading' | 'studies'`; Investments,
My Terminal and Site Help have no role gate to name.

Middleware (`auth/middleware.ts`): `requireAuth`, `requireAdmin`, `requireFounder`,
`requireWorkspace(ws)`, `requireWorkspaceWrite(ws)`, `requireMarkets`,
`requireAdvancedTrading`, `requireFunded`. `requireMarkets` **is** `requireAuth`,
named separately so the always-on boundary is legible at the call sites. The
legacy `users.role` string column is still populated but **unused** — real roles
live in `users.roles`.

The web mirror is `apps/web/src/auth/access.ts` (`ALL_ROLES`, `ROLE_LABELS`,
`ROLE_DESCRIPTIONS`, `isFounder`, `isAdmin`, plus the membership helpers) and is
already in step with the above; the **server is the enforcer**.

**`canAccessWorkspace(roles, ws, features)`'s third argument is required, and must
stay required.** It was optional, and a caller that omitted it silently got
`false` for Advanced Trading — no error, no warning, just a workspace that read as
switched off. Four call sites forgot it, which is how phone notifications,
Pushover, the per-trader notification prefs, the Home-Screen widget, broker
connections **and** the trade alert sound all went invisible for every account at
once, and stayed that way until the owner noticed Pushover was missing. Making it
required is what turns the next one into a compile error. Same for
`workspacesForRoles` and `canAccessFunded`.

## Teams (`teams/service.ts`) — hidden at launch, and no longer a trade boundary

> ### It is called a PRIVATE GROUP everywhere a person reads it (2026-08)
>
> Compliance rename, driven by the owner opening a separate registered
> investment advisory firm: "team" implies coordinated trading and members
> advising each other, and VTS Terminal must not read as an advice business.
> **Labels only. Never keys.** `trading_teams`, `user_teams`,
> `user_team_members`, `user_team_invites`, `team_id`, `team-vitalis`, the
> `teams` / `teamChat` feature keys, `TEAM_ONLY_SECTIONS`, `isDeskLead`, the
> `my_team` / `ad_teams` screen keys and every route path and column are
> **unchanged** — routing, in-app links and the `howto.<screen>` wording all
> depend on them. Everything below this box still describes the real model; read
> "team" in it as the internal name for a private group.
>
> | Where | Reads |
> |---|---|
> | The feature | Private Groups |
> | One instance | your group |
> | Sidebar row (`my_team`) | My Group |
> | Admin section (`ad_teams`) | Groups |
> | Chat tab / wall tile | Group chat / Group Chat |
> | Shared boards | Shared with your group |
> | Admin grant (Admin ▸ Users) | Private Groups |
> | Seeded group (`team-vitalis`) | Vitalis Group |
>
> **Words to keep out of user-visible copy**: team, teammate, trading team,
> shared desk, team book, "your desk" — and in this feature's copy specifically
> also desk, book, network, community, club, collective, partners. Each carries a
> meaning (a coordinated trading unit, a pooled position book, pooled capital, or
> the legal category "investment club") that the rename exists to get away from.
>
> **Two collisions.** "Member" is already the baseline role *and* how the paid
> tiers read, so write "someone in your group" or "group members", never a bare
> "members". And **"the team" meaning VITALIS STAFF** — in the AI privacy copy,
> the guardrail notice and the Privacy Policy — now says **"VTS staff"**: left as
> "the team" it reads as the user's own group, i.e. that the people they trade
> beside can read their AI conversations, which is false and alarming.
>
> **Two pieces of stored copy are repaired on boot**, not by migration, because
> the code that knows the current wording is the only thing that should write it:
> the seeded group's name (`SEEDED_GROUP_RENAMES` in `teams/service.ts`) and the
> seeded chat/announcement bodies (`SEEDED_BODY_REWRITES` in
> `chat/announcements.ts`). Both match on the **exact old string**, so anything
> somebody has since renamed or edited is left alone. The built-in study games
> mention it too, so `BAKED_IN_VERSION` was bumped to re-sync their content.
>
> **Historical patch notes are NOT rewritten** — they are a dated record, the
> same precedent set when "portal" became "terminal". **`LEGAL_VERSION` was
> deliberately NOT bumped** (owner decision): no obligation changed, only the
> word for the feature, so nobody is re-prompted to accept. The substantive
> correction still owed to those documents — they describe broker credentials as
> read-only, which is false — is a separate job, and that is the one that should
> move the effective date.

A **trading team** is a group a user belongs to at most one of (`users.team_id`).
Two owner decisions (2026-08) reshaped what a team *is*, and both matter more
than anything else in this section:

- **Nobody sees anybody else's trade metrics — ever.** Not a teammate's, not a
  member's if you lead the team, not another founder's.
- **Teams are hidden from the average account** and handed out by a software
  developer, by hand. They are not for sale and no opt-in reveals them.

### Trade visibility: self-only by default, team-wide on a GRANT

`visibleTraderIds(viewer)` returns **exactly the viewer** unless that account
holds the Trading Teams grant, in which case it returns their team.

The default is what matters at public launch: a screen showing one trader's
results to another is the raw material for an implied track record, a long way
from the informational-only posture the product holds — the same reason the Site
Help rules say desk metrics are not proof of performance. Since teams are hidden
and handed out by a software developer, every ordinary account and every public
signup resolves to itself.

A **granted** team is a different situation (owner decision, 2026-08, after the
first cut made it self-only for everybody): those are people who already know
each other working one desk, and sharing the book is the reason they were put on
a team. The grant is the gate, so widening this cannot reach anybody who was not
deliberately given it — **a public signup is unaffected by construction, not by
a filter somebody has to remember**.

`hasTradingTeamsGrant` in this file reads the row directly rather than going
through `featuresForUser`, because `rbac.ts` already imports from
`features/service.ts` and importing back is a cycle. It resolves founder-level to
true with no stored row, matching `featuresForUser` exactly — **if that rule
changes, change it in both places.**

**`scope.ts` exports four functions and they are NOT interchangeable:**

- **`visibleTraderIds(viewer)` — visibility.** "Whose trade data may this viewer
  *see*." The viewer alone. Use on a **read**.
- **`visibleTraderIdsForUser(userId)`** — the same boundary, keyed by an id when
  the caller holds no viewer. The counterpart of `scopedTraderIdsForUser`, and it
  exists for the funded book: every function there is handed the owner rather
  than the request, and still has to answer a read with the whole visible desk.
- **`scopedTraderIds(viewer)` — recipients.** "Who should *receive* this."
  **Still team-wide, deliberately.** A TradingView alert is a signal the desk
  sends its members, not a report of anyone's book, so narrowing it would cut a
  trader off from the alerts their own desk is sending them. `trading/alerts.ts`
  is the reason the split exists — **do not "tidy" it onto the visibility
  function.**
- **`notifyTraderIds(ownerId)` — a send whose whole content is one trader's
  position** (the open / close / stop-moved buzzes in `history.ts`). Follows
  *visibility*, so it widens with it: on a granted team a fill reaches the
  teammates who can already see the position, and nowhere else. Buzzing a phone
  about a book the recipient may not look at would move the disclosure rather
  than remove it.

**Private mode is retired.** `shareBook` / `bookAckAt` (`user_features`,
migration `0093`) existed to keep a trader's book off teammates' screens. It was
removed when visibility went self-only and has **not** come back with the grant:
a granted team is a group that deliberately shares a book, and reviving a
per-member opt-out is a real decision rather than something to infer. The
columns, stored values and consent stamps are **untouched**, so that decision is
still available — `sharingBookUserIds` is the query to write again.

### Trading Teams is a GRANT (`user_features.trading_teams`, migration `0100`)

A **fourth axis**, and confusing it with the other three is the classic mistake:
a **role** says what you are trusted with, an **opt-in** says what you have asked
to see, a **membership** says what you have paid for, and a **grant** is none of
those — a software developer hands it out from **Admin ▸ Users**, and no amount
of money or self-service switching obtains it.

- **`requireTradingTeams`** (`auth/middleware.ts`) guards **every** route in
  `routes/userTeams.ts` (reads included), the team chat, and the shared-board
  payload. It answers **403, not 402** — this is not for sale, so an upgrade
  prompt would be a lie.
- **Two routes stay ungated on purpose:** `team/leave` and
  `invites/:id/respond`. Revoking somebody's grant must never strand them on a
  team with no way off it. Both act only on the caller's own membership.
- **`setUserFeatures` refuses it.** The flag is not in `FeaturePatch`, not in the
  `PUT /api/features` Zod schema, and the service carries the stored value
  straight through. `setTradingTeamsGrant` is the only writer. **Keep it that
  way** — the moment the self-service path reads it from a patch, "manually and
  manually only" is gone.
- **Founder-level accounts resolve to granted with no stored row**, the same way
  `getMembership` resolves an admin to Max. That is what stops the owner locking
  themselves out of the feature they hand out. The check is a **local roles
  parse** in `features/service.ts`, not an `isFounder` import — `rbac.ts` already
  imports `DEFAULT_FEATURES` from there, so importing back would be a real cycle.
- **Migration `0100` grandfathers everyone already on a team**, so the Vitalis
  Vitalis Group and its members are unchanged on deploy.
- **The UI hides, it does not lock.** `TEAM_ONLY_SECTIONS` (`theme/nav.ts`) drops
  the row; `visibleTiles` (`tileCatalog.ts`) drops the Team Chat tile from the
  picker; the chat panel drops its Team tab on reason `unavailable`. This is the
  **opposite** of how the opt-in workspaces behave, and it is deliberate: a
  padlock advertises, and an ordinary account should not learn teams exist. There
  is nothing to buy, so a lock would only raise a ticket nobody can resolve.
- The demo is forced to **false** — the tour must show what a public account
  actually gets.

### The content scope (`teams/contentScope.ts`)

**`seedDefaultTeam()` no longer adopts anyone.** It used to end with an
unconditional `UPDATE users SET team_id = 'team-vitalis' WHERE team_id IS NULL`
on every boot. On a private terminal that was a convenience; at public launch it
is a data leak with no mitigation — every stranger who signed up would land in
the same scope as every other stranger, sharing one study library they could each
edit and delete, one channel list and one chat room.

`contentScopeId(viewer)` returns `viewer.teamId ?? user:<id>`. That is **not a
team** and no `trading_teams` row exists for it — it is a scope KEY stored in the
same text column, which is what lets a personal library and a team library share
one table and one set of queries. **None of those columns carry a foreign key**,
which is what makes this safe. Market News channels have worked this way since
they were built; the module is that rule extracted so study content follows it
too. `routes/studies.ts` derives every scope through it.

Consequence worth knowing: a user later granted a team does **not** bring their
personal content with them. That is the safe direction to fail — content never
leaks into a shared library by accident — but "move my games onto the team" is a
deliberate copy, not something that happens on its own.

### Who may delete a trade (`trading/deleteAccess.ts`)

A trader deletes their own; admins keep install-wide reach for support. **Nothing
in between.** The team `canDeleteTrades` permission is gone from the UI and the
resolver: it was always bounded by what the holder could *see*, so self-only
visibility had already collapsed it to "your own trades". It is written out
rather than left to resolve to nothing — a permission that silently does nothing
is worse than an absent one, because the toggle stays on screen and gets handed
out in good faith.

### What a team still is

Everything that is not somebody else's numbers: a shared study library, the team
chat, **shared Live Wall layouts** (only the arrangement travels — every tile
fetches as the reader, and the notes tile is emptied on the way out), invites,
badges, and the member roster. Default team `team-vitalis` / "Vitalis Trading
Team", seeded on boot.

Plus, on a team holding the **grant**, the things that follow `visibleTraderIds`
because the grant is what widens them: the open positions on the Live Wall, and
the **funded accounts and funded book** (owner decision, 2026-08 — see Advanced
Trading ▸ Funded Account). Those are read by the desk and written only by the
trader who owns them.

Worth preserving: `service.ts` hands the visible set to `getAllActiveDecrypted`,
so another trader's broker credentials are **never decrypted** to serve your
poll. The boundary stops the read at the connection, not at the render.

**`getAllActiveDecrypted(scope)` requires its scope, and `ALL_USERS` is the only
way to ask for the whole install.** It used to be an optional parameter, which
made the install-wide decrypt the thing you got by *forgetting* to pass anything —
and that is how one customer's OANDA key came to price the Market Data board for
every other customer. Omitting it is now a compile error. There are exactly **two**
`ALL_USERS` callers, both background bookkeeping that no viewer ever sees:
`reconcileDeskPositions` (`service.ts`) and `backfillClosedTrades(ALL_USERS)` from
that same pass — each connection writes only to its own owner's history.
`backfillClosedTrades` takes the same required scope for the same reason; its two
viewer-facing callers pass a team. **Adding a third `ALL_USERS` caller is a
decision to justify, not a default to inherit.**

### One team, two surfaces (merged)

`users.team_id` (+ the `trading_teams` row) is the **single source of truth** for
team existence, name, and membership. It is managed from **two** surfaces that
act on the same team:

- **Admin ▸ Teams** (`teams/service.ts`) — admins create teams, rename them, and
  assign/move members (`users.team_id`).
- **My Terminal ▸ My Group** (`userTeams/service.ts`) — the self-service surface
  over the **same** team the user is in. Membership is read straight from
  `users.team_id`; My-Terminal-only metadata is layered on top:
  - `user_teams` — one row per team naming its **leader** (`leaderId`).
  - `user_team_members` — optional per-user **badge**, **trade tile colour** (see
    below) + **permission flags**
    (`canCreateStudyGuides / canInvite / canManageBadges / canRemoveMembers /
    canEditTeam / canDeleteTrades`); a missing row = defaults (no badge, no
    colour, no perms). Leader = all.
  - `user_team_invites` — pending invites; **accepting sets the invitee's
    `team_id`** (moves them onto the team's desk). Leaving / removal clears
    `team_id` (→ solo). Renaming updates the shared `trading_teams` name.
  A leader is auto-picked (founder → admin → earliest member) by `ensureTeamMeta`
  and repaired if the stored one leaves; `backfillTeamLeaders()` runs on boot to
  give every existing team a leader row. Demo/inactive users never appear.
  Because membership is `team_id`, the My Terminal team **is** the trade-scoping
  team — the two are one. (Consequence: the Studies delete gate, keyed on team
  leadership, is now live — non-leader members can't delete team study content.)

### Trade tile colours — whose position it is (`trading/tileColors.ts`)

A group that shares its book draws every member's open position in the same navy
card, so telling one trader's trades from another's meant reading the `@handle`
on each one. The group **leader** assigns a colour per person from **My Terminal
▸ My Group**, plus two more for the positions that belong to nobody in
particular. Migration `0124` adds `user_team_members.tile_color` and
`user_teams.funded_tile_color` / `manual_tile_color`.

- **`trading/tileColors.ts` IS THE ONLY PLACE THE HEXES EXIST.** The palette goes
  to the web on `/api/my-portal/config` and the resolved hex is stamped onto each
  position, so no screen ever maps a person to a colour. There is deliberately
  **no web mirror of the palette** to drift — unlike `FEATURE_TIER`, nothing on
  the client needs to know what a key means.
- **A colour is stored as a palette KEY and a raw hex is refused**
  (`normalizeTileColor`). That is what bounds the palette to colours somebody
  chose deliberately, rather than whatever a hand-rolled request sends.
- **THE PALETTE IS THE WHOLE WHEEL, WARM HALF INCLUDED** — sixteen bright,
  saturated choices (owner decision, 2026-08). The first cut withheld red,
  orange, yellow and green on the grounds that a trade tile already uses those
  for winning, losing, break-even and a trailing stop. **The owner overruled
  that, and the reasoning is worth keeping**: nine cool colours were too close to
  one another to tell four people apart at a glance, which is the entire job, and
  a palette that fails at its job is not a safe palette.
  - **What replaced the rule is that THE COLOUR NEVER TOUCHES A FIGURE.** Every
    reading that means win or lose keeps its own colour and none are derived
    from the tile colour: the open P/L number stays green/red, the LONG/SHORT
    pill and the card's top edge stay green/red for the side, the B/E chip stays
    gold, TP/SL keep theirs. The tile colour is confined to the card's wash, its
    left bar and the **owner chip** — surfaces that never carried a meaning of
    their own. A red tile says "this is Dale's"; the money on it still says
    green when it is up. **Keep that boundary** — it is the whole safety
    argument now, and it is what a new position surface has to respect.
  - Values are picked bright and saturated deliberately, because they are drawn
    at ~24% over a navy card and a muted hex vanishes at that blend.
  - Migration `0124`'s own comment still states the original no-warm-colours
    rule. It is applied and is left exactly as written — a dated record, like a
    patch note, and never edited (drizzle keys applied migrations on that file).
- **`slate` is the exact gray funded positions have always carried, and it is the
  funded default.** So a group that never touches this sees the wall it saw
  yesterday: every column is null on deploy, null means "as it was", and only
  funded resolves to a colour without anybody choosing.
- **THE BROKER KIND WINS OVER THE PERSON.** A funded position takes the funded
  colour and a manual one the manual colour, whoever owns it — the owner asked
  for those two to be coloured separately from anybody. A trader's own colour
  therefore marks the accounts they actually trade, and their funded book stays
  visibly off-book, which is the distinction the wall already sorts on.
- **LEADER ONLY, and deliberately not folded into `canManageBadges`** (owner
  instruction). A badge is a title on one person's row; a colour is how the whole
  group reads the board, so two people handing colours out is how two members end
  up sharing one. There is no permission flag for it for the same reason — a flag
  would be a second way in. The leader can colour their own tiles: their
  positions sit on the same wall as everybody else's.
- **The colour is resolved SERVER-SIDE and stamped per position**
  (`LiveTrade.tileColor`), so every surface reads one field and no two can
  disagree about whose trade is whose. `getLiveWall` **wraps** the build
  (`buildLiveWall`) rather than painting inside it — that function returns from
  four places (sample, unavailable, empty desk, live), and a colour applied at
  three of them is a wall that loses its colours whenever a broker goes quiet.
- **Call sites** (change a position surface, bring the colour with it): the full
  card (`TradeCard`, left border + wash), the Open Positions tile's compact list
  (`PositionsTile`), the Trade Desk book (`DeskPositions` — wash only, its left
  border is already spoken for by the side), the funded table
  (`FundedLiveTrades`, off `FundedData.fundedTileColor` since every row there is
  funded), and the **Scriptable iOS widget** in `DeviceSettings.tsx`, which
  blends the hex itself (`mixHex` — Scriptable has no `color-mix`, and a
  translucent background would drop the card colour rather than blend with it).
  `tileTint` is exported from `TradeCard` so one blend rule serves all of them.
- **A row that can be coloured reserves the bar whether or not it has one**
  (`borderLeft: 4px solid transparent` on the base row style, header included).
  Without it a list mixing coloured and plain positions steps in and out and the
  columns stop lining up with their headings.
- **The strength was raised once and must not drift back down** (owner
  instruction, 2026-08). It shipped at a 13% wash with a 3px bar and was too
  subtle to do its job — four people's cards read as one. Now: **24% on a card,
  30–32% on a dense row** (a row has far less area, so the same blend reads
  weaker), a **5px** bar on the card, **4px** on a row, and the owner chip or
  handle drawn in the colour outright. `tileTint`'s default is the card figure;
  `tileChip` is the chip. If a colour looks too strong, the answer is a
  different colour, not a wash nobody can see.
- Everyone in the group sees the same board — colours belong to the group, not to
  the viewer. Somebody on no group resolves to the defaults, which is the
  appearance every tile had before this existed.
- No new paid feature key: this is part of Private Groups, so the routes sit on
  the existing `requirePremium('teams')` guard and the sidebar's `teams` diamond
  already marks it.

### Position designations — REMOVED, do not rebuild

**Chief Strategist and Chief Analyst are gone** (owner decision, 2026-08, for
risk management). A title naming one trader the desk's analyst or strategist
implies they are advising the rest, and that is the advice-giving posture the
whole product is built to stay out of — the same reason Investments carries no
target allocation and gives no buy/sell guidance.

They were one feature spanning three layers, and **all three are removed**:

- **The two badges** (`chief-strategist` / `chief-analyst`), seeded builtin in
  `badges/service.ts`. Migration `0099` deletes the `badge_types` rows, strips
  the keys out of every user's `users.badges` array, and clears any
  `user_team_members.badge` cosmetic title reading "Chief Strategist"/"Chief
  Analyst". It rebuilds the JSON array with `json_group_array` over `json_each`
  rather than editing the JSON text, so other badges survive untouched. Deleting
  the rows is what `seedBadges` cannot do on its own — it only ever inserts what
  is missing, so a builtin badge left in code would be re-seeded forever.
- **The colouring and ranking.** `badges/designations.ts` and the web's
  `DesignationTag.tsx` are deleted. A position is no longer tinted, accented,
  icon-tagged or sorted by whose it is, on the Live Wall, Trade Log, History, the
  iOS widget, or anywhere else. **The off-book (funded/FTP) gray tint and its
  last-place sort stay** — that is a fact about the account, not about the
  person; `tileTint` moved into `TradeCard.tsx`, its only remaining caller.
  Trade open/close notifications name the trader and nothing more.
- **The permission.** Holding a designation used to make a trader a *desk lead*
  (able to edit teammates' Trade History settings). `isDeskLead` is now team
  leader or admin/founder only. **Do not add a badge-derived permission here** —
  a cosmetic label should never be an access-control input.

`BADGE_PRESETS` (`userTeams/service.ts`) is down to `Risk Manager` / `Lead
Trader`. That field is still **free text** up to 40 chars, so a team leader can
type any title they like; there is deliberately no blocklist, since one would be
trivially defeated by a space or a spelling and would give false assurance.

### Who may delete a trade (`trading/deleteAccess.ts`)

A trader always removes their own. Beyond that it is a **team grant**: the
**leader** holds it implicitly, and they can hand the **Delete trades**
permission (`canDeleteTrades`, set from My Terminal ▸ My Group) to any member.
Admins keep their install-wide reach. `tradeDeleteScope(actor)` resolves this
once per request into `{ any, ownerIds, others }`, which `removeTrade`,
`removePosition` and `restoreDeleted` turn into the owner filter on their `WHERE`
clause — every non-admin grant is bounded by `scopedTraderIds`, so a leader only
ever reaches rows their own desk can already see. Whoever may delete may also
**restore** (Deleted Trades); **editing** a teammate's closed trade stays
admin-only. The trade payloads (`/api/trading/trades`, `/history`,
`/deleted-trades`) carry `canDeleteAny` so the UI knows where to draw the
control — the server is still the enforcer.

## AI / Ask VTS AI (`apps/api/src/ai`)

> **User-facing name is always "VTS AI"** (see Conventions). "Claude"/model IDs
> appear only in server config and internal code identifiers, never in UI copy.


- **Models** (env-overridable, current defaults): text = `ANTHROPIC_MODEL_DEFAULT`
  (`claude-sonnet-4-6`); vision/screenshot analysis = `ANTHROPIC_MODEL_ANALYSIS`
  (**`claude-sonnet-5`**). No streaming anywhere — every call is a single awaited
  `messages.create`.
  - **The analysis model moved off Opus** (2026-08, cost). Reading a trade off a
    broker screenshot is structured extraction, not hard reasoning, and Sonnet 5
    is the first Sonnet-tier model with high-resolution vision (2576px long
    edge) — so there is no capability loss on a screenshot, at $3/$15 per million
    tokens against Opus's $5/$25. All four vision flows parse structured JSON out
    of the reply via `extractJson`, so **that parse is what a model change has to
    be checked against**, not just a typecheck. The variable is env-overridable,
    so reverting is a host variable change and a restart, never a redeploy.
- **Availability:** `aiConfigured()` = `!!ANTHROPIC_API_KEY`. When unset, AI
  endpoints return **503**.
- **Usage controls: one monthly text budget, metered vision without a monthly
  product cap** (`ai/usage.ts`), plus one in-memory burst limit
  `AI_RATE_PER_MIN` (default **15**, resets on restart, shared across both).
  Over a retained limit → **429**.
  - `AI_MONTHLY_LIMIT` (default **1000**) — **text**: `ask`,
    `market_hours`, `todo_command` and the eleven `studies_*` kinds.
  - The four **vision** kinds (`analyze`, `position_screenshot`,
    `funded_screenshot`, `account_screenshot`) are recorded in `ai_usage`
    for cost visibility but have **no monthly product quota**. Screenshot trade
    logging is an input workflow; a trader must not be locked out later in the
    month merely because they kept logging legitimate trades.
  - The shared per-minute burst limit remains the request/provider-pressure
    boundary. Every screenshot route also retains its **12 MB request body**,
    accepted image MIME list, authentication, workspace permissions and
    parse/validation failures.
  - A kind not in the vision list counts as text. That is the safe default: new
    AI behavior stays monthly-capped until it is explicitly reviewed as a vision
    input workflow.
  - `getAiUsage` returns the text budget plus the current month's vision
    **used** count. Vision has no `limit` or `remaining`, because presenting a
    synthetic infinity as an allowance would imply a product cap that does not
    exist.
  - Deliberately **not per-tier**: there is no billing yet, and an allowance that
    varies by what somebody paid belongs with the thing that takes the payment.
- **Background AI is recorded, never capped** (`recordSystemAiUse`). The two
  background callers — the news headline tagger and the calendar explainer — run
  on the feed poller with no user behind them and used to write no `ai_usage` row
  at all, so the owner's usage figure covered roughly half the real bill.
  `ai_usage.user_id` is **nullable** (migration `0096`) and a null means "the
  terminal did this on its own schedule".
  - **A null can never consume somebody's allowance**, because every per-user
    count filters on `user_id = ?` and SQL does not match a NULL — a property of
    the comparison rather than an exclusion somebody has to remember to write.
  - It **records without enforcing**: if one of these jobs runs it should finish,
    and half-tagged output is worse than either extreme. `recordSystemAiUse`
    swallows its own errors so metering can never take down the poll it measures.
  - Surfaced to **admins only**, as `system` on `GET /api/ai/usage` and a line in
    the Ask VTS AI panel. Not a budget — nothing caps it.
- **Financial-advice guardrails (`ai/guardrails.ts`) — NOT editable, and that is
  the point.** Every prompt in `prompts.ts` is admin-editable, which is right for
  tone and feature guidance and wrong for the rules that keep the product out of
  regulated advice. Those have to survive a well-meaning edit, a careless paste
  and a compromised admin account. So the editable prompts keep their own advice
  language (it helps, and it is visible where an admin works) and `withGuardrails`
  welds the real rules on afterwards. **There is no route, screen or setting that
  can strip them.** Developer Terminal ▸ AI Instructions displays them read-only,
  so an admin can see what is already enforced instead of writing it again by hand.
  - **Use `withGuardrails` instead of `withStyle`** on every surface where a user
    can type. It includes the style, so it replaces rather than joins it. Applied
    to: the assistant, the tutor, both support intakes, the prop-challenge coach,
    the market overview and the To Do command bar.
  - **The MODEL is the detector**, via a sentinel (`REFUSAL_SENTINEL`) it puts at
    the very start of a reply when it refuses an advice request. The server strips
    it before the user sees anything and records the refusal. This is deliberate
    against the two obvious alternatives: keyword matching cannot tell "what does
    a market order do?" from "should I market-buy right now?", and every false
    positive is a paying customer locked out for half an hour; a classifier call
    before every message would double the AI bill on every turn. The model already
    has the conversation, the workspace and the rules.
    - It **degrades safely both ways**: a model that forgets the sentinel still
      refuses (the part that protects the product) and merely goes unlogged; a
      model that emits it spuriously costs that user a warning and grants nobody
      anything.
    - **Only matched at the START of the reply, never in user text.** A user who
      learns the sentinel exists can provoke a warning for themselves — that is
      self-harm, not an exploit — but a quoted one cannot write a record about
      anyone else.
    - **Structured prompts are told never to emit it** (`withGuardrails(…, {
      structured: true })`). They feed straight to `JSON.parse`, so a marker on
      the front breaks the parse — which on support intake means a user reporting
      a bug gets an error instead of a ticket. The limits still apply; only the
      marking is off, and those surfaces record no violation anyway.
- **Rule breaking (`ai/violations.ts`, `ai_violations`, migration `0101`).**
  - **Warn first, time out second.** The first refusal in a **24-hour window** is
    a warning with no timeout; a second within it carries **30 minutes**. Both are
    recorded and both reach the review screen, so nothing is lost in visibility —
    what is given up is punishing somebody the first time the system might have
    misread them. That is the owner's "benefit of the doubt", made concrete.
  - **The timeout covers Ask VTS AI and the tutor, never support.** A user who
    cannot reach help is a user who cannot tell you the guardrail misfired. Same
    rule that already keeps the complaints channel off the AI paywall.
  - **423, not 429.** The client needs to tell "paused for breaking a rule" from
    "monthly allowance spent" — they want completely different things said. The
    timeout is checked **before** the model call: the point of pausing somebody is
    not to spend the money.
  - **This is the ONLY AI conversation storage in the terminal.** Ordinary chats
    are still never persisted. Only a conversation that actually tripped the
    limits is kept, because a reviewer cannot judge "did we get this right?" from
    a timestamp. It **is** in the `admin/service.ts` per-user delete list —
    deliberately unlike `credential_audit` and `employee_audit_log`, which outlive
    the account because they record access to money and to a hardened surface.
    A stored chat log of a deleted customer is the harder thing to defend.
  - **"I think the AI made a mistake"** (`disputeViolation`) flags the row for a
    human and does **not** lift the timeout. Both halves are deliberate: lifting
    it automatically makes the penalty opt-out for anyone who reads the button,
    and ignoring the press wastes the only signal the terminal gets that its own
    guardrails misfire. An admin clears it from the review screen.
  - **Admin ▸ Rule Breaking** (`ad_rules`) shows the conversation, sorts disputed
    cases first, and rides the admin bell. Its sidebar dot follows a **live open
    count**, like Bug Reports — reviewing the last one has to clear it, and a
    last-seen stamp only moves forward. Clearing the pause is a separate control
    from the outcome, so dismissing a borderline case does not silently hand back
    the thirty minutes.
  - **The user-facing copy is forgiving on purpose** (`GuardrailNotice.tsx`).
    Somebody asking "is now a good time to buy" is a customer using a trading
    terminal in the most natural way imaginable, not an attacker. The card says
    what happened, says outright that the system gets this wrong sometimes, offers
    the button, and only then mentions the pause. It also carries the two privacy
    facts, which the Ask VTS AI panel states up front as well: **these
    conversations are reviewable, and trading data is not** — positions, results,
    balances and broker keys are never read by administrators, only by a software
    developer securing them.
- **Editable prompts** (`ai/prompts.ts`, `PROMPT_DEFS`): shipped default here,
  admin-editable live from **Admin ▸ AI Instructions** (override in
  `app_settings` under `ai.<id>`; blank value resets to default). Edit the
  default in `prompts.ts` so a reset stays correct.
  - `global` — VTS AI base persona. `routes/ai.ts` substitutes `{workspace}`
    (filled only for Trading/Studies; **empty in Admin/Help**, so the base
    persona must carry the whole site map) and `{name}`.
  - `ws.trading`, `ws.studies` — injected into `{workspace}`.
  - `tutor` (generic study tutor), `market_overview` (Market News "Brief me", keep
    `{label}`), `metrics_coach` (prop-challenge read), `support` (bug intake —
    **structured**: must return the exact JSON `{needMore, reply}` or intake
    breaks).
- **One response style, composed onto every prose prompt** (`style` in
  `prompts.ts`, `STYLE_DEF`): the owner's communication style — answer first, no
  preamble or self-description, bullets/numbered steps, short paragraphs, state
  an assumption instead of asking, recommend one default rather than listing
  alternatives. It is **not** copied into each prompt's default; call sites
  compose it on with `withStyle(system)` (or `styleGuide()` where the system
  prompt is built outside `prompts.ts`), so editing `ai.style` once — in code or
  from **Admin ▸ AI Instructions ▸ Response style** — changes the voice of every
  AI reply at once.
  - Applied to: `global` (+ workspace guidance), `tutor`, `market_overview`,
    `metrics_coach`, `support`, `support_intake`, the study-guide builder
    (`chatStudyGuide`, which takes the style as an argument so `claude.ts` stays
    free of the settings/DB layer), and the To Do command bar (`todo/command.ts`
    — wired server-side but **not reachable from any screen**; see "Server
    surface no screen reaches").
  - `withStyle(system, { structured: true })` appends a reminder that the reply
    is still JSON-only — use it for every prompt whose output is parsed, or the
    intake/builder parsers break.
  - **Deliberately not applied** to the data-extraction and content-authoring
    prompts (screenshot parsing, market hours, news reads, calendar explainers,
    deck/flashcard generation, the question audit): their output is structured
    data or study material rather than a reply, and each carries its own tight
    format and length rules.
  - Replies render as **plain text** (`whiteSpace: 'pre-wrap'`), so the style
    asks for `- ` bullets, `1.` steps and a colon-terminated label line instead
    of markdown headings/tables/code fences, which would show up literally. If a
    surface ever renders markdown, revisit that paragraph of `STYLE_DEF`.
- **Vision flows** (Opus, non-editable prompts in `claude.ts`): paste-a-screenshot
  → parse. Used for alert analysis, manual/funded position import, funded-trade
  close, and reading challenge equity off an FTP screenshot. These endpoints take
  `{ imageBase64, mediaType }` and allow a 12 MB body.
- **Market-hours lookup** (`analyzeMarketHours`, default text model, non-editable
  prompt in `claude.ts`): `POST /api/trading/market-hours { symbol }` returns a
  per-day ET schedule (Sun–Fri — includes the Sunday-evening open for forex/
  futures, one single window per day) so a Strategy Session can be filled to "all
  open market hours". Metered against the AI cap (kind `market_hours`); 503 when
  AI is off.

## External integrations & background jobs (`apps/api/src/trading`)

- **OANDA — two files, split by what they can do.**
  - `brokers/oanda.ts` is the **read** side: v20 REST, host per connection env,
    live (`api-fxtrade`) vs practice (`api-fxpractice`). Fetches open trades,
    pricing, account summary (NAV/balance/PL), daily candles and closed trades.
    NAV = live "capital" figure.
  - `brokers/oandaOrders.ts` is the **write** side and the *only* file in the
    repo that can move money: place, close, amend, cancel, plus the instrument
    specs and two-sided quotes the ticket needs. Kept separate on purpose so the
    file that can trade is one small, auditable unit — add order-placement code
    here, never to the read connector.

- **Kraken — three files, split the same way.** `brokers/krakenClient.ts` is the
  shared transport (signing, a **monotonic per-process nonce** — Kraken refuses
  any nonce not higher than the last it saw per key, and a desk fires several
  calls at once — timeouts, and the error decoding that reads the `error` array
  before the HTTP status). `brokers/kraken.ts` is the **read** side: open
  **margin** positions for the Live Wall, which is why a spot-only account shows
  nothing there and the desk reads holdings separately. `brokers/krakenOrders.ts`
  is the **write** side and the second file in the repo that can move money:
  AddOrder / CancelOrder / OpenOrders / QueryOrders, plus the AssetPairs specs,
  Ticker quotes and Balance/TradeBalance the desk needs. Add order-placement code
  there, never to the read connector.

  TradeStation/FTP connectors exist but the self-service connection UI only
  supports `oanda | kraken | manual`. **OANDA and Kraken both have an order
  path**; Kraken's is spot-only and must stay that way (see the Trade Desk
  section) — that is a deliberate posture, not an omission.
- **A connection is named whose + where** — "Andrew's OANDA", "Andrew's Kraken".
  The desk carries accounts at more than one venue, and a label naming only the
  owner leaves two chips on the Live Wall, and two account cards on the Trade
  Desk, that cannot be told apart.
  - `venueLabel(label, broker)` in `trading/connections.ts` is the **single
    rule**, and **every** write goes through it — `addConnection`,
    `updateConnection` and `adminUpdateConnection`. A label that already names
    its own venue is left exactly as the owner wrote it; one that names a
    *different* venue has it stripped; one that names none gets a generic tail
    ("Trades", "Crypto", "Account", "book") dropped and the venue appended, so
    "Andrew's Trades" becomes "Andrew's Kraken" rather than "Andrew's Trades
    Kraken". It is **idempotent**. `manual` is deliberately exempt — a
    hand-entered book is named after the prop firm it tracks and has no platform.
  - `backfillConnectionLabels()` re-applies it to every stored row **on boot**
    (`server.ts`, beside `backfillTeamLeaders()`).
  - **Do not go back to doing this as a migration.** It was migration `0085`
    first, and that is exactly why it broke: a migration only ever sees the rows
    that existed the day it ran, so the next Kraken connection anybody created
    came back reading "Andrew's Trades" beside an OANDA one — the confusion the
    rename existed to remove. The write path plus the boot pass is what makes it
    hold. `0085` is still in the tree as history; it is not the enforcement.
  - The Trade Desk's account cards print the venue outright ("KRAKEN · CRYPTO
    SPOT") from the connection's `broker`, so even a drifting label can never
    leave the desk ambiguous about which venue an order would go to.
- **An admin can REMOVE a teammate's connection, not just rename and pause it**
  (`adminRemoveConnection`, `DELETE /api/trading/connections/:id/admin`). A
  connection stranded by somebody else — a dead account replaced after the
  credential reset — otherwise had exactly one person who could tidy it, which
  is no use when that person is not the one looking at it.
  - **The desk's trade history is untouched by it.**
    `trading_positions.connection_id` carries no foreign key, so closed trades
    outlive the connection they arrived through: an orphaned row still shows on
    the Trade Log, and still dedupes the backfill (an account it cannot
    attribute is unknown, and unknown dedupes). This is tidying the list, not
    deleting anybody's trades — and it is why the removal is safe at all.
  - **Two refusals, each covering a loss the admin cannot see coming.** An
    **active** connection is refused — removing one stops that trader's Live
    Wall with nothing on screen to say why, and the credential is gone, so pause
    (reversible, already there) is the stop and this is the cleanup afterwards.
    A **manual** connection still holding positions is refused, because
    `manual_positions` cascades on that row: deleting it destroys hand-typed
    trades that exist nowhere else and no broker can re-import. The owner can
    still delete their own book — they can see what is in it.
  - The button is drawn only on a paused row, matching what the server accepts;
    a control that always refuses reads as broken rather than as a safeguard.
  - Recorded in the **Administrator Log** (`connection.removed`) — an admin
    acting on somebody else's account, irreversibly, which is what that log is
    for. `removeConnection` (the trader's own) is unchanged and unlogged.
- **TradingView webhooks — TWO endpoints, easy to misconfigure:**
  - `POST /api/webhooks/tradingview` — secret `TRADINGVIEW_WEBHOOK_SECRET` (in
    body or query). Writes `trading_alerts`; **this is the one wired to the
    Alerts UI**. Inbound alerts are attributed to the earliest-created active
    admin; with no admin, alerts are silently dropped. Alerts do **not** auto-place
    trades — a human pastes a screenshot for Opus to log the trade.
  - `POST /api/tv-webhook` — secret `TV_WEBHOOK_SECRET` (body-only, timing-safe).
    Writes a **different** table `tv_alerts` that nothing reads yet. Newer/more
    secure but not UI-wired. Point TradingView at the first one unless you're
    deliberately working on this.
- **News feeds** (`trading/feeds.ts`, prod-only pollers, every **5 min**):
  Finnhub (`FINNHUB_API_KEY`, optional), curated RSS (Fed/CNBC/MarketWatch/
  CoinDesk/Cointelegraph/FXStreet, keyless), Forex Factory economic calendar
  (keyless JSON), Truth Social (unofficial public API, default account = Trump,
  expected to 403 sometimes). Claude tags bias/impact on headlines and explains
  calendar entries. All best-effort; feeds default ON unless env set to `false`.
- **Desk watch** (`trading/service.ts`, prod-only, every **10 s**,
  `DESK_WATCH_SECONDS`): reconciles broker positions so trade open/close/TP-SL
  notifications fire even with no client open. **Only runs if push is configured.**
  - **"Nothing open" and "could not read" are different answers, and a broker
    connector must never collapse them.** Reconcile closes a position when its
    connection **answered** and the position is no longer in the feed, so an
    empty feed is an instruction to close the whole book — at the last mark
    polled, which is a bid/ask midpoint that never filled, with a "trade closed"
    push per position. `fetchOandaTrades` therefore **throws when the response
    carries no `trades` array**: OANDA always sends it, empty when the account is
    flat, so a body without it is a response we do not understand whatever its
    status code. Nothing self-heals a bad close — the closed-trade backfill only
    corrects rows the broker also considers closed — which is why the guard sits
    at the read rather than downstream.
  - **A position wrongly closed is REOPENED, never stored a second time.**
    Reconcile looks a live trade up among **open** rows, so a wrongly-closed one
    is invisible there and used to be inserted alongside: the phantom kept its
    estimated exit and P/L, the new row closed properly later, and both counted
    toward the trade count, win rate and P/L. A broker trade id is never reused,
    so the key **is** the trade — if it is back in the feed it was not really
    closed. `closedByKey` in `history.ts` is that lookup. Soft-deleted rows are
    deliberately excluded: a trade the trader removed by hand must not be
    resurrected by the broker still carrying it, the same rule the backfill
    follows.
- **Closed-trade backfill** (`trading/backfill.ts`, throttled per connection to
  `BACKFILL_INTERVAL_SECONDS`, default 300): pulls OANDA's closed-trade page into
  `trading_positions` so trades that opened and closed between polls still land
  on the desk, and **corrects** what reconcile could only estimate — reconcile
  stamps the last mark it polled (a bid/ask mid, never a real fill) plus the last
  *unrealized* P/L, so the broker's record replaces those. It leaves **open** rows
  for reconcile to close (so the "trade closed" push still fires) and never
  resurrects a soft-deleted one. **Two writers, one key:** reconcile stores a
  position under the id `loadConnection` assigns (`<connectionId>:oanda:<tradeId>`)
  and the backfill must build the exact same string — when they drifted apart
  every live-captured trade got a second, phantom row (migration `0077` cleaned
  those up). There is no unique constraint on `(user_id, key)` to catch it, so
  check with `db:verify-positions` below.
  - **The dedupe boundary is the OANDA ACCOUNT, never the connection row**
    (`differentAccount` in `backfill.ts`). Trade ids are numbered per account,
    and one account can sit behind more than one connection row — so scoping the
    "what do we already hold" index to the connection says *every connection is
    its own account*, which is false. That is the second route to the same
    duplicate the key drift produced, and it is the one that actually shipped: a
    connection deactivated by migration `0094`'s credential reset was replaced by
    a **new** connection rather than re-keyed, the backfill saw an account it had
    no history for, and re-imported all 500 of its closed trades. Every trade the
    live poll had already captured was then held twice — once with the stop, once
    without — and both legs counted toward the trade count, win rate and P/L.
    Migration `0113` merged and removed them.
  - **An account we cannot attribute is UNKNOWN, and unknown dedupes.** Only a
    connection whose credentials this pass already decrypted can be resolved (so
    identity costs no extra decryption and no extra audit row); inactive, deleted
    and out-of-scope connections resolve to nothing. Erring this way costs a
    backfilled row only when one owner runs two accounts whose trade ids collide
    *and* one of those connections is unreadable — a missing row, which the
    trader can see, rather than a phantom one, which scores. Same family of rule
    as the Live Wall's `source` union: **never let a fabricated figure stand in
    for one that could not be established.**
  - **A second connection to an account already connected is refused**
    (`assertAccountNotAlreadyConnected` in `connections.ts`, on both add and
    credential edit), which stops the pair being created at all — and with it the
    live poll reporting one open position twice, which no backfill rule can fix.
    Identity is compared on the plaintext `summary`, so nothing is decrypted to
    run the check. `manual` is exempt: it holds no credential and a trader
    legitimately keeps several hand-kept books.
- **Session watch** (`trading/sessionWatch.ts`, prod-only, every **30 s**,
  `SESSION_WATCH_SECONDS`): fires a trader's OWN Strategy Session notifications —
  a pre-open heads-up, an open buzz, and a close buzz — on each session's per-day
  ET schedule. Opt-in per user (`session_alert_prefs`, `trading/sessionAlertPrefs.ts`);
  in-memory per-ET-day dedup so each event fires once. Runs only if push OR
  Pushover is configured; demo excluded; each notice goes only to its own owner.
### The corner chat has three tabs

`TeamChat.tsx` (the lower-right bubble) carries **Team chat**, **Support**, and —
for founders, software developers and admins — **Administrator chat**.

- The admin room is **one install-wide conversation**, deliberately **not**
  team-scoped: administration is not a desk activity, and an admin on one team
  needs to reach an admin on another. Its rows carry `channel: 'admin'` and
  `teamId: null`, so it needed **no migration** — `chat_messages.team_id` was
  already nullable for the legacy channels.
- Routes `GET|POST /api/chat/admin`, `DELETE /api/chat/admin/:id`, all on
  `requireAdmin` (founder-level passes, being a superset).
- **Delete rights differ from the team chat on purpose.** There, an admin may
  remove anyone's message. Here, only a **founder-level** user can — this room is
  where decisions about people's accounts get discussed, so the record should not
  be editable by everyone standing in it.
- `ChatFeed` in `TeamChat.tsx` is the shared feed+composer the admin tab renders;
  the team chat still has its own inline copy, which is where that markup came
  from.

- **Notifications** fire (web push + Pushover together, scoped per
  `trading/scope.ts` — a trade event reaches only its own trader, a TradingView
  alert reaches the team; demo
  excluded, best-effort) on: a new TradingView alert, and per-trade events during
  reconcile — **opened**, **closed**, and a stop/target change split into
  **placeSl / moveSl / placeTp / moveTp** (a trade whose SL and TP both change
  emits one notification per level). Team chat is not pushed (it has its own
  top-bar bell).
- **Per-user notification prefs** (`notifications/prefs.ts`, `notification_prefs`
  table, `routes/notificationPrefs.ts`): each recipient can pick which teammate a
  trade event is about and, per teammate, which of the six events buzz them
  (`open / close / placeSl / moveSl / placeTp / moveTp`). A recipient with **no
  stored row** for a trader defaults to **all events on** (preserves the old
  whole-team feed), so the filter only ever mutes. `sendToTradingDesk` /
  `sendPushoverToDesk` take an options object `{ excludeUserId?, scopeIds?,
  ownerId?, event? }` and apply the pref filter only when both `ownerId` and
  `event` are given — alerts pass neither (team-wide, not one trader's action).
  UI is the "Trade notifications" panel on **Advanced Trading ▸ Alert Settings**
  (`components/NotificationSettings.tsx`).
- **Session alert prefs** (`trading/sessionAlertPrefs.ts`, `session_alert_prefs`
  table, one row per user): per-user opt-in toggles for **session open / close /
  pre-open** plus a `preOpenLeadMin` (1–240, default 30). Routes
  `GET|PUT /api/trading/session-alert-prefs`; UI is the collapsible "Strategy
  session alerts" card on **Advanced Trading ▸ Alert Settings**
  (`alertPanels.tsx`, rendered by `AlertSettings.tsx` — it was on the Strategy
  Sessions screen until 2026-08).
  All default **off** (opt-in). The session watch reads these to fire a trader's
  own session notifications.

## Employee Portal (`/employee`) — a separate, hardened surface

The company's internal staff site. Unlike everything else in this repo it is
**not a workspace**: it is a second website served from the same origin, with its
own URL, its own bundle, its own API namespace and — the point of the whole
design — **its own sessions**. Signing in to the main terminal grants nothing at
`/employee`, and an employee session grants nothing in the main terminal. They
share an account table and nothing else.

**Where it lives**

- API: `apps/api/src/employee/{emailOtp,mailer,trustedDevices,sessions,audit,lockout,network,guard,service}.ts`,
  routes in `routes/employee.ts` (all under `/api/employee/*`), registered in
  `server.ts`. Tables: `employee_profiles`, `employee_sessions`,
  `employee_login_attempts`, `employee_audit_log`, `employee_announcements`,
  `employee_documents` (migration `0073_employee_portal.sql`),
  `employee_trusted_devices` (migration `0076_employee_email_2fa.sql`).
- Web: `apps/web/employee.html` (a second Vite/Rollup entry) → `src/employee/*`.
  The way in from the app is a **standalone sidebar row pinned above the
  Workspaces list** (`EmployeePortalLink` in `Sidebar.tsx`) — deliberately not a
  workspace and not a section, because it is a different website. It is a plain
  `<a href="/employee" target="_blank" rel="noopener noreferrer">`: a real page
  load in a **new tab**, so the terminal stays where it was, the new tab gets no
  `window.opener` handle back into the signed-in terminal, and no referrer leaks.
  Shown only when `canAccessEmployeePortal(roles, email)` holds; never to the demo.
- `server.ts` serves `/employee`, `/employee/`, and `/employee/*` from the built
  `employee.html`, read into memory and sent directly (**not** via
  `@fastify/static`, whose `Cache-Control` would overwrite the `no-store` header
  this page must carry).

**Who gets in — two independent conditions, both required**

1. the `employee` role, granted per person by a founder; and
2. a sign-in email on `EMPLOYEE_EMAIL_DOMAIN` (default
   `vitalistradingsystems.com`).

Both are re-checked on **every** request (`loadEmployeeContext`), not just at
sign-in, so revoking either takes effect immediately — a live session dies on the
next request. The demo is hard-excluded regardless of roles.

> **Do not make the email domain the only gate.** `seed.ts` backfills every
> account without an email to `<username>@vitalistradingsystems.com`, so the
> domain test alone is close to "every account". It is a *narrowing* condition
> layered on the explicit role, never a grant.

**The security layers** (in the order `guard.ts` applies them)

1. **Network** — optional `EMPLOYEE_IP_ALLOWLIST` (IPv4/IPv6 addresses or CIDRs).
   When set, the page load and every API call from outside it are refused before
   authentication. **Fails closed**: an unparseable client address is refused. The
   main terminal is unaffected.
2. **Origin** — `Sec-Fetch-Site` (or `Origin`) must be this site on every write.
3. **Session** — cookie `__Host-vts_employee` in production (plain
   `vts_employee` in dev, since `__Host-` requires Secure), `SameSite=Strict`,
   `httpOnly`, signed, only the SHA-256 of the token stored. **8h absolute** cap
   (`EMPLOYEE_SESSION_HOURS`) **and** a **30-minute idle timeout**
   (`EMPLOYEE_IDLE_MINUTES`), both enforced server-side on lookup.
4. **Identity** — the two conditions above, plus an `active` employee profile.
5. **CSRF** — a per-session token derived as `HMAC(SESSION_SECRET, sessionId)`
   (never stored, so a DB copy holds no usable token), echoed by the client in
   the `x-vts-employee-csrf` header on every non-GET.

**Second factor — a code emailed to the company address.** Required by default
(`EMPLOYEE_REQUIRE_2FA`). There is **no authenticator app and no enrollment
step**: a correct password issues a `pending_2fa` session that can reach **only**
`POST /2fa/verify` and `POST /2fa/resend`, and a six-digit code goes out by email
(`employee/emailOtp.ts`, sent via `employee/mailer.ts`).

- The code is delivered to **`users.email`** — the account's own sign-in address,
  which the guard has already required to be on the company domain. Never the
  address typed into the form (that field also accepts a username), so a code can
  only ever land in a company mailbox.
- It is random (`crypto.randomInt`, no modulo bias), stored **only as a SHA-256
  on the one session that asked for it** (so a second attempt in another browser
  gets its own and neither consumes the other's), expires after
  `EMPLOYEE_OTP_TTL_MINUTES`, and is **single-use** — promoting the session
  clears it, so it cannot be replayed.
- Wrong guesses are capped per code (**5**, then that code is burned and a fresh
  one must be requested) *and* fed to the account/address lockout ladder below.
  `/2fa/verify` and `/2fa/resend` **check** that ladder as well as feed it.
- **Nothing on the sign-in path clears the ladder until a code actually
  succeeds.** This matters more than it looks: a correct password is a request
  an attacker who has the password can make at will, so if `/login` cleared the
  counters (it used to) they could loop "log in, guess four, log in again"
  forever without ever reaching a rung. Only `/2fa/verify` succeeding clears
  them — the one thing someone who cannot read the mailbox never gets to do.
- **Issuing a code is throttled per account, not per session** (30s,
  `codeSendCooldown` over `lastOtpSentAtForUser`), and `/login` and `/2fa/resend`
  share the one cooldown. A per-session throttle would be no throttle at all:
  both the mail-flood and the guess-forever attacks work by asking for a brand
  new session each round.
- The per-code attempt counter is incremented **in SQL**, so a burst of parallel
  guesses cannot all read the same value and collectively cost one attempt.
- The code is **not** in the email subject line — subjects surface in
  lock-screen previews and are retained in more places than bodies.
- **SMTP is optional.** With no `SMTP_HOST` set the code is written to the server
  log instead of emailed, and the response carries `delivered: false` so the UI
  says so. Deliberate: a misconfigured deploy must not lock every employee out.
- **The send is bounded (10s connect/greeting, 15s socket, in `mailer.ts`).**
  `/login` awaits delivery so it can report `delivered` honestly, which means an
  unbounded send is an unbounded sign-in: nodemailer's defaults (2 min to
  connect, 10 min socket) once hung the login request until the browser gave up
  with "load failed", locking people out via the exact path the log fallback
  exists to prevent. Keep any mail added here on a short timeout. The usual way
  to trigger it is a port/`SMTP_SECURE` mismatch — plaintext on 465 or implicit
  TLS on 587 — where each end waits for the other to speak first.

**"Remember this device for 30 days."** Ticked on the code screen, backed by
`employee/trustedDevices.ts` + `employee_trusted_devices`. A remembered browser
**skips the emailed code** for `EMPLOYEE_REMEMBER_DEVICE_DAYS` — it never skips
the password, so this changes how often the second factor is asked for, not
whether the surface has one. The trust lives in its **own** cookie
(`__Host-vts_employee_device` in production, `SameSite=Strict`, httpOnly, signed,
SHA-256 stored) separate from the session cookie, because the two have opposite
lifetimes: the session is deliberately short (8h / 30m idle), this deliberately
long. **No guard consults it** — authority still comes from the session cookie
alone; holding it only affects what `/login` asks for next. Each employee sees
and revokes their own on the Security screen; a portal admin drops all of
someone's at once (`POST /api/employee/admin/people/:id/forget-devices`, which
also kills their sessions), and revoking access or suspending a record clears
them too.

**Brute force.** `employee_login_attempts` tracks failures per **account** and
per **source address**, with a progressive lockout (5 fails → 1 min, 8 → 5 min,
10 → 15 min, 12 → 1 h) that decays after a quiet hour. Counters live in the
database so a restart does not hand out a fresh budget. The main terminal still has
no login throttle; this surface does.

**Audit.** `employee_audit_log` is append-only: every sign-in, failure, lockout,
refusal, CSRF rejection and write. Nothing updates or deletes a row, and the log
deliberately **survives account deletion** (`admin/service.ts` removes the
profile, sessions and throttle counters, never the audit rows). Employees read
their own trail in the Security screen; portal admins can read everyone's.

**Response headers** (`applyEmployeeSecurityHeaders`, on the page shell and every
`/api/employee` response): a strict CSP (`script-src 'self'`,
`frame-ancestors 'none'`, `connect-src 'self'`, `base-uri 'none'`),
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`,
COOP/CORP/COEP, `Cache-Control: no-store`, `X-Robots-Tag: noindex`, and HSTS in
production.

**Never cached, never installable.** `/employee` is on the service worker's
`navigateFallbackDenylist` and its assets on `globIgnores`, so the surface is
always fetched fresh from the network. A small Vite plugin
(`stripPwaFromEmployeeEntry`) removes the injected web-app manifest from that
entry — it is not a PWA and must not offer an install prompt.

**Tasks** (`employee_tasks`, `MyTasks.tsx` on the Overview screen). Every route
under `/api/employee/tasks` is scoped to the caller by `userId`; an employee adds,
completes and removes their own. A portal admin can **assign** via
`POST /api/employee/admin/tasks` — to one person, or `everyone: true`, which
writes **one row per active employee** rather than a shared row, so each person
completes their own copy. There is deliberately **no** endpoint that reads another
employee's tasks. Assignments are audited (`task.assigned`).

**Headshots & working status.** The "Employee photos" card (`screens/Photos.tsx`)
on Overview holds two things that belong to the person rather than to HR. A
headshot is dropped or picked, cropped square and re-encoded to a **400px JPEG in
the browser** (`src/employee/image.ts`) before `PUT /api/employee/photo` stores it
in **`users.avatar`** — the same column the main terminal uses, so one person has
one face on both surfaces; the route caps the body at 400 KB and refuses anything
that is not an image data URL. Beside it, a roster shows who has a photo
(`DirectoryEntry.hasPhoto`) with the design's "N still need a photo" nudge. A
**founder-level** viewer additionally gets Add / Replace / Remove under every
other person's tile, backed by `PUT /api/employee/admin/people/:id/photo`
(`requireEmployeeDeveloper`, target must be an active employee) — a directory
only ever fills up if somebody can do it on everyone's behalf. That is
deliberately **narrower than `isPortalAdmin`**: HR edits records, not faces.
Acting on someone else is audited with `target` set to their name and
`detail: 'set by a developer'`, so it is distinguishable from a self-change.
**Working status** (`employee_profiles.working_status`: `in_office | remote |
away`, default `in_office`) is set only by its owner via
`PUT /api/employee/working-status` — there is no endpoint for changing anyone
else's — and reads back as a coloured dot in the Directory. Photo changes are
audited (`photo.updated` / `photo.removed`).

**Screens** (`src/employee/screens/*`): Overview (your record + the session's own
security posture + Employee photos + My tasks), Directory, Announcements,
Documents, Security (remembered devices, active sessions, activity log), and
**People** — the HR screen for portal admins (`employee_profiles.is_admin`, or
founder-level implicitly): grant/revoke access, edit records, forget someone's
remembered devices. Granting refuses a non-company address up front rather than
creating an account that would fail at the door.

**Navigation is a top bar, not a side rail** (`EmployeeApp.tsx`). The forest
masthead carries the brand on the left, the signed-in name / main-terminal link /
sign-out on the right, and a second row of screen buttons beneath it. There is
**no sidebar and no collapse toggle** — the screens get the full window width.
Every row is `flexWrap: 'wrap'`, and that is the whole design: the bar **never
scrolls sideways and never truncates a label to an ellipsis**. When a row runs
out of width the items reflow onto another line and the bar grows **taller**, so
every label stays readable in full at any viewport (verified down to 320px). Keep
it that way — do not add `overflowX: 'auto'`, `textOverflow: 'ellipsis'`, or a
fixed height here. Nav labels are `whiteSpace: 'nowrap'` so a two-word item wraps
as a unit rather than splitting; the signed-in name is the one exception
(`overflowWrap: 'anywhere'`), since a name long enough to fill the bar alone has
to break somewhere and an ellipsis is not the answer.

**Its own design language.** The employee portal does **not** use the main
terminal's theme. `src/employee/theme.ts` stands alone — a warm-sand page
(`#f5f2ec`), white cards, a forest masthead (`#0f3d3a`), terracotta for action
(`#c25a38`), Source Sans for UI and Source Serif for headings (self-hosted in
`employee/fonts.css`, since the CSP blocks font CDNs). It also exports `SHADOW`
and `RADIUS`. Every employee screen composes from those tokens and the `ui.tsx`
primitives, so restyling happens in those two files rather than screen by screen.
Full spec and implementation status in `docs/design/employee-portal/`.

**Copy is plain hardcoded text.** The employee bundle has no in-app wording
editor — every developer-authored string is a normal string literal in the
`.tsx` file it lives in. There is no `copy.<id>` override store, no floating
pencil, and no founder-only edit mode on this surface. To reword anything,
edit the source and deploy. (This mirrors the main terminal — see "Coded copy is
hardcoded" below.)

## Auth & security specifics

- Login `POST /api/auth/login` by email (or username fallback), generic 401,
  constant-time-ish (always runs a verify) to resist enumeration. One-click demo
  via `POST /api/auth/demo`.
- Password recovery `POST /api/auth/forgot-password` always returns the same
  generic 202, including for malformed/missing/inactive/disallowed accounts,
  throttling, absent mail configuration, and delivery failure. It creates a
  separate 15-minute (configurable via `PASSWORD_RESET_TTL_MINUTES`) Argon2id
  credential only for an active, private-admitted, non-demo account. The
  plaintext exists only long enough to send through the shared employee mailer;
  recovery must call `mailConfigured()` first because that mailer's development
  fallback logs bodies. A successful temporary-password login atomically
  promotes the hash, consumes the pending row, forces Change Password, and
  revokes older sessions. The one-process IP/mailbox limiter is intentionally
  suitable only while Railway runs one API replica.
- Session cookie **`vts_session`**: random token, stored server-side in
  `sessions` (SHA-256 of the token; raw token only in the cookie), Fastify-signed
  with `SESSION_SECRET`, `httpOnly`, `sameSite: 'lax'`, `secure` per
  `COOKIE_SECURE`, TTL `SESSION_TTL_DAYS` (default 14). Admin password reset /
  deactivate revokes all of a user's sessions.
- **No** login rate-limit, account lockout, or CSRF token — password recovery's
  isolated anti-flood limiter is the exception. CSRF posture rests on
  `sameSite: 'lax'` + signed httpOnly cookie. AI usage cap and the broker poll
  throttle are the only rate limits. (The **Employee Portal** has all of these —
  lockout, CSRF token, idle timeout, emailed-code 2FA — on its own separate session; see its
  section above. None of it applies to the main terminal's `vts_session`.)
- **Broker credentials at rest (`security/secretbox.ts`, `security/credentialsKey.ts`).**
  AES-256-GCM, envelope **`v2:<keyId>:<iv>:<tag>:<ct>`**, key derived by
  **HKDF-SHA256** from `CREDENTIALS_KEY`. Five things carry the design, and each
  one is why the format changed (the reset was migration `0094` — see below):
  - **`CREDENTIALS_KEY` is REQUIRED in production and separate from
    `SESSION_SECRET`.** It no longer falls back to it: one secret must not
    protect both sessions and every broker key. The boot guard in `config.ts`
    refuses to start if it is unset, fails validation, or equals
    `SESSION_SECRET`, and exits naming the variable and the command that fixes
    it. In **development** the fallback survives with a loud warning on every
    boot — but never onto the built-in `dev-only-insecure-session-secret-…`,
    which is refused outright because it is a literal in this repository. (That
    combination is exactly what used to ship: `NODE_ENV` defaults to
    `development`, so a deploy setting neither variable booted happily and
    encrypted every credential under a published string.)
  - **It must be GENERATED randomness, 32+ bytes, base64 or hex — a passphrase
    is refused at boot** (charset + round-trip + all-printable-ASCII checks in
    `credentialsKey.ts`). That is what replaces a slow KDF, deliberately:
    credentials are decrypted on the Live Wall's **10-second poll** for every
    connection on a team, so scrypt/argon2 there would be a permanent latency tax
    on the busiest loop in the terminal. An unguessable key removes the
    brute-force concern instead of pricing it, which leaves HKDF free to be fast.
    The derived key is **memoized per process**, not re-derived per call.
  - **The `keyId`** (first 8 hex of `sha256(derivedKey)`, so no second env var to
    keep in step) is the **rotation seam**. A record written by another key
    throws `WrongKeyError` — distinct from `MalformedSecretError` (a v1 or
    corrupt record) and `SecretAuthError` (tampered / wrong row). **Nothing
    consumes that distinction yet**: it is what a future rotation path needs —
    try the current key, fall back to a retired one, re-encrypt on read.
    **Rotation itself is not built.**
  - **AAD binds a ciphertext to its row** (`userId` + connection `id`), so a blob
    moved between rows no longer decrypts. This is why `encryptSecret` /
    `decryptSecret` take a `SecretScope` — and why `addConnection` mints the row
    id *before* sealing. `authTagLength: 16` is pinned on **both** cipher and
    decipher (unpinned, GCM accepts a shortened tag).
  - **A credential that will not decrypt is surfaced, not swallowed.** Both read
    paths in `connections.ts` log (never the secret, never the ciphertext) and
    mark the connection errored via `recordConnectionStatus` — but **only when
    the stored status is not already `error`**, because this runs on that same
    10-second poll. Before this, an unreadable connection vanished from results
    while the UI kept showing a green "ok" dot.
  - `npm run verify:secretbox` checks all of it offline — round trip, tampering,
    row binding, the v1 path, the key rules and the boot guard.
- **Rotating a key still costs something:** `SESSION_SECRET` signs cookies, so
  rotating it **invalidates every session**; rotating `CREDENTIALS_KEY` makes
  stored broker credentials unreadable until each trader re-enters them (until
  the rotation seam above is built out).
- **The reset (migration `0094`).** v1 records cannot be read under v2, so every
  non-manual `broker_connections` row was marked `active = false`,
  `last_status = 'error'` with a plain re-enter sentence. **Rows are kept** —
  label, broker and `history_start_at` survive, so reconnecting is pasting a key
  into the connection that is already there (`updateConnection` re-encrypts).
  **`manual` rows are deliberately excluded**: they hold no credential to
  re-enter (their payload is `{}`) but are still decrypted on the way to the Live
  Wall, so `repairManualConnectionSecrets()` re-seals them **on boot** beside
  `backfillConnectionLabels()` — the half a migration cannot do, since a
  migration cannot run the encryption.
- **Credential use is audited (`trading/credentialAudit.ts`, `credential_audit`,
  migration `0095`).** Broker credentials here can place real orders, and nothing
  recorded that one had been used — so after a leaked database, a rogue admin or a
  disputed trade there was no way to reconstruct what happened, and no answer to
  "was my key used?". Several US state breach-notification laws turn on exactly
  that determination, and being unable to establish what was reached generally
  forces the broadest possible notification.
  - **Two tiers in one table, and the split is what makes it affordable.**
    Credentials are decrypted on hot paths — reconcile runs install-wide every 10
    seconds, the Live Wall decrypts a whole team's on every poll — so a row per
    decryption would be thousands per connection per day of pure noise. Anything
    that moves money or that a person asked for (the four order actions,
    `desk_read`, `holdings`, `quotes`) writes **one detailed row**; background
    polling (`wall_read`, `reconcile`, `backfill`, `capital`) **upserts one row
    per (connection, purpose, hour)** and increments `count`. That bounds the
    table to roughly connections × purposes × 24 rows a day at any poll rate.
    `hour_bucket` is NULL on an individual row, which is what lets both tiers
    share the unique index — SQL treats NULLs as distinct.
  - **Purpose is passed in, because the decrypt site cannot know it.**
    `getActiveDecrypted` / `getAllActiveDecrypted` are the only two places a
    credential becomes usable, which makes them the one place worth auditing —
    but serving the Live Wall and serving an order look identical from in there.
    So both take a required `CredentialUse`. Two flags carry real weight: `only`
    (the desk decrypts every connection to find the one an order names, and
    recording "order placed" against the others would be false on the very screen
    that exists to tell somebody their key was used) and `deferred` (the order
    paths write their own row **after** the broker answers, so it carries the real
    outcome — a refusal is an attempt that was made and failed, which is what
    matters).
  - **Fire and forget, always.** An audit write must never delay or fail a broker
    call; `recordCredentialUse` returns void and swallows its own errors into a
    log. A trader whose order was refused because the logging table was busy would
    be a far worse outcome than a missing row.
  - **A null actor is a statement, not a gap** — it means the terminal did this on
    its own schedule. Aggregate rows are always null-actor: an hour of polling has
    no single actor, and naming one would be a false attribution. Individual rows
    carry the actor and `request.ip`, which is the real client address because
    `trustProxy` is on in production (`server.ts`); it is the left-most forwarded
    address, so treat it as an investigative indicator rather than proof.
  - **Append-only, and it deliberately outlives the account it describes.** No
    foreign keys — a `references(...)` would take the trail down with the
    connection or the user — so `owner_username` is denormalized onto the row and
    the table is **deliberately NOT in the `admin/service.ts` per-user delete
    list**. That is the same exception `employee_audit_log` already takes, and a
    privacy-policy rewrite has to cover it explicitly.
  - **Who may read it:** a trader sees **their own only**, scoped from the session
    (`GET /api/trading/credential-audit`) — a teammate or team leader gets nothing,
    and there is no parameter that could widen it. Admins see everyone
    (`/credential-audit/all`, same guard shape as `connections/all`). The panel is
    in `BrokerConnectionsPanel.tsx` under Live Brokers. Nothing about a credential
    reaches a row: the writer is handed ids, a purpose and an outcome, and the
    module contains no credential-bearing identifier at all.
- **`PRAGMA secure_delete = ON`** (`db/index.ts`) so a deleted row's ciphertext is
  overwritten rather than left in a freed page that every backup copies. It
  governs **future** deletes only; already-freed pages keep their contents until a
  `VACUUM`, which is deliberately not run at boot (it needs room for a second copy
  of the database and holds a write lock).
- **Demo** (`demo/`): username `demo`, roles `['member']`, own team. Its feature
  opt-ins are forced by `featuresForUser` — Advanced Trading **on** so the tour is
  complete, Funded **off** — rather than read from a stored row.
  `demoGuard` allows only GET/HEAD/OPTIONS + logout, serves canned AI/brief
  responses (no real Claude spend), and 403s every other write. UI also renders
  all demo workspaces read-only.

## Frontend specifics

- **Routing is state-based, not URL-based** (no react-router). `Portal.tsx` holds
  `workspace`/`screen` in `useState`; the URL never changes and there is **no
  deep-linking, refresh-persistence, or browser back/forward**. The **one**
  URL-addressable surface is `/employee`, and it is a separate page rather than a
  route — see the Employee Portal section. Its own internal navigation is
  state-based too. `Screen`
  (`workspaces/Screens.tsx`) is a stale "Stage N" placeholder that only renders
  as the fallback for unmapped keys.
- **State:** auth/current-user in `auth/AuthContext.tsx` (`useAuth()`); everything
  else is local `useState` in `Portal.tsx` plus feature Providers (Privacy,
  Badges, AlertSound). UI RBAC gating in `auth/access.ts` mirrors the server but
  the **server is the enforcer**.
- **PWA:** `vite-plugin-pwa`, `registerType: 'prompt'`. The static shell is
  precached; **`/api` is denylisted from caching** so live data never goes stale.
  `UpdatePrompt.tsx` polls for a new SW every 60 s and shows a relaunch card.
  Push subscription flow in `push/usePushNotifications.ts`; SW handlers in
  `public/push-sw.js`.
- **Theming:** unified navy background everywhere; workspace signalled by accent
  (`theme/tokens.ts`, `theme/themes.ts`). Studies is special — it recolors live
  to the learner's Study-Game level.
- **Responsive:** `useResponsive()` → `{ isPhone ≤480, isTablet ≤768 }`. Phones
  use an off-canvas nav drawer and a sections dropdown; there is no bottom TabBar.
- **Design handoff:** `docs/design/portal-shell.md` is the paste-ready brief for
  an external design tool (shell layout, tokens, workspace accents, section
  lists, component patterns, and an explicit "this is no longer the design" list
  — the pre-Meridian top-bar template with Kia Sales / Wealth / Finance keeps
  resurfacing in generated mockups). `docs/design/portal-shell.html` is the same
  shell as a self-contained static page to screenshot or attach; its colours,
  sizes, nav rows and Lucide glyphs are copied from `theme/*`, `Sidebar.tsx`,
  `TopBar.tsx` and `Icon.tsx`. **Update both when the shell changes** — a stale
  brief is worse than none, because a tool will follow it. The Employee Portal
  has its own, separate spec in `docs/design/employee-portal/`.

## Environment variables

Validated in `config.ts` (Zod) unless noted. Most are optional with sane
defaults; the app runs locally with almost nothing set.

- **Core:** `NODE_ENV`, `PORT` (default 4000; Railway sets it), `WEB_ORIGIN`
  (CORS), `DATABASE_URL` (default `file:./data/vts.db`), `SESSION_SECRET`
  (**required in production**, ≥16 chars; dev falls back to an insecure default),
  `SESSION_TTL_DAYS` (14), `COOKIE_SECURE` (`true` only over HTTPS),
  `PRIVATE_MAINTENANCE` (unset; `true` closes the private portal — see below),
  `CREDENTIALS_KEY` (broker-credential encryption — **required in production**,
  32+ bytes of generated randomness in base64 or hex, and **must differ from
  `SESSION_SECRET`**; the API refuses to boot otherwise. Generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  Dev may leave it unset and falls back to `SESSION_SECRET` with a warning. It no
  longer silently derives from `SESSION_SECRET` in production — see Auth &
  security specifics).
- **AI:** `ANTHROPIC_API_KEY` (absent = AI off), `ANTHROPIC_MODEL_DEFAULT`,
  `ANTHROPIC_MODEL_ANALYSIS` (**`claude-sonnet-5`** — moved off Opus for cost;
  set it back to `claude-opus-4-8` to revert, which is a host variable change and
  a restart, not a redeploy), `AI_MONTHLY_LIMIT` (1000, **text only**), and
  `AI_RATE_PER_MIN` (15, shared burst limit across text and vision). Vision
  calls are metered but have no monthly product quota; see the AI section.
- **Webhooks:** `TRADINGVIEW_WEBHOOK_SECRET`, `TV_WEBHOOK_SECRET` (each unset =
  that webhook rejects everything).
- **Brokers** (env-config path; also seedable per-user in the UI): `OANDA_API_TOKEN`,
  `OANDA_ACCOUNT_ID`, `OANDA_ENV` (`practice`/`live`), `KRAKEN_API_KEY/SECRET`,
  `TRADESTATION_*`, `FTP_API_URL/TOKEN/ACCOUNT_ID`.
- **OANDA pricing account** (the Market Data board + the price-alert watch):
  `OANDA_PRICING_TOKEN`, `OANDA_PRICING_ACCOUNT_ID`, `OANDA_PRICING_ENV`
  (`practice` default). Falls back to the general `OANDA_*` account, then to
  nothing. **Point it at a practice account** — the rates are identical and a
  leaked pricing credential then reaches no money. This is the *only* thing that
  can price those rows: there is deliberately no fallback to a user's own broker
  connection (see Market Data ▸ Prices). Unset means the OANDA-sourced rows show
  sample figures and forex/metals/index alerts cannot fire; crypto is keyless and
  unaffected either way.
- **Feeds:** `FINNHUB_API_KEY`, `RSS_NEWS_ENABLED`, `FOREX_FACTORY_ENABLED`,
  `TRUTH_ENABLED`, `TRUTH_ACCOUNT_ID`, `DESK_WATCH_SECONDS`, plus the two AI feed
  switches, which are **separate on purpose**:
  - `NEWS_AI_SUMMARY_ENABLED` — the headline bias/impact/trade-note read.
    **Opt-in: off unless set to exactly `'true'`** (inverted 2026-08, cost). It is
    a batched call every 5 minutes forever, running whether or not anybody is
    signed in and costing the same with one user as with a thousand, and what it
    buys is a bias glyph on Market News plus a note in the Live Wall's news tile.
    Headlines ingest and display perfectly well without it.
  - `CALENDAR_AI_EXPLAINER_ENABLED` — the plain-language calendar explainer. **On
    by default**, and kept on its own switch rather than sharing the one above:
    explanations are keyed by release **title** and reused across every
    recurrence, so the spend converges to nothing after the first few polls.
    Turning it off saves approximately nothing and costs the calendar its
    explanations. Before the split both read `NEWS_AI_SUMMARY_ENABLED`, so
    inverting that default would have silently taken this down with it.
- **FRED (Market Data macro series):** `FRED_API_KEY` — **optional, and the board
  reads live without it** (the keyless chart-download CSV is the fallback).
  Setting it switches to the documented JSON API **and turns on the real
  "Last → next review" release dates**, which have no keyless equivalent; a
  rejected key falls back to keyless rather than blanking the board. **The same
  variable is read by the `public-terminal` service**, whose own server fills the
  demo board — see the demo market feed above. Setting it on `marketing` does
  nothing; nothing there reads one.
- **YouTube (Market News live streams):** `YOUTUBE_API_KEY` (unset = poller off,
  every channel reads offline and live figures are marked sample),
  `YOUTUBE_WATCH_SECONDS` (300), `YOUTUBE_CHANNELS_PER_TICK` (8),
  `YOUTUBE_DAILY_QUOTA` (9000 units — the watch stops for the day at this
  ceiling rather than erroring), `YOUTUBE_USE_SEARCH` (`false`; the 100-unit
  `search.list` fallback, opt-in only). See the Market News section for why the
  cheap detection path matters.
- **Notifications:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
  `PUSHOVER_APP_TOKEN` (one application token for the whole install, created at
  pushover.net/apps/build — unset means the Alert Settings panel says Pushover
  is not set up on the server, and every `sendPushover*` call is a no-op),
  `PUSHOVER_SOUND`, `PUSHOVER_CALLBACK_ORIGIN` (where Pushover POSTs when a
  **repeating** alert is acknowledged on the phone; falls back to `WEB_ORIGIN`,
  and the callback is omitted unless one of them is a public `https://` address
  — the terminal's own Acknowledge button still works either way, which is why
  this is optional rather than required), `SESSION_WATCH_SECONDS` (session-notif
  poll cadence, default 30).
- **Email — two transports, Resend first.** `RESEND_API_KEY` (an HTTPS send API
  on port **443**) is the preferred path and wins when set; `SMTP_*` is the
  fallback, kept for local catchers like MailHog. `MAIL_FROM` is the From header
  for either (falls back to `SMTP_FROM`); with Resend it must be on a domain
  verified in their dashboard. With neither transport configured the code is
  logged instead of sent. **Prefer the HTTPS API on any PaaS:** most block
  outbound SMTP — Railway blocks 25/465/587/2525 on everything below Pro (Aug
  2025) — and a block presents as a **~10s connection timeout, never an auth
  error**, because the provider is never reached. Time-to-fail is the fastest way
  to tell a blocked port from a bad credential: auth rejections return in under a
  second.
- **Email (SMTP fallback):** `SMTP_HOST` (unset = SMTP off), `SMTP_PORT` (587),
  `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (`false`), `SMTP_FROM`. Currently used
  only for the Employee Portal's sign-in codes; with `SMTP_HOST` unset the code
  is logged instead of sent, so a misconfigured deploy cannot lock everyone out.
  Every `SMTP_*` var treats a **blank value as unset** (`blankAsUnset` in
  `config.ts`) — a hosting dashboard hands you an empty string the moment
  somebody adds a variable and tabs away, and Zod's `.default()` only fires on a
  *missing* var, so a blank would otherwise beat the default: a blank
  `SMTP_FROM` sent every code with an empty From (rejected by every mail
  server), and a blank `SMTP_PORT` failed validation and **crashed the API at
  boot**. `SMTP_PORT`/`SMTP_SECURE` also `.catch()` a junk value rather than
  refusing to start.
  **Host note:** many PaaS block outbound SMTP — Railway blocks ports
  25/465/587/2525 on Free/Trial/Hobby, Pro and above only. A block shows up as a
  ~10s `ETIMEDOUT`/`Greeting never received`, never as an auth error, so time-to-
  fail is the fastest way to tell a network block from a bad credential. If SMTP
  is unavailable, move to an HTTPS email API (port 443) rather than fighting it.
- **Employee Portal:** `EMPLOYEE_SESSION_HOURS` (8), `EMPLOYEE_IDLE_MINUTES` (30),
  `EMPLOYEE_REQUIRE_2FA` (`true`), `EMPLOYEE_OTP_TTL_MINUTES` (10),
  `EMPLOYEE_REMEMBER_DEVICE_DAYS` (30), `EMPLOYEE_EMAIL_DOMAIN`
  (`vitalistradingsystems.com`), `EMPLOYEE_IP_ALLOWLIST` (unset = no network
  fence; **fails closed** when set, so a wrong value locks you out of `/employee`
  — the main terminal is unaffected). Every default is the strict value.
- **Marketing site (its own Railway service):** `SITE_CONTENT_ORIGIN` — the
  private portal's origin (`https://portal.vitalistradingsystems.com`), read by
  `apps/marketing/server.mjs` for the published landing-page document and its
  files. **Unset, the site serves the hand-written page exactly as before.**
  `SITE_CONTENT_POLL_SECONDS` (15). Not in `config.ts` — that is the private
  API's schema, and this service must carry none of it.
- **First-boot admin seed** (read directly via `process.env`, not in the schema):
  `ADMIN_USERNAME` (default `andrew`), `ADMIN_DISPLAY_NAME`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD` (blank = random, printed once to logs), `APP_EMAIL_DOMAIN`.

`.env.example` is the fullest list, but note it and `config.ts` have drifted —
some documented vars aren't in the schema and vice-versa.

## Reporting back to the owner

The owner drives this terminal through Claude Code but is **not a developer** and
does not read the code. A long technical write-up is not thoroughness here — it
is unreadable, and it forces a judgment call the owner has no way to make. So:

- **One short paragraph when a job is done.** Not a section-by-section account,
  not a file-by-file diff summary, not a bulleted list of every step taken.
- **Say what changed and what it means for using the terminal**, in plain
  language. Skip file paths, function names, commit SHAs, PR numbers and
  implementation detail unless the owner asks for them.
- **Do surface the things only the owner can decide or must know:** a failure, a
  real risk, something deliberately left out, or a genuine choice needing an
  answer. Brevity never means hiding a problem — lead with it and keep it plain.
- **Exercise judgment rather than handing it over.** Don't list options and ask
  which to take when one is clearly right; make the call, say so in a sentence,
  and move on. Ask only when the answer is genuinely the owner's (what to build,
  whether to deploy).
- Same voice as the rest of the terminal: plain and terminal-style, no filler.

**This applies to everything an agent writes, not just the closing report.**
A Developer Blog post, a patch note, a commit body, a reply in the terminal — all
of it is **brief: a few sentences where a few sentences will do.** Say what
changed and what it means. Do not explain the implementation, restate the request
back, list the files touched, or write a summary of a summary. Length is not
evidence of care here; it is the thing that makes the writing unreadable.

**BREVITY IS A HARD RULE, NOT A STYLE PREFERENCE** (owner instruction,
2026-09 — "often Claude is overly verbose and I want to reduce that in
general"). It applies to every reply, report, document, patch note, blog post
and commit body an agent produces for this repo. Concrete limits, because
"be concise" has been said before and did not hold:

- **A closing report is one paragraph, under about 120 words.** Lead with the
  outcome. If something failed or needs a decision, that is the first sentence.
- **A deliverable document (a brief, a catalogue, a plan) says each thing
  once, in one to three sentences per item.** No introduction explaining what
  the document is about to say, no closing summary restating it.
- **No headers in anything under about 500 words.** No bullet that runs to a
  paragraph. No restating the request back. No listing files touched.
- **When in doubt, cut.** A reader who wants more will ask; a reader handed
  too much stops reading, and then the one important sentence is lost.

The one exception is THIS FILE: an AGENTS.md entry may be as long as it takes
to stop a mistake being repeated, because it is read by agents rather than by
the owner.

## Never write tips, tricks, or how-to-use-this copy in the UI

Owner instruction, 2026-08. The terminal had accumulated explanatory captions all
over it — "Use the arrows to move a workspace up or down", "Tip: while previewing
the sidebar updates to match that role", "Click a slide to select it, then add a
screenshot". They restate what the control in front of the user plainly does, and
together they are clutter. **Stop adding them.**

The test is not "is this sentence true" or "could this help someone" — almost any
such sentence passes both. It is: **does this carry something the control cannot
say itself?**

- **Keep** what genuinely cannot be discovered from the screen: where to find a
  Pushover user key, the column names a CSV import expects, which brokers the
  desk can reach, that a key is encrypted server-side, that a figure is a sample.
- **Do not write** instructions for a visible control, a walkthrough of a flow
  the user is already in, a restatement of a button's label, or a "you can also…"
  aside.
- An **empty state** naming the action available ("No sessions yet. Add one.") is
  not a tip — it is the screen's only content, and it stays.
- A **disclaimer** required for legal reasons ("informational only, not
  investment advice") is not a tip either. Those stay wherever they already are.

The How-to guides in Site Help are where a walkthrough belongs, if one is wanted
at all. Nowhere else.

## Conventions

- **Every deploy:** bump `APP_VERSION` and prepend a `PATCH_NOTES` entry in
  `apps/web/src/meta/version.ts` (e.g. `Beta V 3.1` → `Beta V 3.2`). `APP_VERSION`
  drives the top-bar version pill. Patch notes are **now DB-backed** (admins draft
  & publish from Admin ▸ Patch Notes); the web merges DB-published notes (newest)
  with the `version.ts` array as the historical archive, so keep prepending there
  for the record.
- **Editable copy:** `howto.<screen>` and `ai.<id>` keys live in `app_settings`;
  prefer editing via **Admin ▸ Site Wording / AI Instructions** over hardcoding
  where a key already exists. (This is the "How-to" walkthrough text and the AI
  system prompts specifically — see below, this is the only remaining
  DB-backed wording.)
- **Coded copy is hardcoded — no in-app text editor.** Every other site-coded
  string (screen titles, subtitles, blurbs, button labels, empty/loading/error
  states, static captions, on both the main terminal and the Employee Portal) is
  a plain string literal in its `.tsx` file. There used to be a floating-icon
  mechanism (`<EditableText>` / the employee portal's `<T>`) that let a founder
  rewrite any of this live from the browser, backed by `copy.<id>` overrides in
  `app_settings`; **it has been removed** (owner decision — all wording changes
  now go through code). To reword anything, edit the source and deploy. Do not
  reintroduce a live text-editing affordance, a `copy.<id>`-style override
  store, or a floating edit icon for coded strings — that mechanism is
  deliberately gone. Never wrap user/team-created data (deck/team/user names,
  tickers, message bodies) or live figures (prices, P&L, counts, dates/times) in
  anything that resembles that old mechanism either — those were never eligible
  for it and still aren't.
- Keep the plain, terminal-style voice in UI copy and AI prompts.
- **Naming the product — always "Terminal", never "portal":** the app is **VTS
  Terminal**, and its workspaces are **My Terminal**, **Admin Terminal** and
  **Developer Terminal** (owner decision, 2026-08 — it was "portal" throughout
  until then). Anything a user reads — labels, blurbs, legal documents, push
  titles, the PWA manifest, AI prompts, study-game content — says terminal.
  **Three exemptions, all deliberate:**
  - **The Employee Portal keeps its name.** It is a separate site with its own
    sign-in and its own design language, and reading as a different tool is the
    point. So do its own HR admins ("portal admins") and its files/tables.
  - **Internal identifiers stay `portal`** — the `myportal` workspace key, the
    `/api/my-portal` routes, `MyPortalData`, `Portal.tsx`, `MyPortalSettings.tsx`,
    `workspaces/myportal/`. The workspace key is what `DEFAULT_SCREEN`, the
    routing switch and every in-app link are keyed on — the same reason `desk`
    stayed `desk` when Trade Desk became Trade History. Rename the label, never
    the key.
  - **React's `createPortal`** is a DOM concept, not the product.
  Two things carry the old name in stored data and are repaired on boot rather
  than in code: the seeded welcome announcement (`chat/announcements.ts`) and the
  built-in study game "VTS Portal 101" (`RENAMED_GAMES` in `studies/bakedGames.ts`,
  which renames the deck in place so progress survives). Patch notes published
  before the rename still say "portal" — they are a dated record and were left as
  written.
- **Naming the AI — always "VTS AI":** in all user-facing copy (labels, blurbs,
  buttons, empty/loading states, prompts the user reads), refer to the terminal's
  AI as **"VTS AI"** (with the space), never "Claude", "Anthropic", or a raw
  model name. The visible UI already follows this ("Ask VTS AI", "Powered by VTS
  AI"). **Exempt:** internal code identifiers (`AskClaudePanel`, `onOpenClaude`,
  the `openClaude` prop, etc.) and the actual server-side Anthropic model IDs in
  `config.ts`/`claude.ts` — those stay as-is; this rule is about what users see.

## Known stale / legacy (don't trust these)

- `README.md` — Stage 1 era, wrong workspaces/roles.
- `workspaces/Screens.tsx` + `help/tutorials.ts` — "Stage 1–4" placeholder
  scaffolding; most real screens bypass it.
- `themes.ts` `TABS`/`TabDef` — superseded by `theme/nav.ts`.
- `tokens.ts` `info` comment ("LLC workspace accent") and `nav.ts`/`access.ts`
  "wealth/finance deep link" fallbacks — reference removed workspaces.

### Server surface no screen reaches (audited 2026-08-02)

About 35 endpoints are live and registered with **no caller anywhere in the
web app**, each with a matching dead wrapper in `api/client.ts`. They compile,
they ship, and they read exactly like working features — which is the danger:
**a method existing in `client.ts` is not evidence a feature works.** Check for
a caller before believing one. (That cuts both ways —
`updateMarketNewsChannel` sat in this same list until Beta V 6.28, and the
right answer there was to *build the missing UI*, not to delete it.)

Three groups, and they want different treatment:

- **Superseded (~21 endpoints, `/api/studies/{learned,game,leaderboard,tests,vocab,starred,sections}`).**
  The pre-team-decks Studies implementation. The giveaway is the near-miss
  naming: the live screens call `saveStudyDeckGame` / `archiveStudyDeckGame`,
  while `saveStudyGame` / `archiveStudyGame` are the old ones. **Do not wire
  these back** — team-built decks (`studyEngine.ts`, `gameStats.ts`) are the
  model now, and reviving a second one is how a leaderboard ends up with two
  disagreeing sources.
- **Removed on purpose (~9 endpoints).** The manual news/calendar CRUD
  (`/api/trading/news`, `/api/trading/calendar` writes) dropped in the Market
  News rebuild, plus `/api/trading/feed/brief` and `/api/trading/truth` — the
  AI overview brief and the Truth Social tab, which that section already says
  are **not to be reintroduced**. The GET on `/api/trading/news` is still very
  much live; it is the shared feed. Only the writes are orphaned.
- **Built but never wired (4 endpoints).** `GET /api/investments/transactions`
  (the screens read transactions off the portfolio payload instead), and the
  To Do trio `POST /api/todo/sections`, `POST /api/todo/items/:id/state` and
  **`POST /api/todo/command`** — the natural-language command bar in
  `todo/command.ts`. That last one is a complete AI feature, metered against
  the AI cap, with **no UI at all**; the AI section above lists it as a place
  the response style is applied, which overstates it. `TradingTodo.tsx` adds
  items to the first trading-tagged section and does nothing else.

Deleting any of it is a real cleanup and an owner decision, not a tidy-up to
slip into an unrelated change — the routes are registered, so removing them is
a behaviour change for anything calling the API directly.

## News feeds can have SEVERAL candidate URLs

`RssFeed.url` in `trading/feeds.ts` accepts a string **or a list**, tried in
order until one answers with usable items. A publisher's RSS endpoint is not a
stable thing — outlets retire, move and rename feeds without notice — and the
failure mode is silent: the poll logs a 404 nobody reads and the screen stays
empty, which looks like "no news today" rather than "this source is gone".

- A **200 with no parseable items counts as a miss**, not a hit. Several retired
  feeds still serve a valid-looking shell, so stopping at the first 200 would
  mean never reaching the address that actually works.
- A source that produces nothing logs **one line naming every address tried**, so
  a dead feed is diagnosable from the logs.
- **Candidates must be the same publisher's same coverage** — alternate addresses,
  not a fallback to a different outlet. A reader told a headline came from
  Reuters has to be right about that.
- The World/Politics URLs were written in an environment with **no outbound
  network** (every address failed identically, including ones already working in
  production), so they are unverified. Reuters retired its long-standing
  `feeds.reuters.com` endpoints and AP publishes no official public RSS, which is
  why each topic carries more than one source as well as more than one URL.

## Verifying changes

**`npm run verify` runs all of it, and is the only command you need.** It
typechecks, runs every check below, and builds — in that order, cheapest first,
so a failure surfaces fast. It generates its own throwaway `CREDENTIALS_KEY` and
`SESSION_SECRET`, so there is nothing to set up and nothing to remember.

**GitHub Actions runs the same command on every pull request**
(`.github/workflows/verify.yml`). That is what makes it impossible for a branch
to reach `main` having had fewer checks than the session running it happened to
remember — several sessions are usually in flight at once, and the checks used
to be a list in this file that each of them was trusted to work through. Do not
add a check to your own routine without adding it to `scripts/verify.mjs`, where
every session and CI will pick it up.

**Those scripts are Node, not bash, and that is deliberate — the repo is worked
on from Windows as well as Linux.** Both failed on Windows as shell scripts, for
two reasons that are invisible on Linux: npm on Windows runs scripts through
`cmd.exe`, where `bash` may not be on `PATH` at all, and `mktemp -d` under Git
Bash returns a POSIX path (`/tmp/tmp.AbC`) that Node cannot then resolve. The
scratch databases live in a gitignored `.tmp-verify/` at the repo root, and their
`DATABASE_URL` is built with `pathToFileURL` on an **absolute** path — a
repo-relative one is resolved by whichever process opens it, and these checks
reach the database through `npm --workspace @vts/api`, whose cwd is `apps/api`,
so a relative URL looks one directory too deep and fails to connect. Keep any
new tooling here in Node for the same reason.

The individual commands still exist and are worth knowing, because when `verify`
fails it fails at one of them and that one is the fastest thing to re-run:

- Typecheck: `npm run typecheck` (root; api + web). Single workspace:
  `npm --workspace @vts/api run typecheck` / `@vts/web`.
- **Migrations: `npm run verify:migrations`.** A migration is *not* verified by
  `db:migrate` printing "Migrations applied." Three things silently stop one from
  running, and all three have bitten this repo:
  - it must be registered in `migrations/meta/_journal.json` — adding the `.sql`
    file is not enough, drizzle iterates the journal and never reads the folder;
  - its statements must be separated by the statement-breakpoint marker, or the
    whole file is handed over as one statement and **only the first is applied**;
  - that marker must sit on **its own line** (or straight after a `;`). It is
    matched as plain text anywhere in the file, so merely *mentioning* it in a
    comment splits the migration at that sentence and hands the driver a broken
    half-statement — which surfaces as an unhelpful `SQLITE_OK: not an error`.

  `verify:migrations` checks all three and is the thing to run after adding one.
  Migrations already applied to production with the breakpoint fault are listed
  in `APPLIED_WITH_KNOWN_FAULT` in `db/verifyMigrations.ts`, each naming the later
  migration that repaired it; **never add a new file to that list** — a new one
  can just be written correctly.

  **Never repair an applied migration by editing it.** Drizzle records a
  migration as done by its journal timestamp, so an edit changes nothing on any
  database that has already seen it. Write a new migration (see `0088`).

  It is still worth applying a new one to a scratch database and listing what
  actually exists: `DATABASE_URL="file:/tmp/x.db" npm run db:migrate`.
- Build: `npm run build` (api `tsc` + web `vite build`). The web build emits
  **two** HTML entries — `dist/index.html` and `dist/employee.html`; if the
  latter is missing, `/employee` serves a plain "not built" 404.
- **Study category draw + breakdown: `npm run verify:study-categories`** after
  touching `deckDraw.ts` or `CategoryBreakdown.tsx`. Both are things a running
  app cannot show you: the draw is a proportion that only appears over hundreds
  of questions, and the breakdown's arithmetic is right or wrong in ways a
  screenshot cannot tell you.
- **Trade movement: `npm run verify:movement`** after touching `pips.ts`,
  `tradeBreakdown.tsx` or `tradeStats.ts`. See the rule below — the fault it
  pins is invisible on a forex-only desk, which is the owner's own.
- **Protective-order triggers: `npm run verify:protection`** after touching
  either `protection.ts`. It is the only check that imports the web copy AND the
  server copy and runs both through the same fixtures, so it is what stops those
  two mirrors drifting — and drift there is silent in the worst direction: the
  ticket would accept a level the desk refuses, or refuse one it would take.
  What it pins is the rule that a stop is watched against the OPPOSITE side of
  the book from the one the trade filled at, which is what made a level typed at
  the price on the screen pass validation and fire on arrival. Every fixture in
  it was proved load-bearing by breaking the server mirror alone and watching
  36 checks fail.
- **Position sizing: `npm run verify:sizing`** after touching either
  `sizing.ts`. It is the only check that imports the web copy AND the server
  copy and runs both through the same fixtures, so it is what stops the two
  mirrors drifting — and drift there is silent: the ticket would show one size
  and a Founder join would place another. It also pins the Account % arithmetic
  against figures read off a live ticket, and the floor-rounding rule across
  every percentage from 1 to 100.
- **Credential encryption: `npm run verify:secretbox`** after touching
  `security/secretbox.ts` or `security/credentialsKey.ts`. Everything it checks
  fails *silently* in production: a ciphertext not bound to its row still
  decrypts, an unpinned tag length still verifies, a passphrase still encrypts.
  Nothing about the running terminal looks wrong — the guarantee is simply gone.
- **Environment checks: `npm run verify:config`** after touching `config.ts` or
  `configChecks.ts`. What it pins is not "does a bad environment get rejected" —
  the old inline code did that. It is that **every** problem is reported in one
  pass. See the boot guard below for why that is the property worth a check.

Run `npm install` first in a fresh container.

**Desk data health:** `npm run db:verify-positions` (root or `@vts/api`) is a
read-only check over `trading_positions` — it flags rows still on the legacy
un-namespaced key, any broker trade stored more than once, any OANDA account
connected more than once, and closed rows with no exit price, then prints
per-trader closed-trade counts and realized P/L to diff against the broker's own
export. **A duplicate is grouped on the TRADE's identity** — owner, trade id,
instrument, side, entry price, open time — **not on the connection it arrived
through**: keyed on the connection, this check could not see a trade duplicated
across two connections to one account, which is exactly the fault it exists to
catch, so the doubled July trades read as clean until somebody noticed the
metrics by eye. Defaults to the current
**ET** month; narrow it with `-- --from=2026-07-01 --to=2026-08-01` (`to` is
exclusive). Exits non-zero when it finds a structural problem. Run it against
prod after any change to the reconcile/backfill writers.

**Study sharing:** `npm run db:check-sharing` walks the whole Study Package
sharing, library and leaderboard contract through the real services. Unlike
every other check here it **writes** — four accounts and a package — so it
refuses to run against any database that already holds a user, which makes an
empty scratch file the only thing it can be pointed at:

    DATABASE_URL="file:/tmp/x.db" npm run db:migrate
    DATABASE_URL="file:/tmp/x.db" npm run db:check-sharing

Run it after touching `packageAccess.ts`, `packageSharing.ts`,
`packageLibrary.ts` or the leaderboard.

**Finishing a package:** `npm run db:check-package-add` walks `addToPackage`
through the real service the same way, and exists for one invariant above all —
**a category the package already has keeps its row and its id** when content is
added against it. That id is what every learner's per-category history hangs off
and what the stored weights are attached to, so a version that mints a fresh row
for the same name passes a typecheck and silently resets both. It also covers
the refusals (a part that is already there, a package that is not) and that the
existing parts are left alone. Same writing guard, same scratch-file rule:

    DATABASE_URL="file:/tmp/x.db" npm run db:migrate
    DATABASE_URL="file:/tmp/x.db" npm run db:check-package-add

**Capital:** `npm run db:check-capital` walks the per-account capital rows
through the real service, and exists for one invariant above all — **typing over
one account's figure must leave every other account exactly as it was, sync
included**, which is what lets a trader hold their own deposit by hand while a
partner's account beside it keeps syncing. It also covers the boot carry-over
that splits the old single figure across the accounts it was summing. Same
writing guard, same scratch-file rule:

    DATABASE_URL="file:/tmp/x.db" npm run db:migrate
    DATABASE_URL="file:/tmp/x.db" npm run db:check-capital

**Trading Notes:** `npm run db:check-notes` walks the notes services through a
scratch database, and exists for the three rules that make the feature a record
rather than a diary — a published call is frozen (and un-sharing does not
unlock it), nobody sees a call before its window opens, and a call that could
not be settled is never scored as wrong. It also pins the Eastern week boundary
(00:30 UTC Monday is still the previous trading week) and `gradeCall`'s edge
cases, including that an unchanged price is a MISS on an "up" call. Same writing
guard, same scratch-file rule:

    DATABASE_URL="file:/tmp/x.db" npm run db:migrate
    DATABASE_URL="file:/tmp/x.db" npm run db:check-notes

**Rollover close and re-entry:** `npm run db:check-rollover` covers the storage
half of both — above all that **a partial save of the rollover plan leaves the
other events alone**, which is the one failure here that is completely silent
(nothing errors, an alert just stops arriving), plus that an unusable time is
never stored, that the recheck gate counts an Eastern day, and that an unpriced
re-entry check reports no total rather than a flattering one. Same writing
guard, same scratch-file rule:

    DATABASE_URL="file:/tmp/x.db" npm run db:migrate
    DATABASE_URL="file:/tmp/x.db" npm run db:check-rollover

**Founder trades:** `npm run db:check-founder-trades` walks the whole state
machine through the real services, and exists for the rules that make it a
workflow rather than a sequence of pop-ups: **a second JOIN cannot reach the
broker**, **the recipient's size is never the inviter's** (an unset one is
refused rather than defaulted), and — on the level-move half — **a move is never
aimed at a guessed position**, **a removal and an unchanged level raise
nothing**, and **the two switches on a link are independent, with both off
removing it**. It also pins the two-party read boundary, the reminder pacing,
that answering now finishes the workflow, and that a pairing is one row however
it is stated. Same writing guard, same scratch-file rule:

    DATABASE_URL="file:/tmp/x.db" npm run db:migrate
    DATABASE_URL="file:/tmp/x.db" npm run db:check-founder-trades

All six are in `verify:db`, so `npm run verify` and CI run them without being
asked.

**Rollover / re-entry math:** `npm run verify:rollover` checks the two pure
halves offline — the firing decision (`rolloverMath.ts`) and the re-entry
arithmetic (`reentryMath.ts`) — because neither can be checked by running the
app: the watch acts on one ET minute a day and only when a funded position
happens to be open, and the re-entry figures need a live two-sided quote. It
pins the reconciliation identity (drift + spread === the distance from the exit
fill to the re-entry fill) that the same-side measurement exists to produce.
Run it after touching either file, or `etTime.ts`.

## Deployment workflow (owner preference)

This is a **private web terminal** for a single owner, but work is often split
across **several Claude Code sessions running at once**, each on its own
branch. Whether a finished branch should go live — and in what order relative
to the other branches in flight — is the owner's call, not the session's.
Because of that:

- **Never deploy without being asked.** When work on a feature branch is
  complete and verified, **stop there**: commit, push the branch, and report
  what's ready. Do **not** open a PR and do **not** merge to `main` unless the
  owner asks for it in that session. Merging to `main` is the deploy — Railway
  auto-redeploys `main` per `railway.json` — so a merge is a production
  release, not a housekeeping step.
- **Deploy through a pull request, always** (owner instruction, 2026-07). When
  the owner asks to deploy: bring the branch up to date and verify (below), push
  it, **open a PR**, then **squash-merge that PR** — do not push to `main`
  directly and do not squash-merge locally. Same code on `main` and the same
  Railway deploy either way; what the PR adds is the record. Each release gets a
  numbered, searchable page describing what changed (which is why `main`'s
  history reads "(#295)"), CI runs against the proposal rather than against
  production, and the agent's own session list can show the work as merged — a
  local squash leaves the branch commits off `main` entirely, so nothing can
  tell the session ever shipped. The PR is opened **only when the owner asks to
  deploy**; a finished-but-unapproved branch still stops at "pushed".
- **Ask before deploying.** End the task by saying the branch is ready and
  asking whether to deploy it, rather than deploying and reporting after the
  fact.
- **When the owner does ask to deploy**, first bring the branch up to date:
  `git fetch origin main`, merge `origin/main` into the branch, resolve any
  conflicts, then re-run verification. A branch that was verified before other
  work landed on `main` has not been verified against what it is merging into.
  Expect a conflict in `apps/web/src/meta/version.ts` whenever another branch
  has deployed since — keep both patch-note entries and take the higher
  `APP_VERSION`.
- **Always verify before merging:** run the web `typecheck` and `build` (and
  any relevant API checks) and only merge when they pass.
- If a build or verification step **fails**, do not merge — report the failure
  instead. Railway keeps the previous version live on a failed build.
- **WAIT FOR CI TO GO GREEN ON THE PR BEFORE MERGING** (owner instruction,
  2026-08). Not "open it and merge" — open it, watch the checks, and squash-merge
  only once they pass. This is the whole reason the PR exists: a local `npm run
  verify` and CI are not the same evidence, because CI has outbound network and
  this sandbox does not, and several branches are in flight at once so the
  merge base is not what was verified. Merging without waiting turns the PR into
  paperwork — the safety property it was opened for is never collected. Read the
  run rather than assuming it: `mcp__github__pull_request_read` with
  `method: 'get_status'`, or `actions_list` on the branch.
- **Squash-merge the PR** (see Deploy mechanics below).

## WHERE THE PRIVATE TERMINAL ACTUALLY RUNS

**The live private portal is the Railway service `vts-private-staging`, in the
VTS Terminal project's `staging` ENVIRONMENT.** It serves
`portal.vitalistradingsystems.com`, holds the volume `vts-private-staging-data`,
and is the box every partner signs in to. Established 2026-08-31, by reading
Settings ▸ Networking on it.

**`@vts/api`, in that same project's `production` environment, is NOT it.** It
answers on `vtsapi-production.up.railway.app`, and its database is the empty
one the split left behind. It looks like the private portal from every angle
that matters — same repo, same branch, same build, `Online`, 32
production-looking variables, and it is the service the project canvas opens
on. (On 2026-08-31 the apex was attached to it too; that is no longer where the
apex lives — see below.)

**THE PUBLIC SITES ARE A DIFFERENT PROJECT: `vts-public-and-demo`, `staging`
environment** (established 2026-09-02, from the project canvas and from
`vitalistradingsystems.com/healthz` answering with the marketing server's own
JSON). Two services, both deploying from `main` of this repo:

| service | serves | config |
| --- | --- | --- |
| `marketing` | `vitalistradingsystems.com` — the landing page | `deploy/railway/marketing.json`; variables `PUBLIC_APP_ORIGIN`, `SITE_CONTENT_ORIGIN` |
| `public-terminal` | `app.vitalistradingsystems.com` — the demo and public accounts | `deploy/railway/public-terminal.json`; variable `FRED_API_KEY` (optional — keys the demo market feed) |

**So a variable for the landing page goes on `marketing` in
`vts-public-and-demo`**, and `SITE_CONTENT_ORIGIN` (the Site Editor's link to
the portal) is set there, not anywhere in the VTS Terminal project. A session
that reads the paragraph above and sends the owner to `@vts/api` for it sends
them to a service that has nothing to do with the page.

**SO: EVERY ENVIRONMENT VARIABLE FOR THE PRIVATE TERMINAL GOES ON
`vts-private-staging`, IN `staging`.** A Railway environment has its own
services and its own variables; setting one in `production` changes nothing any
user sees. **Never tell the owner to edit a variable without naming the service
AND the environment.**

That is not a hypothetical. On 2026-08-31 it cost an evening on one setting:

- `PUSHOVER_APP_TOKEN` was set on `@vts/api`, so the terminal went on reporting
  "Pushover isn't set up on the server yet" with a perfectly good token sitting
  in Railway.
- `PRIVATE_MAINTENANCE=true` closed the **apex**, not the portal, which is why
  the owner kept using the terminal right through what was supposed to be a
  closed site — and why partners were never actually shown the notice.
- `PRIVATE_ACCESS_USER_IDS` was edited there too, so the allowlist being tuned
  was not the one gating anybody's sign-in.

**Two dashboard facts that make this easy to get wrong, and both fooled a
session that had every screenshot it asked for:**

- **A Railway service card prints ONE domain.** `@vts/api`'s card reads
  `vitalistradingsystems.com`, and that says nothing about what else is attached
  — or, here, about the host that is not. The full list is **Settings ▸
  Networking**. Read it before concluding anything about which service serves a
  host.
- **The environment dropdown hides an entire second canvas.** The project card
  said "1/1 service online", which is true of `production` and says nothing
  about `staging`. A project is not one canvas.

**Never infer which service serves a host from a project name.**
`docs/handoff/RAILWAY_RESTORE_DATA.md` guessed from Railway's auto-generated
naming that `extraordinary-vitality` or `daring-appreciation` held the data;
both were Discord bots, and both have since been deleted while the portal kept
running. A later session repeated that guess as if it were established and sent
the owner through three projects for nothing. **The authority is Settings ▸
Networking on the service, or the DNS record for the host — nothing else.**

Consequence worth stating: the terminal everyone depends on runs on a service
named `-staging` in an environment named `staging`. That is a naming hazard, not
a technical one, but it is exactly the sort of thing that gets "cleaned up" by
somebody tidying environments. **Do not rename, prune or migrate it casually**;
if it is ever moved, update this section in the same change.

## Deploy mechanics

- Railway builds and deploys whatever is on `main` (`npm install && npm run
  build`, then `npm run start`, health-checked at `/api/health`). There is no
  manual deploy button or Railway CLI in this environment — merging to `main`
  is the only deploy trigger.
- **Squash merges only**, and always through a PR (see above), so `main` keeps
  one commit per release and every release has a PR page behind it.
- **CI runs on the PULL REQUEST and on `main`, never on a working branch push**
  (owner instruction, 2026-08). Both workflows — `verify.yml` and
  `public-terminal-visual.yml` — carry the same `on:` block for that reason.
  A session pushes a branch several times before it is ready, and every one of
  those pushes was firing both suites (two builds, a browser download, a live
  Postgres stack) against work nobody had asked to deploy, which is what took
  the account to 90% of its free Actions minutes. **Do not add a branch-push
  trigger back**, and do not add a new workflow with one — the run that matters
  is the one on the proposal, which is the run the rule above says to wait for.

### A failed BUILD is harmless. A failed START is an outage.

Worth stating plainly, because it has already cost one: Railway keeps the
previous version live when a **build** fails — nothing is swapped, the site is
untouched. But a build that **succeeds** and then exits at startup is different:
the healthy container is replaced by a dead one and the service returns 502
until somebody notices. `config.ts` exits on a missing variable, so a deploy
that forgets one is exactly that case.

**`apps/api/src/configChecks.ts` is the whole environment guard, and its rule is
COLLECT, NEVER EXIT.** Nothing in it exits, throws on a bad environment, opens a
connection or reads the database — it answers "would this environment boot, and
what would it complain about?" and hands back every answer at once. `config.ts`
prints the list and exits **once**; `preflight.ts` prints the same list and
exits with a status. One module, so the two cannot drift.

That matters more than it looks. The checks used to sit inline in `config.ts` as
four sequential `process.exit(1)` calls, so an operator repairing production
discovered the faults one at a time — set a variable, redeploy, hit the next —
and each discovery was another outage. A single-fault environment behaves
identically either way, which is why this needs `verify:config` rather than a
passing boot to protect it.

### MAINTENANCE MODE — the terminal, deliberately closed

`PRIVATE_MAINTENANCE=true` (`apps/api/src/maintenance.ts`) takes the private
portal off the air and serves a plain notice instead. Unset — or any other value
— and nothing changes.

**IT EXISTS BECAUSE THE ALTERNATIVE IS A LIE.** An account that cannot sign in
is told "Invalid email or password", because that answer is deliberately generic
and cannot distinguish a wrong password from a closed door. Somebody locked out
for an afternoon should not spend it wondering whether they have forgotten their
own password.

- **AN ENVIRONMENT VARIABLE, NOT A DEPLOY.** You turn this on while something is
  already wrong, and a code change means a build, a deploy and a rollback to
  undo. One variable and a restart, in both directions, and it cannot be left
  behind in the source tree.
- **`/api/health` IS EXEMPT, AND THAT IS THE RULE THIS FEATURE DIES WITHOUT.**
  Railway health-checks that path and rolls back a deploy that fails it — so a
  maintenance mode which blocked it would refuse to deploy at the one moment it
  is needed. Matched on the exact path, not a prefix: `startsWith('/api/health')`
  would quietly leave a whole family of routes serving.
- **IT ALSO STOPS THE WATCHES**, in `server.ts`, and that is the same switch
  because it is the same decision: a terminal nobody can open must not still be
  buzzing phones about trades, sessions and price levels. **This is how you stop
  the notifications without deleting a row or disconnecting a broker** — the
  alternative people reach for is destroying data, which is irreversible and
  does not even achieve it faster.
- **503 with `Retry-After` and `no-store`, never 200.** The condition is
  temporary; a 200 lets a crawler record the notice as the site's content, and a
  cacheable one outlives the maintenance.
- **The notice references no asset.** It is one self-contained document, so it
  renders correctly even if nothing else on the deployment does — which is the
  one moment it has to look deliberate.
- **Only the exact string `true` closes it** (trimmed, case-insensitive). A
  variable set to `1` or `yes` by somebody guessing the format must not take the
  terminal down, and neither must one left behind reading `false`.
- **It deletes nothing, disconnects nothing and revokes nothing.** Turn it off
  and everything is exactly as it was.
- **It carries a button to the PUBLIC DEMO** (`PUBLIC_TERMINAL_URL`, defaulting
  to the same demo URL the marketing site links). The apex is the primary
  domain, so the people who land on the notice are not only the three who can
  sign in. The caption says outright that it is a separate site with sample data
  and **not your account** — "demo" on a page about *your* terminal otherwise
  reads as your terminal in a limited mode, which it is not. The URL is an
  environment read rather than a trusted input, so it is refused unless it is
  http(s) and is HTML-escaped before it reaches the href: this is the one page
  served to everybody, signed in or not.

- **THE SERVED PAGE CANNOT REACH THE PEOPLE IT WAS WRITTEN FOR, SO THE CLIENT
  DRAWS ITS OWN** (`apps/web/src/lib/maintenance.ts` + `pages/Maintenance.tsx`).
  The terminal is an installed PWA with a precached shell: a returning partner
  is served `index.html` out of their own device and the notice above is never
  requested at all. They got the ordinary sign-in screen and, on submitting it,
  a generic failure — which is exactly the afternoon of "have I forgotten my own
  password?" the whole feature exists to prevent. **It only appeared in a
  private window**, where there is no worker. Reported by the owner, 2026-08.
  - **What still reaches a cached client is every API call** (`/api` is
    deliberately never cached), so that is what carries it. `request()` reports
    the outcome of **every** response to the store, and `App` draws the card
    ahead of every other branch.
  - **THE WORDING AND THE LINK ARE SENT, NOT MIRRORED.** The 503 body carries
    `title`, `message`, `demoUrl` and `demoNote`, so the served page and the
    in-app card cannot drift into saying different things. The constants in the
    web module are only the fallback for a client cached from before the server
    sent them, and the URL gets the same http(s) guard on both sides.
  - **ANY ANSWER FROM THE SERVER REOPENS IT, NOT ONLY A SUCCESSFUL ONE.** The
    card replaces every other screen, so nothing else is left running to notice
    the terminal reopening — it polls `me`, which answers **401** for a
    signed-out session, and reading that as "still closed" would leave somebody
    trapped on the card for good. It polls `me` rather than the health check for
    the same reason: health is exempt from the gate, so it answers 200
    throughout and could never say the terminal had come back.
  - **Only a 503 that names itself `maintenance` closes the app.** A platform
    503 during a deploy is not the terminal saying it is closed.
- **THE APP SHELL'S OWN FILES KEEP SERVING, AND THAT IS NOT A CONVENIENCE** —
  it is what stops maintenance mode freezing every installed device. A worker
  updates by re-fetching itself and everything in its precache list; gate those
  and a phone is stuck on whatever build it had when the terminal closed, for as
  long as it stays closed, which is precisely the case this is for. So
  `maintenanceExempt` also passes `/index.html`, `/sw.js`, `/registerSW.js`,
  `/push-sw.js`, the manifest, `/assets/*`, `workbox-*.js` and the root icons
  and fonts. **A navigation is still closed** (`/` answers with the notice, so a
  fresh browser gets it on the first request), **nothing under `/api` rides the
  asset rule**, and **never the employee portal** — page or chunk — which is
  network-only and hardened and must not be left standing by a closed terminal.
  What is served is public JavaScript, CSS and icons that carry no data and
  reach none: every request the shell makes is an `/api` one, and those are all
  refused.

`npm run verify:maintenance` checks all of it — both halves, the server's and
the client's — and is in `verify` because these failures are only visible once
the mode is needed: one of them (blocking the health check) makes the very
deploy that enables it roll back, and another leaves a phone stuck on a card
that will not clear. Every rule above was proved load-bearing by breaking it.

**An allowlist entry may be an account ID, a username, or an email**
(`auth/privateAccess.ts`, checked by `npm run verify:private-access`). It matched
on ID alone, and **an ID belongs to one database** — so a deployment pointed at a
different one (a restore, a migration, the service rebuilt during the
public/private split) holds the same person under a different ID, the allowlist
silently stops admitting them, and the terminal refuses the only person who
should be let in. The 401 is deliberately generic, so it reads as a wrong
password from the outside and said nothing on the server either until 7.41.
The gate is **not wider**: the admitted set is still exactly what is enumerated,
keyed on something that survives the storage changing. The tradeoff is stated
rather than hidden — an ID is immutable, a username or email can be changed by an
admin — so prefer an ID once the database is settled, and a username while it is
not.

**What is fatal is a judgment, not a list.** `PRIVATE_ACCESS_USER_IDS` missing in
production exits, because without it the private portal admits every account in
the database — missing security beats broken uptime. `PRIVATE_BOOTSTRAP_ADMIN_ID`
not appearing in that allowlist is only a **warning**, because `seedAdmin` reads
it solely when no admin exists yet: on a running installation it has no effect at
all, so exiting there would take a healthy service down over a setting that does
nothing to it, and on the fresh install where it does apply the symptom (a seeded
admin who cannot sign in) is visible and recoverable. Weigh any new check the same
way — what does this actually break, and is that worse than the service being
down?

**Check before you deploy**, against the real service's own variables, without
starting anything:

    railway run --service <service> npm run preflight

It prints every problem with the fix beside it, or says the environment would
start.

## Frontend conventions

### Every position shows when it opened and closed

Any surface that renders a position — open or closed, live or logged — shows the
**clock time and date it opened** and, once it is closed, **the time and date it
closed**. On a card those sit in the **bottom-right corner, to the left of** the
existing "5h 18m ago" reading; in a table they take one column, the open stamp
with the close stamp beneath it (`→ open` while it runs).

`workspaces/trading/tradeTime.tsx` is the single source for this: `etStamp` /
`etStampFull` (the compact stamp and its hover form), `etSince` ("5h 18m ago"),
`heldFor` / `ageLabel` (a closed trade reads "held 5h 18m" instead), and the two
renderers `<TradeTimes>` (labelled, for cards) and `<TradeTimesCell>` (stacked,
for a dense row; `showHeld` adds the held time as a third line, which History
uses since every row there is closed). A **held** time rolls past a day into
"4d 3h" — a swing hold reading "96h" is unparseable — while the live "x ago"
reading deliberately keeps counting in hours, as it always has.
Stamps render in the reader's chosen zone — **Eastern unless they changed it**
in My Terminal ▸ Preferences (see Display time zone below). Current call sites: `TradeCard` (Live Wall + the Master board's
Positions tile), `TradeLog` (deck cards + tape rows), `History`, `Funded`,
`FundedLiveTrades`, `DeletedTrades`, `PositionsTile`'s compact list,
`DeskPositions` (the Trade Desk's team book),
`BrokerConnectionsPanel`'s manual-position editor, and the Scriptable iOS widget
script in `DeviceSettings.tsx` (which carries its own copy of the formatter, since
it is a standalone script). **A new position surface must show them too** — use
this module rather than formatting a date locally.

### Display time zone (`lib/timezone.ts`)

The clock the terminal **displays** times on. Set from **My Terminal ▸
Preferences** and stored **on the account** (`users.display_timezone`, migration
`0092`; `'auto'` follows whichever device, anything else is an IANA name, null =
never chosen), so it follows the person between devices. **The default is
Eastern and must stay Eastern** — every stamp read ET before this existed, so
anything short of an explicit choice by the user has to render exactly as it did.

`lib/timezone.ts` **holds no storage of its own.** `setAccountZone` is fed from
the signed-in user by a single effect in `AuthContext` (which covers sign-in,
the session check and a profile save alike), and every formatter reads that
module-level value — module-level rather than React state because `zoneFmt` is
called from plain functions all over the terminal, not just components. Signing
out returns it to the default. Saving goes through `PATCH /api/auth/profile`,
which already returns the refreshed user, so there is one write path and no
second refresh to keep in step. The server validates the name against **its own**
`Intl` (`isUsableTimezone` in `auth/rbac.ts`) rather than a list — a name it
could not format would blank every timestamp at once. `takeLegacyDeviceZone` is
the one localStorage read left: a one-time carry-over of the per-device value
this replaced, read and cleared together so it runs at most once per browser.

`zoneFmt(options)` is the single seam: a cached `Intl.DateTimeFormat` bound to
the zone in force, keyed on zone + options. Callers used to hoist a formatter to
module scope for cost; they can't now the zone is a runtime value, so they go
through the cache instead. `zoneAbbr(ms)` gives the label beside a time —
"ET"/"CT"/"PT" come from a small map so the US zones keep the terminal's own
wording, everything else falls through to Intl's DST-aware short name.

**What follows the setting** — the "when did this happen" readings: the top-bar
clock, a position's opened/closed stamps (`tradeTime.tsx`), an alert's arrival,
a headline's time, the Live Wall's "Updated …", the chart's own axis, and the
Scriptable widget script (stamped in at copy time, like its token).

**What deliberately does not**, because it is a fact about the market or about
the desk rather than about the reader:

- **Session windows, market hours, the FOMC schedule** — `etClock.ts`, Market
  Data's Fed bar and calendar, and `TradeCard`'s `etTime` which those two use.
  2:00 PM ET is when the statement lands wherever you are.
- **Anything bucketed by trading day** — History's day/month grouping,
  `newsFormat`'s `fmtDayKey`, the trade code. A trading day is an Eastern
  concept (a 6pm Sunday forex open belongs to Monday), so grouping on the
  reader's calendar day would move trades between buckets, and between two
  teammates' buckets.
- **The Trade Log's CSV export**, which is a shared artifact and says ET in the
  file so it reads the same for whoever opens it.

Consequence worth stating plainly: once a trader moves off Eastern, they and a
teammate read the same trade at different wall-clock times. The top-bar clock
names the zone in force continuously, and every compact stamp carries the full
form with its abbreviation in the hover title — which is why the stamps
themselves can stay zone-free without becoming ambiguous. **A new time surface
should use `zoneFmt`** unless it falls in one of the three categories above.

A zone the browser's ICU build cannot format is filtered out of the picker
(`usableZoneGroups`) and refused on read, so it can never silently fall back
mid-use. `Europe/Frankfurt` is the live example — an alias Node rejects
outright — which is why the list says `Europe/Berlin`.

### Measuring an element under the terminal zoom (`lib/measure.ts`)

`#root` carries a CSS `zoom` (the account-menu zoom control), and that splits
every DOM measurement into two coordinate spaces:

- **layout space** — `clientWidth` / `offsetWidth` / `scrollHeight`. The space an
  inline `width: 480px` written back onto a child lands in.
- **painted space** — `getBoundingClientRect()`, and `window.innerWidth`.

**Measure in layout space whenever the number is fed back into layout.**
`ResizeObserver`'s `contentRect` is the trap: Chromium reports it in layout
space, WebKit in painted space, so a width taken from it and applied as pixels
is a factor of the zoom off *on iPhone only*.

That is not hypothetical — it is what broke the Live Wall on mobile. The board
used `react-grid-layout`'s `WidthProvider`, which sizes from `contentRect`, so at
125% zoom on a 400px phone every tile came out ~60px wider than the board: the
page gained a sideways scroll, and the two tiles that hard-measure their own box
— the **TradingView chart and watchlist iframes** — rendered into a box wider
than the tile, leaving the widget shifted with a band of the iframe's own white
background beside it. It verified clean in Chromium at 100/150/200% because
Chromium reports the *other* space, and it is invisible at 100% in every engine.

`useContentWidth(ref, fallback)` is the fix and the only thing new code should
use: the observer is a **trigger**, the value always comes off the element, and
the zoom factor is a dependency because a zoom change does not reliably fire a
resize entry. Call sites: `ChartBoard` (which therefore does **not** use
`WidthProvider`), `MarketData`, `MarketNews`. `PositionsTile` already did the
right thing by reading `scrollHeight`.

**It waits for the element, and that is load-bearing.** A `RefObject` cannot tell
the hook when it becomes non-null and the layout effect runs once, so a caller
that renders its measured element behind a condition — `if (loading) return …`,
an empty-state branch, a lazily resolved chunk — was measured **never** and kept
the fallback width for the life of the screen. So the hook polls a frame at a
time until the element appears, then observes it. Symptom when it regressed: the
Live Wall laid a 1120px grid out inside a 390px viewport, which is invisible on a
desktop (the fallback is roughly right) and unusable on a phone. Verified by
driving a real browser at 1440 / 768 / 390 / 320 and checking the cells actually
track the viewport — a typecheck cannot see this, and neither can a desktop.

**The terminal zoom stops at an embedded document** (`#root iframe` in
`global.css`). One layer past the measurement trap above, `zoom` and a nested
browsing context do not compose in WebKit either: the framed document is laid out
against one box and painted into another, so at any zoom but 100% an embed covers
only `zoom` of the iframe's area and the browser's own **white** backdrop shows
through the rest. Measured off an iPhone at 90%, the Live Wall's watchlist drew
its ticker across exactly 90% of the tile with a white band down the right edge
and along the bottom; the chart and live-stream tiles share the fault. Chromium
composes the two correctly, which is again why a desktop cannot see it. The rule
cancels the factor so every embed sits at an effective zoom of **1** — there are
then no two spaces left to disagree, whatever the engine does with them. The trade
is that a TradingView chart, a watchlist strip and a YouTube stream keep their
native size while the terminal around them scales; at the default 100% the rule is
an identity. Do not "fix" this by counter-sizing the iframe against a measured
factor — that is engine-dependent, and correcting for WebKit would break Chromium.

**A tile whose content is a fixed-height strip is exempt from the phone height
floor** (`isTickerStrip` in `ChartBoard.tsx`). Every tile is floored to six rows
on a phone so a tile that was a wide strip on the desktop is not a stub — but
TradingView's ticker tape is one fixed height and does not grow into a taller
tile, so the floor could only pad it with two thirds of a tile of nothing. A
watchlist in **static** mode is the quote list, which does fill, and is floored
like everything else.

### A number input must be able to be EMPTY (`studies/NumberField.tsx`)

The obvious controlled spelling is wrong and looks right:

```tsx
<input type="number" value={n} onChange={(e) => set(Number(e.target.value) || 0)} />
```

It **cannot represent an empty box**. Clearing it makes `Number('')` fall through
to the fallback, which is painted straight back into the field — so the box reads
`0` the instant it is emptied and the next digit typed lands *after* that zero.
Clearing a category weight and typing 30 produced **`030`**, reported from the
study game editor. The fault belongs to the spelling, not the field: any input
written this way has it, whatever its fallback (the practice test's length and
pass-line boxes had the identical bug with a fallback of 1).

`NumberField` is the fix and what new numeric inputs should use: it keeps the raw
text while the field has focus and falls back to the committed, clamped number on
blur, so the parent still receives a number on every keystroke (`emptyValue`
while blank) and nothing downstream sees a half-typed string.

**A typecheck cannot see this, and neither can reading the code** — it is React's
controlled-input behaviour, so it only shows up when something types into it.
Verified by driving Chromium against a bundled harness: clear, type, blur, check
both the field and the model. Worth re-running that way rather than by eye if the
component changes.

### Mobile input zoom (iOS)

iOS Safari auto-zooms the viewport whenever a focused text field has a
font-size **below 16px**. To prevent this, a global rule in
`apps/web/src/styles/global.css` floors every `input`, `textarea`, `select`,
and `[contenteditable]` at `16px` on touch devices (`@media (pointer: coarse)`,
with `!important` so it beats inline styles).

- **This is the site-wide default — do not add per-component font-size fixes
  for the zoom.** Any new text box is covered automatically.
- You may still set whatever inline/design `font-size` you want for desktop; it
  applies on fine-pointer devices and is overridden to 16px only on touch.
- If you ever change that global rule, keep the 16px floor — dropping below it
  reintroduces the zoom on every input at once.
