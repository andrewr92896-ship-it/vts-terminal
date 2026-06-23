CREATE TABLE `trading_challenges` (
	`user_id` text PRIMARY KEY NOT NULL,
	`label` text DEFAULT 'FTP Challenge' NOT NULL,
	`account_size` real DEFAULT 200000 NOT NULL,
	`target_bp` integer DEFAULT 1000 NOT NULL,
	`daily_dd_bp` integer DEFAULT 400 NOT NULL,
	`max_dd_bp` integer DEFAULT 600 NOT NULL,
	`trailing` integer DEFAULT true NOT NULL,
	`current_equity` real DEFAULT 200000 NOT NULL,
	`peak_equity` real DEFAULT 200000 NOT NULL,
	`day_start_equity` real DEFAULT 200000 NOT NULL,
	`started_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
