-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- The long-term portfolio tracker for a public account. The public terminal
-- renders the portal's own Investments screens, so the stored shape is the
-- private side's (apps/api/src/db/schema.ts) and the valuation math is a
-- verified mirror (src/investmentsMath.ts).
--
-- THE RULE THAT SHAPES ALL OF IT: a holding with no price is NOT worth zero. It
-- is worth an unknown amount, and every total reports how much of the portfolio
-- it could not see. Treating unpriced as zero silently understates a portfolio,
-- which is the most misleading thing a tracker can do — so `manual_price` is
-- nullable and a null one means unpriced, never free.
--
--   * EVERYTHING IS THE ACCOUNT'S OWN. Every table carries account_id and every
--     statement filters on it. There is no sharing dimension, here or planned:
--     an investment account belongs to one person.
--   * `symbol` IS NULLABLE ON PURPOSE. A 401(k) menu is full of collective
--     trusts and target-date funds that have a name and no ticker, and a
--     tracker that cannot hold one cannot hold most retirement accounts.
--   * `source` IS THE AGGREGATOR SEAM and is server-owned. A read-only provider
--     (Plaid, SnapTrade) lands as a second writer into these same tables rather
--     than a rewrite. A hand-entered account must never be able to claim it is
--     a verified connection.
--   * NO CREDENTIAL COLUMN EXISTS ANYWHERE HERE, deliberately. This workspace
--     never places an order, so there is no table that could hold a broker
--     secret — and on the public side that is the whole point.
--   * `tax_year` IS SEPARATE FROM `occurred_at` because a January contribution
--     can be designated to the previous year.

create table public_investment_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  label text not null,
  kind text not null,
  institution text,
  source text not null default 'manual',
  -- Cash is always known: it is a figure the user typed, not one anybody prices.
  cash_balance double precision not null default 0,
  note text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_investment_accounts_owner_idx on public_investment_accounts (account_id, sort_order);

create table public_investment_holdings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  investment_account_id uuid not null references public_investment_accounts(id) on delete cascade,
  symbol text,
  name text not null,
  asset_class text not null,
  quantity double precision not null default 0,
  cost_basis double precision,
  -- Null is UNPRICED, and unpriced is not zero. Stamped so the screen can say
  -- how old a hand-typed price is rather than presenting it as current.
  manual_price double precision,
  manual_price_at timestamptz,
  sector text,
  region text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_investment_holdings_owner_idx on public_investment_holdings (account_id, investment_account_id);

create table public_investment_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  investment_account_id uuid not null references public_investment_accounts(id) on delete cascade,
  holding_id uuid references public_investment_holdings(id) on delete set null,
  kind text not null,
  amount double precision not null,
  quantity double precision,
  occurred_at timestamptz not null,
  -- A January contribution can be designated to the previous year, so which
  -- year it counts against is stated rather than derived from the date.
  tax_year integer,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index public_investment_transactions_owner_idx on public_investment_transactions (account_id, occurred_at);

create table public_investment_goals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  label text not null,
  target_amount double precision,
  target_year integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_investment_goals_owner_idx on public_investment_goals (account_id);

-- One whole-portfolio reading per Eastern day, written forward and NEVER
-- back-filled. Nothing available can price a retirement fund as of last March,
-- so any earlier curve would be one that never happened.
create table public_investment_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  on_date date not null,
  value double precision not null,
  contributions double precision not null default 0,
  created_at timestamptz not null default now()
);
create unique index public_investment_snapshots_day_unique on public_investment_snapshots (account_id, on_date);
