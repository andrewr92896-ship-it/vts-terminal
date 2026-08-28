-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- The public account's own display settings: the clock it reads times on,
-- whether it appears on the study leaderboards, the screen the terminal opens
-- on, and My Terminal's customization.
--
-- ONE BLOB RATHER THAN A COLUMN PER SETTING, deliberately. Every value here is
-- read and written together by one screen, none of them is ever queried across
-- accounts, and none of them is a figure anything aggregates — so a column each
-- would buy nothing and cost a migration every time a preference is added. This
-- is the same shape `public_market_layouts` already uses for the same reason.
--
-- What is NOT here is anything the server acts on. These are display choices the
-- CLIENT resolves at render, exactly like the private terminal's `home_workspace`
-- — what an account can actually reach depends on what it holds, which moves
-- after this is written, so nothing here is validated as a permission.
create table if not exists public_preferences (
  account_id uuid primary key references public_accounts(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
