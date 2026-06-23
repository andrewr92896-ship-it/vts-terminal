CREATE TABLE `finance_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ftp_phase` text DEFAULT 'testing' NOT NULL,
	`ftp_divisor` real DEFAULT 18 NOT NULL,
	`ftp_payout_bp` integer DEFAULT 8000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `finance_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`day_of_month` integer DEFAULT 1 NOT NULL,
	`category` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `finance_net_worth` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'asset' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
