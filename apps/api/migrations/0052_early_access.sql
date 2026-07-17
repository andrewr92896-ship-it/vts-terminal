CREATE TABLE `early_access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`email` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
