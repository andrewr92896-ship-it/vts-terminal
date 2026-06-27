# VTS Portal — Project Log (everything we did)

A retrospective record of what was built, why, and how it works. Give this to any
Claude chat that needs the full history. For *how to continue working* (stack,
conventions, workflow, next task), see `HANDOFF.md`.

---

## The product

**VTS Portal** is a private, dark "pro‑terminal" web app for one owner plus a
handful of admin‑created users. One login fronts several workspaces:
Trading, Kia Sales, Studies, To Do, and Vitalis Retirement & Wealth Management.

## The stack (one line)

- **Web:** Vite + React 18 + TypeScript, **100% inline styles** (no layout CSS
  classes), responsiveness via a JS `useResponsive()` hook, React context for
  privacy + dealership name, `localStorage` persistence.
- **API:** Fastify 5 + Drizzle ORM + libsql/SQLite, argon2 + server‑side session
  cookies, Zod validation. Money stored as integers (basis points for %, whole
  dollars for $).

---

## Feature history (in build order)

### 1. Mobile responsiveness
- Made the whole portal responsive using the `useResponsive()` hook
  (`isPhone <=480`, `isTablet <=768`) since inline styles can't use CSS media
  queries.
- **Bug fixed:** the top header overflowed on real iPhones (~390px). Root cause
  was the scrollable workspace switcher being a flex child without `min-width:0`
  (the flex `min-width:auto` gotcha). Fixed with `min-width:0`/`max-width:100%`
  containment. An earlier attempt using `overflowX:'hidden'` was removed because
  it clipped the user‑badge dropdown.

### 2. Multi‑user login with isolated data
- Each user logs in and sees **their own** To Do list and Kia tracker, both
  starting at **zero** entries.
- Implemented with per‑user rows keyed by `userId` and a one‑time seed pattern
  (`ensureKiaSeed`/`seedUser`) that creates a settings row but no data.

### 3. Admin‑created accounts (in‑portal)
- An admin screen (`AdminUsers`) creates/edits users from inside the portal — no
  scripts. Create user, set display name, password, roles, brokerage‑view flag,
  active toggle.

### 4. Granular, multi‑role RBAC
- Roles are stored as a JSON array string in `users.roles`. `ROLE_KEYS` (in
  `auth/rbac.ts`) = `admin, trading, trading_viewer, sales, studies, todo,
  wealth`. A user can hold any combination; only an admin can assign them.
- "Viewer" exists only as a **read‑only Trading** role (`trading_viewer`).
- **Admin** grants every workspace. The legacy single `users.role` column is kept
  (with a default) for old rows but is no longer read.

### 5. Per‑page "?" tutorials
- Text‑only step lists per page (screenshots can't be generated in this
  environment).

### 6. Kia Sales workspace (the richest area)
Built out in stages:
- **Editable deals + monthly history** — log a deal (customer, model, New/Used,
  profit, date); inline edit + remove; deals are bucketed by **Eastern‑Time
  month** (`YYYY‑MM`); a Monthly History list shows per‑month units/profit/
  commission.
- **Per‑month goal & reviews** — each month has its own unit goal and Google‑
  review count (`kia_month_settings`). The goal carries forward from the most
  recent prior month if a month hasn't been set; reviews start at zero per month.
- **KPIs & pace** — units MTD vs goal, projected pace to month‑end, days left,
  total profit, estimated commission, unit bonus, review %.
- **Unit bonus tiers** — non‑stacking; the highest tier reached pays. Optionally
  gated behind a minimum Google‑review percentage.
- **Editable per‑user pay plan** (PR #14) — a "Pay plan" modal
  (`PayPlanEditor.tsx`) to change commission %, the review requirement (including
  removing it entirely), and the bonus tiers.
- **Dealership name toggle** (PR #14) — switch the label between "Kia of
  Streetsboro" and a generic "Vitalis Car Sales Tracker" (context +
  `localStorage`).
- **Optional front/back split commission + goal in editor** (PR #15, most
  recent) — see its own section below.

### 7. Vitalis Retirement & Wealth Management workspace
- Added as the owner's future RIA client‑management portal (post Series 65).
- Reuses the same watermark/logo as Trading, but subtitled "Retirement and
  Wealth Management" (a dedicated SVG wordmark
  `public/brand/vitalis-wealth-wordmark.svg`; `BrandMeta` gained an optional
  `wordmark` field).
