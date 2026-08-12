#!/bin/bash
# Everything that must pass before a branch is proposed — one command.
#
# WHY ONE COMMAND. The checks used to be a list in AGENTS.md that a session was
# trusted to remember, and the repo is now worked on from two different tools.
# A list is something to forget; this is not. CI runs exactly this, so work from
# either tool meets the same bar whatever the session remembered.
#
# THE THROWAWAY KEYS ARE NOT SECRETS. The config guard refuses to boot without
# CREDENTIALS_KEY, so this generates one when the caller has none. Nothing here
# reads a real credential or a real database — the encryption check builds its
# own envelopes and the database checks run against scratch files that are
# deleted afterwards. Do NOT replace these with real values or wire repository
# secrets into CI for them; there is nothing for a real key to protect here, and
# putting one in CI is how a production key ends up in a build log.
#
# Add a check by adding a line. Keep the cheap ones first so a failure surfaces
# fast, and keep `build` last — it is the slowest and the least likely to fail
# on its own.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

: "${CREDENTIALS_KEY:=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')}"
: "${SESSION_SECRET:=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')}"
export CREDENTIALS_KEY SESSION_SECRET

step() { printf '\n── %s ──\n' "$1"; }

step "typecheck";                       npm run typecheck
step "migrations";                      npm run verify:migrations
step "credential encryption";           npm run verify:secretbox
step "market data macro";               npm run verify:market-macro
step "investments math";                npm run verify:investments
step "study packages";                  npm run verify:study-packages
step "study sharing and alerts";        bash scripts/verify-db.sh
step "build";                           npm run build

printf '\n✓ all checks passed\n\n'
