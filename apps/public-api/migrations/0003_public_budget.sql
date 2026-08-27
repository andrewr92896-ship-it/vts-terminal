-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Personal budgeting for a public account — the first record family in the
-- public terminal with real storage behind it rather than demo state.
--
-- The contract is deliberately the SAME one the private portal settled on
-- (apps/api/src/finances/budget.ts), because the public terminal renders the
-- portal's own Budget component. A second set of rules would show the same
-- screen behaving two different ways.
--
--   * MONEY IS CENTS, as integers. A budget adds and subtracts the same figures
--     repeatedly and binary floats accumulate visible error doing that.
--     `integer` rather than `bigint` on purpose: node-pg hands back a bigint as
--     a STRING, which is exactly the kind of quiet type change that reintroduces
--     float arithmetic downstream. The ceiling is ~$21.4M on a single figure,
--     which a personal budget does not reach, and the CHECKs below make an
--     attempt to exceed it an error rather than a wrap.
--   * AN AMOUNT IS ALWAYS POSITIVE and `kind` carries the sign. A negative
--     stored amount reads fine until something sums the column without checking
--     the kind, and then the mistake is invisible. The private side holds this
--     by convention; here it is a CHECK, so it cannot be got wrong.
--   * A MONTH IS EASTERN, and `occurred_on` is a DATE rather than a timestamp:
--     the feature buckets by month and nothing cares what time of day a coffee
--     was bought, so storing an instant would mean picking a zone on every read.
--   * EVERYTHING IS THE ACCOUNT'S OWN. Every row carries account_id and every
--     query filters on it. There is no sharing dimension and none is planned.
--   * `source` is the aggregator seam: a read-only provider lands as a second
--     writer into these same tables rather than a rewrite. The client can never
--     set it.

create table public_budget_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  -- Null means "no target": a budget with no targets is a spending log, and the
  -- screen says so rather than drawing every bar at 0%.
  monthly_limit integer check (monthly_limit is null or monthly_limit >= 0),
  icon text,
  sort_order integer not null default 0,
  -- Archived keeps history; deleting removes it. An archived category with
  -- activity in the month being viewed is still listed, because dropping it
  -- would silently change a past month's total.
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_budget_categories_account_idx on public_budget_categories (account_id, sort_order);
-- One name per account per kind. Two categories both called "Groceries" make
-- every total ambiguous and neither one wrong.
create unique index public_budget_categories_name_unique
  on public_budget_categories (account_id, kind, lower(trim(name)));

create table public_budget_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  category_id uuid not null references public_budget_categories(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  note text,
  occurred_on date not null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index public_budget_entries_month_idx on public_budget_entries (account_id, occurred_on);
-- What an aggregator dedupes on. Partial, so hand-entered rows (which carry no
-- external id) are never constrained by it.
create unique index public_budget_entries_external_unique
  on public_budget_entries (account_id, source, id)
  where source <> 'manual';
