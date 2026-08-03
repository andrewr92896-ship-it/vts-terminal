-- Let a trader publish one Live Wall layout to their team.
--
-- `shared_team_id` null (the default) means the board is private, which is what
-- every existing row is and stays. A team id means everyone on that team can
-- open it from their own layout picker.
--
-- What travels is the ARRANGEMENT ONLY — which tiles, where, and their settings.
-- No figure travels with it: every tile fetches as the signed-in reader, with
-- their own credentials and their own team scope, so a teammate opening a shared
-- board sees THEIR net worth and THEIR trades in it, never the author's. That
-- property is what makes sharing safe, and it is a consequence of how the tiles
-- fetch rather than something enforced here.
--
-- The one exception is handled in the service rather than the schema: a notes
-- tile carries the author's own text in the layout blob, so `shareBoard` strips
-- it. A shared board must not publish somebody's scratchpad.
ALTER TABLE `trading_boards` ADD `shared_team_id` text;--> statement-breakpoint
-- Every read of this column is "what has my team published", so index it.
CREATE INDEX `trading_boards_shared_idx` ON `trading_boards` (`shared_team_id`);
