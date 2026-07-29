# CLAUDE.md

Project guidance for Claude Code working in this repo. This file is the
**current source of truth** for how the portal is built and how it behaves.
`README.md` is outdated (it still describes "Stage 1" and workspaces that no
longer exist) — trust this file and the code, not the README.

> When you change how the portal works, update the relevant part of this file
> in the same change so it never goes stale.

## What the portal is

VTS Portal ("Vitalis Trading Systems") is a **private, dark "pro-terminal" web
app** for the owner (Andrew) and a few invited users. One login leads to a
sidebar of workspaces, each with its own sections. It is a PWA (installable,
web push). There is no public sign-up; there is a single read-only **demo
account** and a public **Early Access** request form on the login screen.

## Product direction (owner goal)

The portal is **currently** private/invite-only, but the **stated goal is to launch
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

- **Read-only tracker, not a trading platform.** The app *displays* positions/P&L;
  it must **not** execute trades or move money in-app. This keeps it in Apple's
  accepted "portfolio tracker" lane (App Review Guideline **3.2.1(viii)** reserves
  financial *trading/investing/money-management* apps to the financial institution)
  and keeps regulatory exposure low. Do not add in-app order execution without
  revisiting this.
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
  **Two build entries, not one:** `index.html` → the main portal, and
  `employee.html` → the separate **Employee Portal** at `/employee` (see its own
  section below). They share design tokens and the `Icon` component and nothing
  else — no employee code ships in the main bundle, and vice versa.

Tech:

- **DB:** SQLite via **Drizzle ORM** on the **libsql** driver (`@libsql/client`);
  file at `DATABASE_URL` (default `file:./data/vts.db`; prod uses a Railway
  volume). Schema in `apps/api/src/db/schema.ts`; ~73 SQL migrations in
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
- **Notifications:** web push (VAPID, `web-push`) and **Pushover**.

### Where things live

- API modules: `apps/api/src/{admin,ai,auth,badges,chat,demo,earlyAccess,employee,feedback,legal,messageTemplates,notifications,patchNotes,security,settings,studies,support,teams,todo,trading,userTeams}`.
  Routes in `apps/api/src/routes/*`, registered in `server.ts` (health, auth,
  admin, earlyAccess, brokers, trading, webhooks, tvWebhook, todo, ai, chat,
  feedback, studies, push, pushover, content).
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
- **Sidebar order is founder-overridable:** the **Developer Portal ▸ Sidebar
  Layout** editor (`AdminSidebarLayout`) saves a single order override to
  `app_settings` under `nav.order` (routes: `GET /api/nav-layout` for everyone,
  founder-only `PUT|DELETE /api/admin/nav-layout`). `theme/navOrder.ts`
  (`applyNavOrder`) applies it over the code-default `NAV` for **every** user;
  `Portal.tsx` loads it and passes the reordered nav to `Sidebar`. It only
  reorders (workspaces + sections within a workspace) — never adds/removes/moves
  a section across workspaces, so routing is untouched. Unknown/new keys keep
  their default position (appended), so a stale override never hides new nav.

## Workspaces & sections (`theme/nav.ts`)

Sections a user lacks the role for are hidden. **My Portal is pinned to the very
top of the workspaces list** (see `theme/nav.ts` order).

