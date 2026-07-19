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

## Architecture

Monorepo, **npm workspaces**:

- `apps/api` — **Fastify + TypeScript** backend. Holds all secrets; the browser
  never sees broker keys, the Anthropic key, or password hashes. In production
  it also serves the built web app (`@fastify/static`) — one process, same
  origin, so the API and site share a host.
- `apps/web` — **Vite + React 18 + TypeScript** frontend. Styling is
  inline-style / theme-token based (`src/theme`), **not** a CSS framework.

Tech:

- **DB:** SQLite via **Drizzle ORM** on the **libsql** driver (`@libsql/client`);
  file at `DATABASE_URL` (default `file:./data/vts.db`; prod uses a Railway
  volume). Schema in `apps/api/src/db/schema.ts`; ~57 SQL migrations in
  `apps/api/migrations` (`db:migrate`), seed with `db:seed`. Per-user deletes
  are **explicit** in `admin/service.ts` (no `ON DELETE CASCADE`) — when you add
  a per-user table, add it to that delete list too.
- **Auth:** username/password, **argon2id** (`@node-rs/argon2`), signed
  **httpOnly** session cookies, role-based access. See `apps/api/src/auth`.
- **AI:** Claude via `@anthropic-ai/sdk`, server-side only (`apps/api/src/ai`).
- **Secrets at rest:** broker credentials are AES-256-GCM encrypted
  (`security/secretbox.ts`).
- **Notifications:** web push (VAPID, `web-push`) and **Pushover**.

### Where things live

- API modules: `apps/api/src/{admin,ai,auth,badges,chat,demo,earlyAccess,feedback,notifications,patchNotes,security,settings,studies,teams,todo,trading}`.
  Routes in `apps/api/src/routes/*`, registered in `server.ts` (health, auth,
  admin, earlyAccess, brokers, trading, webhooks, tvWebhook, todo, ai, chat,
  feedback, studies, push, pushover, content).
- Web shell: `apps/web/src/components` (`Portal.tsx` is the router/shell,
  `Sidebar.tsx`, `TopBar.tsx`, `AskClaudePanel.tsx`, `TeamChat.tsx`,
  `UpdatePrompt.tsx`, `InstallPrompt.tsx`, …).
- Web features: `apps/web/src/workspaces/{trading,studies,admin,help}`.
- Web API client: `apps/web/src/api/client.ts` — one flat typed `api` object;
  every call is cookie-authed (`credentials: 'include'`), root-relative `/api`,
  throws `ApiError { status }` on non-2xx.
- **Navigation is data-driven:** `apps/web/src/theme/nav.ts` is the source of
  truth for workspaces, sidebar sections, order, icons, and role gates. Section
  `key`s are the screen keys switched in `Portal.tsx` (`renderScreen` /
  `renderExtra`).

## Workspaces & sections (`theme/nav.ts`)

Sections a user lacks the role for are hidden. **My Portal is pinned to the very
top of the workspaces list** (see `theme/nav.ts` order).

- **Trading** (gold): Live Wall, Trading Alerts (`alerts`), Trade Desk (`desk` — merges Trade Log +
  History + Live Brokers; legacy keys `log`/`history`/`metrics` alias into it),
  Strategy Sessions (`sessions` — per-weekday ET windows with a Bull/Bear/Two-way
  bias; each session picks its own Mon–Fri days + hours, or is filled to the
  instrument's full market hours via the `/api/trading/market-hours` AI lookup.
  Open/close/pre-open notifications are opt-in from Trading Alerts — see below),
  Manual Trades (`funded` key, `FundedScreen`), **Funded**
  (`prop` key — role-gated prop-firm challenge dashboard), Market News, To Do.
- **Studies** (violet): Subjects (`st_home`), Study Game (`st_game`), Flashcards
  (`st_cards`), Practice Tests (`st_test`), Study Presentations (`st_guides`),
  Progress (`st_progress`), Study Creation (`st_decks` — **last**). **All study content is
  team-built** — there is no hardcoded subject. **Study Game / Test Mode /
  Progress** are the same launcher (`StudyGameHub`, parameterized by `target` =
  `play` | `test` | `progress`): each lists your team's own study games and, when
  you pick one, opens the chosen experience — the quiz+leaderboard player
  (`TeamStudyGame`), a graded test (`DeckTestMode`, configurable size + pass line),
  or a progress summary (`DeckProgress`). **Flashcards** (`FlashcardsHub`) is the
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
- **Admin** (rose): Users, Teams, Badges, AI Instructions, Patch Notes, Site
  Wording, Early Access, View as role, Suggestions, Bug Reports. **Admins only.**
- **Developer Portal** (`founder` key/role, amber): AI Instructions, Site Wording,
  View as role. **Founder-level only** (`isFounder`). Displayed as "Developer
  Portal"; the internal key and role are still `founder` (unchanged gating).

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

## AI / Ask Claude (`apps/api/src/ai`)

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
  - `global` — Ask Claude base persona. `routes/ai.ts` substitutes `{workspace}`
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
  per-weekday ET schedule so a Strategy Session can be filled to "all open market
  hours". Metered against the AI cap (kind `market_hours`); 503 when AI is off.

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
  throttle are the only rate limits.
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
  deep-linking, refresh-persistence, or browser back/forward**. `Screen`
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
  where a key already exists.
- **Inline editable wording (`<EditableText>`) — REQUIRED for all new coded copy.**
  Every hardcoded, site-coded string (screen titles, subtitles, blurbs, button
  labels, empty/loading/error states, static captions) must be wrapped in
  `<EditableText id="…">` from `apps/web/src/copy/SiteCopy.tsx`. This makes it
  admin-editable live from the floating admin-shield button beside the corner chat
  bubble (admins only) — click it to enter edit mode, then click any highlighted
  string to reword it, or **Hide** it (renders as nothing for everyone until
  reset). The edit stores an override in `app_settings` under `copy.<id>`
  (routes in `routes/content.ts`, served to everyone via `GET /api/site-content`,
  written via `PUT/DELETE /api/admin/site-content/copy/:key`). Rules:
  - Wrap it: `<EditableText id="alerts.title">Live Alerts</EditableText>`, or use
    the `text={expr}` form when the string is a variable. The bundled text stays
    the default; a blank/identical override clears it.
  - **id** is a globally-unique dotted key, `<screenslug>.<slug>` (lowercase, dots
    / underscores), e.g. `desk.empty`, `admin.users.title`.
  - **Never wrap** user/team-created data (deck/team/user names, tickers, message
    bodies), live figures (prices, P&L, counts, dates/times), interpolated strings,
    or paragraphs containing embedded markup like `<strong>`. It is only for text
    coded into the site.
  - When you build any new screen or component, wrap its coded copy this way by
    default — this is a universal, site-wide expectation, not opt-in.
- Keep the plain, terminal-style voice in UI copy and AI prompts.

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
- Build: `npm run build` (api `tsc` + web `vite build`).

Run `npm install` first in a fresh container.

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
