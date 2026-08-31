-- Founder trade coordination: level-move invitations, per-link switches, linked
-- positions, and the removal of the funded step from this workflow.
--
-- FOUR CHANGES, and each is the storage half of one owner decision (2026-08).
--
-- 1. A LINK NOW SAYS WHAT TRAVELS. `founder_trade_links` was a bare row meaning
--    "this sender's fills reach this recipient". It now carries two independent
--    switches, because moving a stop and opening a trade are different things to
--    want. Existing rows take entries ON and level-moves OFF, so nobody's link
--    changed behaviour on deploy. The row is still the link: turning both off
--    removes it, which keeps "a disabled link and no link are the same fact".
--
-- 2. AN INVITATION HAS A KIND. 'entry' is every invitation that has ever
--    existed, so the default is what the column would have said if it had always
--    been there. 'amend' carries a stop/target change, the levels it moved FROM,
--    and — the part that makes one click possible — the RECIPIENT'S OWN position
--    it applies to, resolved when the invitation was raised.
--
-- 3. POSITIONS CAN BE PAIRED. A join records the pairing automatically; two
--    Founders who each placed the same trade independently can pair theirs by
--    hand. Deliberately no foreign key on the connection or trade ids: a
--    position closes and the pairing is the record that it was linked, exactly
--    as an invitation outlives the order journal row it names.
--
-- 4. THE FUNDED STEP LEAVES THIS WORKFLOW. Joining a trade no longer asks
--    whether it is also going on a funded account, and no longer demands a
--    screenshot. Every row still sitting on one of those two steps is completed
--    here rather than being left waiting for a question the terminal will never
--    ask again — an unresolved row keeps a blocking modal up and keeps a phone
--    repeating, so leaving them would strand somebody in a workflow that no
--    longer has an exit. The COLUMNS are kept as the archive of what was
--    decided, and nothing about the funded book, the Funded Trades screen or
--    any other funded route is touched.

ALTER TABLE `founder_trade_links` ADD `send_entries` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `founder_trade_links` ADD `send_amends` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `founder_trade_invites` ADD `kind` text DEFAULT 'entry' NOT NULL;
--> statement-breakpoint
ALTER TABLE `founder_trade_invites` ADD `prev_stop_loss` real;
--> statement-breakpoint
ALTER TABLE `founder_trade_invites` ADD `prev_take_profit` real;
--> statement-breakpoint
ALTER TABLE `founder_trade_invites` ADD `target_connection_id` text;
--> statement-breakpoint
ALTER TABLE `founder_trade_invites` ADD `target_trade_id` text;
--> statement-breakpoint
ALTER TABLE `founder_trade_invites` ADD `target_match` text;
--> statement-breakpoint
CREATE TABLE `founder_linked_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`a_user_id` text NOT NULL,
	`a_connection_id` text NOT NULL,
	`a_trade_id` text NOT NULL,
	`b_user_id` text NOT NULL,
	`b_connection_id` text NOT NULL,
	`b_trade_id` text NOT NULL,
	`instrument` text NOT NULL,
	`side` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`invite_id` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`a_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`b_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `founder_linked_positions_pair` ON `founder_linked_positions` (`a_user_id`,`a_trade_id`,`b_user_id`,`b_trade_id`);
--> statement-breakpoint
CREATE INDEX `founder_linked_positions_a` ON `founder_linked_positions` (`a_user_id`,`a_trade_id`);
--> statement-breakpoint
CREATE INDEX `founder_linked_positions_b` ON `founder_linked_positions` (`b_user_id`,`b_trade_id`);
--> statement-breakpoint
-- The timeline says why these completed, so a workflow read back later does not
-- look as though somebody answered a funded question they were never asked.
INSERT INTO `founder_trade_events` (`id`, `invite_id`, `actor_user_id`, `kind`, `detail`, `created_at`)
SELECT lower(hex(randomblob(16))), `id`, NULL, 'workflow.completed',
       'The funded question was removed from this workflow, so it was closed here',
       CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `founder_trade_invites`
WHERE `status` IN ('funded_pending', 'proof_pending');
--> statement-breakpoint
UPDATE `founder_trade_invites`
SET `status` = 'complete',
    `completed_at` = COALESCE(`completed_at`, CAST(strftime('%s','now') AS INTEGER) * 1000),
    `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `status` IN ('funded_pending', 'proof_pending');
