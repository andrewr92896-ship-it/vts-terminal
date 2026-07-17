ALTER TABLE `users` ADD `badges` text;--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `patch_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`date_label` text NOT NULL,
	`notes` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `badge_types` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`icon` text NOT NULL,
	`color` text DEFAULT '#EBCB74' NOT NULL,
	`description` text,
	`auto_role` text,
	`builtin` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `badge_types_key_unique` ON `badge_types` (`key`);--> statement-breakpoint
CREATE INDEX `patch_notes_status_idx` ON `patch_notes` (`status`);
