-- Which channels carry which kind of alert.
--
-- The account switches in `alert_prefs` answer "do I want to be notified at
-- all"; this answers "by what" — the app's own push notification, a text
-- message, Pushover, or any combination — chosen per kind of alert.
--
-- A MISSING ROW IS THE DEFAULT, AND THE DEFAULT IS EXACTLY WHAT THE TERMINAL DID
-- BEFORE THIS TABLE EXISTED: app push on, Pushover on, text OFF. That is what
-- makes it invisible on deploy — nobody's alerts changed, and nobody was signed
-- up to be texted by a feature they had not asked for.
--
-- `category` is plain TEXT, matching how `notification_prefs` stores its levels:
-- a value the code does not recognise falls back in code rather than failing a
-- constraint, and adding a category costs no migration.
CREATE TABLE `alert_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`channel_push` integer DEFAULT true NOT NULL,
	`channel_pushover` integer DEFAULT true NOT NULL,
	`channel_sms` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_channels_user_category` ON `alert_channels` (`user_id`,`category`);