- **The actual "Clients" management list is not built yet** — it's the next
  planned feature (see `HANDOFF.md` §6).

### 8. Privacy / demo mode
- A toggle (`PrivacyProvider`/`usePrivacy`) that masks customer/client names,
  contact details, and **all dollar amounts** so the portal can be demoed without
  exposing personal/financial info. `maskName` handles name masking; dollar
  figures render as `•••••`.

### 9. Undo on list removals
- `useUndo` + `<UndoBar>`: removing a To Do item or a Kia deal returns the full
  removed row so it can be restored. Backend `remove*` returns the row;
  `restore*` re‑inserts with `onConflictDoNothing`.

### 10. Admin tab moved to the top bar
- The Admin entry was moved out of the Trading sub‑tabs to sit **just left of the
  username** in the top bar (shown when the user `isAdmin`). Opens an overlay
  with `AdminUsers`. ("Merge the stack" — the previously stacked feature branches
  were consolidated.)

### 11. Studies flashcards auto‑rotate (requested)
- Auto‑cycle: show the term ~10s, the definition ~20s, with a visible countdown.
  (Confirm current shipped state before re‑touching.)

---

## Spotlight: optional front/back split commission (PR #15 — latest)

**Why:** some pay plans pay a % of **front‑end** profit and a different % of
**back‑end** profit. The owner didn't want to enter two numbers per deal unless
their plan actually splits — so split mode is **opt‑in** and the default stays a
single rate on total profit.

**What changed:**
- **Pay‑plan editor** gained a **Total / Split** toggle, front%/back% inputs in
  split mode, and a **Monthly unit goal** field (saved alongside the plan).
- **Deal forms** (add + inline edit) collect **Front $** / **Back $** in split
  mode (total profit = their sum); single **Profit $** in total mode.
- A deal entered as a single total counts entirely as **front‑end** under a split
  plan, so switching modes never loses money. Front/back persist through edit,
  remove, and undo.
- The headline commission % shows the **blended** rate when front/back differ.

**Backend / data:**
- `kia_settings`: added `commission_mode` ('total'|'split'),
  `commission_front_bp`, `commission_back_bp`.
- `kia_deals`: added nullable `front_profit`, `back_profit`.
- Migration `0007_kia_commission_split` (+ journal entry idx 7).
- `dealCommission()` computes per‑deal commission by mode;
  `commissionForDeals()` sums (rounded). `computeMetrics` derives a blended
  effective rate for the headline and pace.

**Verification done:** API typecheck clean; web build clean; full migration chain
0000–0007 applied on a throwaway DB and the math checked end‑to‑end — total mode
($540 on $4,000 @ 13.5%), split mode (25% front / 10% back → $1,600 across a
legacy total deal counted as front + a new $2,000/$1,000 split deal), goal
updated to 20, front/back persisted.

---

## Architecture notes worth keeping

- **Inline styles everywhere** in web; theme objects in `src/theme/themes.ts`;
  `global.css` only has base + keyframes.
- **Responsiveness in JS** (`useResponsive()`), never CSS media queries.
- **Drizzle migrations are pairs:** the `.sql` file **and** a
  `meta/_journal.json` entry must both be added.
- **Money as integers:** percentages in basis points (1350 = 13.5%), dollars
  whole. percent→bp = `Math.round(pct*100)`.
- **Per‑user isolation** is mandatory; new users seed empty.
- **Eastern‑Time month bucketing** for Kia deals (`YYYY‑MM`) so a deal lands in
  the month the salesperson would file it under, regardless of server TZ.

