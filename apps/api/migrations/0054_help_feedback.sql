ALTER TABLE `users` ADD `avatar` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `team_id` text;--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`author` text NOT NULL,
	`team_id` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`author` text NOT NULL,
	`team_id` text,
	`summary` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bug_report_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `bug_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suggestions_created_idx` ON `suggestions` (`created_at`);--> statement-breakpoint
CREATE INDEX `bug_reports_created_idx` ON `bug_reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `bug_report_messages_report_idx` ON `bug_report_messages` (`report_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_team_idx` ON `chat_messages` (`team_id`);
