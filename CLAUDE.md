# CLAUDE.md

Project guidance for Claude Code working in this repo. This file is the
**current source of truth** for how the terminal is built and how it behaves.
`README.md` is outdated (it still describes "Stage 1" and workspaces that no
longer exist) — trust this file and the code, not the README.

> When you change how the terminal works, update the relevant part of this file
> in the same change so it never goes stale.

## Before you touch anything: confirm this is the live checkout

The terminal is worked on from **more than one machine**, and the single most
expensive mistake made in this repo was a session that edited a **stale clone**
for hours while believing it was the live site. It never checked, and it could
not find out: the clone sat in a cloud-sync folder where `git fetch` hangs
outright, and the preview it "verified" against served those same stale files,
so every check it ran confirmed the wrong thing.

`.claude/hooks/session-start.sh` prints this automatically at the start of every
session. If it says **STOP**, believe it — but the checks are simple enough to
run by hand, and they are worth knowing:

- **Remote** is `andrewr92896-ship-it/vts-portal`. Anything else is the wrong
  repo.
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
  advice-flavored features (Trading Alerts, session bias, AI coaching); and a
  **securities/fintech attorney** review of those advice-flavored features
  (potential RIA/CFTC-CTA exposure). Consider E&O/tech/cyber **insurance** to
  transfer residual liability. (None of this is legal advice.)

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
  volume). Schema in `apps/api/src/db/schema.ts`; ~86 SQL migrations in
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
  opt-in: price alerts are a Markets feature included with every account, and
  gating the delivery channel behind the desk left a Markets-only user able to set
  an alert and never be told it fired.

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
- **Sidebar order is founder-overridable:** the **Developer Terminal ▸ Sidebar
  Layout** editor (`AdminSidebarLayout`) saves a single order override to
  `app_settings` under `nav.order` (routes: `GET /api/nav-layout` for everyone,
  founder-only `PUT|DELETE /api/admin/nav-layout`). `theme/navOrder.ts`
  (`applyNavOrder`) applies it over the code-default `NAV` for **every** user;
  `Portal.tsx` loads it and passes the reordered nav to `Sidebar`. It only
  reorders (workspaces + sections within a workspace) — never adds/removes/moves
  a section across workspaces, so routing is untouched. Unknown/new keys keep
  their default position (appended), so a stale override never hides new nav.

## Workspaces & sections (`theme/nav.ts`)

Sections a user lacks the role for — or the **feature opt-in** for (see Feature
Access below) — are hidden. **My Terminal is pinned to the very top of the
workspaces list** (see `theme/nav.ts` order).

- **Markets** (sky blue, key `markets`) — **included with every account, no
  opt-in**: Market News (`news`), Market Data (`data`).
  Everything here reads public market data — no trade, no broker, no balance —
  which is exactly why it sits outside the Advanced Trading opt-in and is the
  terminal's floor for a user who has turned nothing on.
  **The Live Wall moved out of here** (owner decision, 2026-08) to the top of My
  Terminal: it draws on every workspace now rather than just this one. The key
  stayed `live`, so saved `nav.order` overrides and in-app links keep working,
  and **`myportal` is the landing workspace on sign-in** (it was `markets`).
  `DEFAULT_SCREEN.markets` is now `news`.
