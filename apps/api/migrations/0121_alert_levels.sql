-- How LOUD each trade notification is, per event, plus the plumbing that lets a
-- repeating alert be acknowledged from the terminal instead of the Pushover app.
--
-- Three separate things, all part of one feature:
--
-- 1. A LEVEL per trade event, beside the on/off boolean that already exists.
--    The boolean still decides whether you hear about the event at all; the
--    level decides what your phone does when you do. Default 'alert' is exactly
--    what every notification sends today (Pushover priority 1), so nothing
--    stored changes meaning and no backfill is needed.
--
--      silent    -> priority -1: shows on the phone, no sound, no vibration
--      normal    -> priority  0: ordinary alert, respects Pushover quiet hours
--      alert     -> priority  1: sounds through quiet hours (today's behaviour)
--      repeating -> priority  2: repeats until acknowledged
--
--    Six columns rather than a JSON blob because the six booleans beside them
--    are six columns, and one row read has to answer both halves of the same
--    question. A CHECK is deliberately omitted: the value is validated in the
--    service and by Zod at the route, and a CHECK here would turn a future
--    fifth level into a table rebuild.
--
-- 2. `alert_prefs` — how often a repeating alert repeats and for how long. ONE
--    row per user rather than per (recipient, trader) pair: anything worth
--    waking somebody for wants the same urgency, and six copies of the same two
--    numbers is six things to keep in step. Bounds are Pushover's own — retry
--    at least 30s, expire at most 10800s (3 hours) — enforced in the service.
--
-- 3. `pushover_receipts` — the live repeating alerts. Pushover hands back a
--    receipt id for every priority-2 message, and that receipt is the ONLY way
--    to stop the repeats from this side. Without storing it the terminal could
--    show an Acknowledge button it had no way to honour.
--
--    `callback_token` is what makes the public callback route safe: Pushover
--    signs nothing, so the URL carries an unguessable value and the route
--    matches on it. Without that, anybody who could guess a receipt id could
--    mark somebody else's alert acknowledged.
--
--    Rows are kept after acknowledgement rather than deleted — they are the
--    record that the alert fired and that somebody answered it, which is the
--    question "did I sleep through one?" needs. `resolved_at` being null is
--    what makes an alert live.
ALTER TABLE `notification_prefs` ADD `level_open` text DEFAULT 'alert' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `level_close` text DEFAULT 'alert' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `level_place_sl` text DEFAULT 'alert' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `level_move_sl` text DEFAULT 'alert' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `level_place_tp` text DEFAULT 'alert' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `level_move_tp` text DEFAULT 'alert' NOT NULL;--> statement-breakpoint
CREATE TABLE `alert_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`repeat_every_seconds` integer DEFAULT 30 NOT NULL,
	`repeat_for_seconds` integer DEFAULT 300 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `alert_prefs_user_id_unique` ON `alert_prefs` (`user_id`);--> statement-breakpoint
CREATE TABLE `pushover_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`receipt` text NOT NULL,
	`callback_token` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `pushover_receipts_live_idx` ON `pushover_receipts` (`user_id`,`resolved_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `pushover_receipts_token_unique` ON `pushover_receipts` (`callback_token`);
