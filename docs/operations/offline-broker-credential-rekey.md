# Offline broker credential re-key

This procedure is only for an approved, isolated copy of the legacy SQLite
database. It does not authorize attaching a candidate to a service, changing a
Railway variable, deploying, calling a broker, or writing a live database.

## Custody and prerequisites

Stop unless all of the following are true:

1. The exact re-key commit is green in GitHub Actions.
2. A fresh application-consistent production checkpoint was created through the
   proven online SQLite backup path without changing the source.
3. One access-controlled Railway copy and one separately controlled off-Railway
   copy were authenticated-encrypted, permission-restricted, and restore-tested.
4. Backup verification recorded only safe metadata: time, copy count, restore
   result, encryption/authentication result, and shortened hash fingerprints.
5. The production and private-staging credential keys remain in the approved OS
   credential store. Neither key, either full key identifier, or any broker
   credential appears in a file, shell argument, shell history, log, report, or
   clipboard.
6. The isolated source is a regular non-symlink file ending in
   `.snapshot.db` or `.snapshot.sqlite`, has no WAL/SHM neighbor, and is not
   on a mounted service volume.
7. The external reconciliation manifest lists all 100 approved business tables,
   their expected counts, safe hash columns, and the nine required application
   setting keys. Sensitive columns are forbidden from hash selections.

If production health changes, restore the prior operational state and stop. Do
not use the re-key batch as a production repair mechanism.

## Secure invocation

The command accepts keys and expected key identifiers only through inherited
file descriptors. The descriptor producers must read directly from an approved
credential store; never substitute `echo`, a repository file, an environment
variable, a command-line secret, or a pasted value.

Establish four read-only descriptors in the operator's secured shell:

- source credential key;
- private-staging target credential key;
- expected source key identifier;
- expected target key identifier.

Then clear inherited application and hosting variables and execute:

```sh
unset DATABASE_URL PRIVATE_DATABASE_URL
unset RAILWAY_ENVIRONMENT_ID RAILWAY_SERVICE_ID RAILWAY_PROJECT_ID
export NODE_ENV=test
export VTS_RUNTIME_BOUNDARY=offline-broker-credential-rekey-v1

npm run db:rekey-offline -- \
  --source /isolated/source/legacy.snapshot.db \
  --destination /isolated/candidate/private.candidate.db \
  --manifest /isolated/control/reconciliation.json \
  --report /isolated/candidate/rekey-report.json \
  --expected-business-tables 100 \
  --source-key-fd SOURCE_FD_NUMBER \
  --target-key-fd TARGET_FD_NUMBER \
  --source-id-fd SOURCE_ID_FD_NUMBER \
  --target-id-fd TARGET_ID_FD_NUMBER
```

Descriptor numbers are not secrets. Close all four descriptors immediately
after the process exits. Do not enable shell tracing. Do not capture stderr in a
shared log.

The entrypoint checks the exact offline boundary before dynamically importing
database or credential code. It refuses production/Railway/database
environments, URLs, symlinks, SQLite sidecars, in-place or same-directory output,
existing output, literal key arguments, incomplete reconciliation manifests,
sensitive hash columns, and equal or mismatched keys.

## What the command does

The source is opened with Node's native SQLite handle using `readOnly: true`.
A permission-restricted random partial copy is created in the destination
directory. For each broker row, the tool:

1. accepts only the current v2 envelope or the exact repository-proven
   historical v1 AES-256-GCM envelope;
2. validates the source and target identifiers without emitting either;
3. authenticated-decrypts with the source key;
4. immediately encrypts the plaintext into current v2 form with the target key
   and row-bound additional authenticated data;
5. clears the plaintext buffer;
6. preserves every connection field other than `secret_enc`.

The same audited migration implementation applies only 135→137. The fixed
ephemeral-auth allowlist is cleared, the new authentication tables are required
and empty, all manifest counts and safe hashes are reconciled, broker metadata
is hashed independently of ciphertext, foreign keys must pass, every new
envelope must authenticate with the target key, and the source checksum must be
unchanged. Only then are candidate and report renamed into place.

The report contains counts, provider categories, authenticated-format counts,
remediation status, safe deterministic hashes, and boolean safety results. It
contains no path, identity, credential, ciphertext, nonce, tag, key, or full key
identifier.

## Refusal and user re-entry

A v1 envelope is recoverable only when its GCM tag authenticates with the exact
historical derivation proven by commit history. The tool never guesses a format,
tries alternate keys, brute-forces, fabricates, drops, or overwrites a row.

If any envelope is malformed, truncated, forged, from a mixed key set, or fails
authenticated decryption, the tool reports only the safe provider category and
that user credential re-entry is required. No candidate or report is published.
Retain the encrypted source and both encrypted backups. Never test the credential
with a provider login.

Any count, hash, ownership/metadata, application-setting, migration, source-file,
target-authentication, or foreign-key mismatch is also a hard stop.

## Candidate retention and rollback

After success, independently verify the redacted report shows:

- 100 business tables reconciled;
- three broker rows retained with provider-category counts only;
- 5 users, 11 trading trades, 84 funded trades, 3 funded accounts, 9
  application-setting keys, 3 member/permission rows, and 4 membership/tier rows;
- zero foreign-key violations;
- new authentication tables present and empty;
- all three envelopes authenticated with the target key;
- zero external side effects.

Encrypt the successful candidate with approved authenticated encryption before
moving or retaining it. Keep restrictive permissions and key custody outside the
candidate location. The retained candidate must remain unattached.

Rollback is to discard an unpublished partial or the isolated candidate and its
redacted report while retaining the immutable encrypted backups. Never delete,
replace, attach, or write a live database. Deployment, attachment, cutover,
variable changes, broker calls, and main-branch merge are separate operations
and are explicitly out of scope.
