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
with web push). There is no public sign-up; there is a single read-only **demo
account** used to show the app off.

## Architecture

Monorepo managed with **npm workspaces**:

- `apps/api` — **Fastify + TypeScript** backend. Holds all secrets; the browser
  never sees broker keys, the Anthropic key, or password hashes. In production
  it also serves the built web app (`@fastify/static`).
- `apps/web` — **Vite + React + TypeScript** frontend (React 18). Styling is
  inline-style / theme-token based (see `src/theme`), not a CSS framework.

Key tech:

- **Database:** SQLite via **Drizzle ORM** on the **libsql** driver
  (`@libsql/client`); file at `apps/api/data/vts.db`. Schema in
  `apps/api/src/db/schema.ts`; SQL migrations in `apps/api/migrations` (run with
  `db:migrate`, seed with `db:seed`).
- **Auth:** self-hosted username/password, **argon2id** hashing
  (`@node-rs/argon2`), signed **httpOnly** session cookies, role-based access
  control. See `apps/api/src/auth`.
- **AI:** Claude via `@anthropic-ai/sdk`, server-side only (`apps/api/src/ai`).
- **Notifications:** web push (VAPID, `web-push`) and **Pushover**.

### Where things live

- API feature modules: `apps/api/src/{admin,ai,auth,badges,chat,demo,earlyAccess,feedback,notifications,patchNotes,security,settings,studies,teams,todo,trading}`.
  HTTP routes are in `apps/api/src/routes/*` and registered in `server.ts`
  (health, auth, admin, earlyAccess, brokers, trading, webhooks, tvWebhook,
  todo, ai, chat, feedback, studies, push, pushover, content).
- Web shell: `apps/web/src/components` (`Portal.tsx`, `Sidebar.tsx`,
  `TopBar.tsx`, `AskClaudePanel.tsx`, `TeamChat.tsx`, …).
- Web features: `apps/web/src/workspaces/{trading,studies,admin,help}` plus
  `Screens.tsx`.
- **Navigation is data-driven:** `apps/web/src/theme/nav.ts` is the source of
  truth for workspaces, their sidebar sections, order, icons, and role gates.
  Section `key`s are the screen keys routed in `Portal.tsx`.

## Workspaces & sections (from `theme/nav.ts`)

Four workspaces show in the sidebar. Sections a user lacks the role for are
hidden.

- **Trading** (gold): Live Wall, Alerts, Trade Desk, Strategy Sessions, Manual
  Trades, **Funded** (role-gated prop-firm challenge dashboard), Market News,
  To Do. Trading also has live-broker (OANDA) capital, a trade log with
  slippage, TradingView webhook alerts, market news + economic calendar (ET),
  and a shared team To-Do.
- **Studies** (violet): Subjects (hub), Study Game, Test Mode, Progress, Study
  Creation, Study Guides. **Series 65** is the first/primary subject; its
  sections (`st_game`, `st_test`, `st_progress`) are hidden for teams not
  licensed for it (`SERIES65_ONLY_SECTIONS`). Leaderboards are scoped by
  trading team.
- **Site Help** (blue): How to, Announcements, Patch notes, Report a bug,
  Suggestion. Available to **every** signed-in user.
- **Admin** (pink): Users, Teams, Badges, AI Instructions, Patch Notes, Site
  Wording, Early Access, View as role, Suggestions, Bug Reports. Shown **only
  to admins**.

Removed and gone (do not reintroduce or reference): the standalone To-Do
workspace, Vitalis Wealth Management, Personal Finance, the Vitalis LLC business
workspace, and Kia Sales.

## Roles & access (`auth/rbac.ts`)

Granular, admin-assigned roles; a user may hold any combination:

- `admin` — everything, including user management.
- `trading` — full Trading access.
- `trading_viewer` — **read-only** Trading (the only workspace with a read-only
  variant).
- `funded` — reveals the private **Funded** prop-challenge section inside
  Trading (still needs Trading access to reach it). Never shown to the demo.
- `studies` — Studies access.

The **demo** account is public and read-only: every workspace it can reach is
read-only, and server-side `demoGuard` refuses writes regardless of the UI.

## AI / Ask Claude (`apps/api/src/ai/prompts.ts`)

All AI personas/prompts have a shipped **default** in `prompts.ts` and are
**admin-editable live** from **Admin ▸ AI Instructions** (overrides stored in
`app_settings` under `ai.<id>`; a reset restores the default here). When you
change AI behavior, edit the default in `prompts.ts` so a reset stays correct.

- `global` — the **Ask Claude** base persona, used across every workspace. The
  route (`routes/ai.ts`) substitutes `{workspace}` (filled only for Trading and
  Studies; empty elsewhere, so the base persona must carry the whole site map)
  and `{name}` (the user). Because it is empty in Admin/Site Help, keep the base
  persona self-sufficient.
- `ws.trading`, `ws.studies` — extra guidance injected into `{workspace}`.
- `tutor` — Series 65 study tutor. `market_overview` — Market News "Brief me".
  `metrics_coach` — prop-challenge read. `support` — bug-intake assistant
  (**structured**: must return the exact JSON shape or intake breaks).

AI calls are metered per user against a monthly cap (`ai_usage` table).

## Conventions

- **Every deploy:** bump `APP_VERSION` and prepend a `PATCH_NOTES` entry in
  `apps/web/src/meta/version.ts` (e.g. `Beta V 3.1` → `Beta V 3.2`). The
  top-bar version pill and **Site Help ▸ Patch notes** both read from it.
  Admins can also manage patch notes from the Admin workspace.
- User-facing wording is editable from **Admin ▸ Site Wording** (content routes
  / `app_settings`); prefer editing there over hardcoding copy where a key
  already exists.
- Keep the plain, terminal-style voice in UI copy and AI prompts.

## Verifying changes

Run before merging (both must pass):

- Typecheck: `npm run typecheck` (root; runs api + web) — or a single workspace
  with `npm --workspace @vts/api run typecheck` / `@vts/web`.
- Build: `npm run build` (root; api `tsc` + web `vite build`).

Dependencies may need `npm install` first in a fresh container.

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
