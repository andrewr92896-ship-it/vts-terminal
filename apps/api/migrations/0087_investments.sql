-- Investments — the long-term portfolio tracker (401k / IRA / ESA / brokerage).
--
-- Five tables, all owner-scoped by `user_id`. Unlike Trading, an investment
-- account is personal: there is no team column here and nothing in this
-- workspace is ever shown to a teammate.
--
-- Note what is deliberately absent: no credential column, anywhere. The
-- workspace is a tracker that displays and educates — it never places an order
-- and never moves money — so there is no table here that could hold a broker
-- secret even if someone later wanted one to.

-- One row per account the user tracks. `cash_balance` is uninvested cash sitting
-- in the account: it counts toward the account's value but is not a holding.
-- `source` is 'manual' for everything today; the aggregator values are named now
-- so wiring Plaid/SnapTrade later is a new value rather than a new column.
CREATE TABLE IF NOT EXISTS `investment_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `kind` text DEFAULT 'brokerage' NOT NULL,
  `label` text NOT NULL,
  `institution` text,
  `source` text DEFAULT 'manual' NOT NULL,
  `cash_balance` real DEFAULT 0 NOT NULL,
  `note` text,
  `active` integer DEFAULT 1 NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_accounts_user` ON `investment_accounts` (`user_id`);
--> statement-breakpoint
-- A position inside an account. `symbol` is nullable on purpose: 401(k) menus are
-- full of collective trusts and target-date funds that have a name but no public
-- ticker, and refusing those would make the tracker useless for exactly the
-- accounts it exists to track. `name` is what always renders.
--
-- `manual_price` is the per-share mark the user entered. A live quote overlays it
-- when one can be fetched; when none can be, this is what the holding is worth
-- and every surface says so rather than implying the figure is live.
CREATE TABLE IF NOT EXISTS `investment_holdings` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `account_id` text NOT NULL REFERENCES `investment_accounts`(`id`) ON DELETE CASCADE,
  `symbol` text,
  `name` text NOT NULL,
  `asset_class` text DEFAULT 'other' NOT NULL,
  `quantity` real DEFAULT 0 NOT NULL,
  `cost_basis` real,
  `manual_price` real,
  `manual_price_at` integer,
  `sector` text,
  `region` text,
  `note` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_holdings_user` ON `investment_holdings` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_holdings_account` ON `investment_holdings` (`account_id`);
--> statement-breakpoint
-- Money moving into, out of, or around an account. This is what makes
-- Contributions & Goals and Dividends & Income real rather than estimated.
--
-- `symbol` is denormalized rather than derived through `holding_id` so a dividend
-- keeps naming what paid it after the holding is sold and deleted — income
-- history that vanishes when you close a position is worse than none. `tax_year`
-- is separate from `occurred_at` because a contribution made in January can be
-- designated to the previous tax year, and the annual limit is scored on the
-- designation, not the calendar date.
CREATE TABLE IF NOT EXISTS `investment_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `account_id` text NOT NULL REFERENCES `investment_accounts`(`id`) ON DELETE CASCADE,
  `holding_id` text REFERENCES `investment_holdings`(`id`) ON DELETE SET NULL,
  `kind` text NOT NULL,
  `amount` real NOT NULL,
  `quantity` real,
  `symbol` text,
  `occurred_at` integer NOT NULL,
  `tax_year` integer,
  `note` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_transactions_user` ON `investment_transactions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_transactions_account` ON `investment_transactions` (`account_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_transactions_when` ON `investment_transactions` (`user_id`, `occurred_at`);
--> statement-breakpoint
-- One dated reading of the whole portfolio, which is what Performance is drawn
-- from. Whole-portfolio rather than per-account on purpose: an account opened
-- last month would otherwise leave a hole in the history the day it appeared.
--
-- Keyed on an ET calendar date rather than a timestamp so a day has exactly one
-- reading no matter how often the screen is opened, and so the series means the
-- same thing to a user in any timezone — the same reason trade stamps are
-- Eastern everywhere else in the terminal.
--
-- `contributed_to_date` is what makes the "what you put in vs. what the market
-- did" split honest: without it a rising line cannot be told from a line that
-- rose only because money was added.
CREATE TABLE IF NOT EXISTS `investment_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `on_date` text NOT NULL,
  `value` real NOT NULL,
  `cost_basis` real,
  `contributed_to_date` real,
  `created_at` integer NOT NULL,
  CONSTRAINT `investment_snapshots_user_date` UNIQUE(`user_id`, `on_date`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_snapshots_user` ON `investment_snapshots` (`user_id`, `on_date`);
--> statement-breakpoint
-- A savings target. `account_id` is nullable — a goal either tracks one account
-- or the whole portfolio.
CREATE TABLE IF NOT EXISTS `investment_goals` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `account_id` text REFERENCES `investment_accounts`(`id`) ON DELETE CASCADE,
  `kind` text DEFAULT 'general' NOT NULL,
  `label` text NOT NULL,
  `target_amount` real NOT NULL,
  `target_date` text,
  `note` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `investment_goals_user` ON `investment_goals` (`user_id`);
