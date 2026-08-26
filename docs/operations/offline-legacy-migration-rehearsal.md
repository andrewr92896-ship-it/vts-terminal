# Offline legacy-to-private migration rehearsal

This runbook is for an approved, offline rehearsal only. It does not authorize
copying a live database, reading Railway, changing a service, deploying, or
cutting traffic over. The tooling accepts local SQLite snapshot files and writes
only a new, isolated candidate.

## Safety boundary

Normal service startup and offline rehearsal are mutually exclusive:

- Normal startup requires `VTS_RUNTIME_BOUNDARY` to be unset.
- Offline commands require the exact value
  `offline-migration-rehearsal-v1`.
- Offline commands refuse `NODE_ENV=production`, any `RAILWAY_*` variable,
  and either `DATABASE_URL` or `PRIVATE_DATABASE_URL`.
- The source must be a regular non-symlink file named
  `*.snapshot.db` or `*.snapshot.sqlite`, with no WAL/SHM sidecar.
- The destination must not exist, must be named
  `*.candidate.db` or `*.candidate.sqlite`, and must live in a different
  directory from the source.
- Only migration level 135 to 137 is allowed, and the journal entries must be
  exactly `0136_password_reset_credentials` and
  `0137_terminal_email_2fa`.
- The source is queried through Node's native SQLite handle with
  `readOnly: true`. Its SHA-256 is checked before and after preparation.
- Candidate work happens under a random partial filename and is atomically
  published only after every check passes.

The offline entrypoint never imports the server, shared application database,
seed code, mailer, broker code, or watchers. It never decrypts a broker
credential. The normal server entrypoint checks the boundary before dynamically
importing any of those modules.

## Backup prerequisites for a future authorized rehearsal

Railway backups/PITR are not available on the current plan. Before any future
data batch, an operator must establish all of the following outside this batch:

1. An approved maintenance window and a confirmed quiescent SQLite source.
2. A self-contained level-135 snapshot with no `-wal` or `-shm` neighbor.
3. Two independently stored snapshot copies and recorded SHA-256 checksums.
4. A restore test into a disposable offline location.
5. Free disk space for the source, partial candidate, final candidate, report,
   and another rollback copy.
6. A separately approved way to obtain the legacy and destination eight-character
   broker credential key identifiers. An identifier is diagnostic metadata, not
   the key. Never put the credential key in the manifest, command, report, or
   shell history.

Stop if any prerequisite is missing. Do not compensate for unavailable backups
by rehearsing against a mounted live volume.

## Build the reconciliation manifest

Create the manifest outside the repository. The committed file
`apps/api/src/db/fixtures/offline-migration-manifest.json` is synthetic test
data only and must not be reused unchanged for an actual rehearsal.

The shape is:

```json
{
  "version": 1,
  "sourceMigrationLevel": 135,
  "destinationMigrationLevel": 137,
  "userIdMappings": [
    {
      "sourceUserId": "00000000-0000-4000-8000-000000000001",
      "destinationUserId": "00000000-0000-4000-8000-000000000101"
    }
  ],
  "expectedCounts": {
    "users": 1,
    "trading_positions": 0,
    "app_settings": 0,
    "broker_connections": 0
  },
  "requiredAppSettingKeys": [
    "replace.with.an.approved.required.key"
  ],
  "brokerCredentialKeyId": "0123abcd",
  "ephemeralAuthTables": [
    "sessions",
    "employee_sessions",
    "password_reset_credentials",
    "login_challenges",
    "terminal_trusted_devices",
    "terminal_auth_limits"
  ],
  "hashTables": {
    "trading_positions": ["id", "user_id", "connection_id"]
  }
}
```

All identities and counts above are placeholders. The future authorized batch
must generate its own manifest without committing it.

Manifest rules:

- Every source user ID must appear exactly once.
- Destination user IDs must be unique and must not intersect the source IDs.
- Expected counts are required for the business tables selected by the approved
  reconciliation plan.
- Required app-setting keys are checked by key only; setting values are never
  included in the report.
- The broker key identifier must match both stored non-manual broker envelopes
  and the separately supplied destination identifier. Mixed, malformed, or
  incompatible identifiers are a hard stop. This batch performs no re-keying.
- `ephemeralAuthTables` must equal the audited allowlist exactly. It cannot be
  expanded to a business table.
- `hashTables` must select only approved non-secret columns. Reports contain
  deterministic SHA-256 values, not row values.

## Prepare an isolated candidate

Use separate snapshot and candidate directories. Clear any inherited database
or hosting variables first:

```sh
unset DATABASE_URL PRIVATE_DATABASE_URL
export VTS_RUNTIME_BOUNDARY=offline-migration-rehearsal-v1
export NODE_ENV=test

npm run db:prepare-offline -- \
  --source /offline/snapshots/legacy.snapshot.db \
  --destination /offline/rehearsal/private.candidate.db \
  --manifest /offline/manifests/reconciliation.json \
  --report /offline/rehearsal/reconciliation-report.json \
  --from 135 \
  --to 137 \
  --destination-key-id 0123abcd
```

The key identifier shown is a placeholder. Do not substitute a credential key.

The command performs, in order:

1. Boundary, filename, directory, sidecar, and nonexistence checks.
2. Read-only source preflight at migration level 135.
3. User-map, count, required-key, broker-key-ID, and foreign-key/orphan checks.
4. A byte-for-byte isolated partial copy.
5. Only migrations 0136 and 0137.
6. Clearing of the exact ephemeral authentication allowlist.
7. Destination level, authentication-schema, counts, hashes, key-ID, and
   foreign-key checks.
8. Source checksum revalidation.
9. Atomic publication of the candidate and a redacted JSON report.

A failure removes the partial candidate. An already published destination is
never overwritten.

For an already isolated candidate that deliberately stopped at level 135, the
schema-only command is:

```sh
npm run db:migrate-only -- \
  --database /offline/rehearsal/private.candidate.db \
  --from 135 \
  --to 137
```

This command is intentionally narrower: it applies the two audited migrations
to an existing candidate. Use the preparation command when source-copy and
reconciliation guarantees are required.

## Refusal conditions

Stop and investigate; do not bypass a refusal. The tool refuses:

- in-place, same-directory, symlink, existing-destination, or live-service URL
  combinations;
- snapshot files with WAL/SHM sidecars;
- production, Railway, or inherited application database environments;
- any transition other than 135 to 137;
- incomplete, duplicate, intersecting, or malformed user mappings;
- missing tables, count mismatches, or missing required app-setting keys;
- malformed, mixed, unexpected, or destination-incompatible broker key IDs;
- foreign-key violations or orphaned rows;
- an altered migration journal;
- any attempt to expand the ephemeral deletion allowlist;
- a source whose bytes change during preparation.

## Reconciliation and rollback checkpoints

Checkpoint 0 — before snapshotting: no rehearsal is authorized without verified,
restorable backups and a quiescent source.

Checkpoint 1 — after source preflight: retain the immutable source and its
checksum. A refusal here means no candidate was published.

Checkpoint 2 — after candidate publication: archive the candidate and redacted
report together. Compare migration levels, counts, non-secret hashes, mapping
completeness, setting-key hash, broker key ID, and zero foreign-key violations.

Checkpoint 3 — before any future cutover: stop. Cutover, identity remapping,
broker re-keying, Railway changes, service variables, deployment, and traffic
changes require a separate approved batch and a fresh backup checkpoint.

Rollback for this offline batch is deletion of the isolated candidate and report;
the source remains untouched. Never treat deleting or replacing a live database
as rollback.