- **Advanced Trading** (gold, internal key `trading`) — **opt-in** (and several of
  its parts are **paid** — see Memberships): Trading Alerts (`alerts`),
  **Trade Desk** (`tradedesk` — placing real orders, see below), Trade Analysis
  (`desk` — **two tabs, Trade Log + Live Brokers**; legacy keys
  `log`/`history`/`metrics` alias into it. **The key stayed `desk` when the label
  changed** from "Trade Desk" to "Trade Analysis", so saved `nav.order`
  overrides, the `howto.desk` wording and every in-app link keep pointing at the
  review screen; the new placement screen took the *new* key `tradedesk`.
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
  Open/close/pre-open notifications are opt-in from Trading Alerts — see below),
  Manual Trades (`funded` key, `FundedScreen`), **Funded Account**
  (`prop` key — the nested opt-in; prop-firm challenge dashboard). **To Do moved
  to My Terminal** (owner decision, 2026-08 — a to-do list is personal, not a
  desk instrument); its key is still `td_trading`, so saved `nav.order`
  overrides and in-app links keep working.
  Market Data and Market News moved to **Markets**; their section keys are
  unchanged (`data` / `news`), so saved `nav.order` overrides, `howto` wording
  and in-app links keep working.
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
      team-wide: the book is the same team-scoped `/api/trading/live` feed every
      other screen reads, so the visibility boundary stays defined once
      (`trading/scope.ts`). *Acting* is personal: every write resolves its
      connection through `getActiveDecrypted(userId)`, which is keyed on the
      caller, so **there is no code path that trades a teammate's account** —
      teammates' rows on the book are watch-only by construction. Do not add an
      "act on behalf of" path here; a desk lead editing a teammate's *settings*
      (below) is a different thing entirely from placing their trades.
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
      `pipLocation`. The quick-size chips split on a related axis — thousands for
      whole-unit instruments, fractions for anything the broker allows a
      fractional size on, and on a **spot** account **amounts of money** ($100 …
      $5,000, converted at the live price when pressed), because "$500 of bitcoin"
      is how a coin is actually bought. Always bounded by that instrument's
      min/max order size and minimum order value. Sizes render through `fmtUnits`
      (`TradeCard.tsx`), which keeps more decimals the smaller the size — the
      default locale format prints 0.00042 of a bitcoin as "0". Keep all of this
      when adding stocks or another broker.
    - No notification is fired here on purpose: the desk watch reconciles within
      ~10s and sends the existing "trade opened/closed" push, so firing one at
      placement would double every buzz.
  - **Trade Analysis settings are per trader** (`trading/settings.ts`,
    `getDeskSettings(userId)` / `updateDeskSettings(userId, patch)`): the
    break-even buffer, per-instrument buffers (`trading_be_overrides`, keyed
    `(owner_id, instrument)`; `owner_id = userId`, or `'desk'` for the shared
    default a trader falls back to before customizing), and the "ignore test
    trades" floor all govern **that trader's own view** of the desk. A trader
    edits their own; a **desk lead** — team leader, Chief Analyst / Chief
    Strategist designation, or admin/founder — can edit any **teammate's** via
    the `?userId=` param, gated by `trading/deskAccess.ts`
    (`canEditDeskSettingsFor` / `editableDeskMembers`). The `DeskSettingsModal`
    "Whose settings" picker surfaces this. `getTrades` / `getHistory` /
    `getLiveWall` score each viewer's desk with the **viewer's own** settings.
  - **Market Data** (`data`, `workspaces/trading/MarketData.tsx` — now a
    **Markets** section, files unchanged) is the desk's
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
    - **20 rows are still design fixtures.** Seventeen are the ones **no free
      provider covers** — CME FedWatch meeting odds, the SEP dot plot, BoE/BoJ
      rates, the 1-year breakeven, the Cleveland nowcast, the GDP forecast, the
      ISM surveys (licensed, pulled from FRED), the MOVE index, blended EPS, the
      Citi surprise index and the three crypto flow/funding rows. The other three
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
    - **The Fed decision bar reads its target range from the `ffr` series**, never
      from a literal. It carried a hardcoded "4.25–4.50" in two places, which
      became a visible lie the moment that row went live off FRED — the bar
      claimed a hold at a range the row directly beneath it contradicted. Anything
      the bar states about current policy must come from the payload.
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
    **Markets** section, files unchanged) is two things:
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
      since Market News is a Markets section included with every account and
      demanding the Advanced Trading opt-in would lock a Markets-only user out of
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
  - **Everything is personal, never team-scoped.** Unlike Trading, where the
    whole desk watches one book, an investment account belongs to one user:
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
- **My Terminal** (emerald) leads with the **Live Wall** (`live`) — the
  terminal's one centralized board, first section of the first workspace and what
  a sign-in opens on; see its own section below. It also holds **Premium
  Features** (`my_access`) — memberships and the per-user opt-ins, see its own
  section below — plus one personal roll-up section:
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
  two colors — your team's own games (violet) vs. the terminal's built-in example
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
  somewhere in the middle. The makers themselves are unchanged: the study-game
  maker+editor (`TeamStudyDecks` → `DeckEditor`, plus combine-games), the
  **flashcard-set maker** (`TeamFlashcards` — type cards in, AI-generate from a
  topic, or upload a `.txt`), and the study-guide builder (`StudyGuideCreator` —
  build with VTS AI or upload a `.pptx`, parsed client-side in `lib/pptx.ts`).
  **Study Presentations** (`StudyGuidesLibrary`) is the present/manage side — the
  finished guides only, ending with a **Build a presentation** tile.
  The shared level ladder / streak / scoring math lives in `gameEngine.ts` (used
  by `studyEngine.ts` for per-deck state and mirrored server-side in
  `gameStats.ts`). Studies is lazy-loaded.