## Environment constraints we worked under
- Remote, ephemeral container — must commit & push to persist.
- GitHub only via `mcp__github__*` tools (no `gh` CLI). Repo scope:
  `andrewr92896-ship-it/vts-portal`.
- Headless Chromium download is **blocked** — no screenshots / browser repro;
  verification was reasoning + typecheck/build + throwaway‑DB `tsx` scripts.
- Commit footer with `Co-Authored-By` + `Claude-Session`; PR footer with the
  `🤖 Generated with Claude Code` line. Model identifier never written into
  repo artifacts. Lockfile churn reverted before committing.

## Workflow that emerged (owner‑directed)
- "Ideas keep coming" → batch them, keep moving; build on the fastest path with
  creative control, owner adjusts after.
- Per‑feature branch → PR → squash‑merge to `main` (PRs #13/#14/#15). No deep PR
  stacks. Sync local `main` and delete the branch after each merge.

## Merge history (recent)
- **#13** — Integrate all features + move Admin to the top bar (consolidated the
  earlier stack #3–#12).
- **#14** — Kia: editable per‑user pay plan + dealership name toggle.
- **#15** — Kia: optional front/back split commission + goal in pay‑plan editor.
- **#16** — Add HANDOFF.md + PROJECT_LOG.md docs for session continuity.
- **#17** — Wealth **Clients** list; admin **permanent account deletion**;
  gamified **Series 65 Study Game** (+ vocab flashcards, Study Hub, Progress);
  Studies data code‑split; version pill → **Alpha V 1.0**.

## Recent additions (shipped in #17)
- **Vitalis Wealth — Clients list:** per‑user `wealth_clients` table (migration
  `0008`), service + routes (`requireWorkspace('wealth')`) with add/edit/remove +
  undo and a clients/AUM/active summary; privacy‑masked, responsive screen on the
  `wm_clients` tab.
- **Admin — permanent account deletion:** `deleteUser` removes the user and every
  per‑user row (todo, kia, wealth, sessions) in one transaction; guards block
  deleting your own account or the last admin. UI has a one‑click confirm
  alongside the existing Deactivate.
- **Series 65 Study Game (Studies):** 400‑question bank parsed to a typed module,
  each tagged to one of four exam areas; one question at a time, exam‑weighted
  "Mix" or single category; score = accuracy over last 100 (1 decimal) vs a 72%
  pass line with PASSING/NOT PASSING status; per‑category **levels + prestige**
  (Novice→Grandmaster); per‑question **explanations**; **Flashcards** folded in as
  a toggle; **Study Hub** + **Progress** screens. Persisted per user in
  `localStorage`. Studies screens are `React.lazy` code‑split.

## Studies — custom flashcards + crash fix
- **Add-your-own flashcards (AI definitions):** the Flashcards screen now has an
  "Add a word" box. The server (`POST /api/studies/vocab`) asks Claude
  (`defineSeries65Term`) for a concise Series 65 definition and classifies the
  word into one of the four topics, then stores it in a new per-user
  `study_vocab` table (migration `0032`, service `studies/vocab.ts`) so the
  custom deck syncs across devices like learned terms. Custom cards merge into
  the deck (deduped by term), carry a "✦ Your word" badge, and can be deleted.
  AI calls are rate-limited under the `studies_vocab` bucket and return 503 when
  no API key is configured.
- **Study section crash fix:** the lazy-loaded Studies screens had a `Suspense`
  but **no error boundary**, so a failed code-split chunk fetch (common after a
  redeploy when the cached `index.html` points at stale chunk hashes, or on a
  flaky connection) crashed the whole app to a blank page. Added a reusable
  `ErrorBoundary` (`components/ErrorBoundary.tsx`) around the screen `Suspense`
  in `Portal.tsx`, keyed by the active screen so navigating away clears it. It
  detects chunk-load errors and offers a "Reload app" button (fetches the fresh
  build); other render errors get a "Try again".

## What's next
Build out the **Trading tab** until done — full plan and current (placeholder)
state in `HANDOFF.md` §6.
