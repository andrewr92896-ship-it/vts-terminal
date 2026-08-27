# Handoff — find and restore the VTS private terminal's real data

Written for whoever can operate the Railway dashboard. The Claude Code session
that wrote this cannot: its sandbox blocks `railway.com`, `backboard.railway.com`
and every `vitalistradingsystems.com` host, so it can ship code and nothing else.

**Andrew is not a developer.** Report back in a short paragraph of plain
language: what you found and what it means. No file paths or command output
unless he asks.

---

## The situation

The private terminal at `portal.vitalistradingsystems.com` is live, healthy and
running the current build. Andrew can sign in on his MacBook. **The database it
is serving is empty** — 0 trades, no broker connections, no capital.

His real data exists: **207 trades and 3 broker connections** (2 credentials
still decrypt; Kraken needs re-entering, which he does not care about — he only
uses OANDA). A previous survey found it in "the existing production database",
while "the newer portal database" was empty.

**Nothing is known to be lost.** This is a question of which database the service
opens, not of missing data.

---

## What is already established — do not re-derive

From the Railway Variables tab of service **`@vts/api`**, environment
**`production`** (31 service variables):

- `DATABASE_URL` **is set**.
- `PRIVATE_DATABASE_URL` **is NOT set**, and neither is any other `PRIVATE_*`
  variable except `PRIVATE_ACCESS_USER_IDS`.

That matters because the API resolves its database as
`PRIVATE_DATABASE_URL ?? DATABASE_URL` (`apps/api/src/config.ts`). So the
terminal is reading **`DATABASE_URL`**, and there is no override to remove.

The service also has **Console** and **Backups** tabs. Console is what makes this
solvable without guessing.

---

## STEP 0 — Take a backup before changing anything

Backups tab → take one now. Everything below is reversible, but do this first.

---

## STEP 1 — Make the access list name a person, not a row

**Set `PRIVATE_ACCESS_USER_IDS` to `andrew`** (his username), replacing whatever
UUID is in it.

Do this **before** touching the database, and do not skip it.

That variable is the allowlist for who may sign in to the private portal. It used
to match account IDs only — and an ID belongs to *one database*, so pointing the
service at a different database makes it stop admitting him. The service starts
perfectly well and then refuses the only person who should be let in, with the
message "Invalid email or password", which is indistinguishable from a typo.

As of **Beta V 7.42** (deployed) an entry may be an ID, a username, or an email.
A username survives the database changing. The gate is not wider — the admitted
set is still exactly what is enumerated.

This is very likely why his **iPhone sign-in is failing right now** while his
MacBook session keeps working.

---

## STEP 2 — Find where the real database is

Open the service's **Console** tab. It is a shell on the running container.

First, see what `DATABASE_URL` actually is (Variables tab, click the eye icon).
It will be one of:

- **`file:/…/something.db`** → SQLite on a Railway **volume**. Most likely.
- **`libsql://…`** or an `http(s)://` URL → a remote database. Different path;
  see "If it is remote" below.

### If it is a `file:` path

In the Console, list the volume directory — the parent of that path, commonly
`/data`:

    ls -la /data

**Look for more than one `.db` file.** The strong possibility here is that the
old database is sitting on the same volume under a different name, because
`DATABASE_URL` was repointed during the public/private split. If you see
something like `vts.db` alongside `portal.db`, the larger/older one is very
likely Andrew's real history.

Then identify each candidate — this is **read-only and safe on production**:

    DATABASE_URL="file:/data/<candidate>.db" npm run db:inspect

It prints, per database:

- migrations applied vs. present on disk
- row counts — **look for ~207 under "closed and open trades"**
- every account with its **ID**, and whether the current allowlist admits it
- whether each stored broker credential still decrypts, and if not, whether the
  cause is a wrong key (recoverable) or a moved row (must be re-entered)

Run it against each `.db` you find. The one reporting ~207 trades is the target.

### If `ls /data` shows only the database already in use

Then the real data is not on this service's volume, and the likely locations are:

1. **Another Railway service** in the same project with its own volume — the
   "old portal". Check the project's service list.
2. **A Railway backup** of this volume from before the split. Backups tab.

Report which of these you find rather than acting on it — restoring a backup
replaces the current volume contents and needs Andrew's say-so.

### If it is remote (`libsql://`)

There is no volume to list. The other database's URL has to come from wherever it
was recorded (another service's variables, or Turso's own dashboard). Report what
you find.

---

## STEP 3 — Point the terminal at the right database

Once `db:inspect` has identified the database holding ~207 trades:

**Set `DATABASE_URL` to that database.** That is the whole change. The service
redeploys and comes back with his trades, his OANDA connection and his capital.

- **Reversible.** Put the old value back and you are exactly where you started.
- **Nothing is copied, merged or deleted.** No trade can be duplicated or lost —
  which matters, because this repo has twice had duplicate-trade incidents from
  data being moved rather than repointed.
- **Andrew's MacBook session will end.** Sessions live in the database, so one
  issued by the old database will not validate against the new one. He signs in
  fresh. That is the change working, not a failure.
- Two migrations will run on first boot against that database (they only create
  new tables and indexes — nothing rewrites existing rows).

---

## If sign-in still fails afterwards

**Beta V 7.41** made the server log the real reason. Have him attempt sign-in
**once**, then read the deploy logs for a line saying one of:

- `no such account` — that address does not exist in this database
- `account is inactive`
- `account is not in PRIVATE_ACCESS_USER_IDS` — Step 1 was missed or misspelled
- `password did not match` — the stored password differs; use Forgot password

**Do not let him retry repeatedly.** There is a lockout ladder (5 fails → 1 min,
8 → 5 min, 10 → 15 min, 12 → 1 hour). One attempt produces the log line.

**"Forgot password" revokes every existing session**, including the MacBook one
he is currently relying on. Do not use it until the database question is settled.

---

## Do not

- **Do not rotate `CREDENTIALS_KEY`.** Every stored broker credential is
  encrypted under it, bound to its own account ID and connection ID. Rotating it
  makes them unreadable and there is no rotation path built. If a credential
  fails to decrypt after the switch, that is a key mismatch to investigate — not
  a reason to change the key.
- **Do not copy rows between databases.** Repoint instead. A credential copied
  into a database where the account has a different ID will not decrypt, and
  merging trade tables is how this repo produced duplicate trades twice before.
- **Do not delete a `.db` file or a volume**, even one that looks superseded.
- **Do not delete or recreate the service.**
- **Do not open or merge a pull request**, and do not push to `main` — merging to
  `main` is a production deploy. Nothing in this task needs a code change.

---

## Repo state, for reference

- Remote `andrewr92896-ship-it/vts-terminal`; `main` = `e4f2702`, **Beta V 7.42**,
  deployed.
- Recent releases relevant here: 7.39 added **Developer Terminal ▸ Deployment**
  (a founder-only screen showing which database the terminal is reading, its
  accounts and their IDs, and whether credentials decrypt — the in-app version of
  `db:inspect`); 7.41 added the sign-in refusal logging; 7.42 made the allowlist
  accept a username.
- `npm run db:inspect` and `npm run preflight` are both read-only and safe
  against production.
