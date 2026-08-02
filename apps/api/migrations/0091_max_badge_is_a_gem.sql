-- The Max badge was seeded with the `diamond` glyph, which in this icon set is a
-- rounded tilted square rather than a brilliant-cut diamond. `gem` is the actual
-- jewel shape.
--
-- Guarded on the old value so an admin who has deliberately picked something else
-- from Admin ▸ Badges keeps their choice — seedBadges only inserts missing rows
-- and never overwrites an edit, and this one-time correction holds to the same
-- rule.
UPDATE `badge_types` SET `icon` = 'gem' WHERE `key` = 'max' AND `icon` = 'diamond';
