# VTS Portal — GPT Project Memory Handoff

**Purpose.** This document gives a ChatGPT project durable knowledge about VTS Terminal so that
future conversations can help design, plan, troubleshoot, and write Claude Code handoffs without
re-deriving the product from scratch.

It is deliberately **not** an implementation handoff. It contains no code, no secrets, no
credentials, no endpoint inventories, and no debugging history. Where something is temporary it is
labelled.

Every section is marked with what kind of fact it holds:

- **IMPLEMENTED** — exists in the product today.
- **OWNER-APPROVED / IN PROGRESS** — decided, not finished.
- **FUTURE** — approved direction, not started.

---

## 1. Project Identity

**IMPLEMENTED**

**Product name:** **VTS Terminal**. The company is **Vitalis Trading Systems**; the legal entity for
the planned public launch is **Vitalis Trading Systems LLC**.

**What it is.** A private, dark "pro-terminal" web application, installable as a PWA, with web push.
One sign-in leads to a sidebar of workspaces, each with its own sections. Today it is invite-only:
there is no public sign-up, but there is a single read-only **demo account** and a public **Early
Access** request form on the login screen.

**Where it is going.** The stated owner goal is to open it to the general public as a **paid,
subscription product**, including an official iOS app under the LLC. A home-screen widget showing
open positions is a headline feature of that plan. The paywall layer exists already; billing does
not.

### Naming rules that must be followed consistently

- **"Terminal", never "portal"**, in anything a user reads — labels, blurbs, legal documents, push
  titles, the PWA manifest, AI prompts, study content. The workspaces are **My Terminal**, **Admin
  Terminal**, **Developer Terminal**.
  - Three deliberate exemptions: the **Employee Portal** keeps its name (it is a separate site with
    its own sign-in and design language); **internal identifiers** stay as they are (`myportal`
    workspace key, `/api/my-portal` routes, `Portal.tsx`); and React's `createPortal` is a DOM
    concept, not the product.
- **The AI is always "VTS AI"** in user-facing copy — never "Claude", "Anthropic", or a raw model
  name. Internal code identifiers and server-side model IDs are exempt.
- **A private group, never a "team", in user-facing copy.** This is a compliance rename: "team"
  implies coordinated trading and members advising each other. **Labels only — never keys.** All the
  internal names (`trading_teams`, `team_id`, the `teams`/`teamChat` feature keys, the `my_team`
  screen key) are unchanged, because routing, in-app links and help wording depend on them.
  - Words to keep out of that feature's copy: team, teammate, trading team, shared desk, team book,
    desk, book, network, community, club, collective, partners. Each carries a meaning (a
    coordinated trading unit, a pooled position book, pooled capital, or the legal category
    "investment club") the rename exists to avoid.
  - "Member" is already both the baseline role and how paid tiers read, so write "someone in your
    group" rather than a bare "members".
  - When "the team" means **company staff**, write **"VTS staff"** — otherwise it reads as the
    user's own group.
- **Rename a label, never a key.** Section keys are the screen keys the router switches on, and
  in-app links and help wording are keyed to them. Several screens have been renamed repeatedly
  while keeping their original key (the closed-trade review screen is still `desk`; Premium Features
  is still `my_access`).

### Workspaces (current)

**My Terminal** (emerald), **Advanced Trading** (gold, internal key `trading`), **Finances**
(green), **News** (slate-blue), **Investments** (teal), **Studies** (violet), **Site Help** (blue),
**Admin Terminal** (rose, admins only), **Developer Terminal** (amber, founder-level only). The
**Employee Portal** is reached from a pinned sidebar row but is a separate website, not a workspace.

### Removed and not to be reintroduced

The Markets workspace (its Market News and Market Data sections moved to News and My Terminal), the
standalone To-Do workspace, Vitalis Wealth Management, Personal Finance, the Vitalis LLC business
workspace, and Kia Sales.

### Voice and copy conventions

- Plain, terminal-style. No filler.
- **No tips, tricks, or how-to-use-this copy in the UI.** The test is not "is this sentence true" but
  "does it carry something the control cannot say itself". Keep only what cannot be discovered from
  the screen (where to find an external key, the columns a CSV import expects, that a figure is a
  sample). Empty states and legally required disclaimers are not tips and stay.
- **Everything Claude Code writes is brief** — commit bodies, patch notes, developer blog posts,
  closing reports. A few sentences where a few sentences will do. Length is not evidence of care.
- Versioning: `Beta V X.YY`, bumped every deploy, with a patch-note entry prepended in the same
  change. Patch notes are also database-backed and published from the Admin Terminal; the code array
  is the historical archive.

---

## 2. Product Architecture

**IMPLEMENTED**

**Monorepo**, npm workspaces, two applications.

- **API** — Fastify + TypeScript. Holds every secret; the browser never sees broker keys, the AI
  key, or password hashes. In production the same process also serves the built web app, so the API
  and the site share one origin.
- **Web** — Vite + React 18 + TypeScript. Styling is inline-style / design-token based (a theme
  module), **not** a CSS framework. **Two build entries**: the main terminal, and a separate
  Employee Portal bundle. They share design tokens and an icon component and nothing else.

**Database.** SQLite via Drizzle ORM on the libsql driver; roughly 120 SQL migrations. Two storage
properties matter constantly:

- **Foreign keys are never enabled.** A declared `ON DELETE` action is documentation, not behaviour.
  Every cleanup is explicit.
- **Per-user deletion is an explicit list** in the admin service. When a new per-user table is
  added, it must be added to that list. Two audit tables deliberately survive account deletion
  because they record access to money and to a hardened surface; AI rule-breaking conversations
  deliberately do not.

**Authentication.** Username/password with argon2id, signed httpOnly session cookies, role-based
access. The main terminal has no login rate-limit, no lockout, and no CSRF token — its posture rests
on `SameSite=Lax` plus a signed httpOnly cookie. The **Employee Portal has its own, completely
separate session system** with lockout, CSRF tokens, an idle timeout, emailed-code second factor,
optional IP allowlist, and its own audit log. Neither session grants anything on the other surface.

**Routing and navigation.** Routing is **state-based, not URL-based** — there is no router, the URL
never changes, and there is no deep-linking, refresh persistence, or browser back/forward. The one
URL-addressable surface is the Employee Portal, and that is a separate page rather than a route.
Navigation is **data-driven from a single nav module** that is the source of truth for workspaces,
sections, order, icons and gates. **Sidebar order is code-only** — nothing at runtime may change
it, and a previous runtime override mechanism was removed precisely because two sources of order can
disagree silently.

