# Provisioning the public deployment

What is left before the public product is reachable, in the order it has to
happen. Everything here needs a Railway account and a domain, which is why none
of it is done: it is the half a coding session cannot do.

The code side is finished. Eleven record families have real storage, the
migrations apply cleanly to an empty database, and `npm run verify:postgres`
drives every one of them through the store that actually runs.

## What already exists

| Piece | Where | State |
| --- | --- | --- |
| Marketing site | `apps/marketing` | Built, static, `deploy/railway/marketing.json` |
| Public terminal | `apps/public-terminal` | Built, static, `deploy/railway/public-terminal.json` |
| Public API | `apps/public-api` | Built, `deploy/railway/public-api.json` |
| Private portal | `apps/web` + `apps/api` | **Already deployed and live** |

## 1. The public database

A Postgres instance, separate from the private one. It shares nothing with it —
not a row, not a session, not a secret.

Then apply the schema:

```
PUBLIC_DATABASE_URL=<the new database> npm run db:migrate:public
```

It is idempotent, and the Railway start command runs it on every deploy, so this
is only needed by hand the first time or when checking.

**It refuses to run against a database holding non-`public_*` tables.** That is
the private database's shape, and pointing this at it by mistake is the worst
thing the script could do — so it checks before it writes anything.

## 2. The public API service

Root directory the repository, config `deploy/railway/public-api.json`.

Variables, all required unless marked:

| Variable | What it is |
| --- | --- |
| `PUBLIC_DATABASE_URL` | The database from step 1 |
| `PUBLIC_SESSION_SIGNING_KEY` | 32+ bytes of generated randomness |
| `PUBLIC_CHALLENGE_PEPPER` | A second, different one |
| `PUBLIC_TRUSTED_DEVICE_SIGNING_KEY` | A third, different one |
| `PUBLIC_ALLOWED_ORIGINS` | `https://app.vitalistradingsystems.com` |
| `PUBLIC_COOKIE_SECURE` | Exactly `true` |
| `PUBLIC_COOKIE_DOMAIN` | *(optional)* |
| `PUBLIC_MAIL_FROM` | The address sign-in codes come from |
| `PUBLIC_SMTP_URL` | `smtps://…` for those codes |
| `PUBLIC_MARKET_PROVIDER_URL` | *(optional)* where market data is read from |
| `PUBLIC_MARKET_PROVIDER_TOKEN` | *(optional)* its token |

Generate each key separately:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**The three keys must differ from each other and from anything the private
portal uses.** The service refuses to start otherwise, which is the intended
behaviour: one secret protecting two things is one breach protecting neither.

Health check: `/public/v1/health`.

## 3. The public terminal and marketing services

Both are static and need no variables. Configs are already written.

- `apps/public-terminal` → `app.vitalistradingsystems.com`
- `apps/marketing` → `vitalistradingsystems.com`

The terminal reaches the API at `/public/v1/*` on its own origin, so the two
either sit behind one domain or the API is proxied under that path. If they end
up on separate hostnames, `PUBLIC_ALLOWED_ORIGINS` has to name the terminal's.

## 4. Domains and TLS

Point both hostnames at their services and let Railway issue certificates.
`PUBLIC_COOKIE_SECURE` is `true`, so nothing works over plain HTTP — which is
the point, not an obstacle.

## 5. The first account

There is no public sign-up. An account is created directly:

```sql
insert into public_accounts(email, password_hash, display_name)
values ('you@example.com', '<argon2id hash>', 'Your name');
```

Or reach the early-access list, which the marketing site already writes to.

## What is deliberately still unbuilt

- **Study package sharing and the public library.** Sharing by username and a
  moderated library both mean one public account's content reaching another's
  screen, plus an attestation and a review queue with no admin surface on the
  public side. That is a product decision, not a port.
- **AI, everywhere.** Every AI route fails closed by name until the provider
  migration, so the public terminal never implies a capability that is not
  wired.
- **Billing.** A tier is granted by an administrator; there is no Stripe and no
  StoreKit. See the Product direction notes in `AGENTS.md` for why iOS must use
  StoreKit and the web a separate path.

## The private portal is untouched by all of this

It is already live and none of the above changes it. The one thing still owed
there is `PRIVATE_ACCESS_USER_IDS`, which since 7.42 accepts an account ID, a
username or an email — a username survives the database changing, which an ID
does not.
