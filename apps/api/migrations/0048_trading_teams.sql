CREATE TABLE `trading_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `team_id` text;--> statement-breakpoint
INSERT INTO `trading_teams` (`id`, `name`, `created_at`, `updated_at`) VALUES ('team-vitalis', 'Vitalis Trading Team', 1784338036908, 1784338036908);--> statement-breakpoint
UPDATE `users` SET `team_id` = 'team-vitalis' WHERE `team_id` IS NULL;
