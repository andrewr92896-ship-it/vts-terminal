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
- **Fixed the demo's own write gaps.** The Investments workspace BROKE in the
  demo, silently: an unhandled name answers with an empty-but-generic payload,
  so `const { portfolio } = await api.createInvestmentAccount(...)`
  destructured `undefined` and the screen published nothing — no error, just a
  blank workspace the moment a visitor tried the first thing they think of. All
  ten investment writes, the contribution/goal/dividend paths and the to-do undo
  are handled now, each mutating the seeded state the reads already derive from,
  so a write and the figure it changes cannot disagree.
- `npm run verify:demo-writes` drives every one of them to the act it exists
  for, asserting on the field the SCREEN destructures. It is in `verify`, so CI
  runs it. This is the half a screenshot test cannot see: a capture asserts a
  page rendered, not that pressing "add" on it did anything.
- **`npm run verify:demo-coverage` closes the whole class.** It walks the public
  screen tree, collects every `api.*` call reachable from it, and requires each
  to be answered — served live, served by the demo, refused as AI, or NAMED in
  the script with the reason it is deliberately unbuilt. The named list is the
  point: a gap somebody decided to leave is fine, a gap nobody knows about is
  not. Proved to fail by removing a handler, not merely observed to pass.
- Auditing that way found the rest of the class and fixed it: the hand-kept
  funded book's writes (Manual Trades is a retained nav row), and reporting a
  bug — which is free on every account, is what somebody evaluating the product
  is most likely to press, and put `undefined` straight into the list the screen
  renders.
- It also found a SECOND AI route slipping the guard by name, after
  `flashcardsFromGame`: `closeFundedTrade` reads the result off a screenshot.
  Both are now refused by name rather than falling through to "route not found".
- **The check now covers a second class: works in the demo, 404s for a real
  account.** That one is easy to miss and expensive — the screen that was the
  proof the product works is the screen that breaks for the first customer.
  Twelve calls were in that state. Each is now either wired live or NAMED in
  `DEMO_ONLY` with its reason. Proved to fail by unnaming one.

- Gave the public terminal a ninth record family with real storage: SUPPORT —
  reporting a bug, replying on the thread, and sending a suggestion. Wired for
  real accounts rather than left demo-only because it is the channel through
  which everything else gets reported: a user who cannot reach help is a user
  who cannot tell you their payment failed. It sits on nothing but a session —
  no tier, no opt-in, no entitlement.
- A reply can only ever be posted as `user`. There is no admin surface on the
  public side, so a client must not be able to post a message that renders as
  staff having answered. The summary is derived from the first line rather than
  typed: a reporter should not have to title their own bug report.
- No AI triage, and that is stated rather than stubbed. The private side runs an
  intake conversation to draw a usable description out of a person; here the
  report is simply what was written.

- Gave the public terminal a tenth record family with real storage: THE
  HAND-KEPT TRADE LOG, with Deleted Trades behind it. No broker is involved in
  any of it — no credential stored, no order placed, no position read — which is
  what makes it safe to have here at all. `source` is fixed server-side, because
  claiming a row came from a broker fill is a claim about where a number came
  from.
- **The break-even band is fixed at exactly flat, and SAID SO in the payload.**
  The private terminal scores against a band the desk sets; setting it is a
  desk-settings surface and the public terminal has none, so there is nothing to
  honour and nothing to diverge from. It matters that the payload states it: the
  SCREEN recomputes the summary itself whenever a filter is on, so given the
  same config the two halves cannot disagree about a win rate.
- The tests are mostly about the difference between ZERO and UNKNOWN, because
  getting it wrong does not error — it quietly scores a trade nobody scored. An
  open trade's result is null however it arrives; a hand-kept open trade's
  unrealized P/L is null because no live price stands behind it; slippage is
  null when no plan was stated; and a log with nothing scored reports no total
  rather than a flat zero.
- Deleting is SOFT. A hand-typed trade exists nowhere else and no broker can
  re-import it, so a hard delete would be the one act on that screen with no way
  back. A row in the bin cannot be edited either — rewriting it there would mean
  restoring something other than what was removed.

- Gave the public terminal an eleventh record family with real storage: THE
  FUNDED BOOK. VTS never places a funded trade and never will — the trader
  places it at the firm and writes it down here — so there is no integration, no
  credential, and nothing on that path reaches the firm.
- The account's headline figures are DERIVED from its trades on every read
  rather than stored beside them: stored, the balance and the trades that
  produced it could disagree and there would be no way to say which was right.
  With no starting balance stated there is NO balance, rather than a bare P/L
  presented as one — that would be a figure the account never held.
- A stop or target is null when none is KNOWN OF, which is deliberately not the
  same as "there is none": a funded position with no protection on it is the
  most important thing a row can say, so it must not be implied by an absence of
  data. Commission is null when not stated and is never read as zero, since
  nothing can look a prop firm's schedule up.
