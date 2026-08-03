-- Make `ai_usage.user_id` nullable so background AI spend can be recorded.
--
-- The two background callers (the news headline tagger and the calendar
-- explainer) run on the feed poller's schedule with no user behind them, so
-- they bypassed metering entirely and wrote no row at all. That left the owner
-- looking at a usage figure that covered roughly half of what was actually
-- being spent, with no way to know it.
--
-- A null `user_id` means "the terminal did this on its own schedule". Every
-- per-user count filters on `user_id = ?`, which never matches a null in SQL, so
-- a background job cannot consume anybody's personal allowance by construction.
--
-- SQLite cannot drop a NOT NULL constraint in place, so this is the standard
-- table rebuild (same shape as migration 0068). The foreign key is kept — a null
-- value is permitted by it — so a deleted account still takes its own rows with
-- it while the system rows stay.
CREATE TABLE `ai_usage_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `ai_usage_new` (`id`, `user_id`, `kind`, `created_at`) SELECT `id`, `user_id`, `kind`, `created_at` FROM `ai_usage`;
--> statement-breakpoint
DROP TABLE `ai_usage`;
--> statement-breakpoint
ALTER TABLE `ai_usage_new` RENAME TO `ai_usage`;
--> statement-breakpoint
-- Every read is "this month, for this user (or the system), of this kind".
CREATE INDEX `ai_usage_user_created_idx` ON `ai_usage` (`user_id`, `created_at`);
