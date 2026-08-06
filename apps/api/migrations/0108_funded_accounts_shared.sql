-- A funded account stops being one-per-person.
--
-- `trading_challenges` was keyed by `user_id` as its primary key, which said two
-- things at once: who owns the challenge, and that there can only ever be one of
-- them. The second is wrong twice over — a trader can run more than one prop
-- account at a time, and a desk can have several traders each running their own.
--
-- So the row gets its own `id` and `user_id` becomes an ordinary owner column.
-- The existing row keeps `id = user_id`: it is already unique, it needs no
-- generated value, and it means every stored challenge survives the rebuild with
-- its equity, peak and day-start intact. Nothing about who owns what changes.
--
-- SQLite cannot drop or change a primary key in place, so this is the standard
-- table rebuild (same shape as migrations 0068 and 0096). The foreign key is
-- kept, so deleting an account still takes its challenges with it.
CREATE TABLE `trading_challenges_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text DEFAULT 'FTP Challenge' NOT NULL,
	`account_size` real DEFAULT 200000 NOT NULL,
	`target_bp` integer DEFAULT 1000 NOT NULL,
	`daily_dd_bp` integer DEFAULT 400 NOT NULL,
	`max_dd_bp` integer DEFAULT 600 NOT NULL,
	`trailing` integer DEFAULT true NOT NULL,
	`current_equity` real DEFAULT 200000 NOT NULL,
	`peak_equity` real DEFAULT 200000 NOT NULL,
	`day_start_equity` real DEFAULT 200000 NOT NULL,
	`day_start_on` text,
	`started_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `trading_challenges_new` (`id`, `user_id`, `label`, `account_size`, `target_bp`, `daily_dd_bp`, `max_dd_bp`, `trailing`, `current_equity`, `peak_equity`, `day_start_equity`, `day_start_on`, `started_at`, `created_at`, `updated_at`) SELECT `user_id`, `user_id`, `label`, `account_size`, `target_bp`, `daily_dd_bp`, `max_dd_bp`, `trailing`, `current_equity`, `peak_equity`, `day_start_equity`, `day_start_on`, `started_at`, `created_at`, `updated_at` FROM `trading_challenges`;
--> statement-breakpoint
DROP TABLE `trading_challenges`;
--> statement-breakpoint
ALTER TABLE `trading_challenges_new` RENAME TO `trading_challenges`;
--> statement-breakpoint
-- Every read is "the challenges belonging to these traders", so the owner is the
-- index. Deliberately NOT unique — that is the whole point of the rebuild.
CREATE INDEX `trading_challenges_user_idx` ON `trading_challenges` (`user_id`);
