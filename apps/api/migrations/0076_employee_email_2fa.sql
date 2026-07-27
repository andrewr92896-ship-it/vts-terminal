-- Employee Portal second factor moves from an authenticator app (TOTP) to a
-- code emailed to the employee's company sign-in address, plus an opt-in
-- "remember this device" that lets a browser skip the code for a while.
--
-- The TOTP columns go with it. Dropping them is deliberate: an encrypted secret
-- nothing can read any more is a liability, not a backup. Every employee simply
-- receives a code by email at their next sign-in — there is no re-enrollment
-- step to walk through, so nothing is lost by discarding the old state.

ALTER TABLE `employee_profiles` DROP COLUMN `totp_secret`;--> statement-breakpoint
ALTER TABLE `employee_profiles` DROP COLUMN `totp_enrolled_at`;--> statement-breakpoint
ALTER TABLE `employee_profiles` DROP COLUMN `totp_last_step`;--> statement-breakpoint
ALTER TABLE `employee_profiles` DROP COLUMN `recovery_codes`;--> statement-breakpoint

-- The pending code lives on the session, not the profile: it belongs to one
-- sign-in attempt in one browser. Only its SHA-256 is kept.
ALTER TABLE `employee_sessions` ADD `otp_code_hash` text;--> statement-breakpoint
ALTER TABLE `employee_sessions` ADD `otp_expires_at` integer;--> statement-breakpoint
ALTER TABLE `employee_sessions` ADD `otp_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_sessions` ADD `otp_sent_at` integer;--> statement-breakpoint

CREATE TABLE `employee_trusted_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `employee_trusted_devices_user_idx` ON `employee_trusted_devices` (`user_id`);--> statement-breakpoint

-- Sessions issued under the old scheme are cut: an authenticated session whose
-- second factor no longer exists should not survive the change.
DELETE FROM `employee_sessions`;
