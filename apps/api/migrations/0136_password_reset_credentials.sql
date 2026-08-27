-- A recovery request must not overwrite the account's working password. The
-- emailed temporary password is represented by one separate, short-lived
-- Argon2 hash per user; a newer request replaces the row and delivery failure
-- removes it again.
CREATE TABLE `password_reset_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_credentials_user_id_unique` ON `password_reset_credentials` (`user_id`);
--> statement-breakpoint
CREATE INDEX `password_reset_expiry_idx` ON `password_reset_credentials` (`expires_at`);