- **Site Help** (blue): How to, Announcements, Patch notes, Report a bug,
  Suggestion. Available to **every** signed-in user.
- **Admin** (rose): Users, **Administrator Log**, **Admin Guidelines**, Teams,
  Badges, Message Templates, Patch Notes, Early Access, Bug Reports, Support.
  **Admins only.**
  - **Administrator Log** (`ad_log`, `AdminLog.tsx` over `admin/adminLog.ts`) —
    what administrators have done, and what is waiting on one. **Red = open**
    (still needs somebody), **green = resolved**, **gray = a record that asks
    nothing of anyone**. Grouped into collapsible lists with the open one expanded,
    since the only question the screen exists to answer at a glance is "is anything
    waiting on me".
    - **Two storage models, deliberately.** Administrative **actions** (a manual
      membership grant and its stated reason) are **stored** in `admin_log` — they
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
  Sidebar Layout (`ad_sidebar` — reorder the whole sidebar, see below),
  **Suggestions** (`ad_suggestions` — moved out of the Admin Terminal; the
  `/api/admin/suggestions` read/patch/delete routes are `requireFounder` to
  match, while *sending* a suggestion from Site Help stays open to everyone),
  View as role. **Founder-level only** (`isFounder`). Displayed as "Developer Terminal";
  the internal key and role are still `founder` (unchanged gating).
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
    - **How Claude Code posts here.** It edits the repository; it has no session
      and no runtime route into production. So a post it writes is an entry in
      **`devBlog/seeded.ts`**, and the deploy that carries the entry publishes it
      (`seedDevBlog` on boot). Keyed on `seedKey`, so a restart **updates** that
      post rather than stacking duplicates, and editing the title or body updates
      the live post next deploy. Deleting a seeded post from the screen means the
      next boot brings it back — remove its entry to be rid of it.
    - **Posts must be brief.** A few sentences. See the brevity rule under
      Reporting back to the owner — it applies to everything Claude Code writes,
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

