# Private portal access

The portal is an invite-only system for named accounts. Knowing its URL is never authorization.

## Create and admit an account

1. An existing authorized administrator creates the account using the private administration workflow.
2. Record the new account's stable internal user ID.
3. Review the roles and grants server-side; do not accept a role from browser state, query parameters or editable profile fields.
4. Add the stable ID to `PRIVATE_ACCESS_USER_IDS` in the private Railway service only.
5. Redeploy/restart the private service and verify access.
6. Require a password change and terms acceptance using the existing account flags.
7. Require MFA before production launch. The current custom main-terminal auth does not implement MFA, so this remains a blocker.

The allowlist is ID-based, not email-domain-based. Production refuses to boot with an empty allowlist.

## Authentication and authorization

- Login uses a generic error that does not reveal whether an account exists.
- Passwords are argon2id hashes.
- The signed private cookie is host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Session lookup checks that the account is active and still allowlisted.
- Existing role, premium-feature and private-grant middleware continues to enforce endpoint permissions.
- No public signup, early-access submission or credential-free demo route is registered by the private portal.

## Remove access

1. Remove the user ID from `PRIVATE_ACCESS_USER_IDS`.
2. Restart/redeploy the private service. Existing cookies stop resolving immediately.
3. Deactivate the account in Administration.
4. Use the existing session-revocation path when resetting or deactivating the account.
5. Remove roles/grants as appropriate.
6. Preserve audit records unless a separately approved retention/deletion process applies.

## Emergency disable

To disable one person, remove only that ID and restart. To disable all external access, remove the portal's public Railway domain or apply an infrastructure network restriction; do not replace the allowlist with an empty value because production intentionally refuses to boot empty. Preserve access to Railway logs and the private database for incident review.

## Logging

Private login failures caused by invalid credentials or admission denial return the same response. Security logging should use stable user IDs and action names, not passwords, tokens, cookie values, broker credentials or full connection strings. Existing administrator actions should remain in the Administrator Log.

A dedicated structured authentication audit stream, brute-force rate limiting and alerting remain to be implemented.

## MFA and recovery

The current custom private authentication stack does not support TOTP, passkeys or recovery codes. Before production cutover, implement MFA or move private authentication to a separately scoped provider client that requires MFA. Recovery must verify identity through an owner-controlled process and revoke existing sessions.

## Crawlers are not a security boundary

`robots.txt`, `noindex` metadata and `X-Robots-Tag` tell cooperative search engines not to index a page. They do not stop direct requests, scanners, leaked links or unauthorized users. Authentication, the production allowlist, active-account checks and server-side permission guards are the access controls.
