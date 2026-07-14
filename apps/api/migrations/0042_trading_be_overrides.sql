CREATE TABLE `trading_be_overrides` (
	`instrument` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'percent' NOT NULL,
	`pct` real DEFAULT 0 NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
