-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Early-access requests are the public terminal's top of funnel. They are their
-- own table rather than a row on public_accounts, because a request is made by
-- somebody who does NOT have an account — that is the whole point of it.
create table public_early_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  note text,
  -- 'new' until somebody works it. Kept so a lead can be cleared without
  -- deleting the contact details, which is the only way it could be cleared
  -- before this column existed on the private side.
  status text not null default 'new',
  source text not null default 'public_terminal',
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
-- One live request per address. A second submission updates the first rather
-- than queueing a duplicate for somebody to work twice.
create unique index public_early_access_email on public_early_access_requests (lower(email));
