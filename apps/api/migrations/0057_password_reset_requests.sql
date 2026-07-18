CREATE TABLE `password_reset_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
