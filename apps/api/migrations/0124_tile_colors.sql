-- Trade tile colours — whose position it is, readable at a glance.
--
-- A group sharing its book renders every member's open position in the same navy
-- card, so telling one trader's trades from another's meant reading the @handle
-- on each one. These columns let the group LEADER assign a colour per person,
-- plus two more for the tiles that belong to nobody in particular: funded
-- (prop-firm) positions and hand-kept manual ones.
--
-- A colour is stored as a PALETTE KEY, never a hex value, and the key is checked
-- against the palette on write. That is what stops a tile being painted green or
-- red: on a trade card those two already mean winning and losing, and a losing
-- position washed green is the one mistake this feature could make that costs
-- real money to misread. The palette lives in `trading/tileColors.ts` and is the
-- only place the hexes exist — the web renders swatches from what the server
-- sends, so there is no second copy to drift.
--
-- All three are NULL by default, and null means "exactly as it was": no wash on
-- a person's tile or a manual one, and the same neutral gray a funded tile has
-- always carried. Nothing on any desk changes appearance until somebody chooses.
ALTER TABLE `user_team_members` ADD `tile_color` text;--> statement-breakpoint
ALTER TABLE `user_teams` ADD `funded_tile_color` text;--> statement-breakpoint
ALTER TABLE `user_teams` ADD `manual_tile_color` text;
