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

## Frontend conventions

### Mobile input zoom (iOS)

iOS Safari auto-zooms the viewport whenever a focused text field has a
font-size **below 16px**. To prevent this, a global rule in
`apps/web/src/styles/global.css` floors every `input`, `textarea`, `select`,
and `[contenteditable]` at `16px` on touch devices (`@media (pointer: coarse)`,
with `!important` so it beats inline styles).

- **This is the site-wide default — do not add per-component font-size fixes
  for the zoom.** Any new text box is covered automatically.
- You may still set whatever inline/design `font-size` you want for desktop; it
  applies on fine-pointer devices and is overridden to 16px only on touch.
- If you ever change that global rule, keep the 16px floor — dropping below it
  reintroduces the zoom on every input at once.
