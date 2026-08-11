#!/bin/bash
# The two checks that WRITE to a database, run against throwaway scratch files.
#
# Each of them deliberately refuses any database that already holds a user —
# that guard is what stops them ever being pointed at production — so each needs
# its own fresh file rather than sharing one. Running them back to back against
# a single scratch database fails the second one, which looks like a real
# failure and is not.
#
# Called by scripts/verify.sh. Safe to run on its own.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Throwaway values when the caller has none. See the note in verify.sh.
: "${CREDENTIALS_KEY:=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')}"
: "${SESSION_SECRET:=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')}"
export CREDENTIALS_KEY SESSION_SECRET

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

run_check() {
  local script="$1"
  export DATABASE_URL="file:$TMP/${script//:/-}.db"
  npm run db:migrate >/dev/null
  npm run "$script"
}

run_check db:check-sharing
run_check db:check-alerts
