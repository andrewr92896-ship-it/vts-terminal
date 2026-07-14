# CLAUDE.md

Project guidance for Claude Code working in this repo.

## Deployment workflow (owner preference)

This is a **private web portal** for a single owner — there is no external
review step and no other users to protect from a bad merge. Because of that:

- **Always deploy automatically.** When work on a feature branch is complete
  and verified (typecheck + build pass), open a PR to `main` and merge it
  without waiting for approval. Merging to `main` is the deploy — Railway
  auto-redeploys `main` per `railway.json`.
- **Never ask the owner to check, review, or approve a PR** before merging,
  and never end a task by asking whether to deploy. Just deploy.
- Still verify before merging: run the web `typecheck` and `build` (and any
  relevant API checks) and only merge when they pass. Automatic deploy does
  not mean skipping verification.
- If a build or verification step **fails**, do not merge — report the failure
  instead. Railway keeps the previous version live on a failed build.

## Deploy mechanics

- Railway builds and deploys whatever is on `main` (`npm install && npm run
  build`, then `npm run start`, health-checked at `/api/health`). There is no
  manual deploy button or Railway CLI in this environment — merging to `main`
  is the only deploy trigger.
- Prefer **squash merges** to keep `main` history clean.