- **`FEATURE_TIER` is the entire paywall, in one object.** Eight paid features
  (owner decisions, 2026-08). **Max:** `ai`, `tradeDesk`, `teams`, `teamChat`,
  `customStreams`, `brokerConnections` (**Trade Analysis ▸ Live Brokers carries
  its diamond**), `pushover`. **Premium:** `funded`, `studyCreation`,
  `customBoards`, `premiumBadges`, `strategySessions`, `marketData`,
  `presetStreams`, `suggestions`, `supportChat`. Everything absent
  from that map is included with every account. **Moving a feature between tiers
  is a one-word edit there** and every guard, lock icon and upgrade prompt
  follows — that is the whole reason features ask `hasEntitlement(user, 'ai')` and
  never "is this user premium". The owner is still deciding what belongs where, so
  keep it editable like this.
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
  - **Sections stack free → Premium → Max** inside each workspace, in the `NAV`
    array itself, so a founder's saved `nav.order` override still wins over it.
  - **Only wholly-gated sections are marked** in the sidebar. Several paid
    features have no section of their own, and each is marked **at its own
    control** instead (audited 2026-08 — every one of the sixteen paid features
    now carries its mark somewhere a user can see before they hit the paywall):
    | feature | where it is marked |
    | --- | --- |
    | `ai` | the Ask VTS AI panel header |
    | `teamChat` | the chat bubble's Team chat tab |
    | `suggestions`, `supportChat` | the intake choices in `SupportTab` |
    | `brokerConnections` | Trade Analysis ▸ Live Brokers, **and** the Settings section |
    | `pushover` | its row in `DeviceSettings` |
    | `premiumBadges` | the **Badge** button in My Terminal ▸ Trading Team |
    | `customBoards` | the Live Wall's "Build your own" button |
    | `studyCreation` | the Studies **Create** `ActionTile` |
    | `presetStreams`, `customStreams` | the Market News channel rail |
    Everything else is a nav row (`tradeDesk`, `teams`, `marketData`,
    `strategySessions`, `funded`, `studyCreation`) and marked there.
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
    other. Both are kept icier/warmer than the Markets accent (`#5AC8FA`) so a
    tier marker is never read as a workspace one.
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
> the section key is still `my_access`, so saved `nav.order` overrides and in-app
> links keep working — the same reason `desk` stayed `desk`. The screen now covers
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

Everything else — **Markets, Investments, Studies, My Terminal, Site Help** — is
included with every account and deliberately has nothing to opt into: none of it
holds money or places an order, and a terminal without it is worth nothing to an
average user. The Premium Features screen lists them as "Included with every
account" rather than hiding them, so the screen reads as the whole picture.

- **Storage:** `user_features`, one row per user (migration `0083`), in the
  `admin/service.ts` per-user delete list. Everything defaults **off** for a new
  account. `tradingAckAt` stamps the acknowledgement that the desk places real
  orders with the user's own broker — **the desk cannot be enabled without it**
  (`FeatureError`), and the stamp survives an opt-out so returning does not ask
  twice.
  - **The table also holds `shareBook` / `bookAckAt` (migration `0093`) — private
    mode — which is NOT an opt-in and is NOT edited from this screen.** It is a
    privacy setting about the team, so its switch lives in **My Terminal ▸ Trading
    Team**; it rides this row because the plumbing is identical (one row per user,
    a switch beside an acknowledgement stamp, already in the per-user delete list,
    already carried to the client on `user.access.features`). It follows the same
    acknowledgement rule as the desk, and is deliberately **not nested** under
    `advancedTrading`: a trader who switches the desk off still has closed trades
    on the team's Trade Log, and their answer about who may read them should not
    depend on another switch. What it actually gates is in **Teams ▸ Private
    mode** above — read that before touching `trading/scope.ts`.
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

### The Live Wall — one centralized board (`live`)

**The terminal's one board, and the first section of My Terminal** (owner
decision, 2026-08). Every part of the terminal can be put on it, so it is
deliberately the screen a sign-in lands on. There is no lite duplicate to keep in
sync — one screen serves a free account and a full desk alike.

**Four files carry the design, and adding a tile kind touches all of them:**

- **`workspaces/trading/tileCatalog.ts`** — the single source of truth for what a
  tile IS: its label, group, icon, one-line blurb, starting size, minimum size,
  and **what it costs** (`feature`, `desk`, `funded`). `tileLock()` answers "can
  this reader have it", and `newTile()` builds one. The board itself no longer
  knows what kinds exist.
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
**cell**, not the tile header. Deliberately: the headers belong to twenty-three
components, seven of which predate the shared `TileFrame`, so putting it in the
cell gives every kind the behaviour with no per-tile change. The bottom-right
corner is free exactly when it is offered — while editing, that corner is the
resize handle and the button is hidden. It is hover-revealed on a pointer device
and permanently visible under `@media (hover: none)`, since a touch device gets
no chance to discover a hover-only control.

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

**`dirty` means MODIFIED, not merely unsaved.** A built-in layout is permanently
unsaved and nonetheless untouched, so `applyBuiltIn` / `applyShared` baseline
`savedTilesJson` against what they just applied. Conflating the two made every
layout switch ask "discard unsaved changes?" about changes nobody had made.

