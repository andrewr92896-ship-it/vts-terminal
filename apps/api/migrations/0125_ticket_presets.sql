-- Order ticket size presets — the quick-size buttons, made the trader's own.
--
-- The chips under the ticket's size box were fixed in code (1k / 5k / 10k / 25k
-- / 100k, or fractions on a crypto pair, or amounts of money on a spot account).
-- This row lets a trader say what those buttons are, and what they mean: a size
-- in units, or an amount of money per pip — "$5 a pip" is how most traders
-- actually size a trade, and working that out by hand every time is what the
-- shortcut existed to save.
--
-- Every ladder column is NULLABLE and null means "the built-in ladder", not "no
-- buttons". So nobody's ticket changes on deploy, and a default improved in code
-- still reaches everyone who never customised that ladder.
--
-- The four are kept apart because a number means something different in each:
-- 1,000 is an ordinary FX size and a ruinous bitcoin one, so one shared ladder
-- would be wrong on whichever instrument it was not written for.
--
-- margin_warn_pct is when a preset's margin reading turns red. 100 is the
-- default and the honest one — that is the point the broker refuses the order —
-- but a trader who never wants a single position past 70% of their free margin
-- can say so, and the button tells them before they press it.
--
-- This is the trader's own ticket and nobody else's: the service takes the
-- caller's id, and unlike trading_desk_settings there is no path by which a desk
-- lead reaches a teammate's row.
CREATE TABLE `ticket_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text,
	`units_presets` text,
	`fractional_presets` text,
	`step_presets` text,
	`cost_presets` text,
	`show_margin` integer DEFAULT true NOT NULL,
	`margin_warn_pct` integer DEFAULT 100 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_presets_user_id_unique` ON `ticket_presets` (`user_id`);
