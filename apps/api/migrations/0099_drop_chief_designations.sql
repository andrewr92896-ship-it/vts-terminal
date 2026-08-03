-- Remove the Chief Strategist / Chief Analyst designations.
--
-- Owner decision, 2026-08, for risk management: a title naming one trader the
-- desk's analyst or strategist implies they are advising the others, and the
-- terminal deliberately stays out of the advice-giving posture (see the "no
-- personalized buy/sell advice" line the rest of the product is built to).
-- Dropping them from the code is not enough — the badges are rows, and a badge
-- already granted would keep rendering beside somebody's name forever.
--
-- Three places hold one, and all three are cleared:
--   1. the two badge_types rows (they were seeded builtin, so nothing else
--      removes them — seedBadges only ever inserts what is missing);
--   2. the keys inside each user's badges JSON array;
--   3. the cosmetic user_team_members.badge title, which was a free-text field
--      offered with these two as presets.
--
-- Step 2 rebuilds the array with json_group_array over json_each rather than
-- doing string surgery on the JSON text, so a key that merely appears as a
-- substring of another badge's key is untouched. An empty result is '[]', which
-- parseBadges reads as no badges.
DELETE FROM `badge_types` WHERE `key` IN ('chief-strategist', 'chief-analyst');
--> statement-breakpoint
UPDATE `users`
SET `badges` = (
  SELECT json_group_array(`value`)
  FROM json_each(`users`.`badges`)
  WHERE `value` NOT IN ('chief-strategist', 'chief-analyst')
)
WHERE `badges` IS NOT NULL
  AND json_valid(`badges`)
  AND EXISTS (
    SELECT 1 FROM json_each(`users`.`badges`)
    WHERE `value` IN ('chief-strategist', 'chief-analyst')
  );
--> statement-breakpoint
UPDATE `user_team_members`
SET `badge` = NULL
WHERE `badge` IN ('Chief Strategist', 'Chief Analyst');
