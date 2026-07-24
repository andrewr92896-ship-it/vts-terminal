CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'sms' NOT NULL,
	`title` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`created_by` text,
	`created_by_name` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
