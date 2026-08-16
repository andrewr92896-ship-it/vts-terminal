-- Trading Notes — predictions and observations.
--
-- Two kinds of entry in one table, because they share almost everything (owner,
-- visibility, instrument tag, week bucket) and differ only in whether a verdict
-- is ever owed. A prediction carries a window, a deadline and an outcome; an
-- observation leaves all of those null and is never settled.
--
-- THE POINT OF THE FEATURE IS THAT A PUBLISHED CALL CANNOT BE REWRITTEN. A track
-- record you can edit after the fact is not a track record, so `locked_at` is
-- stamped the moment a prediction is shared with the group, and a window that
-- has opened locks the call whether or not it was ever shared. After that only
-- the reflection may be written. Same rule the published study packages follow.
--
-- `week_key` is an ET week stamp ('YYYY-Www', Monday-based) computed by the
-- service at write time, not derived on read. A trading week is an Eastern
-- concept — the same reason History buckets its days in ET — so deriving it per
-- reader would move a call between weeks when somebody changes their display
-- zone, and would put two people in one group on different boards.
--
-- `open_price` is the mark the call was made against and is what an automatic
-- settlement compares to when no explicit target was named. It is stamped when
-- the window opens; a call whose open price was never readable simply cannot be
-- settled automatically, and says so rather than being scored.
--
-- No foreign key on the group: visibility is resolved live through
-- visibleTraderIds(), so a shared note stops being visible the moment its author
-- leaves the group, with nothing stored to go stale.
CREATE TABLE IF NOT EXISTS `trading_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'observation' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`instrument` text,
	`direction` text,
	`target_price` real,
	`confidence` integer,
	`week_key` text NOT NULL,
	`window_opens_at` integer,
	`deadline_at` integer,
	`open_price` real,
	`locked_at` integer,
	`outcome` text,
	`settled_at` integer,
	`settled_by` text,
	`settle_price` real,
	`settle_note` text,
	`reflection` text,
	`reflected_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- The week board reads one owner's week at a time; the group board reads a set
-- of owners for one week. Both are served by this.
CREATE INDEX IF NOT EXISTS `trading_notes_user_week_idx` ON `trading_notes` (`user_id`,`week_key`);
--> statement-breakpoint
-- The settlement pass asks for every prediction whose deadline has passed and
-- that carries no outcome yet, across all owners.
CREATE INDEX IF NOT EXISTS `trading_notes_settle_idx` ON `trading_notes` (`kind`,`outcome`,`deadline_at`);
