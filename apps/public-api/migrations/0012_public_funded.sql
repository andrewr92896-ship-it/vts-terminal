-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- The funded book: a record of what a prop firm is holding, typed in by hand.
--
-- VTS NEVER PLACES A FUNDED TRADE and never will. The trader places it at the
-- firm; what is stored here is their own record of it. That is true on the
-- private side too, and it is what makes this safe to have on the public one:
-- there is no integration, no credential, and nothing here reaches the firm.
--
-- The account's headline figures are DERIVED from its trades on read, never
-- stored beside them. Stored, the balance and the trades that produced it could
-- disagree, and there would be no way to say which was right.
--
-- `commission_per_lot` is NULL when the trader has not stated it, and null is
-- never read as zero. Nothing can look a prop firm's commission schedule up, so
-- a zero would make trading the account look free.

create table public_funded_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  platform text not null default 'Hand-kept',
  label text not null,
  currency text not null default 'USD',
  -- What was paid in / what the firm allocated. The live balance is derived.
  starting_balance double precision,
  commission_per_lot double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_funded_accounts_owner_idx on public_funded_accounts (account_id, created_at);

create table public_funded_trades (
  id uuid primary key default gen_random_uuid(),
  funded_account_id uuid not null references public_funded_accounts(id) on delete cascade,
  instrument text not null,
  side text not null check (side in ('long', 'short')),
  units double precision,
  entry_price double precision,
  exit_price double precision,
  -- The stop and target held at the firm. Null means none is known of, which is
  -- deliberately different from "there is none" — a position with no protection
  -- is the most important thing this row can say, so it must not be implied by
  -- an absence of data.
  stop_loss double precision,
  take_profit double precision,
  realized_pl double precision,
  status text not null check (status in ('open', 'closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index public_funded_trades_book_idx on public_funded_trades (funded_account_id, opened_at desc);