**Tiles fetch through `tiles/tileFeed.ts`, so two tiles reading one endpoint make
one request.** The wall changed the economics of a poll: a realistic board has
Trade Analysis beside Closed Trades (both the closed-trade history), Net Worth
beside Portfolio, two Market Data tiles off one catalog. `sharedFetch` shares an
**in-flight** request (the mount case — a board opens and fires everything at
once) and an answer younger than the **caller's own** staleness bound (the
steady-state case — two tiles on the same interval drift into lockstep). A failed
request drops the in-flight marker but **keeps the last good answer**, which is
what lets a tile go on showing the previous reading. `useTileData`'s first
argument is the key, and it must name everything that varies the request —
`studies:leaderboard:<deckId>`, never `studies:leaderboard`, or every leaderboard
tile shows the first deck's standings.

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
  Markets / Investments / Studies / My Terminal / Site Help are included with
  every account.
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

`WorkspaceKey` server-side is only `'trading' | 'studies'`; Markets, Investments,
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

## Teams (`teams/service.ts`) — scope almost everything

A **trading team** is a group a user belongs to at most one of (`users.team_id`).
Teams scope **all trade data** (Live Wall, Trade Log, History, broker capital),
Studies **leaderboards**, **team chat** (but *not* the Administrator chat — see
below), and notification recipients — a trader
only ever sees their own team's data (or just their own if team-less). Default
team `team-vitalis` / "Vitalis Trading Team" (seeded on boot; team-less users are
adopted into it). Study games, flashcard sets, and guides are all team-scoped —
a team only sees its own. `trading/scope.ts` is the single
place the boundary is defined; everything funnels through it.

### Private mode, and why `scope.ts` has two functions

Being on a team no longer means broadcasting your book to it. **`shareBook`**
(`user_features.share_book`, migration `0093`) is a per-user privacy switch: while
it is off, that trader's positions are absent from every teammate's Live Wall,
Trade Log, History, Deleted Trades and broker capital — **including the team
leader's**, since leading a team is not a right to read a member's positions.
Administrators keep their install-wide reach for support (their paths never come
through here).

- **Privacy is the default and the consent is real.** A new member starts
  private; their book appears only after they tick the acknowledgement naming
  what a teammate would see (instrument, direction, entry, size, stop, target,
  live P&L, open time). Migration `0093` **grandfathers everyone already on a
  team** into sharing with a stamped acknowledgement — they have been sharing all
  along, so nobody's wall goes dark on deploy — and deliberately leaves team-less
  traders private, since they have nobody to share with yet. `seed.ts` does the
  same for the first-boot owner, as `0083` did. The stamp survives going private
  again, so returning does not ask twice. The demo is forced to sharing.
- **The switch lives in My Terminal ▸ Trading Team**, not Premium Features: it is
  a question about those people, not about which parts of the terminal you have
  switched on. Storage location and UI location deliberately differ.

**`scope.ts` exports two functions and they are not interchangeable.** The team
set is used in two opposite directions, and private mode belongs on only one:

- **`visibleTraderIds(viewer)` — visibility.** "Whose trade data may this viewer
  *see*." Private members removed, the viewer's own id always kept. Use this on a
  **read**: the Live Wall (`service.ts` — and so the Trade Desk's team book, which
  reads the same `/api/trading/live` feed), Trade Log, History, Deleted Trades,
  broker capital, the desk-settings instrument list, the "notify me about a
  trader" picker, and `deleteAccess.ts` (a leader must not be able to delete a
  trade they cannot see).
- **`scopedTraderIds(viewer)` — recipients.** "Who should *receive* this." Private
  members **kept**. Use this on a **send**. `trading/alerts.ts` is the reason this
  split exists: a TradingView alert is a team-wide signal, not a report of anyone's
  book, so filtering it would cut a private trader off from the alerts their desk
  is sending them. **Do not "tidy" alerts.ts onto the filtered function.**
