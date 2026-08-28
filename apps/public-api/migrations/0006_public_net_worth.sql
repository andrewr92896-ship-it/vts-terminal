-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Everything you own minus everything you owe. The public terminal renders the
-- portal's own Net Worth screen, so the stored shape and the rules are the
-- private side's (apps/api/src/myportal/netWorth.ts).
--
-- That number is the easiest one in the terminal to quietly get wrong, and the
-- three ways it happens are designed against rather than checked for:
--
--   1. DOUBLE COUNTING. The investment portfolio is already tracked and is
--      pulled in live, so there is deliberately NO category here for
--      "brokerage" or "investments" among the hand-entered assets. Offering one
--      would invite somebody to type the largest number on the screen in a
--      second time, and nothing could detect that afterwards. The category list
--      below is the whole list, and it is a CHECK so it cannot be widened by
--      accident.
--   2. TWO SOURCES OF TRUTH. The tracked half is read through the same
--      portfolio code the Investments screens use, never recomputed here. Two
--      definitions of "what my portfolio is worth" would show two totals on two
--      screens with no way to say which was right.
--   3. A CONFIDENT TOTAL BUILT ON A GAP. When the tracked side cannot be
--      totalled, no net worth is reported at all — and no snapshot is written
--      either, or the history gets a permanent dip that never happened.
--
-- `value` IS ALWAYS STORED POSITIVE and `kind` carries the sign. A debt stored
-- negative reads fine until something sums the column without checking the
-- kind, and then the mistake is invisible. Here it is a CHECK.

create table public_net_worth_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  kind text not null check (kind in ('asset', 'liability')),
  -- No 'brokerage' or 'investments' member, deliberately — see rule 1.
  category text not null check (category in (
    'cash', 'real_estate', 'vehicle', 'crypto', 'business', 'valuables',
    'retirement_other', 'other_asset',
    'mortgage', 'auto_loan', 'student_loan', 'credit_card', 'personal_loan', 'other_debt'
  )),
  label text not null,
  value double precision not null check (value >= 0),
  note text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_net_worth_items_owner_idx on public_net_worth_items (account_id, sort_order);

-- One reading per Eastern day, written forward and never back-filled: nothing
-- can know what a house or a fund was worth last year.
create table public_net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  on_date date not null,
  assets double precision not null,
  liabilities double precision not null,
  net_worth double precision not null,
  created_at timestamptz not null default now()
);
create unique index public_net_worth_snapshots_day_unique on public_net_worth_snapshots (account_id, on_date);
