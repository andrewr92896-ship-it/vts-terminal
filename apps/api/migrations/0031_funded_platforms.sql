CREATE TABLE `funded_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text DEFAULT 'FTP' NOT NULL,
	`label` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`balance` real,
	`starting_balance` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `funded_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`instrument` text NOT NULL,
	`side` text DEFAULT 'long' NOT NULL,
	`units` real DEFAULT 0 NOT NULL,
	`entry_price` real,
	`exit_price` real,
	`realized_pl` real,
	`opened_at` integer,
	`closed_at` integer,
	`dedup_key` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `funded_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `funded_trades_account_dedup` ON `funded_trades` (`account_id`,`dedup_key`);