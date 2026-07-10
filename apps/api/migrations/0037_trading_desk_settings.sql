CREATE TABLE `trading_desk_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`break_even_pct` real DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
