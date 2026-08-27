# Public/private migration status

Updated: 2026-08-25.

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
- Provision a public database and public API.
- Configure separate public authentication.
- Configure private MFA.
- Populate `PRIVATE_ACCESS_USER_IDS` with approved stable IDs.
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
