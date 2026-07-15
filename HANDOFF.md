# VTS Portal — Handoff for a New Claude Chat

Paste this whole file into a new chat to continue work on the VTS Portal. It is
everything a fresh Claude needs to be productive immediately: what the app is,
how it's built, the conventions you must follow, the workflow the owner expects,
and where each workspace stands today.

> **How to use this handoff:** tell the new chat *what you want built or changed*
> (e.g. "add X to the Trading Trade Desk", "build out the LLC Documents tab").
> This file gives it the context; your message gives it the task.

_Last refreshed: July 15, 2026 · App version **Beta V 2.7** · Migrations through
**0042**._

---

## 1. What this project is

**VTS Portal** — a private, dark "pro-terminal" web app for one owner (Andrew)
plus a small number of admin-created users. One login fronts several workspaces,
each with its own theme and sub-tabs:

- **Trading** — a real trading desk: Live Wall, Alerts, Trade Desk, Strategy
  Sessions, Funded (prop-challenge tracking), Market News, and a Trading To-Do.
  Wired to broker keys (OANDA, Kraken, TradeStation, FTP Match-Trader),
  TradingView webhook alerts, live prices, and push notifications.
- **Kia Sales** — a car-salesperson performance tracker (deals, commission, unit
  goals, bonus tiers, Google-review gating, monthly history, editable pay plan),
  plus Kia News and Product Knowledge tabs.
- **Studies** — a gamified **Series 65 Study Game** (400-question bank, exam-
  weighted categories, a level ladder with per-level page recolor, prestige,
  lifetime-accuracy scoring vs a 72% pass line, mock tests, starred questions,
  per-question "More Details"/multi-turn "Ask Claude" tutor), vocab flashcards,
  a Subjects hub, and a Progress screen.
- **To Do** — per-user task lists that start empty.
- **Wealth** (Vitalis Retirement & Wealth Management) — the owner's RIA portal:
  Overview, Clients (per-user, privacy-masked, add/edit/remove with undo),
  Portfolios, Planning, Compliance.
- **Finance** — personal finance: Overview, Expenses, Net Worth.
- **Vitalis Trading Systems LLC** — company admin workspace: Overview, Documents,
  Members, Contractors, Compliance & Filings, Accounts & Banking, Legal &
  Contracts. (Newest workspace; several tabs are still thin — good build targets.)

Cross-cutting features: multi-user isolated data, admin-managed accounts &
granular roles (incl. **permanent account deletion**), a privacy/demo mode that
masks names/contacts/dollar amounts, per-page "?" tutorials, an in-app patch-
notes/help hub, web-push notifications (VAPID + Pushover), and an undo bar on
list removals.

---

## 2. Repo layout & stack

Monorepo (npm workspaces):

- **`apps/web`** — Vite + React 18 + TypeScript.
  - **100% inline `style` objects.** There are **no CSS classes for layout**.
    `global.css` holds only base styles + keyframes. Theme objects live in
    `src/theme/themes.ts`.
  - Because inline styles can't use media queries, responsiveness is done in JS
    via `useResponsive()` (`src/hooks/useMediaQuery.ts`) →
    `{ isPhone (<=480), isTablet (<=768) }`.
  - React context providers wrap the Portal: `PrivacyProvider/usePrivacy`
    (`src/privacy/privacy.tsx`) and `DealershipProvider/useDealership`
    (`src/workspaces/kia/dealership.tsx`). Both persist to `localStorage`.
  - `src/hooks/useUndo.ts` + `src/components/UndoBar.tsx` power undo.
  - Heavy screens are code-split with `React.lazy` in `components/Portal.tsx`,
    wrapped in an `ErrorBoundary` that recovers from stale-chunk fetch failures
    after a redeploy. Follow that pattern for any large data-heavy screen.
- **`apps/api`** — Fastify 5 + Drizzle ORM + `@libsql/client` (SQLite).
  - argon2 password hashing, server-side session cookies (only the SHA-256 of
    the token is stored), Zod validation on every route.
  - Money is stored as **integers**: percentages in **basis points** (1350 =
    13.5%), dollars as **whole dollars**.
  - Secrets (broker keys, Anthropic key, VAPID/Pushover, TradingView webhook
    secret) live only in `apps/api/.env` — never sent to the browser. See
    `.env.example` for every variable.
  - Service dirs: `admin/ ai/ auth/ chat/ demo/ finance/ kia/ notifications/
    studies/ todo/ trading/ wealth/`. Routes: `apps/api/src/routes/*.ts`.

### Commands (run from repo root)
```bash
npm install                                 # first thing in a fresh container
npm run typecheck                           # tsc --noEmit for api + web
npm run build                               # api build + web vite build (incl. tsc)
npm run db:migrate --workspace @vts/api     # apply migrations to the DB
npm run dev                                 # api + web together (localhost:5173)
```
The API also runs migrations automatically on boot.

