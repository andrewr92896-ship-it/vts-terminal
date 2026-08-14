@AGENTS.md

<!--
This file is deliberately a one-line import and nothing else.

AGENTS.md is the canonical instruction file for this repo, and the @AGENTS.md
line above is Claude Code's documented import syntax: it expands AGENTS.md into
context at session start, so this repo has exactly one instruction document with
nothing to drift against it.

It carries the name AGENTS.md rather than living here directly because that is
the filename every coding agent other than Claude Code reads. This repo is
worked on with Claude Code (owner decision, 2026-08); the arrangement is kept
because it costs nothing and makes adding another tool later a decision rather
than a migration.

Do not add project instructions here — put them in AGENTS.md, which is the file
everything else points at. Anything genuinely Claude-Code-only could go below
the import, but there is nothing today.

To confirm the import is working, run /context in a Claude Code session and
check that both CLAUDE.md and AGENTS.md appear under "Memory files".

Block-level HTML comments like this one are stripped before the file is loaded
into context, so this note is free to read for humans and costs no tokens.
-->
