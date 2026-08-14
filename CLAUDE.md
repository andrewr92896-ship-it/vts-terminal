@AGENTS.md

<!--
This file is deliberately a one-line import and nothing else.

AGENTS.md is the canonical instruction file for this repo. It carries that name
because GPT Codex reads AGENTS.md, while Claude Code reads CLAUDE.md and does
not pick up AGENTS.md on its own. The `@AGENTS.md` line above is Claude Code's
documented import syntax: it expands AGENTS.md into context at session start, so
both tools read one document and neither can go stale against the other.

Do not add project instructions here — Codex would never see them. Put them in
AGENTS.md. Anything genuinely Claude-Code-only can go below the import, but
there is nothing today.

To confirm the import is working, run /context in a Claude Code session and
check that both CLAUDE.md and AGENTS.md appear under "Memory files".

Block-level HTML comments like this one are stripped before the file is loaded
into context, so this note is free to read for humans and costs no tokens.
-->
