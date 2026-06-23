# VTS Portal — Handoff for a New Claude Code Chat

Paste this whole file into a new chat to continue work. It is everything a fresh
Claude needs to be productive immediately. (A companion file, `PROJECT_LOG.md`,
records *everything already built* — read that for history; read this for how to
work and what's next.)

---

## 1. What this project is

**VTS Portal** — a private, dark‑navy "pro‑terminal" web app for one owner
(Andrew) and a small number of admin‑created users. It bundles several
workspaces behind one login:

- **Trading** — broker status dashboard (read‑only roles allowed; "Viewer" is a
  read‑only Trading role).
- **Kia Sales** — a car‑salesperson performance tracker (deals, commission, unit
  goals, bonus tiers, Google‑review gating, monthly history, editable pay plan).
- **Studies** — flashcards (auto‑rotating).
- **To Do** — per‑user task lists that start empty.
- **Vitalis Retirement & Wealth Management** — the future client‑management
  portal for the owner's RIA (after he passes the Series 65). Same watermark/logo
  as Trading but subtitled "Retirement and Wealth Management". **The real
  "Clients" management list is the next big feature to build** (see §6).

Cross‑cutting features: multi‑user isolated data, admin‑managed accounts &
granular roles, a privacy/demo mode that masks names/contacts/dollar amounts,
per‑page "?" tutorials, and an undo bar on list removals.

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
- **`apps/api`** — Fastify 5 + Drizzle ORM + `@libsql/client` (SQLite).
  - argon2 password hashing, server‑side session cookies (only the SHA‑256 of
    the token is stored), Zod validation on every route.
  - Money is stored as **integers**: percentages in **basis points** (1350 =
    13.5%), dollars as **whole dollars**.

### Commands (run from repo root)
```bash
npm run typecheck --workspace @vts/api      # tsc --noEmit
npm run build --workspace @vts/web          # vite build (includes tsc)
npm run db:migrate --workspace @vts/api     # apply migrations to the DB
```
The API also runs migrations automatically on boot.

---

## 3. Conventions you MUST follow

- **Inline styles only** in web code; match the surrounding dark theme (palette
  below). No CSS‑class refactors.
- **Responsive via `useResponsive()`**, never CSS media queries.
- **Drizzle migrations come in pairs:** add the `.sql` file in
  `apps/api/migrations/` **and** add a matching entry to
  `apps/api/migrations/meta/_journal.json` (increment `idx`, keep `tag` ==
  filename without extension). The latest is `idx: 7`,
  `0007_kia_commission_split`.
- **Money math:** percent→bp is `Math.round(pct * 100)`; store dollars rounded to
  whole numbers.
- **Per‑user everything.** Every Kia/To‑Do/Wealth row is keyed by `userId`. New
  users must start empty (see the `seedUser`/`ensure*Seed` pattern in
  `apps/api/src/kia/service.ts`).
- **Verify before merging:** API typecheck + web build, and for DB changes run
  the migration chain on a throwaway SQLite file and exercise the service
  functions with a quick `tsx` script (delete the script afterward — don't commit
  scratch files). Set `DATABASE_URL=file:/tmp/.../scratch.db` and
  `SESSION_SECRET=test-secret-1234567890` when running scripts.
- **Revert `package-lock.json` churn** before committing (don't commit
  incidental lockfile changes).
- Common palette: `RED #BB162B`, `RED2 #8d0f20`, `CARD #15171b`,
  `BORDER #2a2d33`, `GREEN #35c47b`, `AMBER #e0a23a`, panel bg `#0e0f12`,
  text `#eceef0`, muted `#8b9098`/`#9aa0a8`.

---

## 4. Workflow directives (from the owner — keep honoring these)

Verbatim intent:
> "When I give you ideas, you don't have to do it then and there, continue the
> most efficient process flow, because the ideas are going to keep coming."
> "Whatever is the fastest process flow. I'm okay with giving you creative
> control, then I make adjustments from there."

So in practice:

1. **Batch ideas, keep moving.** Don't stop and ask on every idea; pick the
   fastest path and build.
2. **Per‑feature branch → PR → squash‑merge to `main`.** That's the established
   pattern (PRs #13, #14, #15 all merged to `main`). Don't build deep PR stacks.
   Sync local `main` after each merge; delete the merged branch.
3. **Only stop to ask** on genuinely ambiguous or destructive decisions.
4. **Report concisely** what shipped + how it was verified.

### Git / environment specifics
- Remote execution env; repo is cloned fresh per session — **commit & push or
  it's lost.** GitHub is reached only through `mcp__github__*` MCP tools (the
  `gh` CLI is **not** available). Repo scope: `andrewr92896-ship-it/vts-portal`.
- Push with `git push -u origin <branch>`; retry network failures with backoff.
- **Commit message footer** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017JTGjnRn49wwe6VstvaBvh
  ```
  (The session URL will differ in your chat — use your own.)
- **PR body footer:** the `🤖 Generated with Claude Code` line + the session URL.
- **Never** put the model identifier in commits/PRs/code — chat replies only.
- Don't create a PR unless asked — but here the established, owner‑approved flow
  *is* branch→PR→merge, so continue it.
- **Headless Chromium is blocked** by the network policy → you cannot screenshot
  or browser‑repro. Verify by reasoning + typecheck/build + DB scripts.

---

## 5. Current state (as of this handoff)

- All work is merged to `main`; `main` is clean with **no uncommitted work**.
- Latest merges: **#13** (integrate all features + Admin moved to top bar),
  **#14** (editable per‑user Kia pay plan + dealership name toggle),
  **#15** (optional front/back split commission + monthly goal in pay‑plan
  editor). No open PRs.
- Migrations applied: `0000`–`0007`.

---

## 6. Next task (start here unless redirected)

**Build the Vitalis Wealth "Clients" management list** — the real workspace the
owner will use to manage clients after the Series 65.

Suggested scope for a first cut (mirror the Kia patterns):
- Per‑user `wealth_clients` table (Drizzle migration `0008` + journal entry).
  Likely fields: `id`, `userId`, `name`, `email`, `phone`, optional
  `accountValue` (whole dollars), `stage`/`status`, `notes`, `createdAt`,
  `updatedAt`.
- API service (`apps/api/src/wealth/service.ts`) + routes guarded by
  `requireWorkspace('wealth')`: list / add / edit / remove, with **undo** on
  remove (return the removed row like Kia/To‑Do do).
- Web workspace screen: add/edit/remove clients, **privacy‑masked** (use
  `maskName` + the `usePrivacy()` dollar‑masking pattern so names, contacts, and
  amounts hide in demo mode), `useUndo` + `<UndoBar>` for removals, `isPhone`
  responsive layout, dark theme to match.
- Wire it into the Wealth workspace screen routing (see how Kia/Trading screens
  are mounted in `apps/web/src/.../Portal*`).

Verify (typecheck + build + a `tsx` DB script proving per‑user isolation, add/
edit/remove, and undo), then branch → PR → squash‑merge to `main`.

### Backlog / ideas the owner has floated (confirm priority before/after Clients)
- Studies flashcards auto‑rotate (term 10s → definition 20s, with a visible
  countdown) — confirm whether already shipped before rebuilding.
- Per‑page "?" tutorials (text‑only steps; screenshots can't be generated here).
- Continued Kia build‑out (already has editable deals, monthly history, per‑month
  goals/reviews, editable pay plan incl. split commission).
- A Stage‑4 "Ask Claude" command bar on the Kia dashboard (currently a disabled
  placeholder input).

---

## 7. Key files to read first
- `apps/api/src/db/schema.ts` — all tables (users, sessions, todo, kia_*).
- `apps/api/src/auth/rbac.ts` — `ROLE_KEYS` = admin, trading, trading_viewer,
  sales, studies, todo, wealth; admin grants all workspaces.
- `apps/api/src/kia/service.ts` — the richest service; copy its seed/per‑user/
  per‑month/undo/pay‑plan patterns for Wealth.
- `apps/web/src/workspaces/kia/KiaDashboard.tsx` + `PayPlanEditor.tsx` — the
  reference UI patterns (inline styles, responsive, privacy, undo, modals).
- `apps/web/src/privacy/privacy.tsx`, `src/hooks/useUndo.ts`,
  `src/components/UndoBar.tsx`, `src/hooks/useMediaQuery.ts`.
