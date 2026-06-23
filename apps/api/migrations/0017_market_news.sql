CREATE TABLE `trading_news` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text,
	`title` text NOT NULL,
	`body` text,
	`source` text,
	`url` text,
	`category` text DEFAULT 'markets' NOT NULL,
	`impact` text DEFAULT 'medium' NOT NULL,
	`bias` text DEFAULT 'neutral' NOT NULL,
	`published_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `trading_calendar` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text,
	`title` text NOT NULL,
	`country` text,
	`impact` text DEFAULT 'medium' NOT NULL,
	`event_time` integer NOT NULL,
	`forecast` text,
	`previous` text,
	`actual` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
