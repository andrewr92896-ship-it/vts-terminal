CREATE TABLE `kia_month_settings` (
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`goal_units` integer DEFAULT 12 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `month`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
