# Public/private migration status

Updated: 2026-08-27.

## Completed in code

- Recorded the pre-change single-service architecture.
- Added independent marketing, public-terminal and private-portal build targets.
- Added separate Railway service configurations.
- Ensured public source/builds import no private application code.
- Added a public-artifact identifier scanner to `npm run verify`.
- Linked marketing only to `https://app.vitalistradingsystems.com`.
- Added a permanent `www`-to-apex redirect in the marketing server.
- Reclassified the existing combined app/API as private.
- Removed credential-free demo login and public early-access submission from the private entry point.
- Added an explicit production private-user ID allowlist checked at login and on every session lookup.
- Added private origin, database, session-secret and cookie configuration names.
- Added a host-only private production cookie name and forced secure production cookies.
- Added private crawler exclusion and response hardening headers.
- Added GitHub Actions validation for `codex/**` branches.
- Added architecture, feature, deployment and access documentation.
- Removed the private terminal's monthly screenshot-to-trade quota while retaining
  vision usage metering, the shared per-minute burst limiter, 12 MB request
  bodies, accepted image MIME validation and existing route permissions.

- Built demo mode as a runtime mode (`?demo=1`) over module state: nothing is
  saved, leaving resets it, and one bundle serves both the demo and real
  accounts. Proven across every retained page family at three widths, including
  that a write in the demo reaches no service and sets no cookie.
- Replaced the marketing holding page with a sales landing page carrying the
  demo, early access and an explicit "what it deliberately does not do".
- Built public early access end to end: route, migration, rate limit, bounded
  storage, and the same answer whether or not the address is already on the
  list.
- Added the AI provider seam with OpenAI behind it, switched off; public AI
  still fails closed by name before the demo store is consulted.
- Made the public API's auth service INJECTABLE. It was not, and it held the
  module-level Postgres store, so every authenticated route resolved its session
  against a database no test could reach — the authenticated half of the API was
  untestable, which is the half that most needs testing.
- Gave the public terminal its first record family with real storage: personal
  budgeting, on the same contract the private portal settled on (integer cents,
  positive amounts with `kind` carrying the sign, Eastern months, archive keeps
  history and delete removes it, `source` server-owned as the aggregator seam).

- Gave the public terminal a second record family with real storage: personal
  To Do, with the private side's display rules (Eastern daily reset, recurring
  timers, markers) shared as pure functions so one component cannot behave two
  ways. Seeding is idempotent by CONSTRAINT rather than by an in-process guard,
  which the private side uses and which cannot hold across instances.

- Gave the public terminal a third record family with real storage:
  Investments — accounts, holdings, transactions, goals and a forward-only
  daily history. The valuation math is a VERBATIM MIRROR of the private one,
  because the public API may not import private code; `verify:investments-mirror`
  compares the two files byte for byte below their headers AND runs both through
  the same fixtures, so drift fails in CI rather than as two screens quietly
  disagreeing about what a portfolio is worth.
- No live quotes on the public side yet, stated rather than papered over: a
  holding is priced from what its owner typed or it is unpriced, and an unpriced
  holding is excluded from every total and COUNTED. The three price sources are
  already distinguished, so wiring a provider is a branch rather than a rewrite.

- Gave the public terminal a fourth record family with real storage: Net Worth,
  which reads the portfolio live rather than storing it (one definition of what
  a portfolio is worth, not two), offers no category that would let it be typed
  in a second time, stores every value positive with `kind` carrying the sign,
  and refuses an incomplete total rather than approximating one — writing no
  history point in that state either.

- Gave the public terminal a fifth record family with real storage: Trading
  Notes. The three rules that make it a record rather than a diary are kept and
  tested, because each fails silently if it regresses: a call FREEZES once its
  window opens and only its reflection may be written afterwards, a verdict is
  given once, and `unsettleable` is a real outcome that is counted on its own
  and never scored as a miss. The Eastern, Monday-based week key is STORED
  rather than derived, so a call cannot move between weeks when somebody changes
  their display zone.
- The group half is ABSENT rather than disabled: no `visibility` column, no
  publish route, and nothing in the public API that could share, copy, route or
  distribute a call. `autoSettles` is hard false and `openPrice` stays null
  because there is no price feed — a `true` there would tell a trader the
  terminal will grade the call for them, and it never would. `gradeCall` is kept
  and tested anyway, so the rules a feed must follow (an unchanged price is a
  MISS; no reference is unsettleable, never a miss) are already pinned.

- **Wired the public terminal's client to those five families.** They had real
  storage that nothing could reach: the adapter sends any unrecognised `api.*`
  call to `/records/<name>`, which the public API does not serve, so on a real
  account Budget, To Do, Investments, Net Worth and Trading Notes would all have
  404'd while the storage behind them sat there working. It was invisible only
  because nothing but the demo has ever run. The demo is still checked FIRST —
  `publicRequest` refuses to reach the service from inside it — which is why the
  live map sits behind that branch rather than beside the market-data methods.