**Four independent access axes.** Confusing them is the classic mistake in this codebase:

1. **Role** — what you are trusted with. Five roles: founder, software_developer (permission-
   equivalent to founder), admin, employee, member. Roles no longer decide which workspace you see.
2. **Opt-in** ("Premium Features") — what you have asked to see. Only two things are optional, both
   the trading desk: Advanced Trading, and Funded Account nested under it.
3. **Membership tier** — what you have paid for: `free` → `premium` → `max`. One map defines which
   feature costs which tier, so moving a feature between tiers is a one-word edit and every guard,
   lock icon and upgrade prompt follows. Admin/developer/founder roles always resolve to Max with no
   stored grant.
4. **Grant** — handed out by a software developer by hand, not purchasable and not self-service.
   Today this is **Trading Teams** (private groups).

A paid feature answers **402**, so the client shows an upgrade prompt. A not-for-sale grant answers
**403**, because an upgrade prompt would be a lie.

**Content ownership and scoping.** A content scope key is `teamId ?? user:<id>` — the personal form
is not a team and has no group row; it is a scope key stored in the same column, which lets a
personal library and a group library share one table and one set of queries. Studies now runs **two
ownership models side by side** (see section 4). Investments, Finances and Net Worth are strictly
personal — every query filters on the caller and there is no "whose" parameter.

**Architectural constraints that repeatedly matter:**

- **The server is the enforcer.** The client mirrors access rules for drawing locks; it never
  decides them.
- **A fabricated figure must never stand in for one that could not be read.** This rule appears
  everywhere: live vs sample vs unavailable position feeds, `sample: true` on market data rows,
  refusing an incomplete net-worth total rather than approximating it, and Studies never scoring an
  uncovered category as zero.
- **Two writers of one number is the recurring bug shape.** Where a figure appears on two surfaces,
  both must compute it through the same function.
- **AI is never streamed** — every call is a single awaited request.
- Deployment: the hosting platform builds and deploys whatever is on `main`. **Merging to `main` is
  the production release.** Deploys go through a pull request and a squash merge, and only when the
  owner asks.

---

## 3. Current Major Features

**IMPLEMENTED** (summarised — what exists, not how)

**Advanced Trading** (opt-in; several parts paid). The desk's own workspace, ordered by a trade's
life rather than by price:

- **Live Wall** — the terminal's single configurable board and the screen a sign-in lands on. Any
  part of the terminal can be placed on it as a tile, including a working order ticket. A free
  account gets three built-in layouts; saving your own arrangement is Premium. Boards can be shared
  with a private group (only the arrangement travels — every tile fetches as the reader), have
  per-device defaults (phone vs desktop), per-tile zoom, and a resizable workspace width that grows
  the board rather than thinning its columns. Phones render one column and never write that back.
- **Live Trades (Trade Desk)** — places **real orders** at the trader's own accounts at two venues:
  OANDA (forex, margin) and Kraken (crypto, **spot only, deliberately**). Market/limit/stop with
  protective orders, closing whole or partial, amending stops and targets, cancelling resting
  orders. Every attempt is journalled including refusals. Acting is strictly personal — no code path
  trades another person's account.
- **Closed Trades & Metrics** — one page combining the trade log and the connected brokers, with the
  trader's own deposited/withdrawn/total capital, breakdowns by strategy and instrument, CSV export,
  and an explicit note whenever settings have narrowed what is being counted.
- **Funded Trades / Manual Trades** — prop-firm challenge accounts and hand-kept books, with
  screenshot import, drawdown gauges that reset on their own each trading day, and their own stats.
- **Strategy Sessions** — per-weekday Eastern windows with a bias, plus opt-in open/close/pre-open
  notifications.

**My Terminal.** Premium Features (memberships and the opt-ins), Market Data, Net Worth's sibling
personal roll-ups, personal to-do, settings and preferences, site rules.

**Finances.** Deliberately separate from Investments: Investments answers "what do I own", Finances
answers "what do I earn and spend". Net Worth and a budget feature live here. The budget gives no
advice.

**Investments.** A read-only, layman-friendly long-term portfolio tracker — accounts, holdings,
allocation, performance, dividends, contributions and goals, projections. Strictly a tracker that
displays and educates: no order execution, no money movement, and **no personalised
buy/sell/rebalance advice**. Account connection is manual entry only today; a read-only aggregator
is the designed path and an owner decision, not a build. Contribution limits are a hand-maintained
catalogue keyed by tax year and must be updated annually.

**News.** Market News (headline feed plus an embedded YouTube live-stream wall with tiered
concurrent playback), plus World and Politics from **wire services only** — a deliberate editorial
position, with no bias glyph, impact chip or AI read-through on those categories.

**Market Data.** A read-only board of 75 series across ten groups, most of them live from two
keyless-capable providers, with a Fed decision countdown and the economic calendar. Rows that no
free provider covers are marked as samples rather than presented as real.

**Studies.** See section 4.

**Site Help.** How-to guides, announcements, patch notes, bug reports, suggestions, rules, terms,
privacy. Available to every signed-in user. Rules & Conduct is one document rendered in two places.

**Admin Terminal.** Users, Administrator Log, Admin Guidelines, Rule Breaking, **Study Library
moderation**, Groups, Badges, Message Templates, Patch Notes, Early Access, Bug Reports, Support.

**Developer Terminal** (founder-level). Developer Blog, AI Instructions, Site Wording, Suggestions,
Under Review, Live Wall Templates. Plus two preview controls in the account menu: **View as role**
and **Preview as tier** — the latter is server-side and authoritative, only ever reduces privilege,
and never writes to the account.

**Employee Portal.** A separate hardened internal staff site at its own URL with its own bundle,
sessions, design language, and audit trail. Requires both the `employee` role and a company-domain
sign-in address, re-checked on every request.

**Cross-cutting.** Web push and Pushover notifications; TradingView webhooks; background pollers for
news feeds, desk reconciliation, closed-trade backfill and session alerts; broker credentials
encrypted at rest with a dedicated key and an audited use trail; per-account display time zone
(defaulting to Eastern) with a documented list of things that deliberately stay Eastern.

---

## 4. Studies / Study Package Architecture

This section is written so a fresh conversation can continue Studies work without the original
Studies handoffs.

### 4.1 The two ownership models — IMPLEMENTED

Studies content now has **two ownership models running side by side**, and one module is the single
place that decides which applies.

