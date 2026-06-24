CREATE TABLE `manual_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`instrument` text NOT NULL,
	`side` text DEFAULT 'long' NOT NULL,
	`units` real DEFAULT 0 NOT NULL,
	`entry_price` real NOT NULL,
	`current_price` real,
	`take_profit` real,
	`stop_loss` real,
	`planned_entry` real,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `broker_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
