CREATE TABLE `broker_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`broker` text NOT NULL,
	`label` text NOT NULL,
	`secret_enc` text NOT NULL,
	`summary` text,
	`active` integer DEFAULT true NOT NULL,
	`last_status` text DEFAULT 'unknown' NOT NULL,
	`last_error` text,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `trading_positions` ADD `connection_id` text;
