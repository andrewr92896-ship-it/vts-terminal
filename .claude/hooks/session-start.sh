#!/bin/bash
# Session-start guard: prove this working copy is the live one before any work.
#
# WHY THIS EXISTS. A session once spent hours editing a stale June clone of this
# repo — one commit, Pre-Alpha V 0.2 — believing it was the live site. It could
# not self-correct, because that clone lived in a cloud-sync folder where
# `git fetch` fails outright, and the preview it "verified" against served the
# same stale files. Every conclusion after that was wrong.
#
# The portal is worked on from more than one machine, so this check belongs in
# the repo rather than in anyone's memory: it runs at the start of every session
# on every machine and prints what is actually checked out.
#
# DESIGN RULES, all learned from that failure:
#   * Never touch the network. `git fetch` is the exact call that hangs for ten
#     minutes in a OneDrive checkout — a guard that hangs is worse than none.
#     Everything below is local and finishes instantly.
#   * Never fail the session. This always exits 0; a wrong answer here must not
#     stop someone working. It informs loudly and lets the human decide.
#   * Prefer signals that are true offline. A stale clone is identifiable from
#     its own contents — the version string it shipped with and how much history
#     it has — without asking a remote anything.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0

# The one repository that deploys. Matched as a substring so it works for an
# https remote, an ssh remote, and the proxied remote used by Claude Code on the
# web — all three spell the path the same way.
EXPECTED_REPO="andrewr92896-ship-it/vts-portal"

REMOTE="$(git remote get-url origin 2>/dev/null || echo 'none')"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
HEAD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
COMMITS="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
VERSION="$(grep -m1 "^export const APP_VERSION" apps/web/src/meta/version.ts 2>/dev/null | sed "s/.*= *'//; s/'.*//")"
HERE="$(pwd)"

problems=0
note() {
  problems=$((problems + 1))
  echo "  ✗ $1"
}

echo ""
echo "── VTS Portal · checkout check ─────────────────────────────"
echo "  path      $HERE"
echo "  remote    $REMOTE"
echo "  branch    $BRANCH @ $HEAD_SHA  ($COMMITS commits)"
echo "  version   ${VERSION:-<not found>}"
echo ""

# 1. Right repository. A clone of something else, or no remote at all, is the
#    clearest possible sign of being in the wrong folder.
case "$REMOTE" in
  *"$EXPECTED_REPO"*) ;;
  *) note "remote is not $EXPECTED_REPO — this is not the portal's repo" ;;
esac

# 2. Not inside a cloud-sync folder. OneDrive/Dropbox/Drive/iCloud rewrite files
#    underneath git and corrupt packfiles; the known-bad clone lived in one, and
#    that is why it could never fetch its way back to current.
case "$HERE" in
  *OneDrive*|*CloudStorage*|*Dropbox*|*"Google Drive"*|*"Mobile Documents"*)
    note "this path is inside a cloud-sync folder — git breaks here; clone to local disk instead" ;;
esac

# 3. Shipped version looks current. The live app has been on "Beta V" for a long
#    time; anything else (Pre-Alpha, Stage N) is a checkout from another era.
case "$VERSION" in
  "Beta V "*) ;;
  "") note "APP_VERSION not found — apps/web/src/meta/version.ts is missing or renamed" ;;
  *) note "APP_VERSION reads '$VERSION' — the live app is on 'Beta V …'; this looks like an old checkout" ;;
esac

# 4. Enough history to be a real clone. The stale copy had a single commit.
if [ "$COMMITS" -lt 20 ] 2>/dev/null; then
  note "only $COMMITS commit(s) of history — a full clone has far more"
fi

if [ "$problems" -gt 0 ]; then
  echo ""
  echo "  ⚠  STOP — do not edit anything from this folder until this is resolved."
  echo "     Ask Andrew which checkout is the live one. Do NOT guess, and do not"
  echo "     try to repair a cloud-synced clone — clone fresh to local disk."
else
  echo "  ✓ looks like the live checkout"
fi

echo ""
echo "  Before editing, confirm you are current:"
echo "      git fetch origin main && git log --oneline -1 origin/main"
echo "  main is what deploys. Merging to main IS the production release."
echo "  Never deploy, open a PR, or merge unless Andrew asks in this session."
echo "────────────────────────────────────────────────────────────"
echo ""

# Always succeed: this guard informs, it never blocks.
exit 0
