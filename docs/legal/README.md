# Public terminal — legal drafting working papers

These are the working papers for the public terminal's Terms of Service and
Privacy Policy. They are **not** the documents themselves — those live in
`apps/public-terminal/src/adapters/publicLegal.ts` and are what the terminal
renders and the clickwrap hashes.

They are here rather than in a chat for the same reason `AGENTS.md` is: a
context window is not a place to keep a source of truth, and these were
otherwise sitting in a session scratchpad that is destroyed when the container
is reclaimed.

| File | What it is |
| --- | --- |
| `public-data-facts.txt` | The fact sheet and drafting brief. Every claim in it was read out of this repository. It also defines the two-AI drafting process and who decides what. **Read section 0 first.** |
| `public-legal-review-phase2.txt` | An adversarial review of the first drafts, checked against the code — including corrections to the fact sheet's own earlier errors. |

## Keeping the fact sheet true

It carries a revision number and a "read from" line naming the version it was
checked against. **When something it describes changes, update it in the same
change** — a fact sheet that has quietly gone stale is worse than none, because
the drafting is done against it without re-checking.

Everything it lists as settled was confirmed by the owner and is recorded with
the date. Everything it lists as outstanding genuinely is.
