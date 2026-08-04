-- Personal budgeting — the Finances workspace's second screen.
--
-- Manual entry today. The designed path is the same read-only aggregator
-- (Plaid / SnapTrade) already earmarked for Investments, which needs a paid
-- provider account and is therefore an owner decision rather than a build. The
-- shape here is chosen so that lands as another writer into these same tables
-- rather than a rewrite: an entry already carries `source` and an optional
-- `external_id`, and nothing about the maths cares where a row came from.
--
-- EVERYTHING IS PER USER. Like Investments and unlike Trading, a budget belongs
-- to one person: every table carries user_id, every query filters on the caller,
-- and no team dimension appears anywhere in this feature. Do not add one.

-- A budget line: an income source, or a spending category with an optional
-- monthly limit.
CREATE TABLE budget_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- 'income' | 'expense'. The sign lives here, never in the amount — see below.
  kind TEXT NOT NULL,
  -- What this category is expected to be each month, in cents, or NULL for "no
  -- target". Only meaningful on an expense; an income line uses it as expected
  -- earnings.
  monthly_limit INTEGER,
  -- A Lucide glyph name for the row, or NULL for the default.
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint

-- One recorded amount against a category.
--
-- `amount_cents` IS ALWAYS POSITIVE. The category's `kind` carries the sign,
-- exactly as net_worth_items does with asset/liability — a negative stored
-- amount reads fine until something sums the column without checking the kind,
-- and then the mistake is invisible.
--
-- Money is stored in CENTS as an integer. A budget is the one place in this
-- terminal where values are added and subtracted repeatedly, and binary floats
-- accumulate error doing that: 0.1 + 0.2 is not 0.3, and a year of grocery
-- entries drifts by a visible amount. Prices elsewhere are read-and-display, so
-- they can stay real.
CREATE TABLE budget_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  note TEXT,
  -- The ET calendar day this belongs to, as YYYY-MM-DD. A date string rather
  -- than a timestamp because a budget is bucketed by month and nothing here
  -- cares what time of day a coffee was bought — and because bucketing a
  -- timestamp means picking a zone every time it is read.
  occurred_on TEXT NOT NULL,
  -- 'manual' today. The seam for an aggregator; the client can never set it.
  source TEXT NOT NULL DEFAULT 'manual',
  -- The provider's own id for a synced transaction, so a re-sync updates rather
  -- than duplicates. NULL for anything hand-entered.
  external_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE INDEX budget_categories_user_idx ON budget_categories (user_id, archived);
--> statement-breakpoint
CREATE INDEX budget_entries_user_month_idx ON budget_entries (user_id, occurred_on);
--> statement-breakpoint
-- A synced transaction arrives with the provider's id; this is what makes a
-- re-sync an update instead of a second row. Unique per user, since two people
-- can legitimately hold the same provider id from different connections.
CREATE UNIQUE INDEX budget_entries_external_idx ON budget_entries (user_id, external_id)
  WHERE external_id IS NOT NULL;
