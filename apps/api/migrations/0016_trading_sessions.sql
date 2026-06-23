CREATE TABLE `trading_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`instrument` text,
	`open_time` text DEFAULT '09:30' NOT NULL,
	`close_time` text DEFAULT '11:00' NOT NULL,
	`timeframe` text,
	`bias` text DEFAULT 'neutral' NOT NULL,
	`bull_plan` text,
	`bear_plan` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
