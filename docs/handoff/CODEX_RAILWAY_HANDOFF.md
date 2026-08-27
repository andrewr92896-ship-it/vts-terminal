# Handoff — VTS Terminal, Railway unblock

You are picking this up from a Claude Code session that could not finish it. The
reason is not authorization and not skill: that sandbox's egress proxy blocks
`railway.com`, `backboard.railway.com` and every `vitalistradingsystems.com`
host. GitHub is reachable, nothing else relevant is. So the code work is done
and pushed; the dashboard work is not, and that is what you have that it did not.

**Andrew is not a developer.** Report in a short paragraph of plain language:
what changed and what it means for using the terminal. No file paths, no
function names, no step-by-step account of what you did.

---

## THE ONE THING THAT MATTERS MOST

**This service is live and a bad deploy takes it down.**

Railway keeps the previous version running when a *build* fails — that is
harmless. But a build that **succeeds** and then exits at startup replaces a
healthy container with a dead one, and the site returns 502 until someone
notices. That already happened once here, on 2026-08-27: `Beta V 7.38` deployed,
the API called `process.exit(1)` because `PRIVATE_ACCESS_USER_IDS` was not set,
and the private terminal went down. It was recovered by reverting to
`a184c9f`, which is what `main` currently is.

Do not merge anything to `main` unless Andrew asks in that session. Merging to
`main` **is** the production deploy.

---

## TASK 1 — Set `PRIVATE_ACCESS_USER_IDS` (this is the blocker)

The private terminal refuses to start in production without it. It is the
allowlist of account IDs permitted to sign in to the private portal — the
boundary that stops every account in the database reaching it.

1. Railway → the **private terminal** service → **Variables**.
2. Add `PRIVATE_ACCESS_USER_IDS`.
3. Value: Andrew's account ID. Comma-separated for more than one. UUID format.
4. Save. The service redeploys.

**Where to get the ID:** sign in to the private terminal → **Admin ▸ Users** →
each row now shows its account ID with a copy button. (That button ships in
7.38, which is not deployed yet — so on the currently deployed version you may
need to read it from the database instead, see Task 2.)

**Also check** whether `PRIVATE_BOOTSTRAP_ADMIN_ID` is set on that service. If
it is, its value **must also appear** inside `PRIVATE_ACCESS_USER_IDS`, or the
service refuses to start for a second reason. Either add it to the list or
remove the variable.

### Verify before you redeploy, not after

The branch below adds a preflight check that runs the identical startup
validation **without starting the server** and reports every problem at once:

```
railway run --service <service> npm run preflight
```

It prints each missing or invalid variable with the fix beside it, or says the
environment would start. **It only exists on the unmerged branch**, not on
deployed `main`, so run it from a local checkout of
`claude/new-session-yhim93`.

---

## TASK 2 — Survey both databases

Andrew wants to consolidate his real data (broker connections, trade log) into
the private portal. Nobody can sequence that without knowing what is actually in
each database. There is a **read-only** inspector for exactly this:

```
railway run --service <service> npm run db:inspect
```

Run it against **both** services (private terminal, and whichever service the
older/public data lives on) and capture the full output.

It reports: which migrations are applied vs. present on disk, row counts per
content family, and — the important part — whether each stored broker credential
still decrypts, with a three-way explanation when it does not:

- *sealed under a DIFFERENT `CREDENTIALS_KEY`* — the key was rotated or differs
  between services.
- *key matches but the row moved* — the credential is bound to its user ID and
  connection ID; one of them changed.
- *older v1 record, or corrupt*.

That distinction decides whether credentials can be moved at all or must be
re-entered by hand. **Do not guess it — paste the real output.**

`db:inspect` writes nothing. It is safe to run against production.

---

## DO NOT

- **Do not rotate `CREDENTIALS_KEY`.** Every stored broker credential is
  encrypted under it. Rotating it makes them all unreadable and there is no
  rotation path built yet — each trader would have to re-enter their key.
- **Do not rotate `SESSION_SECRET`** casually. It signs cookies; rotating it
  signs everyone out.
- **Do not set `CREDENTIALS_KEY` equal to `SESSION_SECRET`.** The API refuses to
  start, deliberately — one secret must not protect both sessions and broker
  keys. It must be 32+ bytes of *generated randomness* in base64 or hex, not a
  passphrase. Generate with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- **Do not force-push, rebase, or amend** anything on `claude/new-session-yhim93`.
- **Do not open or merge a PR** unless Andrew asks.
- **Do not delete or recreate a Railway service or volume.** The database lives
  on a volume.

---

## Repo state, as of this handoff

- Remote: `andrewr92896-ship-it/vts-terminal`
- `main` = `a184c9f` — *"Revert Beta V 7.38 to restore service (#436)"*. This is
  what is deployed. It is byte-identical to the last known-good tree.
- Working branch = `claude/new-session-yhim93` = `a3fe487`, pushed, **not merged**.
  Carries `Beta V 7.38` plus three commits after it. `npm run verify` passes on it.

7.38 contains, among other things: the public terminal and its demo mode, the
marketing landing page, early access end to end, email two-factor, the account-ID
column in Admin ▸ Users, the environment preflight, and a fix to how gold/indices/
crypto report their movement.

**It is ready to deploy and must not be deployed until Task 1 is done.** Deploying
it against a service with no `PRIVATE_ACCESS_USER_IDS` reproduces the outage
exactly.

---

## If you end up touching code

Read `AGENTS.md` at the repo root first — it is the source of truth for this
codebase and it is long because the traps are specific. `README.md` is stale;
ignore it.

Non-negotiables, condensed:

- **`npm run verify` must pass** before anything is pushed. It typechecks, runs
  every check, and builds. CI runs the same command on every PR.
- **Every deploy bumps `APP_VERSION` and prepends a `PATCH_NOTES` entry** in
  `apps/web/src/meta/version.ts`.
- **Rename a label, never a key.** Screen keys are what routing, in-app links and
  the how-to wording are keyed on.
- **Never let a fabricated or unmeasurable figure stand in for a real one.** This
  is the repo's most repeated rule. A price that could not be read is marked
  unavailable, not defaulted; a total missing a part is refused, not
  approximated; a figure nobody measured is never printed as zero.
- **Never write tips, tricks, or how-to-use-this copy in the UI.** If the control
  says it, do not say it again.
- **Public builds must never import private portal, broker, execution, admin or
  group code.** `npm run verify:boundaries` enforces it. Do not weaken it with a
  runtime flag or a role check — a render-time gate is not the same as not
  shipping the strings.
- **Groups/teams are removed from the public product** and must not come back
  through any path. Trading Notes stay personal and unpublishable.
- **AI fails closed in the public terminal** until a separate provider migration.
  Do not wire a model call into it.

---

## What is still open after these two tasks

- Merge 7.38 (PR, squash-merge — only when Andrew asks).
- Railway services for `apps/marketing` and `apps/public-terminal` do not exist
  yet. Configs are at `deploy/railway/marketing.json` and
  `deploy/railway/public-terminal.json`.
- Domains: `vitalistradingsystems.com` → marketing; `app.vitalistradingsystems.com`
  → public terminal; a separate subdomain → private portal.
- The OpenAI provider switch is built and behind `AI_PROVIDER=openai`, deliberately
  not enabled — Andrew deferred it.
- A verbosity/organization pass over the private terminal, which Andrew wants to
  review before it goes far.
