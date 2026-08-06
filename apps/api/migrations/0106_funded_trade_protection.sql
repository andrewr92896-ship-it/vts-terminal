-- The stop and target on a hand-kept funded position.
--
-- A funded/prop position is entered by pasting a screenshot of the open trade,
-- and VTS AI has always read the stop and target off it (`ParsedPosition`
-- carries both). There was nowhere to put them: the row had no columns, so the
-- route dropped them and the Live Wall hard-coded a null stop on every funded
-- position it built.
--
-- That is worse than an omission. The desk draws "Stop loss: none" deliberately,
-- because a position with no protection on it is the most important thing that
-- panel can say — so a trade carrying a stop at the broker was being reported as
-- an unprotected one, in the words the desk reserves for genuine danger.
--
-- Nullable with no default: a null here means "we do not know of a stop on this
-- position", which is exactly right for every row imported before this, and is
-- the same thing the column means going forward.
ALTER TABLE `funded_trades` ADD `stop_loss` real;
--> statement-breakpoint
ALTER TABLE `funded_trades` ADD `take_profit` real;
