-- The Trade Desk's order journal: every order the portal sends to a broker and
-- what came back. Kept separate from `trading_positions` on purpose — that table
-- mirrors what the broker says *exists*, while this one records what we *asked
-- for*, including the attempts that were rejected or cancelled and so never
-- became a position at all.
--
-- Append-only: one row per attempt, written once the broker has answered, never
-- rewritten afterwards.
CREATE TABLE `trading_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`broker` text DEFAULT 'oanda' NOT NULL,
	`kind` text DEFAULT 'entry' NOT NULL,
	`instrument` text NOT NULL,
	`side` text,
	`order_type` text,
	`units` real,
	`requested_price` real,
	`take_profit` real,
	`stop_loss` real,
	`status` text NOT NULL,
	`broker_order_id` text,
	`broker_trade_id` text,
	`fill_price` real,
	`realized_pl` real,
	`error_code` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- The desk reads a trader's own recent orders, newest first.
CREATE INDEX `trading_orders_user_created_idx` ON `trading_orders` (`user_id`,`created_at`);
