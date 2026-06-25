CREATE TABLE `trading_strategy_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ignore_tokens` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