- **`notifyTraderIds(ownerId)` — the third case**, for a notification that *is* a
  send but whose entire content is one trader's position (the open / close /
  stop-moved buzzes in `history.ts`). Their team normally; **just them** while
  private. A private trader whose fills still buzzed every teammate's phone would
  not be private in any sense that matters, however clean their Live Wall row
  looked.

Worth preserving: `service.ts` hands the visible set to `getAllActiveDecrypted`,
so a private trader's broker credentials are **never decrypted** to serve a
teammate's poll. Private mode stops the read at the connection, not at the render.

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
- **My Terminal ▸ Trading Team** (`userTeams/service.ts`) — the self-service surface
  over the **same** team the user is in. Membership is read straight from
  `users.team_id`; My-Terminal-only metadata is layered on top:
  - `user_teams` — one row per team naming its **leader** (`leaderId`).
  - `user_team_members` — optional per-user **badge** + **permission flags**
    (`canCreateStudyGuides / canInvite / canManageBadges / canRemoveMembers /
    canEditTeam / canDeleteTrades`); a missing row = defaults (no badge, no
    perms). Leader = all.
  - `user_team_invites` — pending invites; **accepting sets the invitee's
    `team_id`** (moves them onto the team's desk). Leaving / removal clears
    `team_id` (→ solo). Renaming updates the shared `trading_teams` name.
  A leader is auto-picked (founder → admin → earliest member) by `ensureTeamMeta`
  and repaired if the stored one leaves; `backfillTeamLeaders()` runs on boot to
  give every existing team a leader row. Demo/inactive users never appear.
  Because membership is `team_id`, the My Terminal team **is** the trade-scoping
  team — the two are one. (Consequence: the Studies delete gate, keyed on team
  leadership, is now live — non-leader members can't delete team study content.)

### Who may delete a trade (`trading/deleteAccess.ts`)

A trader always removes their own. Beyond that it is a **team grant**: the
**leader** holds it implicitly, and they can hand the **Delete trades**
permission (`canDeleteTrades`, set from My Terminal ▸ Trading Team) to any member.
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
- **Usage caps: TWO monthly budgets, not one** (`ai/usage.ts`), both per-user,
  both metered in `ai_usage`, both resetting at the start of each **Eastern-Time**
  month, plus one in-memory burst limit `AI_RATE_PER_MIN` (default **15**, resets
  on restart, shared across both). Over limit → **429**. `enforceAiLimit(userId,
  kind)` runs before every call and picks the budget from the kind.
  - `AI_MONTHLY_LIMIT` (default **1000**) — **text**: `ask`, `market_hours`,
    `todo_command` and the eleven `studies_*` kinds. Name unchanged on purpose so
    existing deployments are unaffected.
  - `AI_VISION_MONTHLY_LIMIT` (default **40**) — the four **vision** kinds
    (`analyze`, `position_screenshot`, `funded_screenshot`, `account_screenshot`),
    listed in `VISION_KINDS`. A kind not in that list counts as text, which is
    the safe default both ways: a new text kind needs no edit, and a forgotten
    new vision kind is merely metered against the larger budget rather than
    escaping metering.
  - **Why they are separate:** a text question costs roughly 1.5–2¢ and a
    screenshot read 5–10¢, so one counter did not bound the worst case usefully —
    somebody spending their whole allowance on screenshots cost several times
    somebody spending it on questions, and nothing could tell the difference.
  - **The 429 names which budget was hit.** "AI limit reached" leaves a user who
    has used forty screenshot imports believing every AI feature is gone when
    asking a question would have worked. `getAiUsage` returns both budgets (and
    the flat `used`/`limit`/`remaining` still mirror **text**, so the existing
    counter keeps working).
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

- **Notifications** fire (web push + Pushover together, team-scoped, demo
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
  UI is the "Notify me about a trader" section in `DeviceSettings.tsx`.
- **Session alert prefs** (`trading/sessionAlertPrefs.ts`, `session_alert_prefs`
  table, one row per user): per-user opt-in toggles for **session open / close /
  pre-open** plus a `preOpenLeadMin` (1–240, default 30). Routes
  `GET|PUT /api/trading/session-alert-prefs`; UI is the collapsible "Strategy
  session alerts" card at the top of the Trading Alerts screen (`Alerts.tsx`).
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
- Session cookie **`vts_session`**: random token, stored server-side in
  `sessions` (SHA-256 of the token; raw token only in the cookie), Fastify-signed
  with `SESSION_SECRET`, `httpOnly`, `sameSite: 'lax'`, `secure` per
  `COOKIE_SECURE`, TTL `SESSION_TTL_DAYS` (default 14). Admin password reset /
  deactivate revokes all of a user's sessions.
- **No** login rate-limit, account lockout, or CSRF token — CSRF posture rests on
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
  a restart, not a redeploy), `AI_MONTHLY_LIMIT` (1000, **text only**),
  `AI_VISION_MONTHLY_LIMIT` (40, the four screenshot flows), `AI_RATE_PER_MIN`
  (15, shared burst limit). See the AI section for why the budgets are split.
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
  rejected key falls back to keyless rather than blanking the board.
- **YouTube (Market News live streams):** `YOUTUBE_API_KEY` (unset = poller off,
  every channel reads offline and live figures are marked sample),
  `YOUTUBE_WATCH_SECONDS` (300), `YOUTUBE_CHANNELS_PER_TICK` (8),
  `YOUTUBE_DAILY_QUOTA` (9000 units — the watch stops for the day at this
  ceiling rather than erroring), `YOUTUBE_USE_SEARCH` (`false`; the 100-unit
  `search.list` fallback, opt-in only). See the Market News section for why the
  cheap detection path matters.
- **Notifications:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
  `PUSHOVER_APP_TOKEN`, `PUSHOVER_SOUND`, `SESSION_WATCH_SECONDS` (session-notif
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

**This applies to everything Claude Code writes, not just the closing report.**
A Developer Blog post, a patch note, a commit body, a reply in the terminal — all
of it is **brief: a few sentences where a few sentences will do.** Say what
changed and what it means. Do not explain the implementation, restate the request
back, list the files touched, or write a summary of a summary. Length is not
evidence of care here; it is the thing that makes the writing unreadable.

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
    `workspaces/myportal/`. A saved `nav.order` override is keyed on the
    workspace key, so renaming it would silently drop a founder's sidebar layout
    — the same reason `desk` stayed `desk` when Trade Desk became Trade Analysis.
    Rename the label, never the key.
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

## Verifying changes

Run before merging (both must pass):

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
- **Credential encryption: `npm run verify:secretbox`** after touching
  `security/secretbox.ts` or `security/credentialsKey.ts`. Everything it checks
  fails *silently* in production: a ciphertext not bound to its row still
  decrypts, an unpinned tag length still verifies, a passphrase still encrypts.
  Nothing about the running terminal looks wrong — the guarantee is simply gone.

Run `npm install` first in a fresh container.

**Desk data health:** `npm run db:verify-positions` (root or `@vts/api`) is a
read-only check over `trading_positions` — it flags rows still on the legacy
un-namespaced key, any broker trade stored more than once on a connection, and
closed rows with no exit price, then prints per-trader closed-trade counts and
realized P/L to diff against the broker's own export. Defaults to the current
**ET** month; narrow it with `-- --from=2026-07-01 --to=2026-08-01` (`to` is
exclusive). Exits non-zero when it finds a structural problem. Run it against
prod after any change to the reconcile/backfill writers.

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
  production, and Claude Code's session list can show the work as merged — a
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
- **Squash-merge the PR** (see Deploy mechanics below).

## Deploy mechanics

- Railway builds and deploys whatever is on `main` (`npm install && npm run
  build`, then `npm run start`, health-checked at `/api/health`). There is no
  manual deploy button or Railway CLI in this environment — merging to `main`
  is the only deploy trigger.
- **Squash merges only**, and always through a PR (see above), so `main` keeps
  one commit per release and every release has a PR page behind it.

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
