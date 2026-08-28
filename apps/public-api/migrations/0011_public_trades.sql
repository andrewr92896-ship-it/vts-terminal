-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- The hand-kept trade log: a record of trades somebody typed in.
--
-- THERE IS NO BROKER BEHIND ANY OF THIS, and that is what makes it safe to have
-- on the public side at all. No credential is stored, no order is placed, no
-- position is read from anywhere. Every row here exists because a person wrote
-- it down, which is why `source` is fixed at 'manual' and is server-owned: a
-- client must not be able to claim a row came from a broker fill.
--
-- Two rules the private side learned the hard way and this inherits:
--
--   * A CLOSED TRADE'S P/L IS NULL UNTIL IT IS KNOWN, never zero. A zero scores
--     as a break-even in every figure that reads it — the win rate, the profit
--     factor, the totals — so an unknown result would quietly count as a flat
--     trade rather than as one that has not been scored.
--   * DELETING IS SOFT. `deleted_at` is what Deleted Trades reads and what a
--     restore clears. A hand-typed trade exists nowhere else and no broker can
--     re-import it, so a hard delete would be the one destructive act on this
--     screen with no way back.

create table public_trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  instrument text not null,
  side text not null check (side in ('long', 'short')),
  status text not null check (status in ('open', 'closed')),
  -- Where the trade was MEANT to go on, so slippage is entry minus plan. Null is
  -- "no plan was stated", which is not the same as no slippage.
  planned_entry double precision,
  entry_price double precision not null,
  exit_price double precision,
  take_profit double precision,
  stop_loss double precision,
  units double precision not null default 0,
  realized_pl double precision,
  strategy text,
  timeframe text,
  notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The log reads the live rows and Deleted Trades reads the rest, so both halves
-- are served by one index on the column that separates them.
create index public_trades_owner_idx on public_trades (account_id, deleted_at, opened_at desc);
