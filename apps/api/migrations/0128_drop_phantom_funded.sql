-- Remove the funded accounts nobody added.
--
-- `listChallenges` used to begin with an `ensureOwnChallenge` that inserted a
-- default 200,000 FTP row for any trader who had none, so merely OPENING the
-- Funded screen — or carrying the Live Wall's Funded Account tile on a board —
-- created a prop challenge in that trader's name. On a desk that shares its
-- funded book those rows then appeared on everybody else's screen, and only the
-- trader they belonged to could remove them. The owner reported two people in
-- his group showing funded accounts they do not have.
--
-- The auto-create is gone (see trading/challenge.ts). This clears what it left.
--
-- WHAT IS DELETED is a row that is still exactly as it was minted and has never
-- been saved: every column at the seed default, and `updated_at` still equal to
-- `created_at`. Such a row carries no information at all — a 200,000 account
-- holding 200,000, untouched — so nothing anybody typed can be lost here, and a
-- trader who did want one adds it back with a single click.
--
-- The one row this cannot tell apart is a first account somebody added
-- deliberately and then never filled in, which is the same empty placeholder by
-- every measurable property. That is the accepted cost, and it is small.
--
-- Note `day_start_equity`: the daily roll rewrites it to the current equity,
-- which for an untouched row is still the account size, so a row that has been
-- sitting there for weeks still matches. The roll deliberately leaves
-- `updated_at` alone, which is what makes that column trustworthy here.
DELETE FROM `trading_challenges`
WHERE `updated_at` = `created_at`
  AND `label` = 'FTP Challenge'
  AND `account_size` = 200000
  AND `current_equity` = 200000
  AND `peak_equity` = 200000
  AND `day_start_equity` = 200000
  AND `target_bp` = 1000
  AND `daily_dd_bp` = 400
  AND `max_dd_bp` = 600
  AND `trailing` = 1;
