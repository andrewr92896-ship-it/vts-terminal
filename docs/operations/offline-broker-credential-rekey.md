# Offline broker credential re-key and quarantine

This procedure applies only to an approved, isolated copy of the legacy SQLite
database. It does not authorize attachment, deployment, a Railway change, a
live-database write, a broker call, or credential entry in chat.

## Preconditions

Stop unless all of these are true:

1. The exact branch commit is green in GitHub Actions.
2. Both fresh authenticated-encrypted backups remain retained, access-controlled,
   restore-tested, and unchanged.
3. The exact green GitHub archive is unpacked only inside an encrypted temporary
   execution volume. It is not a checkout and is not edited.
4. Execution is inside a Linux network namespace or equivalent sandbox with only
   loopback interfaces and routes. The command verifies this before reading any
   key descriptor; a failure means no key may be read.
5. Source and target credential keys are supplied only by the audited
   non-disclosing inherited-file-descriptor path.
6. The source is a native read-only regular snapshot, the candidate and report
   are new files in a distinct directory, and no WAL/SHM sidecar exists.
7. The private manifest is access-controlled and names exactly the expected
   historical row by connection identity, owner identity, provider category, and
   the source-envelope digest. These values never appear in output.
8. The manifest reconciles all 100 business tables and the nine required
   application-setting keys using non-sensitive columns only.

If production or staging health changes, stop. This operation is not a repair or
cutover procedure.

## Invocation

Run the command only inside the verified network-disabled sandbox. Clear
application and hosting variables, disable shell tracing, and inherit four
read-only descriptors: source key, target key, expected source key identifier,
and expected target key identifier.

```sh
unset DATABASE_URL PRIVATE_DATABASE_URL
unset RAILWAY_ENVIRONMENT_ID RAILWAY_SERVICE_ID RAILWAY_PROJECT_ID
export NODE_ENV=test
export VTS_RUNTIME_BOUNDARY=offline-broker-credential-rekey-v1

npm run db:rekey-offline -- \
  --source SOURCE_SNAPSHOT \
  --destination PRIVATE_CANDIDATE \
  --manifest PRIVATE_MANIFEST \
  --report REDACTED_REPORT \
  --expected-business-tables 100 \
  --source-key-fd SOURCE_KEY_FD \
  --target-key-fd TARGET_KEY_FD \
  --source-id-fd SOURCE_ID_FD \
  --target-id-fd TARGET_ID_FD
```

Close every descriptor immediately after exit. Do not capture stderr in shared
logs. The CLI accepts no row override and no literal credential or key flag.

## Candidate policy

The source remains native read-only and byte-identical. A permission-restricted
partial copy is migrated only through 135→138.

- The two expected current envelopes must authenticate with the source key. Each
  plaintext buffer is immediately re-encrypted with the target key and cleared.
- The manifest-approved row must be a credential-bearing OANDA or Kraken
  historical-v1 envelope, and it must fail authenticated recovery. Its unreadable
  payload is replaced in the candidate with an empty non-credential value and
  `credential_state='reconnect_required'`.
- The quarantined row keeps its ID, owner, provider, label, summary, historical
  enabled/paused bit, health fields, history cutoff, and timestamps.
- Any unsupported format, mismatched manifest identity/provider/digest, an
  approved row that authenticates, or any second/unexpected authentication
  failure aborts atomically and publishes no candidate or report.
- Reconnect-required rows are refused before runtime decryption and before any
  broker/client/watcher/order/status/reconciliation call.

The command then clears only the fixed ephemeral-auth allowlist, requires the new
authentication and remediation schema, reconciles counts and preserved metadata,
checks foreign keys, authenticates the two re-keyed envelopes with the target key
offline, and verifies exactly two `ready` rows plus one
`reconnect_required` row with no credential payload.

The redacted report contains counts, provider categories, credential
dispositions, migration levels, and boolean reconciliation results only. It
contains no path, identity, ciphertext, secret, nonce, tag, digest, full hash, or
key identifier.

## Validation and retention

Require the expected business reconciliation: 100 legacy business tables; 5
users; 11 trading trades; 84 funded trades with the 76/8 ownership split; 3
funded accounts; 3 broker metadata rows; exactly 2 re-keyed and 1
reconnect-required; 9 application-setting keys; 3 member/permission rows; 4
membership/tier rows; all IDs, ownership, inactive states, and foreign keys
preserved; new auth/remediation schema present; ephemeral auth empty; and zero
seed, backfill, demo refresh, content rewrite, watcher, mail, integration, market,
notification, broker, order, or trade side effects.

Retain a successful candidate only after authenticated encryption and access
control are applied outside the temporary volume. Keep it unattached. Destroy the
temporary encrypted execution volume and retain only approved encrypted artifacts
and redacted reports.

Rollback means discarding an unpublished partial or the unattached candidate and
its redacted report. Never delete or overwrite either retained encrypted backup.

## Authorized user re-entry later

The owning authorized user uses the private portal's reconnect form after a
separate staging validation and deployment decision. The existing signed session,
workspace-write authorization, owner-scoped row lookup, and same-origin CSRF
guard apply. A complete replacement credential is normalized, encrypted with the
current key, and stored in the same database update that changes the state to
`ready`. Label, pause/resume, or admin metadata edits cannot clear quarantine.

Saving replacement credentials does not place, modify, close, validate, or
simulate a trade and does not contact a broker. Connectivity validation, if ever
authorized, is a separate later action.