- **Legacy content** (no package): scoped by the content scope key (`teamId ?? user:<id>`). You
  reach it by being in that scope. This is every game, set and presentation that existed before
  packages, and nothing about it changed.
- **Package-backed content**: belongs to a **person**. You reach it by owning it, by having accepted
  a share of it, or by having added it from the public library — **never** by being in the owner's
  trading/private group. This is what makes Study sharing work for a public signup, who is in no
  group and for whom no group can be invented.

Two invariants hold this together:

- Package-backed rows are stored under the **owner's personal scope key**, never their group scope.
  Using the group scope would look natural and would quietly hand every group member access through
  the legacy path.
- Route handlers must **not** carry per-request "if it has a package" exceptions. They ask one
  resolver for a scope key and get back either a key to read under or nothing — the same shape they
  already handled. A guard exception copied into eleven handlers will be wrong in one of them.

### 4.2 What a Study Package is — IMPLEMENTED

A container owned by one person, holding: **one study game** (multiple-choice questions), **one
flashcard set**, **one presentation**, its **lesson plans**, and its **category blueprint** (the
categories, their weights, and how those weights are used).

Three rights, kept deliberately apart:

- **read** — study it: play, take tests, read the slides.
- **edit** — change its content. **Locked while published.**
- **manage** — the owner's own controls: share, revoke, submit, archive, withdraw. Never locked by
  publication, because withdrawing is how you get out of the lock.

### 4.3 Stable category identity — IMPLEMENTED

This is the correction the package layer exists to make. Legacy categories are identified by **name**
everywhere — on the game, on each question's topic, in the weights map, and in each learner's
per-category statistics — so renaming one silently reset everybody's history for it.

In a package, the **category row id is the identity** and the name is merely what it is currently
called. The old name-keyed fields are **kept and kept in step** by a single sync function, which is
why no player, editor or test code had to change. Removing a category, or deleting the package,
clears the link and **leaves the topic text**, so the content degrades to a legacy name-keyed game
rather than losing its categories.

### 4.4 Stable slide identity — IMPLEMENTED

A presentation stores its slides as one JSON blob — a good way to hold a presentation together and a
hopeless way to identify a slide, because dragging one changes every position. So each slide carries
its **own id inside the blob**, minted by the server the first time it is written, and lessons point
at those ids rather than at positions.

Three rules carry it: identity is **kept on read and only minted on write** (a read that invented
ids would hand out different ones every time); the id must **round-trip through the editor**, or
every save looks like a deck of brand-new slides; and **legacy presentations are not migrated** —
their slides have no id, work exactly as before, and gain ids the next time they are saved.

### 4.5 Learner progress, levelling and scoring — IMPLEMENTED, and deliberately untouched

- **Progress is keyed by (learner, game).** A shared package is the *same* game id for everybody, so
  each person keeps their own progress row against it. Nothing about progress changed when packages
  landed.
- **The original study-game mechanics are intact and must stay intact:** the twelve-level ladder with
  five sub-levels each and a rising cost per sub-level; the streak multiplier (every five correct
  answers in a row raises the multiplier, one wrong answer resets it, and the multiplier scales level
  progress only — lifetime accuracy still counts each answer once); the fixed 100-answer scoring
  blocks; per-category accuracy over the last 100 answers. Studies also recolours live to the
  learner's level.
- **Revoking a share never touches progress.** The share row goes; the learner's record of work they
  actually did is theirs.

### 4.6 Weighted scoring — IMPLEMENTED

A game's categories can carry **weights** — the exam blueprint. A category list said which topics a
game covered and never that the real exam gives them different shares of the paper.

The weights do **two separate things**, and merging them is the mistake:

1. **The draw** — a 20-question sitting on a 15% category takes about three from it, allocated by a
   highest-averages method so a category that cannot supply its share hands the remainder to whoever
   is most under-served, always summing to the test length.
2. **The score** — each category's accuracy times its share. **This does not depend on how many
   questions were drawn.** Four of five right in a 15% area is worth 15% × 80% whether the draw took
   five questions or fifty; the draw only decides how precise each estimate is.

Supporting rules:

- **An uncovered category is rescaled out, never scored zero**, and is named on the result. Scoring
  a category the learner was never asked about marks them down for questions that were not on their
  paper.
- **Weights are stored raw and normalised on read**, so a list totalling 95 still scores correctly
  and a renamed or removed category cannot leave a weight counting toward the denominator.
- **Null weights mean unweighted**, which is every pre-existing game and is deliberately not the
  same as every weight being zero.
- **The choice is per sitting** — a practice test offers weighted or plain scoring when the game has
  usable weights, and shows both scores at the end either way, because the gap between them says the
  sample was kinder or harsher than the exam's own mix.
- **Progress shows the weighted score too**, on the same lifetime basis as the accuracy card beside
  it.
- **A merged game is unweighted** however its sources were: two blueprints do not add up to a third.
- The player and the leaderboards stay on **raw accuracy**.
- A package additionally records **what its weights are for** (tracking only / draw only / score
  only / both). Null keeps the legacy reading.

### 4.7 Sharing by username — IMPLEMENTED

One person names another and hands over a package. There is **no chat, no feed, no follow, and above
all no group** — which is the whole reason the package layer exists.

- The recipient is **resolved server-side** against the real user table by username or display name
  (both unique platform-wide). A typo finds nobody and says so. The lookup answers with a display
  name and username and **nothing else** — no email, no roles — so a share form cannot become a way
  to read the user table.
- **Only an accepted share is access.** A pending share is an offer nobody answered. Responding
  matches on the recipient as well as the share, so a guessed id cannot be answered on someone
  else's behalf.
- **Repeat sharing is idempotent**, and re-sharing to somebody who declined puts it back to pending,
  because an owner asking again is a real thing to want.
- **Revoking never touches progress.**
- Package visibility moves between private and shared on its own as recipients come and go, and
  **never** overwrites the submitted or public states.
- **Shared With Me** is its own list of offers and accepted packages, in the Studies ▸ Study
  Packages section.

### 4.8 The public VTS Study Library — IMPLEMENTED

**Submitting is not publishing.** A creator asks; an administrator reads it and decides. Nothing
becomes public on a timer, and nothing becomes public because it was shared privately.

- **Three outcomes, two of which are the same act with different words.** Approve publishes.
  Reject and "ask for changes" both hand it back with the package untouched — kept apart because a
  creator reads them completely differently.
