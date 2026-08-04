-- Trading Teams become a granted feature, not a standard one.
--
-- Teams stay fully built and working, but they are hidden from the average
-- account at public launch: a shared desk is the raw material for an implied
-- track record, and the product's whole posture is informational-only. A
-- software developer grants access by hand; nothing self-service can turn it on.
--
-- Default 0 — nobody has it until granted. The backfill below gives it to the
-- accounts that already belong to a real team, so the people using teams today
-- keep them and nothing disappears on deploy. Founder-level accounts do not need
-- a row: getUserFeatures resolves them to true the same way memberships resolve
-- admins to Max.
ALTER TABLE user_features ADD COLUMN trading_teams INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Anyone currently on a team keeps it. A row may not exist for them yet (a user
-- who never touched a switch has no user_features row at all), so insert first,
-- then set the flag.
INSERT INTO user_features (id, user_id, advanced_trading, funded, share_book, trading_teams, created_at, updated_at)
SELECT
  'uf-tt-' || u.id,
  u.id,
  0,
  0,
  0,
  1,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM users u
WHERE u.team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_features f WHERE f.user_id = u.id);
--> statement-breakpoint

UPDATE user_features
SET trading_teams = 1,
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE user_id IN (SELECT id FROM users WHERE team_id IS NOT NULL);
