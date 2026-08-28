-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Reporting a bug, and sending a suggestion.
--
-- REPORTING A BUG IS FREE ON EVERY ACCOUNT AND MUST STAY THAT WAY. A bug report
-- is the user doing you a favour, and charging for it — or gating it behind the
-- thing being complained about — means never hearing about the bug. It is also
-- the channel through which somebody tells you their payment failed, so it can
-- never sit behind the paid or AI paths.
--
-- No AI triage here. The private side runs an intake conversation to get a
-- usable description out of a person; the public AI paths are switched off until
-- the provider migration, so a report is simply what the reporter wrote. That is
-- stated rather than stubbed: `role` carries an 'ai' member because the shape is
-- the portal's own and the screen renders all three, but nothing here writes one.

create table public_bug_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  -- The first line of the first message, capped. Derived on write rather than
  -- typed: a reporter should not have to title their own bug report.
  summary text not null,
  status text not null default 'open' check (status in ('open', 'submitted', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_bug_reports_owner_idx on public_bug_reports (account_id, updated_at desc);

create table public_bug_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public_bug_reports(id) on delete cascade,
  -- The screen switches on this to decide which side of the thread a message
  -- sits on and how it is labelled, so it is a closed set rather than free text.
  role text not null check (role in ('user', 'ai', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);
create index public_bug_messages_thread_idx on public_bug_messages (report_id, created_at);

-- A suggestion is one message and has no thread: there is nothing to reply to
-- until somebody acts on it, and a reply channel nobody staffs is worse than
-- none. It is kept so the sender can see it was received.
create table public_suggestions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  body text not null,
  status text not null default 'new' check (status in ('new', 'reviewed')),
  created_at timestamptz not null default now()
);
create index public_suggestions_owner_idx on public_suggestions (account_id, created_at desc);
