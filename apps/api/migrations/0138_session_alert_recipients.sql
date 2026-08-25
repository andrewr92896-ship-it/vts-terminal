-- Who else gets a trader's Strategy Session alerts.
--
-- A session belongs to the trader who built it, and its open/close/pre-open
-- alerts reached that one person. One row here per (owner, recipient) is how
-- somebody else gets them too.
--
-- AN EMPTY LIST MEANS THE OWNER ALONE, which is what the feature did before this
-- table existed, so nobody's alerts changed on deploy. The owner is never stored
-- as a recipient of their own sessions — they are the baseline, not an entry —
-- which is what stops "remove everyone" quietly meaning "silence my own".
--
-- Who may be added is decided at request time against the owner's private group
-- and each recipient's own `alert_prefs.group_alerts` switch, never from this
-- table: a row is a request, and consent belongs to the person being buzzed.
CREATE TABLE `session_alert_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_alert_recipients_pair` ON `session_alert_recipients` (`owner_user_id`,`recipient_user_id`);
