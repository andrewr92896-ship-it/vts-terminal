CREATE TABLE `login_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`sent_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `login_challenges_user_unique` ON `login_challenges` (`user_id`);
--> statement-breakpoint
CREATE INDEX `login_challenges_expiry_idx` ON `login_challenges` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `terminal_trusted_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `terminal_trusted_devices_user_idx` ON `terminal_trusted_devices` (`user_id`);
--> statement-breakpoint
CREATE INDEX `terminal_trusted_devices_expiry_idx` ON `terminal_trusted_devices` (`expires_at`);

--> statement-breakpoint
CREATE TABLE `terminal_auth_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`send_count` integer DEFAULT 0 NOT NULL,
	`send_window_started_at` integer NOT NULL,
	`last_sent_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`failure_window_started_at` integer NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `terminal_auth_limits_updated_idx` ON `terminal_auth_limits` (`updated_at`);
