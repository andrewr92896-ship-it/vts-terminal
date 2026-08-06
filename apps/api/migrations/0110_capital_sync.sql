-- Withdrawn capital, and the option to keep both figures in step with the broker.
--
-- Deposited capital arrived in 0109 as a number the trader types. This adds its
-- opposite, and a per-figure switch between typing it and syncing it from the
-- connected OANDA account's funding history.
--
-- Four things about the shape, each of which is the honest option rather than
-- the tidy one:
--
--   * The typed figure and the synced figure are SEPARATE columns. Turning sync
--     on must not overwrite what the trader entered, so turning it off again
--     restores their own number rather than leaving the broker's in its place.
--   * `*_sync` is per figure, not one switch for both. The same broker read
--     answers deposits and withdrawals, but pressing Sync on one card must not
--     silently change what the other card is doing.
--   * `synced_*` holds the LAST GOOD reading, so a failed refresh leaves the
--     figure standing with its timestamp instead of blanking to zero — the same
--     stale-while-revalidate rule Market Data follows.
--   * Every new column is NULLABLE (or defaults to off). Null means "not
--     stated", which is every row that exists today, and stays distinct from a
--     zero the trader actually entered.
ALTER TABLE `trading_desk_settings` ADD `withdrawn_capital` real;
--> statement-breakpoint
ALTER TABLE `trading_desk_settings` ADD `deposited_sync` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `trading_desk_settings` ADD `withdrawn_sync` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `trading_desk_settings` ADD `synced_deposited` real;
--> statement-breakpoint
ALTER TABLE `trading_desk_settings` ADD `synced_withdrawn` real;
--> statement-breakpoint
ALTER TABLE `trading_desk_settings` ADD `capital_synced_at` integer;
