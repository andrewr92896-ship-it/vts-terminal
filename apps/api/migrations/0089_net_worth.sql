-- My Terminal ▸ Net Worth — everything you own minus everything you owe.
--
-- Two tables, both owner-scoped by `user_id`. Nothing here is ever team-visible:
-- a person's net worth is the most personal figure in the terminal.
--
-- What is deliberately NOT stored here is most of the number. The investment
-- portfolio and the trading account are already tracked elsewhere and are read
-- live at request time, so this table holds only what nothing else knows about —
-- a house, a car, a mortgage, a credit-card balance. Copying the tracked figures
-- into a row here would give the terminal two answers to the same question, and
-- the stale one would win about half the time.

-- One hand-entered asset or liability. `value` is always POSITIVE; `kind` says
-- which side of the ledger it falls on. Storing a debt as a negative number
-- reads fine until something sums the column without checking `kind`, at which
-- point the mistake is invisible.
CREATE TABLE IF NOT EXISTS `net_worth_items` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `category` text DEFAULT 'other' NOT NULL,
  `label` text NOT NULL,
  `value` real DEFAULT 0 NOT NULL,
  `note` text,
  `active` integer DEFAULT 1 NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `net_worth_items_user` ON `net_worth_items` (`user_id`);
--> statement-breakpoint

-- One dated reading of the whole picture, which is what the trend line is drawn
-- from. Keyed on an ET calendar date so a day has exactly one reading however
-- often the screen is opened, matching investment_snapshots and every other
-- dated figure in the terminal.
--
-- Assets and liabilities are stored separately rather than only their
-- difference: a net worth that moved because a debt was paid down is a different
-- story from one that moved because a house was revalued, and a single column
-- cannot tell them apart afterwards.
CREATE TABLE IF NOT EXISTS `net_worth_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `on_date` text NOT NULL,
  `assets` real NOT NULL,
  `liabilities` real NOT NULL,
  `net_worth` real NOT NULL,
  `created_at` integer NOT NULL,
  CONSTRAINT `net_worth_snapshots_user_date` UNIQUE(`user_id`, `on_date`)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `net_worth_snapshots_user` ON `net_worth_snapshots` (`user_id`, `on_date`);
