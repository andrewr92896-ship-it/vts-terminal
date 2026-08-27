# VTS public API

This package is the separately buildable public service. It imports no private API code, reads only `PUBLIC_*` configuration, uses only the database addressed by `PUBLIC_DATABASE_URL`, and serves only `/public/v1`.

Contracts:

- `GET /public/v1/health`
- `POST /public/v1/auth/login` (`email`, `password`)
- `POST /public/v1/auth/two-factor/verify` (`challengeId`, six-digit `code`, `remember`)
- `POST /public/v1/auth/recovery` (`email`; always a generic response)
- `GET /public/v1/auth/session`
- `POST /public/v1/auth/change-password` (`currentPassword`, `newPassword`)
- `POST /public/v1/auth/logout`
- `GET /public/v1/market-data`
- `GET /public/v1/market-news`
- `GET|PUT /public/v1/market-data/layout`
- `/public/v1/ai/*` is an explicit fail-closed `501` contract.

Unsafe requests require an allowed HTTPS `Origin` and `X-VTS-Public-CSRF: 1`. Public session and trusted-device cookies are HTTP-only, Secure, SameSite Strict, and scoped to `/public`. Runtime market data requires an explicit HTTPS provider; there are no runtime fixtures.
