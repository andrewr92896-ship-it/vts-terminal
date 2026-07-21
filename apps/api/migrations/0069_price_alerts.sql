CREATE TABLE `price_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`condition` text NOT NULL,
	`threshold` real NOT NULL,
	`repeat` text DEFAULT 'once' NOT NULL,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	`last_side` text,
	`last_price` real,
	`last_fired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