- **`verify:demo-coverage` now reports ZERO demo-only calls.** Every reachable
  api call on a public screen either works on a real account or is named as
  deliberately unbuilt.
- A test caught a routing bug worth recording: the guard for the bare
  `/funded/trades` path matched `trades/<id>` too and swallowed every funded
  trade delete — which then 404'd for the right-LOOKING reason, so the ownership
  test beside it passed while proving nothing.

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

- Gave the public terminal a seventh and eighth record family with real storage:
  FLASHCARD SETS and STUDY PRESENTATIONS. With study games that is every Studies
  screen except the sharing half working on a real account.
- **A slide's `id` is the whole presentation design.** Slides are stored as one
  blob, so an array position identifies nothing — it changes the moment somebody
  drags a slide up the deck. Each slide carries its own id, MINTED ON WRITE ONLY
  (a read that invented identity would hand out a different id every time) and
  round-tripped through the editor, or every save would look like a deck of brand
  new slides. Tested in both directions.
- **An oversized screenshot is REFUSED, not dropped** — a deliberate divergence
  from the private side, which drops it. Dropping saves a presentation with a
  slide the author believes has a picture on it, and they find out when they
  present. A slide with nothing on it at all is still dropped, because that is
  nothing rather than something lost.
- A set's topics are DERIVED from its cards on every read rather than stored
  beside them: stored, the two could disagree about what is in the set.
- `flashcardsFromGame` is now refused BY NAME as an AI route. None of the words
  the AI guard matches appear in it, so it fell through to "route not found" —
  which reads as a broken button rather than a feature that is switched off.

- Still demo-only: the Study PACKAGE, sharing and public-library half. Sharing by
  username and a moderated public library both mean one public account's content
  reaching another's screen, plus an attestation and a review queue with no admin
  surface on the public side. That is a product decision, not a port.

- **THE POSTGRES STORE NOW ACTUALLY RUNS, AGAINST A REAL DATABASE.** Every other
  test drives the in-memory store, which is a faithful model of the contract and
  executes none of the SQL — so twelve migrations and every query in
  `postgresStore.ts` had never once been run. A wrong column name, a bad jsonb
  cast or an inverted soft-delete predicate would have surfaced for the first
  time when the public service was deployed, looking like the feature was broken
  rather than like one wrong word.
- `npm run verify:postgres` applies every migration to an empty schema and
  drives one round trip through each of the eleven record families. It runs in
  CI as its own job with a Postgres service — separate from `verify`, which
  deliberately needs nothing at all.
- It is NOT a second copy of the behavioural tests. Those belong with the memory
  store, where they are fast and total. What is checked here is only what the
  memory store cannot check: that the statements are valid, and that what goes
  into the database comes back out as the same shape.
- **Proved to catch two classes of fault**, not merely observed to pass: a wrong
  column alias and an inverted soft-delete predicate. The first attempt did NOT
  catch the alias — the assertions read a summary computed from prices, so an
  `undefined` came back unnoticed — so the reads now assert every column rather
  than the few a summary happens to use.
- The last case is the one nothing else could see: deleting an account and then
  checking that no table anywhere still holds rows for it. Every record family
  cascades correctly.

- **There is a migration RUNNER now**, which there was not: provisioning meant
  feeding twelve files through psql by hand, in order, remembering which had
  already been applied. `npm run db:migrate:public` does it once and repeatably,
  is idempotent, and is on the public API's start command so every deploy
  applies what is pending.
- It **refuses to run against a database holding non-`public_*` tables** — that
  is the private database's shape, and pointing this at it by mistake is the
  worst thing the script could do. Proved by pointing it at a database holding
  `users` and `broker_connections`.
- `verify:migrations` read the first two migrations BY NAME, so every migration
  added since was covered by none of its guards — including the one that stops a
  public migration creating a private table. It reads all of them now, and also
  checks the numbering is a sequence rather than assuming it.
- `deploy/railway/public-api.json` did not exist; the other three services had
  configs and the API had none.
- `docs/implementation/public-launch-runbook.md` is the ordered list of what is
  left, all of which needs a Railway account and a domain.

- **`npm run verify:public-wiring` checks the adapter's paths against the
  server's routes.** `publicApi.ts` names 66 of them and `server.ts` serves
  them; both are written by hand and had never been run together. Nothing else
  could have caught a typo there — the adapter is not typechecked against the
  routes, the demo never reaches them, and the API's own tests write the paths a
  second time in the test file. So it reads the paths OUT OF THE ADAPTER and
  calls each against a real server on a real database. Proved by misspelling one.
- It counts only a route-not-found. A 400 means the route is there and did not
  like an empty body, which is a different question and one the API's own tests
  already answer.

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
- Provision a public database and public API (the API exists and has auth, market data, layout, early access, budget, to-do, investments, net worth, trading notes, study games, flashcards, presentations, support, the hand-kept trade log and the funded book; the remaining record families are still demo-only).
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
