# Public API and authentication foundation v1

The public terminal now uses password authentication followed by a hashed, single-use, six-digit email challenge. The optional 30-day trusted device is created only after verification and is rotated when used. Recovery always returns the same response, sends a short-lived temporary password through the public-only mail transport, revokes sessions and trusted devices, and requires a password change after the next two-step sign-in.

`apps/public-api` is a separate package, build, entry point, database migration set, cookie namespace, key namespace, and route namespace. It has no import from `apps/api`. Its runtime market adapter fails with `503` unless `PUBLIC_MARKET_PROVIDER_URL` is explicitly configured. Evidence fixtures remain confined to the public UI's CI rendering adapter.

The migration creates only `public_*` tables: accounts, auth challenges, sessions, trusted devices, rate limits, recovery events, layouts, and audits. No private table is read or written.