---

## 3. Conventions you MUST follow

- **Inline styles only** in web code; match the surrounding dark theme for that
  workspace. Each workspace has its own palette in `src/theme/themes.ts`
  (`THEMES`, `BRAND`, `TABS`, `DEFAULT_SCREEN`). Trading is navy/gold (accent
  `#EBCB74`). **No CSS-class refactors.**
- **Responsive via `useResponsive()`**, never CSS media queries. On mobile,
  watch for iOS input zoom (use ≥16px font on inputs/textareas) and off-screen
  dropdown clipping — both have bitten this repo before.
- **Drizzle migrations come in pairs:** add the `.sql` file in
  `apps/api/migrations/` **and** a matching entry in
  `apps/api/migrations/meta/_journal.json` (increment `idx`, `tag` == filename
  without extension). **The latest is `idx: 42`, `0042_trading_be_overrides`, so
  the next migration is `0043_*` / `idx: 43`.** Copy an existing migration's
  CREATE TABLE format.
- **Money math:** percent→bp is `Math.round(pct * 100)`; store dollars rounded to
  whole numbers. Privacy/demo mode masks dollar amounts — honor it everywhere.
- **Per-user everything.** Every per-user row is keyed by `userId`; new users
  start empty. Copy the seed pattern from `apps/api/src/kia/service.ts` or the
  seed-free pattern in `apps/api/src/wealth/service.ts`. If data is shared
  (e.g. the owner's single trading desk) rather than per-user, decide that
  explicitly and document it.
- **RBAC.** Role keys live in `apps/api/src/auth/rbac.ts` (`ROLE_KEYS`):
  `admin, trading, trading_viewer, sales, studies, todo, wealth, finance`.
  `admin` grants everything. Routes go behind `requireWorkspace('<ws>')`. The
  **`trading_viewer`** role is **read-only** (`isWorkspaceReadOnly`) — viewers
  must never mutate. The **`viewBrokerage`** flag gates whether balances/account
  detail are shown.
- **Verify before merging:** `npm run typecheck` + `npm run build`, and for DB
  changes run the migration chain on a throwaway SQLite file and exercise the
  service functions with a quick `tsx` script (delete the script afterward —
  don't commit scratch files). Set `DATABASE_URL=file:/tmp/.../scratch.db` and
  `SESSION_SECRET=test-secret-1234567890` when running scripts.
- **Revert `package-lock.json` churn** before committing (`npm install` rewrites
  it; `git checkout -- package-lock.json`).
- **Common Trading palette:** `GOLD #EBCB74`, `GOLD2 #C9A24B`; status
  `GREEN #35c47b`, `AMBER #e0a23a`, `RED #ef5468`; text `#eef3ff`, muted
  `#9fb0d6`/`#8ea3cc`, navy panels `rgba(11,26,58,.5)`. Other workspaces have
  their own palettes in `themes.ts`.
- **Version pill / patch notes:** on any user-visible change, bump `APP_VERSION`
  and prepend a `PATCH_NOTES` entry in `apps/web/src/meta/version.ts` (top-bar
  pill and the help hub both read from it).

---

## 4. Workflow directives (from the owner — keep honoring these)

> "Whatever is the fastest process flow. I'm okay with giving you creative
> control, then I make adjustments from there." · "When I give you ideas, you
> don't have to do it then and there, continue the most efficient process flow."

In practice:

1. **Batch ideas, keep moving.** Don't stop and ask on every idea; pick the
   fastest path and build. Only stop for genuinely ambiguous or destructive
   decisions. Keep questions short (TLDR) via the `AskUserQuestion` tool.
2. **Auto-deploy when done.** Per `CLAUDE.md`: this is a private single-owner
   portal with no review step. When a feature is complete **and verified**
   (typecheck + build pass), open a PR to `main` and **squash-merge it without
   waiting for approval** — merging to `main` is the deploy (Railway
   auto-redeploys `main`). **Never ask the owner to review/approve a PR.** If a
   build/verify step **fails, do not merge** — report the failure (Railway keeps
   the previous version live).
3. **Per-feature branch → PR → squash-merge to `main`.** Sync local `main` after
   each merge. Use the branch the harness assigns you; never push elsewhere
   without permission.
4. **Report concisely** what shipped + how it was verified.

### Git / environment specifics
- Remote, ephemeral container; the repo is cloned fresh per session — **commit &
  push or it's lost.** Run `npm install` first.
- **GitHub is reached only through `mcp__github__*` MCP tools** (load them with
  `ToolSearch`; the `gh` CLI is **not** available). Repo scope:
  `andrewr92896-ship-it/vts-portal`. You can open and squash-merge PRs with
  these tools.
- **Commit message footer** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/<your session url>
  ```
- **PR body footer:** the `🤖 Generated with Claude Code` line + session URL.
- **Never** put the model identifier in commits/PRs/code — chat replies only.
- **Headless Chromium / browser repro is blocked** by the network policy → you
  cannot screenshot. Verify by reasoning + typecheck/build + throwaway-DB `tsx`
  scripts.
- The owner views a **deployed site that runs `main`**, so a feature isn't
  visible to him until its PR is merged to `main` and the site redeploys.

---

## 5. Current state per workspace (as of this handoff)

Everything below is **built and wired** into `Portal.renderScreen` unless noted.
Sub-tabs are defined in `TABS` in `src/theme/themes.ts`.

- **Trading** (`workspaces/trading/`) — most built-out area. Screens: `LiveWall`,
  `Alerts`, `TradingDesk` (+ `DeskSettingsModal`, break-even buffer modes/
  overrides), `StrategySessions`, `Funded`/`FundedScreen`, `TradeLog` +
  `History`, `MarketNews`, `TradingTodo`, `LiveBrokers`/`BrokerConnections`.
  Helpers: `pips.ts`, `outcome.ts`, `newsRelevance.ts`, `useLivePrices.ts`.
  Backed by `apps/api/src/trading/` + routes `trading.ts`, `brokers.ts`,
  `tvWebhook.ts`. Reads real broker/TradingView/Finnhub data when keys are set.
- **Kia Sales** (`workspaces/kia/`) — `KiaDashboard` (deals, KPIs, pace, bonus
  tiers, editable pay plan, split commission), Kia News, Product Knowledge, Kia
  To-Do. Backed by `apps/api/src/kia/`.
- **Studies** (`workspaces/studies/`) — Series 65 Study Game, mock tests
  (`st_test`), Flashcards, Progress, Subjects hub. `React.lazy` code-split.
  Backed by `apps/api/src/studies/` + AI tutor via `apps/api/src/ai/`.
- **To Do** (`td_all`) — per-user tasks. Backed by `apps/api/src/todo/`.
- **Wealth** (`workspaces/wealth/`) — `WealthOverview`, `WealthClients`,
  `WealthPortfolios`, `WealthPlanning`, `WealthCompliance`. Backed by
  `apps/api/src/wealth/`.
- **Finance** (`workspaces/finance/`) — `FinanceOverview`, `FinanceExpenses`,
  `FinanceNetWorth`. Backed by `apps/api/src/finance/`.
- **LLC** (`workspaces/llc/LlcWorkspace.tsx`) — newest workspace; 7 tabs defined
  (Overview, Documents, Members, Contractors, Compliance & Filings, Accounts &
  Banking, Legal & Contracts). Several tabs are still thin — **good candidates
  for the next build.**

**No open PRs assumed** — check `list_pull_requests` before starting. Latest
merged work (recent commits): Live Wall header cleanup (#122), Study Game
question persistence (#121), per-instrument break-even buffers (#117/#118),
Trade Log profit factor + CSV export (#112).

---

## 6. Key files to read first

**Shell / cross-cutting**
- `apps/web/src/components/Portal.tsx` — `renderScreen` switch + `React.lazy`
  code-splitting + `ErrorBoundary`; `onNavigate` prop pattern.
- `apps/web/src/theme/themes.ts` — `THEMES`, `BRAND`, `TABS`, `DEFAULT_SCREEN`,
  `WORKSPACE_LABELS`, `WorkspaceKey`.
- `apps/web/src/meta/version.ts` — `APP_VERSION` + `PATCH_NOTES`.
- `apps/api/src/auth/rbac.ts` — roles, `requireWorkspace`, `isWorkspaceReadOnly`,
  `canAccessWorkspace`, `viewBrokerage`.
- `apps/web/src/privacy/privacy.tsx`, `hooks/useUndo.ts`,
  `components/UndoBar.tsx`, `hooks/useMediaQuery.ts`.
- `apps/api/src/db/schema.ts` — all tables (add new tables here).

**Reference patterns to copy**
- Richest service: `apps/api/src/kia/service.ts` + `routes/kia.ts` (per-user,
  per-month ET, undo, settings). Simpler list+summary+undo:
  `apps/api/src/wealth/service.ts`. Multi-table transaction:
  `apps/api/src/admin/service.ts` `deleteUser`.
- Screen UI patterns: `workspaces/kia/KiaDashboard.tsx`,
  `workspaces/wealth/WealthClients.tsx`, `workspaces/studies/StudyGame.tsx`,
  `workspaces/trading/TradingDesk.tsx`.

**Companion doc:** `PROJECT_LOG.md` records earlier build history (now partly
superseded by this file — trust this handoff for current state).
