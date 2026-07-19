ALTER TABLE `trading_sessions` ADD `days` text;--> statement-breakpoint
ALTER TABLE `trading_sessions` ADD `market_hours` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `session_alert_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notify_open` integer DEFAULT false NOT NULL,
	`notify_close` integer DEFAULT false NOT NULL,
	`notify_pre_open` integer DEFAULT false NOT NULL,
	`pre_open_lead_min` integer DEFAULT 30 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_alert_prefs_user_id_unique` ON `session_alert_prefs` (`user_id`);
