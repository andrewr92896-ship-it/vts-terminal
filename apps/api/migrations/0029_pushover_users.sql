CREATE TABLE `pushover_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`user_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