- **The attestation is recorded as a version, not a boolean.** The wording will change, and "they
  ticked the box" would not say which wording was put in front of them. The attestation covers: own
  work or the right to submit it; not reproducing question banks, books or courses; educational
  content; any finance material educational rather than personal investment advice.
- **A published package's content is frozen.** The owner keeps manage and loses edit, because it is
  public on the strength of what a reviewer read. Withdrawing or unpublishing unlocks it, and
  returning to the library takes a **fresh submission and a fresh approval**, attestation included.
- **Reading the library is not joining it.** Anyone signed in may read a published package; an
  explicit "add" is what puts it in their own Studies and on its leaderboard. **No copy is made** —
  everyone studies the same game, and progress is per learner.
- A person's own package list is therefore **owned + accepted shares + added published ones**,
  deliberately *not* every public package. Dropping the whole library into everyone's list is not a
  library.
- **An add is a right of its own**, so somebody who took a package up keeps it after it stops being
  public.

### 4.9 Archiving and withdrawal — IMPLEMENTED

Two different actions, often confused:

- **Archiving** ("removing" a package) changes one flag. The package, its components, every
  learner's progress, the stable category ids and every sharing relationship are left exactly as they
  are, so unarchiving is instant and lossless. What the flag governs is **listing** — an archived
  package's game, set and presentation drop out of the ordinary Studies views, while reading one by
  id still works so a direct link and a restore both do.
  - **Do not go back to detaching the content.** An earlier design severed the package link, which
    turned package-owned content into unrelated standalone content, stranded the lessons, broke what
    sharing and versioning need, and recorded nothing about what the package held. It is destructive
    in a way that does not look destructive.
- **Withdrawing from the library** is a publication-state transition and **not** an archive or a
  delete. A **creator can withdraw their own publication** without waiting for an administrator —
  stopping distribution of your own work must not depend on somebody being available, and it must not
  require breaking the publication content lock or paying on a membership that has since lapsed.
  - It stops **public distribution only**. Explicit username shares keep working; anyone who had
    already added it keeps it.
  - The record is preserved and the withdrawal is **stamped onto the approval that ended**, so a
    package published, withdrawn and published again has two independent records.
  - The admin "unpublish" action delegates to the same transition, so there is one record whoever
    performs it; an admin acting on someone else's package additionally writes an Administrator Log
    entry.
  - A withdrawn package does not go back on its own.
- A genuinely destructive purge exists for **account deletion only**. It has no route and no
  user-facing workflow.

### 4.10 Package leaderboards — IMPLEMENTED

Two kinds of game have a leaderboard, and they are **ranked by the same code**, so a percentage means
one thing everywhere:

