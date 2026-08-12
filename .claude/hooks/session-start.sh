#!/bin/bash
# Claude Code SessionStart hook — a thin wrapper, deliberately.
#
# The checkout guard itself lives in `scripts/check-checkout.sh` so that GPT
# Codex can run the identical check; Codex has no repo-level hook mechanism, so
# anything left in here would protect Claude Code sessions only. Keep this file
# a wrapper and put every change in the script.
exec bash "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}/scripts/check-checkout.sh"