- **Advanced Trading** (gold, internal key `trading`): Live Wall, Trading Alerts (`alerts`), Trade Desk (`desk` — merges Trade Log +
  History + Live Brokers; legacy keys `log`/`history`/`metrics` alias into it),
  Strategy Sessions (`sessions` — per-weekday ET windows with a Bull/Bear/Two-way
  bias; each session picks its own Mon–Fri days + hours, or is filled to the
  instrument's full market hours via the `/api/trading/market-hours` AI lookup.
  Open/close/pre-open notifications are opt-in from Trading Alerts — see below),
  Manual Trades (`funded` key, `FundedScreen`), **Funded**
  (`prop` key — role-gated prop-firm challenge dashboard), Market News, To Do.
  - **Trade Desk settings are per trader** (`trading/settings.ts`,
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
- **Investments** (teal, key `investments`): a read-only, layman-friendly
  **long-term portfolio tracker** — 401(k), IRA, ESA, and general holdings. This
  is the platform's intended "bread and butter" for a future public/App Store
  launch, and the **whole foundation is currently "Coming Soon" placeholders**
  (`workspaces/investments/ComingSoon.tsx`, routed via `COMING_SOON_SCREENS` in
  `Portal.tsx`). Sections: Portfolio Overview (`inv_overview`), Accounts
  (`inv_accounts`), Holdings (`inv_holdings`), Allocation (`inv_allocation`),
  Performance (`inv_performance`), Dividends & Income (`inv_dividends`),
  Contributions & Goals (`inv_contributions`), Projections (`inv_projections`).
  **Regulatory posture (decided with the owner):** strictly a *tracker that
  displays and educates* — no in-app trade execution or money movement (stays in
  Apple's 3.2.1(viii) portfolio-tracker lane) and **no personalized
  buy/sell/rebalance advice** (avoids RIA/adviser exposure). Deliberately **no**
  rebalancing or tax-advice sections. Account connection is designed around a
  **read-only aggregator (Plaid / SnapTrade)** plus **manual entry** — most
  retirement providers (Fidelity, Vanguard 401k) don't expose per-user API keys
  the way OANDA/Kraken do. Every advice-flavored surface must carry an
  "informational only, not investment advice" disclaimer.
- **My Portal** also gains two personal roll-up sections (emerald), both
  currently "Coming Soon":
  - **Investment Holdings** (`my_holdings`) — a combined summary of active
    Advanced Trading positions + the total long-term Investments portfolio and
    stats across both.
  - **Net Worth** (`my_networth`) — the whole-life picture: every asset (cash,
    investments, real estate, crypto, vehicles) minus every liability (loans,
    cards, mortgage), tracked over time as a single number. Lives in My Portal
    (not Investments) as a personal cross-workspace summary, keeping the
    Investments workspace focused as a pure investment-portfolio tracker.
- **Studies** (violet): Subjects (`st_home`), Study Game (`st_game`), Flashcards
  (`st_cards`), Practice Tests (`st_test`), Study Presentations (`st_guides`),
  Progress (`st_progress`), Study Creation (`st_decks` — **last**). **All study content is
  team-built** — there is no hardcoded subject. **Study Game / Test Mode /
  Progress** are the same launcher (`StudyGameHub`, parameterized by `target` =
  `play` | `test` | `progress`): each lists the study games in your list and, when
  you pick one, opens the chosen experience — the quiz+leaderboard player
  (`TeamStudyGame`), a graded test (`DeckTestMode`, configurable size + pass line),
  or a progress summary (`DeckProgress`). The list separates games by source with
  two colors — your team's own games (violet) vs. the portal's built-in example
  games (blue, `isSample`). Built-in games are **not** shown by default: a **Browse
  Study Games** gallery (toggled in `StudyGameHub`) lists them, and the learner adds
  the ones they want into their own list. That add/remove set is a personal,
  device-local preference in localStorage (`sampleGames.ts`, keyed by user id),
  never team data. **Flashcards** (`FlashcardsHub`) is the
  matching launcher for flashcard sets — pick one and study it with the auto-rotate
  `FlashcardSetPlayer`. **Study Creation** (`StudyCreation`) is the make/manage-only
  section (no playing/studying inline): it stacks the study-game maker+editor
  (`TeamStudyDecks` → `DeckEditor`, plus combine-games), the **flashcard-set maker**
  (`TeamFlashcards` — type cards in, AI-generate from a topic, or upload a `.txt`),
  and the study-guide builder (`StudyGuideCreator` — build with VTS AI or upload a
  `.pptx`, parsed client-side in `lib/pptx.ts`). **Study Guides**
  (`StudyGuidesLibrary`) is the present/manage side — the finished guides only.
  The shared level ladder / streak / scoring math lives in `gameEngine.ts` (used
  by `studyEngine.ts` for per-deck state and mirrored server-side in
  `gameStats.ts`). Studies is lazy-loaded.
- **Site Help** (blue): How to, Announcements, Patch notes, Report a bug,
  Suggestion. Available to **every** signed-in user.
- **Admin** (rose): Users, Teams, Badges, Message Templates, Patch Notes, Early
  Access, Bug Reports, Support. **Admins only.** **Message Templates** (`ad_templates`,
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
- **Developer Portal** (`founder` key/role, amber): AI Instructions, Site Wording,
  Sidebar Layout (`ad_sidebar` — reorder the whole sidebar, see below),
  **Suggestions** (`ad_suggestions` — moved out of the Admin Portal; the
  `/api/admin/suggestions` read/patch/delete routes are `requireFounder` to
  match, while *sending* a suggestion from Site Help stays open to everyone),
  View as role. **Founder-level only** (`isFounder`). Displayed as "Developer Portal";
  the internal key and role are still `founder` (unchanged gating).

Removed and gone (do not reintroduce or reference): the standalone To-Do
workspace, Vitalis Wealth Management, Personal Finance, the Vitalis LLC business
workspace, and Kia Sales.

## Roles & access (`auth/rbac.ts`)

Granular, admin-assigned roles (JSON array in `users.roles`); a user may hold
any combination:

- `admin` — everything, incl. user/team management.
- `trading` — full Trading.
- `trading_viewer` — **read-only** Trading (the only read-only variant;
  `requireWorkspaceWrite` blocks it).
- `funded` — reveals the private **Funded** prop-challenge section inside Trading
  (still needs Trading access; `requireFunded`). Never the demo.
- `employee` — reveals **My Portal ▸ Employee Portal** and permits the separate
  sign-in at `/employee`. **Not** implied by admin or founder level — it must be
  granted outright, by a founder. It unlocks nothing inside the main portal, and
  on its own it is not enough: a **company-domain sign-in email** is required too
  (`canAccessEmployeePortal(roles, email)`). Never the demo.
- `studies` — Studies.

Middleware (`auth/middleware.ts`): `requireAuth`, `requireAdmin`,
`requireWorkspace(ws)`, `requireWorkspaceWrite(ws)`, `requireFunded`. The
legacy `users.role` string column is still populated but **unused** — real
roles live in `users.roles`.

## Teams (`teams/service.ts`) — scope almost everything

A **trading team** is a group a user belongs to at most one of (`users.team_id`).
Teams scope **all trade data** (Live Wall, Trade Log, History, broker capital),
Studies **leaderboards**, **team chat**, and notification recipients — a trader
only ever sees their own team's data (or just their own if team-less). Default
team `team-vitalis` / "Vitalis Trading Team" (seeded on boot; team-less users are
adopted into it). Study games, flashcard sets, and guides are all team-scoped —
a team only sees its own. `scopedTraderIds` (`trading/scope.ts`) is the single
place the boundary is defined; everything funnels through it.

### One team, two surfaces (merged)

`users.team_id` (+ the `trading_teams` row) is the **single source of truth** for
team existence, name, and membership. It is managed from **two** surfaces that
act on the same team:

- **Admin ▸ Teams** (`teams/service.ts`) — admins create teams, rename them, and
  assign/move members (`users.team_id`).
- **My Portal ▸ Trading Team** (`userTeams/service.ts`) — the self-service surface
  over the **same** team the user is in. Membership is read straight from
  `users.team_id`; My-Portal-only metadata is layered on top:
  - `user_teams` — one row per team naming its **leader** (`leaderId`).
  - `user_team_members` — optional per-user **badge** + **permission flags**
    (`canCreateStudyGuides / canInvite / canManageBadges / canRemoveMembers /
    canEditTeam`); a missing row = defaults (no badge, no perms). Leader = all.
  - `user_team_invites` — pending invites; **accepting sets the invitee's
    `team_id`** (moves them onto the team's desk). Leaving / removal clears
    `team_id` (→ solo). Renaming updates the shared `trading_teams` name.
  A leader is auto-picked (founder → admin → earliest member) by `ensureTeamMeta`
  and repaired if the stored one leaves; `backfillTeamLeaders()` runs on boot to
  give every existing team a leader row. Demo/inactive users never appear.
  Because membership is `team_id`, the My Portal team **is** the trade-scoping
  team — the two are one. (Consequence: the Studies delete gate, keyed on team
  leadership, is now live — non-leader members can't delete team study content.)

## AI / Ask VTS AI (`apps/api/src/ai`)

> **User-facing name is always "VTS AI"** (see Conventions). "Claude"/model IDs
> appear only in server config and internal code identifiers, never in UI copy.


- **Models** (env-overridable, current defaults): text = `ANTHROPIC_MODEL_DEFAULT`
  (`claude-sonnet-4-6`); vision/screenshot analysis = `ANTHROPIC_MODEL_ANALYSIS`
  (`claude-opus-4-8`, adaptive thinking). No streaming anywhere — every call is
  a single awaited `messages.create`.
- **Availability:** `aiConfigured()` = `!!ANTHROPIC_API_KEY`. When unset, AI
  endpoints return **503**.
- **Usage cap:** per-user, metered in `ai_usage`. `AI_MONTHLY_LIMIT` (default
  **1000**/month, resets at the start of each **Eastern-Time** month) + an
  in-memory burst limit `AI_RATE_PER_MIN` (default **15**, resets on restart).
  Over limit → **429**. `enforceAiLimit` runs before every call.
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

- **OANDA** (`brokers/oanda.ts`) — v20 REST, host per connection env: live
  (`api-fxtrade`) vs practice (`api-fxpractice`). Fetches open trades, pricing,
  account summary (NAV/balance/PL) and closed trades. NAV = live "capital" figure.
  Kraken and TradeStation/FTP connectors exist but the self-service connection UI
  only supports `oanda | kraken | manual`.
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
design — **its own sessions**. Signing in to the main portal grants nothing at
`/employee`, and an employee session grants nothing in the main portal. They
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
  load in a **new tab**, so the portal stays where it was, the new tab gets no
  `window.opener` handle back into the signed-in portal, and no referrer leaks.
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
   main portal is unaffected.
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
database so a restart does not hand out a fresh budget. The main portal still has
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
in **`users.avatar`** — the same column the main portal uses, so one person has
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

**Its own design language.** The employee portal does **not** use the main
portal's theme. `src/employee/theme.ts` stands alone — a warm-sand page
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
edit the source and deploy. (This mirrors the main portal — see "Coded copy is
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
  section above. None of it applies to the main portal's `vts_session`.)
- **Key rotation caveat:** `SESSION_SECRET` signs cookies; `CREDENTIALS_KEY`
  (or, if unset, a key derived from `SESSION_SECRET`) encrypts broker creds.
  Rotating either **invalidates all sessions and makes stored broker creds
  undecryptable** — re-enter creds after a rotation.
- **Demo** (`demo/`): username `demo`, roles `['trading','studies']`, own team.
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

## Environment variables

Validated in `config.ts` (Zod) unless noted. Most are optional with sane
defaults; the app runs locally with almost nothing set.

- **Core:** `NODE_ENV`, `PORT` (default 4000; Railway sets it), `WEB_ORIGIN`
  (CORS), `DATABASE_URL` (default `file:./data/vts.db`), `SESSION_SECRET`
  (**required in production**, ≥16 chars; dev falls back to an insecure default),
  `SESSION_TTL_DAYS` (14), `COOKIE_SECURE` (`true` only over HTTPS),
  `CREDENTIALS_KEY` (broker-cred encryption; falls back to `SESSION_SECRET`).
- **AI:** `ANTHROPIC_API_KEY` (absent = AI off), `ANTHROPIC_MODEL_DEFAULT`,
  `ANTHROPIC_MODEL_ANALYSIS`, `AI_MONTHLY_LIMIT` (1000), `AI_RATE_PER_MIN` (15).
- **Webhooks:** `TRADINGVIEW_WEBHOOK_SECRET`, `TV_WEBHOOK_SECRET` (each unset =
  that webhook rejects everything).
- **Brokers** (env-config path; also seedable per-user in the UI): `OANDA_API_TOKEN`,
  `OANDA_ACCOUNT_ID`, `OANDA_ENV` (`practice`/`live`), `KRAKEN_API_KEY/SECRET`,
  `TRADESTATION_*`, `FTP_API_URL/TOKEN/ACCOUNT_ID`.
- **Feeds:** `FINNHUB_API_KEY`, `RSS_NEWS_ENABLED`, `NEWS_AI_SUMMARY_ENABLED`,
  `FOREX_FACTORY_ENABLED`, `TRUTH_ENABLED`, `TRUTH_ACCOUNT_ID`, `DESK_WATCH_SECONDS`.
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
  — the main portal is unaffected). Every default is the strict value.
- **First-boot admin seed** (read directly via `process.env`, not in the schema):
  `ADMIN_USERNAME` (default `andrew`), `ADMIN_DISPLAY_NAME`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD` (blank = random, printed once to logs), `APP_EMAIL_DOMAIN`.

`.env.example` is the fullest list, but note it and `config.ts` have drifted —
some documented vars aren't in the schema and vice-versa.

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
  states, static captions, on both the main portal and the Employee Portal) is
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
- **Naming the AI — always "VTS AI":** in all user-facing copy (labels, blurbs,
  buttons, empty/loading states, prompts the user reads), refer to the portal's
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

## Verifying changes

Run before merging (both must pass):

- Typecheck: `npm run typecheck` (root; api + web). Single workspace:
  `npm --workspace @vts/api run typecheck` / `@vts/web`.
- Build: `npm run build` (api `tsc` + web `vite build`). The web build emits
  **two** HTML entries — `dist/index.html` and `dist/employee.html`; if the
  latter is missing, `/employee` serves a plain "not built" 404.

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

This is a **private web portal** for a single owner — there is no external
review step and no other users to protect from a bad merge. Because of that:

- **Always deploy automatically.** When work on a feature branch is complete
  and verified (typecheck + build pass), open a PR to `main` and merge it
  without waiting for approval. Merging to `main` is the deploy — Railway
  auto-redeploys `main` per `railway.json`.
- **Never ask the owner to check, review, or approve a PR** before merging,
  and never end a task by asking whether to deploy. Just deploy.
- Still verify before merging: run the web `typecheck` and `build` (and any
  relevant API checks) and only merge when they pass. Automatic deploy does
  not mean skipping verification.
- If a build or verification step **fails**, do not merge — report the failure
  instead. Railway keeps the previous version live on a failed build.

## Deploy mechanics

- Railway builds and deploys whatever is on `main` (`npm install && npm run
  build`, then `npm run start`, health-checked at `/api/health`). There is no
  manual deploy button or Railway CLI in this environment — merging to `main`
  is the only deploy trigger.
- Prefer **squash merges** to keep `main` history clean.

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
for a dense row). Everything is **Eastern Time**, matching session windows,
market hours and trade codes, so a stamp means the same instant to every
teammate. Current call sites: `TradeCard` (Live Wall + the Master board's
Positions tile), `TradeLog` (deck cards + tape rows), `History`, `Funded`,
`FundedLiveTrades`, `DeletedTrades`, `PositionsTile`'s compact list,
`BrokerConnectionsPanel`'s manual-position editor, and the Scriptable iOS widget
script in `DeviceSettings.tsx` (which carries its own copy of the formatter, since
it is a standalone script). **A new position surface must show them too** — use
this module rather than formatting a date locally.

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