- Two payload mismatches surfaced doing it, both of which render as an undefined
  figure rather than an error: the budget month carried no totals at all (the
  screen reads six), and net worth sent `daysRecorded` where the screen reads
  `totalDays`, with no `asOf`. Both are fixed on the SERVER, since the totals are
  money arithmetic and there must be one definition of them; a test now pins the
  field names.
- Budget money now arrives as DOLLARS and is converted to cents at the edge,
  matching the private route exactly, so the adapter carries no unit conversion —
  the one place a 100× error could hide silently.
- Still demo-only, and now visibly so: the investments and trading-notes WRITE
  paths in the demo store (they fall through to an empty fixture).

- Gave the public terminal a sixth record family with real storage: STUDY GAMES
  — the decks, their questions, each learner's progress, and combining games.
  That is Study Game, Practice Tests and Progress working on a real account,
  plus the reviewed-questions creation path.
- **No leaderboard, and its absence is the decision worth recording.** On the
  private side a built-in game is ranked across every copy of itself on the whole
  install; doing that here would put one public visitor's display name and
  accuracy on a stranger's screen — a product and privacy question with a
  moderation dimension, since display names are typed by the person. Every deck
  reports `hasLeaderboard: false`, there is no board route, and the client keys
  its tab on that flag so it hides rather than opening an empty board.
- **Nothing is seeded.** A new account has no games and the screen says so.
  Seeding invented ones would present something nobody created as something
  somebody did — the same rule the Live Wall's `sample` union and the funded
  account fix already enforce.
- `seq` is assigned by the SERVER by position, never taken from the file: it is a
  question's stable identity within its deck and the saved draw is keyed on it,
  so a file whose questions all claim the same seq would collide silently and
  start asking a mid-round learner the wrong questions.
- Two faults were caught by the tests rather than by reading: the game-state cap
  was unreachable behind a 16 KB request-body limit (a real state blob runs to
  tens of kilobytes, and the client saves progress fire-and-forget, so progress
  would have silently stopped recording), and replacing a game's questions left
  a category no question was filed under, keeping its weight in the denominator
  of a score nothing on screen explained.

- Still demo-only: the Study PACKAGE, sharing and public-library half. Sharing by
  username and a moderated public library both mean one public account's content
  reaching another's screen, plus an attestation and a review queue with no admin
  surface on the public side. That is a product decision, not a port.

## Partially completed

- `PRIVATE_DATABASE_URL` is supported, but the physical existing database has not been moved or renamed.
- `PRIVATE_SESSION_SECRET` is supported, but the existing Railway service must be configured before merge/deploy.
- The public terminal is a safe isolated shell, not a customer product.
- Screenshot-to-trade remains private because the public terminal has no
  authentication, API, database or AI provider path. The central policy now
  represents vision as metered-without-a-monthly-quota, so a future public
  implementation can reuse that contract only after public-specific
  infrastructure and product/legal review; this change does not build it.
- Public/private deployment configs exist, but Railway services and domains do not.
- Private admission is allowlist-based, but MFA and dedicated auth audit logging are not implemented.

## Blocked/manual

- Provision separate Railway services.
- Provision a public database and public API (the API exists and has auth, market data, layout, early access, budget, to-do, investments, net worth, trading notes and study games; the remaining record families are still demo-only).
- Configure separate public authentication.
- Configure private MFA.
- Populate `PRIVATE_ACCESS_USER_IDS`. Since 7.42 an entry may be an ID, a username or an email — a username survives the database changing, which an ID does not.
- Set separate secrets and logging destinations.
- Attach domains, create DNS records and wait for TLS.
- Design any production data migration.
- Confirm vendor/licensing treatment for market data and broker access.
- Review execution, partner distribution and personalized features with legal/compliance counsel.

## Tests

Baseline before editing: `npm ci` and `npm run verify` passed on `main` at `444f709`.

This branch is validated by GitHub Actions with `npm ci` and `npm run verify`. The boundary suite builds the marketing/public artifacts, scans source and output, verifies the marketing destination and verifies private crawler exclusion. The AI usage check submits 44 metered vision calls across every screenshot kind (past the former cap of 40), confirms the retained burst limiter still rejects an excessive burst, and confirms the monthly text budget still blocks at its configured limit.

No live broker, production database, DNS, deployment, customer, billing or authentication-provider action is part of the test.

## Pre-existing issues

- No general lint command.
- No general CSRF-token middleware.
- No global API/login rate limiter.
- npm audit reported high-severity runtime dependency advisories during the readiness audit.
- The existing private application and API remain broad and tightly coupled to one schema.
- `AGENTS.md` and `.env.example` already acknowledged configuration drift.

## Remaining risks

The architecture is not production-separated until physical resources, secrets and domains are distinct. Merging before setting `PRIVATE_ACCESS_USER_IDS` will make the private production service fail closed at boot. The public shell must not be presented as a finished customer product.

## Recommended next step

Review and approve this branch, then configure a non-production Railway environment with three services and test the private allowlist/cookie boundary. Only after that should a separate public auth/API/database slice be designed. Start with a non-trading feature such as profile/support; do not migrate broker or partner behavior first.
