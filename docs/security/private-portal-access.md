# Private portal access

The portal is an invite-only system for named accounts. Knowing its URL is never authorization.

## Create and admit an account

1. An existing authorized administrator creates the account using the private administration workflow.
2. Record the new account's stable internal user ID.
3. Review the roles and grants server-side; do not accept a role from browser state, query parameters or editable profile fields.
4. Add the stable ID to `PRIVATE_ACCESS_USER_IDS` in the private Railway service only.
5. Redeploy/restart the private service and verify access.
6. Require a password change and terms acceptance using the existing account flags.
7. Decide whether this account needs the emailed sign-in code. A second factor exists
   (a code emailed to the account's own address) but is a **per-account opt-in that
   defaults to off**, set from Settings > Sign-in. `AUTH_REQUIRE_2FA` only governs
   whether the deployment offers it at all. TOTP and passkeys are still not supported.

An allowlist entry may be a stable account ID, a username **or an email address**. Prefer
the account ID: a username or email can be changed later, and an entry that stops matching
silently stops admitting that account, behind the same generic sign-in refusal a wrong
password gets. The self-service email change refuses outright when it would strip the
caller out of the allowlist, rather than locking them out invisibly. It is never
email-DOMAIN-based. Production refuses to boot with an empty allowlist.

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

Brute-force rate limiting IS implemented: five failed sign-in attempts inside fifteen
minutes locks that subject for fifteen minutes, counted per account **and** per source
address, stored in `terminal_auth_limits` so a restart does not hand out a fresh budget,
with the keys HMAC'd so a database copy carries no usernames or addresses. Emailed-code
sends are capped per account and per address as well. A dedicated structured
authentication audit stream and alerting remain to be implemented.

## MFA and recovery

The second factor is an emailed code, opt-in per account and off by default; TOTP,
passkeys and printed recovery codes are not supported. Before production cutover, decide
whether the code should be mandatory for every account -- note that making it mandatory
makes sign-in depend on a mailbox staying reachable, which is why it is an opt-in today.

Recovery is implemented: a time-limited temporary credential is emailed, and using it
forces a password change and revokes older sessions. It does not yet verify identity
through an owner-controlled process beyond control of the mailbox.

## Crawlers are not a security boundary

`robots.txt`, `noindex` metadata and `X-Robots-Tag` tell cooperative search engines not to index a page. They do not stop direct requests, scanners, leaked links or unauthorized users. Authentication, the production allowlist, active-account checks and server-side permission guards are the access controls.