- a **built-in** game, spanning every copy of itself across the install (built-ins are seeded per
  scope, so ranking on one copy's id would rank somebody against nobody);
- a **package-backed** game, among the **package's own audience** — the owner, whoever accepted a
  share, and whoever added it from the library. Never group membership. Administrators are not
  enrolled.

A **legacy user-made game has no leaderboard at all**, and its endpoint answers 404 rather than an
empty list so the client hides the tab instead of showing an empty board that reads as broken.
Learners can opt out of being listed on other people's boards from Preferences, and still see their
own row.

### 4.11 The creation wizard — IMPLEMENTED

The default way to build a study game. One structural question per card, branching on the answers,
ending at a review screen. The three existing makers (game, flashcard set, presentation) stay exactly
as they were and remain directly reachable underneath.

- **It calls no VTS AI endpoint.** The content comes from the creator's own third-party AI or from
  their keyboard. The wizard produces a **blueprint describing the shape** of a package — how many
  questions, which categories, whether there are flashcards — and never a word of the content.
- **It writes nothing.** No package exists because somebody opened the wizard or reached the last
  card. Creation happens in what comes after.
- Questions are added by adding a step, never by threading a conditional through the shell, and the
  path is recomputed from the answers so branching works and no newly-relevant step can be skipped.
- **The draft is per user, on the device**, restored on open, and **discarded rather than repaired**
  when its schema version moves — replaying half-understood answers into a changed set of questions
  produces a package nobody described.
- A category **gets its stable id the moment it is added**, so renaming it later is a rename.

### 4.12 The third-party AI workflow — IMPLEMENTED

**The content comes from the creator's own AI, and VTS validates it.** That is the economics of the
whole workflow: the terminal defines the structure and checks the answer, and somebody else's model
does the writing. **Zero VTS AI calls** in the questionnaire, the handoff, the parsing, the
validation, or the repair instructions.

- **The handoff is composed locally** from fixed sections plus blueprint values, and the behavioural
  contract is **identical for every provider** — only a heading and one line of onboarding differ,
  because a package written against ChatGPT must import exactly like one written against Claude. The
  same builder produces the **repair prompt** when validation fails, carrying the failures and the
  affected ids and deliberately not the creator's whole package.
- **Exact per-category question targets are computed, not described**, reusing the same allocator a
  weighted practice test draws with. One allocation used twice; a second implementation is how the
  prompt and the validator come to disagree.
- **The transport format is versioned JSON** with a declared format name and schema version, because
  one package carries metadata, categories, weights, questions, flashcards, slides and lessons at
  once. **CSV is untouched** and remains the round-trip route for questions and cards.
- **Validation is deterministic** and reports **what passed as well as what failed**. Every failure
  names the thing — a missing option on a numbered question, an expected-versus-found count for a
  named category. "Invalid JSON" tells a creator nothing they can act on. The paste path strips
  **one** surrounding code fence and nothing else: no brace hunting, no quote repair, no fuzzy
  fixing.
- **Multipart import.** A package too large for one reply arrives as parts — a manifest plus
  component parts. Every part must carry the same blueprint id; a set mixing two is **refused rather
  than combined**, and a set missing one says how many are still needed instead of importing what it
  has.
- **Nothing is created by validating.** Validate reads and reports; confirm writes. That is what
  lets a creator paste, read the errors, have their AI fix them, and paste again with nothing left
  behind.
- **Commit is one transaction** covering the package, categories, game, questions, flashcard set,
  cards, presentation and lessons. A failure part-way leaves nothing. **Ids and sequence numbers are
  assigned by the server** — the ids in the file are import identity only.
- Validation limits are matched to what the live model can actually store, so a package that passes
  validation is persistable.

### 4.13 Manual and hybrid creation — IMPLEMENTED

The **manual ending creates a package too**. It edits a pending draft in client state and commits
through the same transactional creator, so the game carries its package link by construction rather
than by a second code path remembering to set it. It deliberately does **not** route into the
standalone maker, though the standalone makers remain reachable for building one piece outside the
wizard.

### 4.14 Developer preview and diagnostics — IMPLEMENTED

- **Developer capabilities live in the real screens**, gated on the *effective* roles so a tier
  preview hides them. There is deliberately **no second, developer-flavoured copy of Studies**.
- Validation diagnostics ride on every validation result — versions, ids, counts, part indices, and
  **no content**, on a pass or a failure. Founder-level readers see them; an ordinary user gets the
  plain-language errors.
- Test fixtures are **generated against the open blueprint** rather than checked in, because a
  fixture written against last month's plan fails for the wrong reason. Each bad fixture breaks
  exactly one thing, and fixtures go through the ordinary validate-then-confirm path so a fixture
  behaving differently from a real package is a finding rather than a quirk.
- **Preview as tier** (free / premium / max / public) is server-side, lives on the session, only ever
  reduces privilege, never writes to the account, and ends on sign-out. A client-side flag would be a
  costume — the screen would draw a padlock while the API served the paid answer behind it.

### 4.15 Study-aware bug reporting — IMPLEMENTED

"Report a problem" on a wizard validation error or an import failure opens the terminal's **existing**
bug flow with the diagnosis attached. There is deliberately no second, Studies-only ticketing system.

- The point is that the reporter does not have to explain any of it — they know the screen said no,
  not the step id, the schema version, the validation codes, or whether they pasted or uploaded.
- **The schema is a closed list of short scalars, and no field a package could arrive in.** Anything
  else the client sends is stripped server-side; the client's list is a mirror, not the enforcer.
- The one exception is an optional **small sample**, filled only by an explicit press, hard-capped,
  and dropped rather than truncated if over-length.
- The context is appended as its own message rather than folded into the reporter's words, is
  **not** shown to the AI intake, and is honoured on a **bug** only.

### 4.16 Compliance copy in Studies — IMPLEMENTED

Centralised, and there are **four sentences of it**. The rule is not "say more" but "say it once,
where it matters" — a wall of disclaimers is worse than a short notice at the point of risk, because
people stop reading it and it makes an educational product look like a legal one.

- An **educational-only** notice and an **affiliation** notice at the foot of the study surfaces.
- A **rights** notice at the AI handoff step and nowhere else — that is where "am I allowed to use
  this?" actually arises.
- A **score** notice on the leaderboard and nowhere else — a ranked list of people is the one place a
  study percentage could be read as a claim about investment ability.

The **attestation is deliberately not in that file**: it lives server-side, versioned, because it is
*recorded* against a submission rather than merely displayed.

The AI handoff also carries a standing **rights-and-educational-use block** on the first handoff and
on the repair instructions alike: original questions; no copyrighted question banks, books or
courses; supplied material only where the creator may use it; finance content educational; no
personalised recommendations; no individualised buy/sell/hold; follow the format exactly.

### 4.17 Studies sections today — IMPLEMENTED

Study Creation (paid: authoring), Study Packages, Study Game, Flashcards, Practice Tests, Study
Presentations, Progress. Study Game / Practice Tests / Progress are one launcher parameterised by
target. **All study content is team- or person-built — there is no hardcoded subject**, other than
the terminal's built-in example games, which are not shown by default and are added from a browse
gallery into a learner's own list.

**Making is paid; playing is not.** A free account works through every built-in game, set and
presentation and keeps its progress, streak and level. A locked authoring tile is **shown with its
tier badge, never hidden**.

### 4.18 Not built yet — FUTURE

Nothing in the package layer is known to be half-finished, but these are explicitly *not* built:

- Package **versioning** (the stable ids and the frozen-when-published rule are the groundwork; there
  is no version history, no diff, and no "update your copy" flow).
- **Editing rights for share recipients** — sharing is read-only.
- Any **billing** path for Studies or anything else.
- Any **VTS-AI-generated** package creation path in the new workflow (deliberately).

---

## 5. Current Studies Product Decisions

**OWNER-APPROVED** — these are settled decisions, not merely observed code behaviour.

1. **VTS defines the protocol; the creator's own external AI generates the content.** The terminal
   specifies the shape, produces the handoff, and validates what comes back.
2. **The new Study workflow should use little or no VTS AI generation.** This is an economic and
   architectural decision, not an oversight. The wizard, handoff, import, validation and repair paths
   make zero VTS AI calls.
3. **Advanced AI users should be able to work the structure out in their own AI.** The handoff tells
   their model to ask one question at a time, and the format is documented well enough for a capable
   model to produce a valid package directly.
4. **The original study-game levelling, streak and scoring mechanics must remain intact.** Packages
   changed who can reach content and who appears on a board; they changed nothing about how a learner
   levels or scores.
5. **Study sharing is separate from trading/private groups.** A recipient joins nothing. This is the
   reason the package layer exists, because a public signup has no group and none can be invented.
6. **Public content requires review.** Submitting is a request. An administrator publishes, asks for
   changes, or declines.
7. **Accepted recipients follow the authoritative shared package** — the same game, not a copy, so
   there is one canonical package and each person keeps their own progress against it.
8. **Edited public content requires review again.** A published package is frozen against in-place
   edits; the way to change it is to withdraw or be unpublished, edit, and submit afresh with a fresh
   attestation.
9. **A creator can always withdraw their own publication**, without an administrator and without
   paying.
10. **Withdrawal and archiving are not deletions.** Nothing about content, progress, ids or existing
    shares is destroyed by either.
11. **Removing access never destroys the other person's progress.**
12. **Categories and slides have stable identity**, because names and positions are not identity and
    treating them as such silently destroyed learner history.
13. **Weighted results must never report a figure that was not measured** — uncovered categories are
    rescaled out and named.
14. **Making is paid; playing, browsing and keeping your progress are free.** Locked authoring
    surfaces are marked with their tier rather than hidden.
15. **Compliance copy is centralised and minimal** — four sentences, each at its point of risk.
16. **Developer tooling lives in the real screens.** No parallel developer implementation of Studies.
17. **Bug reports from Studies carry machine context, never study content.**
18. **Built-in games have a public install-wide leaderboard; package games rank their own audience;
    legacy user-made games have none.** Learners may opt out of appearing on others' boards.

---

## 6. AI Architecture

**IMPLEMENTED**

**User-facing name is always "VTS AI".** "Claude", "Anthropic" and model IDs appear only in server
config and internal identifiers.

**Provider and models.** Anthropic, via the official SDK, **server-side only** — the browser never
sees the key. Two model roles, both environment-overridable: a **text** model (currently a Sonnet-tier
model) and a **vision/analysis** model used for screenshot reading (currently Sonnet-tier; it was
moved off the Opus tier for cost, because reading a trade off a broker screenshot is structured
extraction rather than hard reasoning). **No streaming anywhere** — every call is a single awaited
request. With no API key configured, AI endpoints answer 503.

**Where AI is used.**

- **Ask VTS AI** — the general assistant panel, with workspace-aware guidance.
- **The study tutor** — explanations and open questions inside the study game and flashcard player.
- **Vision flows** — four screenshot-reading paths: alert analysis, manual/funded position import,
  funded-trade close, and reading challenge equity off a platform screenshot. All four parse
  structured JSON out of the reply, so **that parse is what a model change must be checked against**,
  not just a typecheck.
- **Support and feedback intake** — structured, and deliberately free on every tier.
- **Market-hours lookup** for filling a strategy session to an instrument's full market hours.
- **Background jobs** — news headline tagging and calendar explanations, on the feed poller with no
  user behind them.
- **A to-do command bar** exists server-side and is reachable from no screen.

**Entitlement distinctions.**

- **Max:** the general assistant (`ai`), and **typing your own question to the study tutor**
  (`studyAsk`) — open-ended, so it has no ceiling on what one learner can spend.
- **Premium:** the tutor's **one-tap explanation** ("Break this down" / "More Details")
  (`studyExplain`) — one canned opener with a bounded cost, and the thing a learner who got an answer
  wrong actually needs.
- **Free, deliberately:** customer support intake. A user who cannot reach help is a user who cannot
  tell you their payment failed. Never put the complaints channel behind the thing being complained
  about.
- The server splits the tutor's two halves on the **shape of the request**, not on the client's word
  for it.
- The Ask VTS AI button stays in the top bar for everyone, with the composer replaced by an upgrade
  notice, so a free account can discover the feature exists.

**Usage and rate limits.** **Two monthly per-user budgets**, both resetting at the start of each
Eastern-time month, plus one in-memory per-minute burst limit shared across both. Text and **vision**
are metered separately because a screenshot read costs several times a text question, so one counter
did not bound the worst case usefully. Over limit answers **429**, and the message says **which**
budget was hit. Background AI is **recorded but never capped** — a null actor on a usage row means
the terminal did this on its own schedule, and it can never consume anybody's allowance. The budgets
are deliberately not per-tier: an allowance that varies by what somebody paid belongs with the thing
that takes the payment.

**Guardrails and rule-breaking.** Prompts are admin-editable for tone and feature guidance; the
**financial-advice guardrails are not editable and there is no route, screen or setting that can
strip them**. The **model is the detector**, emitting a sentinel at the very start of a refusal which
the server strips and records — chosen over keyword matching (which cannot tell "what does a market
order do?" from "should I buy now?") and over a classifier call per turn (which would double the
bill). Enforcement is **warn first, time out second**: the first refusal in a 24-hour window is a
warning, a second carries a 30-minute pause, answered **423** so the client can distinguish "paused
for breaking a rule" from "allowance spent". The pause covers the assistant and the tutor and
**never support**. This is the **only AI conversation storage in the terminal** — ordinary chats are
never persisted — and a "the AI made a mistake" button flags a case for a human without lifting the
pause.

**One response style** is composed onto every prose prompt from a single place, so editing it once
changes the voice of every AI reply. Replies render as plain text, so the style asks for plain
bullets and numbered steps rather than markdown.

**VTS AI versus external user-provided AI.** These are two separate things and must not be conflated:

- **VTS AI** is the terminal's own paid AI, billed to VTS, metered per user, guardrailed, and gated
  by membership tier.
- **External user-provided AI** is the creator's own ChatGPT or Claude subscription, used in the
  Study Package workflow. VTS composes the handoff locally, the creator's model writes the content,
  and VTS validates the result. **No VTS AI call is made anywhere in that path**, and no VTS
  allowance is consumed.

### FUTURE — approved direction, not built

**The owner has decided that a separate future project will migrate the built-in VTS AI from
Anthropic/Claude to the OpenAI API.**

- This is **not** part of the current Studies correction work and must not be bundled into it.
- **Nothing has been started.** There is no OpenAI dependency, client, configuration, or model
  reference anywhere in the repository today (verified). Every AI call goes through the Anthropic
  SDK.
- The external-AI Study Package workflow is **unaffected** by that migration either way — it calls no
  VTS AI at all, and its handoff is provider-neutral by design.
- Migration surface to keep in mind when it is planned: the two model roles, the four vision flows
  and their JSON parses, the guardrail sentinel mechanism, the editable-prompt store, the two usage
  budgets, and the structured prompts whose output is parsed (support intake and the study-guide
  builder).

---

## 7. Access, Compliance, and Regulatory Design Principles

**IMPLEMENTED / OWNER-APPROVED.** None of the following is legal advice, and none of it asserts that
the product has been reviewed by counsel.

**Studies**

- Study content is **educational and informational** — explicitly not financial, investment, legal or
  tax advice. That position is stated in one centralised place and drawn at the foot of the study
  surfaces.
- Study content may **name third parties to teach about them** without being affiliated with or
  endorsed by them, and says so.
- **Public Study content requires a rights/compliance attestation and administrator review.** The
  attestation is versioned and recorded per submission.
- **A study score is not a measure of investment skill or professional competence**, stated on the
  leaderboard.
- **Study sharing is distinct from trading/private groups.** A share grants content access and
  membership in nothing.
- The AI handoff instructs the creator's model to produce original material, to avoid proprietary
  question banks and protected passages, to keep finance content educational, and to give no
  personalised or individualised buy/sell/hold guidance.

**Terminal-wide**

- **Investments is a tracker that displays and educates.** No in-app execution or money movement, and
  **no personalised buy/sell/rebalance advice**. Deliberately no rebalancing section, no tax advice,
  and no target allocation to measure against — the allocation screen states what is true, never what
  to do about it.
- **Advice-flavoured surfaces carry an "informational only, not investment advice" line.** Market
  Data is deliberately factual with no AI note anywhere on it. The News world/politics categories
  carry no read-through, because a flood or an election has none the terminal could honestly supply.
- **The trading desk places real orders** but never moves money — no deposits, withdrawals or
  custody. It sends an order to the trader's own broker under the trader's own credentials. That
  change is what makes a securities/fintech attorney review a hard launch blocker rather than a
  recommendation, and it raises the case for insurance.
- **Broker credential custody is the main real liability.** Credentials are encrypted at rest with a
  dedicated key, their use is audited, and the Kraken integration is **spot-only by design** so the
  worst case on a leaked key is bounded to the cash and coins in the account with no liquidation path.
- **Anything that takes the user's own API key or credential is Max** — not for what it costs to run,
  but for what it means to hold. Two surfaces qualify today. **Reading a connection's status and
  disconnecting it always stay open**, so a lapsed member can always take their own credential back.
- **Review marks are two things, not one.** A public "still being built" mark, and an amber
  **founder-level-only** compliance-risk mark. The risk mark exists so features awaiting attorney
  review can be found again, and it is never shown to users, members or plain admins — a product that
  publicly labels its own features as legally risky tells customers to worry and writes a record
  pointing at itself. Marks never gate, hide, disable or degrade anything.
- **Developer capabilities must not create a second product implementation.** Preview and diagnostics
  live in the real screens, gated on effective roles.
- Known outstanding items before a public launch (owner's list, not legal advice): organisation Apple
  account and D-U-N-S under the LLC; terms and privacy policy; in-app account deletion; AI-use
  disclosure; the attorney review; and subscription disclosure rules. One known substantive
  correction is outstanding: the current Terms and Privacy describe broker credentials as read-only,
  which is no longer true.

---

## 8. Claude Code ↔ ChatGPT Working Model

**OWNER-APPROVED WORKFLOW**

- **ChatGPT is the product / spec / design owner.** Major product decisions, scope, wording direction
  and architecture choices are settled in ChatGPT first.
- **Claude Code is primarily the implementation agent.** It reads the repository, writes the code,
  runs verification, and reports.
- **Claude Code implements approved specifications rather than re-designing settled product
  decisions.** If a spec says a thing, build the thing.
- **When a genuine product decision blocks implementation**, Claude Code should produce a **concise,
  copy/paste-ready question for ChatGPT** — the decision, the options, and what each would mean —
  rather than guessing or writing an essay.
- **Avoid long speculative re-analysis** when reasonable implementation judgment is sufficient. Make
  the ordinary call, state the assumption in a sentence, and continue.
- **Major product changes are designed in ChatGPT, then handed to Claude Code.** Small corrections
  and mechanical work go straight to Claude Code.
- **The owner is not a developer and does not read the code.** Reports back are one short paragraph in
  plain language: what changed and what it means for using the terminal. No file paths, function
  names, commit hashes or step-by-step accounts unless asked. Failures, real risks, deliberate
  omissions and genuine open questions are always surfaced, plainly and first.
- **Claude Code does not deploy without being asked.** Finished work stops at "branch pushed, here is
  what is ready". Deploying means a pull request and a squash merge to `main`, and only when the
  owner asks in that session.

---

## 9. Repository Invariants / High-Risk Constraints

These are the constraints future work could easily break.

1. **Migrations are not verified by the migration command succeeding.** Three things silently stop a
   migration from running: not being registered in the migration journal; missing statement-breakpoint
   markers between statements (only the first statement gets applied); and a marker appearing anywhere
   else in the file, including inside a comment. A dedicated verification script checks all three and
   must be run after adding one.
2. **Never repair an already-applied migration by editing it.** Applied status is recorded by
   timestamp, so an edit changes nothing on any database that has already seen it. Write a new
   migration.
3. **Test a data-rewriting migration against real data**, not an empty schema. A past migration
   silently renamed every duplicate display name to "1" because of SQL operator precedence, and a
   typecheck could not see it.
4. **Foreign keys are never enabled.** A declared `ON DELETE` action is documentation, not behaviour.
   There is **no automatic cascade on user deletion**.
5. **Per-user deletion is an explicit list.** Any new per-user table must be added to it. Two audit
   tables deliberately survive account deletion; stored AI rule-breaking conversations deliberately do
   not.
6. **Stable ids are tied to learner progress.** Progress is keyed by (learner, game); package
   categories are identified by id, not name; slides are identified by id, not position. Breaking any
   of these silently destroys or misattributes learner history.
7. **Slide ids must round-trip through the editor**, including through the request schema — a schema
   that strips undeclared fields is the easiest place to break the whole mechanism, and the symptom is
   every save looking like a deck of brand-new slides.
8. **Access control is server-authoritative.** The client mirrors rules to draw locks and marks. Never
   move a decision to the client, and never let a preview or developer mode grant anything.
9. **One resolver decides package access.** No per-handler exceptions.
10. **Paid rows are marked in the client, and paid tiles are never stripped on save** — a lapsed
    membership must not quietly delete somebody's saved arrangement. Opt-in-gated tiles *are* stripped,
    which is a different rule.
11. **Section keys are screen keys.** Rename labels freely; never rename keys.
12. **Sidebar order is code-only.** Do not add a second runtime source of nav order.
13. **The legacy Studies implementation is dead and must stay dead.** Roughly two dozen pre-team-decks
    Studies endpoints are still registered with no caller in the web app, and their names are
    near-misses for the live ones. Reviving them is how a leaderboard ends up with two disagreeing
    sources. More generally: **a method existing in the API client is not evidence a feature works** —
    check for a caller.
14. **Two writers of one figure is the recurring bug shape.** Where a number appears on more than one
    surface, both must compute it through the same function. The Live Wall's tiles restate most
    screens, so **changing a screen means checking its tile in the same change.**
15. **Never let a fabricated or unavailable figure read as a measured one.** This applies to position
    feeds, market data rows, portfolio totals, net worth, and weighted study scores.
16. **Studies verification scripts exist and should be run after touching their areas:** a study
    package format/validator/slide-identity check, a sharing/library/leaderboard walk-through that
    **writes** and therefore refuses to run against any database that already holds a user, plus
    typecheck and build at the root. Do not weaken that write guard.
17. **Two things to check before editing anything:** that this is the live checkout (the remote, a
    plausible version string, deep history, and a path on local disk rather than a cloud-sync folder),
    and that the branch is current with `main`.

---

## 10. Current Project Status Snapshot

> **CURRENT SNAPSHOT — may become outdated.** Everything in this section describes a moment in time
> and should be re-verified rather than trusted. It is for orientation only and is **not** durable
> project memory.

- **Date of this snapshot:** 2026-08-11.
- **Working branch:** `claude/vts-gpt-memory-handoff-d7wm5z`, which currently sits **exactly at
  `origin/main`** with no code changes of its own. It was created for this handoff document.
- **Version on `main`:** `Beta V 7.01`.
- **Studies work is deployed.** The full Study Package feature set — the container model, stable
  category and slide identity, the creation wizard, the external-AI handoff, deterministic JSON and
  multipart import, manual creation, username sharing, the public Study Library with moderation,
  package leaderboards, archiving, and creator withdrawal — is merged to `main` and live. The most
  recent Studies release was creator self-withdrawal from the library.
- **Latest migrations** run to the study-package, sharing, session-preview and library-withdrawal
  series. Nothing appears half-applied.
- **Major handoff in progress:** the owner-testing correction pass on the shipped Studies work.
  This repository carries **no tracking document** for it — its contents are whatever the owner has
  found in testing, and ChatGPT should ask rather than assume what is on that list.
- **Verification status:** no verification was run as part of producing this document, because it
  changes no product code. The repository's checks are typecheck, build, migration verification,
  credential-encryption verification, and the Studies package and sharing checks.
- **Known open tasks (from the repository's own notes, not a task tracker):** the Terms and Privacy
  documents still describe broker credentials as read-only and need correcting; broker-credential key
  rotation is designed for but not built; billing (StoreKit for iOS, a separate web path) does not
  exist; investment account aggregation is manual-entry only; roughly two dozen superseded Studies
  endpoints and a handful of other unwired endpoints are still registered, and removing them is an
  owner decision rather than a tidy-up.

---

## 11. Approved Future Work

**OWNER-APPROVED, not completed.**

1. **Complete the current Studies owner-testing correction pass.** The shipped Study Package work is
   being exercised by the owner; corrections arising from that testing are the immediate priority. Do
   not fold unrelated changes into it.
2. **Terminal-wide migration of built-in VTS AI from Anthropic/Claude to the OpenAI API**, as a
   separate project, **after** the Studies correction pass. Nothing has been started. The external-AI
   Study Package workflow is unaffected.
3. **Billing.** Apple StoreKit auto-renewable subscriptions for iOS (Apple's rails are mandatory for a
   digital subscription inside an iOS app) and a separate web billing path. The membership layer
   already carries a "billing" source for when it exists.
4. **The native iOS shell** — a Capacitor wrap of the existing web app plus a native SwiftUI widget
   extension, with a per-user revocable bearer token for the widget scoped to **display data only**,
   never broker keys or trade ability. Whether the iOS shell can ship the order-placement desk at all
   is a legal/licensing question, not a build-time decision.
5. **Pre-public-launch compliance items:** organisation Apple account and D-U-N-S under the LLC; terms
   and privacy policy (including correcting the read-only-credentials claim and covering the audit
   tables that outlive an account); in-app account deletion; AI-use disclosure; the
   securities/fintech attorney review; and consideration of E&O / tech / cyber insurance.
6. **Broker-credential key rotation.** The envelope format already carries a key identifier and the
   error types a rotation path needs; the rotation itself is not built.
7. **Read-only investment account aggregation** via a paid provider — an owner decision, with the
   data model already carrying the source values for it.
8. **An entitlement layer for public users** — trial state, expiry, grace period — sitting alongside
   the existing roles, once real money and general public signups are involved.

---

## 12. Things ChatGPT Should NOT Assume

1. **Do not assume old or superseded Studies routes reflect live UI behaviour.** A large set of
   pre-team-decks Studies endpoints is still registered with no caller, and their names are near-misses
   for the live ones. Existence in the API client is not evidence a feature works.
2. **Do not conflate Study sharing with trading/private groups.** They are separate systems with
   separate access models. A Study share makes somebody a member of nothing; private groups are a
   hand-granted, non-purchasable feature with its own guard.
3. **Do not assume public Study content may be edited without review.** A published package is frozen
   against in-place edits. Changing it requires withdrawal or unpublication, then a fresh submission
   and a fresh approval with a fresh attestation.
4. **Do not assume external Study Package creation should consume VTS AI.** The whole workflow is
   deliberately zero-VTS-AI: the terminal specifies and validates, the creator's own model writes.
   Proposing a "just generate it with VTS AI" shortcut contradicts a settled decision.
5. **Do not assume the snapshot in section 10 is still current.** Branch, version, deployment state and
   open tasks change constantly. Re-verify before relying on any of it.
6. **Do not assume the OpenAI migration has begun.** There is no OpenAI code in the repository. It is
   an approved future direction only.
7. **Do not assume archiving or withdrawal deletes anything.** Neither destroys content, progress, ids
   or existing shares. Only account deletion purges a package.
8. **Do not assume a role grants a workspace.** Roles no longer decide workspace visibility — the
   per-user opt-in does, membership decides what is reachable, and a grant decides private groups.
9. **Do not assume "team" is safe to use in copy.** It is an internal key only; user-facing copy says
   private group. And "the team" meaning company staff must read "VTS staff".
10. **Do not assume a section can be renamed at the key level.** Rename labels, never keys.
11. **Do not assume Claude Code will deploy on completion.** It stops at a pushed branch unless the
    owner asks, and deployment is a pull request plus a squash merge to `main`.
12. **Do not assume declared database cascades work.** Foreign keys are never enabled; cleanup is
    explicit.
13. **Do not assume a figure shown on a screen is computed once.** Most screens have a Live Wall tile
    restating them, and keeping the two in step is a standing requirement.
14. **Do not treat the repository's own project guide as internally consistent everywhere.** See the
    contradictions noted to the owner alongside this document.

---

# Instructions for the New ChatGPT Conversation

1. **Read this entire handoff** before responding to any VTS Portal request.
2. **Treat sections 1–9, 11 and 12 as durable VTS Portal project context.** They describe the product
   as it actually exists and the decisions behind it.
3. **Treat section 10, the Current Project Status Snapshot, as potentially stale.** Branch names,
   version numbers, deployment state and open tasks change constantly. Ask before relying on any of
   it.
4. **Ask me before saving anything ambiguous as long-term project memory.** If a fact is unclear,
   contradicted, or looks like a temporary implementation detail, check with me rather than committing
   it.
5. **Update project memory with the durable information in this document**, so future conversations
   inherit it without re-reading the repository.
6. **Continue using ChatGPT as the product / spec / design owner and Claude Code as the
   implementation agent**, unless I explicitly change that workflow. When implementation raises a
   genuine product decision, expect a short copy/paste question from Claude Code, and answer it as a
   spec decision rather than as code direction.
