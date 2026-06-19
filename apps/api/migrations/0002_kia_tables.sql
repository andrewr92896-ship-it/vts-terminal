CREATE TABLE `kia_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`goal_units` integer DEFAULT 12 NOT NULL,
	`review_count` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `kia_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`customer` text NOT NULL,
	`model` text NOT NULL,
	`type` text NOT NULL,
	`profit` integer NOT NULL,
	`sold_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
