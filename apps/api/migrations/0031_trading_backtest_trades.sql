CREATE TABLE `trading_backtest_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`strategy` text NOT NULL,
	`side` text DEFAULT 'long' NOT NULL,
	`entry_price` real,
	`exit_price` real,
	`pnl` real,
	`opened_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
