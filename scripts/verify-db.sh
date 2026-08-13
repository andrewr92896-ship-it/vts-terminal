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

SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

# Git Bash gives shell tools a POSIX path such as /tmp/x, while the Node process
# it starts is Windows-native and needs the matching C:/... path. Linux and
# Railway have no cygpath, so they keep the ordinary POSIX path unchanged.
NODE_SCRATCH_DIR="$SCRATCH_DIR"
if command -v cygpath >/dev/null 2>&1; then
  NODE_SCRATCH_DIR="$(cygpath -m "$SCRATCH_DIR")"
fi

run_check() {
  local script="$1"
  export DATABASE_URL="file:$NODE_SCRATCH_DIR/${script//:/-}.db"
  npm run db:migrate >/dev/null
  npm run "$script"
}

run_check db:check-sharing
run_check db:check-alerts
