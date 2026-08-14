# Vitalis Trading Systems Terminal

A private, dark "pro-terminal" web app for the owner (Andrew) and a small set of
invited users. One login leads to a sidebar of workspaces, each with its own
sections. It is an installable PWA with web push. There is no public sign-up;
the login screen offers a single read-only **demo** account and a public
**Early Access** request form.

> **Source of truth:** `AGENTS.md` documents how the terminal is actually built
> and how it behaves. When README and `AGENTS.md` disagree, trust `AGENTS.md`
> and the code.

## Workspaces

Sections a user lacks the role for are hidden. **My Terminal** is pinned to the
top of the list.

- **My Terminal** — the self-service Trading Team surface (membership, leader,
  invites, per-member badges/permissions).
- **Trading** — Live Wall, Trading Alerts, Trade Desk (log + history + live
  brokers), Strategy Sessions, Manual Trades, the role-gated Funded
  (prop-challenge) dashboard, Market News, and a To-Do.
- **Studies** — team-built study games, flashcards, practice tests, study
  guides, and progress. All study content is created by teams; nothing is
  hardcoded.
- **Site Help** — how-to, announcements, patch notes, bug reports, suggestions.
  Available to every signed-in user.
- **Admin Terminal** — users, teams, badges, AI instructions, patch notes, site
  wording, early access, suggestions, bug reports. Admins only.
- **Developer Terminal** — AI instructions, site wording, view-as-role.
  Founder-level only.

## Stack

- **Frontend:** Vite + React 18 + TypeScript (`apps/web`). Inline-style / theme
  tokens, not a CSS framework.
- **Backend:** Fastify + TypeScript (`apps/api`) — holds all secrets; the
  browser never sees broker keys, the Anthropic key, or password hashes. In
  production it also serves the built web app (one process, same origin).
- **Database:** SQLite via Drizzle ORM on the libsql driver (no native build).
- **Auth:** username/password, argon2id hashing, signed httpOnly server-side
  session cookies, role-based access.
- **AI:** Claude via the Anthropic SDK, server-side only.
- **Notifications:** web push (VAPID) and Pushover.

## Roles

Granular, admin-assigned roles (a user may hold any combination):

- **member** — baseline access to every standard workspace.
- **admin** — everything, including user/team management.
- **funded** — reveals the private Funded prop-challenge section in Trading.
- **founder** / **software_developer** — founder-level; the Developer Terminal.
  Granted only by the owner.

## Layout

```
apps/
  api/    Fastify backend, SQLite database, auth, AI, brokers, notifications
  web/    React frontend, app shell, workspaces, PWA
```

## First-time setup

Requires Node 20+.

1. Install dependencies and create the database:
   ```
   npm install
   npm --workspace @vts/api run db:migrate
   npm --workspace @vts/api run db:seed
   ```
   The seed prints the initial admin username and a generated password once.
   Save it.

2. Start both servers (frontend + backend together):
   ```
   npm run dev
   ```

3. Open http://localhost:5173 and sign in.

## Verify before merging

```
npm run typecheck   # api + web
npm run build       # api tsc + web vite build
```

## Environment

Backend configuration lives in `apps/api/.env` (gitignored). See
`.env.example` for the variables. The app runs locally with almost nothing set;
broker keys and the Anthropic key are optional (AI features report "not
configured" when the key is absent).

## Security notes

- No secrets, credentials, account numbers, or API keys ever reach the
  browser. They live only in `apps/api/.env` or a password manager.
- Session cookies are httpOnly and signed. Passwords are argon2id hashed.
- Broker credentials are AES-256-GCM encrypted at rest.
- The database file (`apps/api/data/vts.db`) and all `.env` files are
  gitignored.
