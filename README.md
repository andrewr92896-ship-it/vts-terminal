# Vitalis Trading Systems Portal

Private business portal for Vitalis Trading Systems LLC. One login, four
workspaces: To Do List, Kia Sales, Trading, and Studies.

This repository is built in stages. **Stage 1 (this stage)** delivers the
project scaffold, authentication, role-based access, and the full app shell
(workspace switcher, ET clock, role badge, per-workspace theming). Trading
data, the other workspaces' data, the Claude layer, and deployment come in
later stages.

## Stack

- **Frontend:** Vite + React + TypeScript (`apps/web`)
- **Backend:** Fastify + TypeScript (`apps/api`) — holds all secrets, never
  exposes them to the browser
- **Database:** SQLite via Drizzle ORM and the libsql driver (no native build)
- **Auth:** self-hosted username/password, argon2 hashing, signed server-side
  session cookies, role-based access control (Admin, Trader, Sales, Viewer)

## Layout

```
apps/
  api/    Fastify backend, SQLite database, auth, broker status (stub)
  web/    React frontend, app shell, login, theming
```

## First-time setup

Requires Node 20+ (you have Node 24).

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

## Environment

Backend configuration lives in `apps/api/.env` (gitignored). See
`.env.example` for every variable. Broker keys and the Anthropic key stay
blank until Stages 2 and 4.

## Security notes

- No secrets, credentials, account numbers, or API keys ever reach the
  browser. They live only in `apps/api/.env` or a password manager.
- Session cookies are httpOnly and signed. Passwords are argon2id hashed.
- The database file (`apps/api/data/vts.db`) and all `.env` files are
  gitignored.
