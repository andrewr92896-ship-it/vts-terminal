CREATE TABLE `notification_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`notify_open` integer DEFAULT true NOT NULL,
	`notify_close` integer DEFAULT true NOT NULL,
	`notify_place_sl` integer DEFAULT true NOT NULL,
	`notify_move_sl` integer DEFAULT true NOT NULL,
	`notify_place_tp` integer DEFAULT true NOT NULL,
	`notify_move_tp` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_prefs_user_id_target_user_id_unique` ON `notification_prefs` (`user_id`,`target_user_id`);
