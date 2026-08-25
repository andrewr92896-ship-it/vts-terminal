# Railway subdomain deployment runbook

Do not perform these steps from an unreviewed branch. They are manual production actions.

Railway currently supports custom domains with automatic TLS. For each custom domain, use the exact CNAME/ALIAS and TXT verification records Railway displays; do not copy example targets from documentation. Railway config-as-code remains supported for existing services but is deprecated after 2026-12-01, so migrate these service settings to Railway Infrastructure as Code before that deadline.

References:

- https://docs.railway.com/deployments/monorepo
- https://docs.railway.com/networking/domains/working-with-domains
- https://docs.railway.com/deployments/deployment-actions
- https://docs.railway.com/config-as-code/reference

## 1. Private portal

Preserve the existing Railway service and persistent volume.

1. In service settings, keep the repository root as the build root.
2. Set the config file path to `/deploy/railway/private-portal.json` (the root `railway.json` is equivalent for the existing service).
3. Before deploying this code, add:
   - `NODE_ENV=production`
   - `PRIVATE_PORTAL_ORIGIN=https://portal.vitalistradingsystems.com`
   - `PRIVATE_DATABASE_URL=<existing private volume database URL>`
   - `PRIVATE_SESSION_SECRET=<new generated secret used only here>`
   - `PRIVATE_SESSION_COOKIE=__Host-vts_portal_session`
   - `PRIVATE_ACCESS_USER_IDS=<comma-separated stable IDs of explicitly approved accounts>`
   - `COOKIE_SECURE=true`
   - existing `CREDENTIALS_KEY` and private integration secrets
4. Do not copy these variables to either public service.
5. Deploy to a Railway-generated temporary hostname first.
6. Verify health, headers, login denial for a non-allowlisted account and access for each named account.
7. Attach `portal.vitalistradingsystems.com`; create the exact DNS verification records Railway supplies.
8. Confirm Railway-issued TLS before using the domain.

## 2. Public terminal

1. Create a new Railway service from this repository.
2. Set its config path to `/deploy/railway/public-terminal.json`.
3. Do not attach a volume and do not inherit private service variables.
4. Only `PORT` is needed for the current holding shell.
5. Deploy to a Railway-generated temporary hostname.
6. Inspect the delivered HTML/CSS and confirm no private hostname, route or feature identifier is present.
7. Attach `app.vitalistradingsystems.com` and add Railway's exact DNS records.
8. Confirm TLS.
9. Do not expose customer login until a separate public auth/API/database deployment has passed review.

## 3. Marketing

1. Create another Railway service from this repository.
2. Set its config path to `/deploy/railway/marketing.json`.
3. Do not inherit public-auth or private variables.
4. Deploy and verify the only application button targets `https://app.vitalistradingsystems.com`.
5. Attach `vitalistradingsystems.com` and `www.vitalistradingsystems.com`.
6. Add the exact Railway CNAME/ALIAS and TXT records at the DNS provider.
7. The checked-in server redirects any `www` request to the apex with HTTP 308. Verify path and query preservation.
8. Confirm Railway-issued TLS for both hostnames.

Apex records depend on the DNS provider. Use CNAME flattening or a dynamic ALIAS where supported; otherwise follow Railway's documented provider-specific workaround.

## 4. Authentication and database provisioning

Before public customer access:

1. Provision a public database with credentials that cannot read the private database.
2. Provision a separate public API/auth service.
3. Set `PUBLIC_DATABASE_URL`, `PUBLIC_SESSION_SECRET`, and `PUBLIC_SESSION_COOKIE=__Host-vts_public_session` only on that service.
4. If using OAuth/OIDC, create a public client/audience and a different private client/audience.
5. Configure callbacks only on their matching hostnames.
6. Add negative tests proving neither audience/cookie is accepted by the other service.
7. Require MFA for private accounts and document recovery.

No database records should be copied until a reviewed data-migration plan identifies table ownership, retention and rollback.

## 5. Verification

- Run `npm ci && npm run verify`.
- Check marketing returns 200 at the apex and 308 from `www`.
- Check the public shell returns 200 and contains no private identifiers.
- Check the private portal returns `X-Robots-Tag: noindex, nofollow`.
- Check `robots.txt` denies the private host.
- Confirm the public host cannot reach any private API route.
- Confirm a removed private user ID loses access immediately.
- Confirm cookies have no `Domain` attribute and are host-only.
- Do not test any broker mutation route.

## 6. Rollback

For each service, Railway Deployments → the last known-good deployment → Rollback. Railway restores the prior image and its recorded variables. If the image is outside the retention window, redeploy the last known-good Git commit. Roll back services independently; never point public DNS at the private service as a shortcut.
