# VTS Portal — Handoff for a New Claude Code Chat

Paste this whole file into a new chat to continue work. It is everything a fresh
Claude needs to be productive immediately. (A companion file, `PROJECT_LOG.md`,
records *everything already built* — read that for history; read this for how to
work and what's next.)

**This chat's focus: build out the Trading tab until it is done.** See §6.

---

## 1. What this project is

**VTS Portal** — a private, dark "pro‑terminal" web app for one owner
(Andrew) and a small number of admin‑created users. It bundles several
workspaces behind one login:

- **Trading** — broker status dashboard (read‑only "Viewer" role allowed).
  **Currently all placeholder screens — this is the next big build (see §6).**
- **Kia Sales** — a car‑salesperson performance tracker (deals, commission, unit
  goals, bonus tiers, Google‑review gating, monthly history, editable pay plan).
- **Studies** — a gamified **Series 65 Study Game** (400‑question bank, exam‑
  weighted categories, per‑category levels/prestige, last‑100 scoring vs a 72%
  pass line, per‑question explanations) with a vocabulary **Flashcards** view
  folded in, plus a **Study Hub** and **Progress** screen.
- **To Do** — per‑user task lists that start empty.
- **Vitalis Retirement & Wealth Management** — the owner's future RIA portal.
  The **Clients** management list is built (per‑user, privacy‑masked, add/edit/
  remove with undo). Other Wealth tabs (Overview, Portfolios, Planning,
  Compliance) are still placeholders.

Cross‑cutting features: multi‑user isolated data, admin‑managed accounts &
granular roles (incl. **permanent account deletion**), a privacy/demo mode that
masks names/contacts/dollar amounts, per‑page "?" tutorials, and an undo bar on
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
  - Heavy screens are code‑split with `React.lazy` in `components/Portal.tsx`
    (the Studies screens are lazy so the 400‑question data stays out of the main
    bundle). Follow that pattern for any large Trading data.
- **`apps/api`** — Fastify 5 + Drizzle ORM + `@libsql/client` (SQLite).
  - argon2 password hashing, server‑side session cookies (only the SHA‑256 of
    the token is stored), Zod validation on every route.
  - Money is stored as **integers**: percentages in **basis points** (1350 =
    13.5%), dollars as **whole dollars**.

### Commands (run from repo root)
```bash
npm install                                 # first thing in a fresh container
npm run typecheck --workspace @vts/api      # tsc --noEmit
npm run build --workspace @vts/web          # vite build (includes tsc)
npm run db:migrate --workspace @vts/api     # apply migrations to the DB
```
The API also runs migrations automatically on boot.

---

## 3. Conventions you MUST follow

- **Inline styles only** in web code; match the surrounding dark theme. The
  Trading theme is navy/gold (accent `#EBCB74`); see `THEMES.trading` in
  `src/theme/themes.ts`. No CSS‑class refactors.
- **Responsive via `useResponsive()`**, never CSS media queries.
- **Drizzle migrations come in pairs:** add the `.sql` file in
  `apps/api/migrations/` **and** add a matching entry to
  `apps/api/migrations/meta/_journal.json` (increment `idx`, keep `tag` ==
  filename without extension). **The latest is `idx: 8`, `0008_wealth_clients`,**
  so the next Trading migration is `0009_*` / `idx: 9`. CREATE TABLE format:
  copy an existing migration (e.g. `0008_wealth_clients.sql`).
- **Money math:** percent→bp is `Math.round(pct * 100)`; store dollars rounded to
  whole numbers.
- **Per‑user everything.** Every per‑user row is keyed by `userId`; new users
  start empty (copy the `seedUser`/`ensure*Seed` pattern in
  `apps/api/src/kia/service.ts`, or the seed‑free pattern in
  `apps/api/src/wealth/service.ts`). If Trading data is shared (e.g. one set of
  broker accounts the owner watches) rather than per‑user, decide that explicitly
  and document it.
- **RBAC for Trading:** routes go behind `requireWorkspace('trading')`. The
  **`trading_viewer`** role is **read‑only** (see `isWorkspaceReadOnly` in
  `apps/api/src/auth/rbac.ts`) — viewers must not be able to mutate. The
  **`viewBrokerage`** flag on the user gates whether balances/account detail are
  shown. Privacy/demo mode masks dollar amounts; honor it.
- **Verify before merging:** API typecheck + web build, and for DB changes run
  the migration chain on a throwaway SQLite file and exercise the service
  functions with a quick `tsx` script (delete the script afterward — don't commit
  scratch files). Set `DATABASE_URL=file:/tmp/.../scratch.db` and
  `SESSION_SECRET=test-secret-1234567890` when running scripts.
- **Revert `package-lock.json` churn** before committing (`npm install` rewrites
  it; `git checkout -- package-lock.json`).
- Common palette: Trading `GOLD #EBCB74`, `GOLD2 #C9A24B`; status `GREEN #35c47b`,
  `AMBER #e0a23a`, `RED #ef5468`; text `#eef3ff`, muted `#9fb0d6`/`#8ea3cc`,
  navy panels `rgba(11,26,58,.5)`. (Other workspaces have their own palettes.)

---

## 4. Workflow directives (from the owner — keep honoring these)

> "Whatever is the fastest process flow. I'm okay with giving you creative
> control, then I make adjustments from there." · "When I give you ideas, you
> don't have to do it then and there, continue the most efficient process flow."

In practice:

1. **Batch ideas, keep moving.** Don't stop and ask on every idea; pick the
   fastest path and build. Only stop for genuinely ambiguous or destructive
   decisions.
2. **Per‑feature branch → PR → squash‑merge to `main`.** Established, owner‑
   approved flow (PRs #13–#17 all squash‑merged to `main`). Sync local `main`
   after each merge. Use the branch the harness assigns you; never push to a
   different branch without explicit permission.
3. **TLDR when asking the owner.** He asked that every question be short — use the
   `AskUserQuestion` tool with brief options.
4. **Report concisely** what shipped + how it was verified.

### Git / environment specifics
- Remote, ephemeral container; the repo is cloned fresh per session — **commit &
  push or it's lost.** Run `npm install` first.
- **GitHub is reached only through `mcp__github__*` MCP tools** (load them with
  `ToolSearch`; the `gh` CLI is **not** available). Repo scope:
  `andrewr92896-ship-it/vts-portal`. You can open and **squash‑merge** PRs with
  these tools (done for #17).
- **Commit message footer** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/<your session url>
  ```
- **PR body footer:** the `🤖 Generated with Claude Code` line + your session URL.
- **Never** put the model identifier in commits/PRs/code — chat replies only.
- **Headless Chromium is blocked** by the network policy → you cannot screenshot
  or browser‑repro. Verify by reasoning + typecheck/build + throwaway‑DB scripts.
- The owner views a **deployed site that runs `main`**, so a feature isn't
  visible to him until its PR is merged to `main` and the site redeploys.

---

## 5. Current state (as of this handoff)

- **Everything is merged to `main`** (latest: PR **#17**, squash commit, "Wealth
  Clients, account deletion, Series 65 Study Game, Alpha V 1.0"). No open PRs.
- Version pill in the top bar reads **Alpha V 1.0** (`components/TopBar.tsx`).
- Migrations applied: **`0000`–`0008`** (next is `0009`).
- Recently shipped (all live on `main`): Vitalis Wealth **Clients** list; admin
  **permanent account deletion** (with cascade cleanup + guards); the gamified
  **Series 65 Study Game** + vocab flashcards + Study Hub + Progress; Studies
  data **code‑split**; two mis‑keyed Series 65 questions corrected (Q55, Q176).

---

## 6. Next task — build out the **Trading** tab (until done)

**Goal:** turn the Trading workspace from placeholders into a working dashboard.
Build it stage by stage, branch → PR → squash‑merge per stage; keep going until
the owner says it's done.

### What exists today (all placeholder)
- **Tabs** (`TABS.trading` in `src/theme/themes.ts`): `live` Live Wall, `log`
  Trade Log, `sessions` Strategy Sessions, `metrics` Account Metrics, `news`
  Market News, `history` History, `td_trading` To Do. Default screen is `live`.
- **Screens** are branded stubs rendered by `apps/web/src/workspaces/Screens.tsx`
  (the `SCREENS` map has each one's intended blurb). None are wired in
  `Portal.renderScreen` yet — add `case`s there as you build real screens (see
  how Kia/Wealth/Studies are wired).
- **Backend:** `apps/api/src/routes/brokers.ts` exposes
  `GET /api/brokers/status`, guarded by `requireWorkspace('trading')`. It returns
  four hard‑coded brokers — **FTP** (Funded Trading Plus, Match‑Trader, funded
  prop), **OANDA** (forex), **Kraken Pro** (crypto), **TradeStation** (stocks) —
  all with `status: 'unconfigured'`, `balance: null`, `lastSyncAt: null`, and a
  `stage: 1` note. The **TopBar** renders these as colored status dots (Trading
  only). There are **no trading DB tables or services yet.**
- **RBAC:** `trading` (full) and `trading_viewer` (read‑only) roles;
  `viewBrokerage` flag gates balances. `api/types.ts` already has a
  `BrokerStatus` type and `api.brokerStatus()` client method.

### Intended functionality (from the prototype blurbs in `Screens.tsx`)
- **Live Wall** — live trade cards: planned entry vs actual fill, slippage, TP,
  SL, strategy, timeframe, lots — "streamed from the brokers."
- **Trade Log** — full fill history with **Deck** and **Tape** layouts; computed
  slippage vs the alert price per trade.
- **Strategy Sessions** — active/opening/closing strategy windows with bull/bear
  playbooks per instrument.
- **Account Metrics** — an **FTP challenge** dashboard: $200K account, 10% target,
  4% daily and 6% trailing drawdown, live equity.
- **Market News** — market/geopolitical headlines with impact & bias tags, plus
  an economic calendar in **Eastern Time**.
- **History** — historical performance, closed trades, per‑strategy results.
- **To Do** — Trading tasks, also visible in the full To Do workspace (mirror
  `KiaTodo`).

### Suggested approach (confirm scope with the owner first — TLDR)
1. **Decide data source.** Real broker APIs need keys in `apps/api/.env` and
   outbound network (likely blocked here) — so the practical first cut is
   **owner‑editable / seeded mock data** persisted in SQLite, structured so a
   live feed can replace it later. **Ask the owner (TLDR):** real broker
   integration now vs. mock/manual data first, and which screen to build first.
2. **Model the data** (new `0009_*` migration + journal entry): e.g.
   `trading_accounts` (per broker: equity, balance, the FTP challenge params),
   `trades` (instrument, side, planned vs fill price, slippage, TP/SL, strategy,
   timeframe, lots, status open/closed, opened/closed timestamps),
   `strategies`/`sessions`, and optionally `news`. Decide **per‑user vs shared**
   (the owner is the main trader — shared/owner‑scoped may fit better than
   per‑user; document the choice). Mind Eastern‑Time bucketing like Kia.
3. **API services + routes** under `requireWorkspace('trading')`; **enforce
   read‑only for `trading_viewer`** (no writes) and gate balances behind
   `viewBrokerage`. Copy the service/route shape from
   `apps/api/src/kia/service.ts` + `routes/kia.ts` or `wealth/`.
4. **Web screens** wired into `Portal.renderScreen`, inline‑styled in the navy/
   gold Trading theme, responsive, privacy‑masked dollars, undo on removals.
   Reference UIs: `workspaces/kia/KiaDashboard.tsx`,
   `workspaces/wealth/WealthClients.tsx`, `workspaces/studies/StudyGame.tsx`.
   Replace each placeholder one screen at a time.
5. **Tutorials:** add `live`/`log`/`sessions`/`metrics`/`news`/`history` entries
   to `apps/web/src/help/tutorials.ts` as each screen ships.
6. **Verify** (typecheck + build + throwaway‑DB `tsx` script for any DB work),
   then branch → PR → squash‑merge. Repeat per stage until done.

### Backlog the owner has floated (after / alongside Trading, confirm priority)
- ~~Kia "Ask Claude" command bar (currently a disabled placeholder on the Kia
  dashboard).~~ Done — `POST /api/kia/command` (`apps/api/src/kia/command.ts`)
  parses natural-language instructions (add/edit/remove deal, set goal, set
  reviews, summary) and applies them; wired into the dashboard command bar.
- Remaining Wealth tabs (Overview, Portfolios, Planning, Compliance).
- Per‑page "?" tutorial polish.

---

## 7. Key files to read first

**Trading‑specific**
- `apps/web/src/workspaces/Screens.tsx` — the placeholder screens + their intended
  blurbs (the spec for what each Trading screen should become).
- `apps/api/src/routes/brokers.ts` — the broker status endpoint (4 brokers).
- `apps/web/src/components/TopBar.tsx` — broker status dots + the version pill.
- `apps/api/src/auth/rbac.ts` — `trading`/`trading_viewer`, `isWorkspaceReadOnly`,
  `canAccessWorkspace`, `viewBrokerage` gating.
- `apps/web/src/theme/themes.ts` — `THEMES.trading`, `TABS.trading`,
  `DEFAULT_SCREEN`, `BRAND.trading` (gold wordmark).
- `apps/web/src/api/{client,types}.ts` — `BrokerStatus`, `api.brokerStatus()`.

**Reference patterns to copy**
- `apps/api/src/db/schema.ts` — all tables (users, sessions, todo, kia_*,
  wealth_clients). Add Trading tables here.
- `apps/api/src/kia/service.ts` + `routes/kia.ts` — richest service: per‑user,
  per‑month (ET), undo, settings. `apps/api/src/wealth/service.ts` — simpler
  list+summary+undo. `apps/api/src/admin/service.ts` `deleteUser` — multi‑table
  transaction example.
- `apps/web/src/workspaces/kia/KiaDashboard.tsx` + `wealth/WealthClients.tsx` +
  `studies/StudyGame.tsx` — inline‑styled, responsive, privacy/undo UI patterns.
- `apps/web/src/components/Portal.tsx` — `renderScreen` switch (+ `React.lazy`
  code‑splitting), `onNavigate` prop pattern.
- `apps/web/src/privacy/privacy.tsx`, `hooks/useUndo.ts`,
  `components/UndoBar.tsx`, `hooks/useMediaQuery.ts`.
