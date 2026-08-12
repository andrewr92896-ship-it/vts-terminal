-- Repair the work that three earlier migrations were written to do and never did.
--
-- Drizzle splits a migration file on the statement-breakpoint marker line and
-- applies each piece. A file with no markers is handed over as ONE statement, so
-- only its FIRST statement is applied and the rest are dropped in silence — the
-- migration still reports success. Three files in this tree were written without
-- the markers and lost everything after their opening statement:
--
-- (Do not write that marker out in full inside a comment, here or anywhere: it
-- is matched literally, anywhere in the file, so a mention of it in prose splits
-- the migration at that point and mangles the statement it lands in the middle
-- of. That is exactly what happened while writing this one.)
--
--   0083_user_features                the grandfathering INSERT
--   0084_market_news_channels         CREATE UNIQUE INDEX (team_id, key)
--   0085_connection_labels…           3 of its 4 label UPDATEs
--
-- and a fourth, 0086_market_news_channel_repair, was never registered in
-- migrations/meta/_journal.json at all, so none of it ran.
--
-- The old files are NOT edited to fix this. Drizzle records a migration as
-- applied by its journal timestamp, so amending one changes nothing on a
-- database that has already seen it. The repair has to be a new migration, which
-- is this one.
--
-- 0085 needs nothing here: AGENTS.md already records that it is not the
-- enforcement — `backfillConnectionLabels()` re-applies the venue-naming rule to
-- every connection on every boot, which is why the labels are correct in spite
-- of this. That leaves 0083, 0084 and 0086, below.
--
-- `npm run verify:migrations` now fails on an unregistered or unsafely-formatted
-- migration, so this class of silent loss cannot recur.

-- ---------------------------------------------------------------------------
-- 1. 0083 — grandfather the accounts that Feature Access was meant to carry over
-- ---------------------------------------------------------------------------
-- Feature Access made Advanced Trading an opt-in that defaults OFF, and 0083 was
-- supposed to insert a row for every account that already existed so nobody lost
-- their desk on that deploy. Its patch note (Beta V 5.93, 31 July 2026) promised
-- exactly that: "Everyone already using the portal keeps everything they had."
-- The INSERT never ran, so those accounts have no `user_features` row, read
-- `advanced_trading = 0`, and lost the trading desk until they turned it back on
-- themselves.
--
-- Who this touches, and why it is deliberately narrow: a user is grandfathered
-- only if they have NO row yet AND either
--
--   (a) they were created before Feature Access shipped — so 0083 would have
--       covered them — or
--   (b) they own data that can only exist if they had the desk: a broker
--       connection, a trade, a position, a hand-kept book, a strategy session, a
--       saved board, a prop challenge.
--
-- Clause (b) is what makes this safe without being able to inspect the live
-- database first. Clause (a) alone would miss anyone created during the day of
-- the deploy; (b) alone would miss someone who had access but had not used it.
-- Neither can fire for a genuinely new account, which is the case that must not
-- be touched — silently switching the trading desk on for somebody who never
-- asked for it is the one outcome worse than the bug being repaired.
--
-- `trading_ack_at` is stamped for the same reason 0083 stamped it: these accounts
-- were using the desk before the acknowledgement existed, so asking them to
-- re-consent to something they were already doing is noise. A brand-new account
-- is never in this set and still has to acknowledge before it can opt in.
--
-- `funded` replicates 0083's rule exactly — whoever passed the old role gate.
INSERT INTO `user_features` (
  `id`, `user_id`, `advanced_trading`, `funded`, `trading_ack_at`, `created_at`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))),
  u.`id`,
  1,
  CASE
    WHEN COALESCE(u.`roles`, '') LIKE '%"funded"%'
      OR COALESCE(u.`roles`, '') LIKE '%"admin"%'
      OR COALESCE(u.`roles`, '') LIKE '%"founder"%'
      OR COALESCE(u.`roles`, '') LIKE '%"software_developer"%'
    THEN 1
    ELSE 0
  END,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `users` u
WHERE u.`id` NOT IN (SELECT `user_id` FROM `user_features`)
  AND (
    -- (a) existed before Feature Access shipped (2026-07-31T00:00:00Z)
    u.`created_at` < 1785456000000
    -- (b) or holds data that proves they had the desk
    OR EXISTS (SELECT 1 FROM `broker_connections` t WHERE t.`user_id` = u.`id`)
    OR EXISTS (SELECT 1 FROM `trading_trades`     t WHERE t.`user_id` = u.`id`)
    OR EXISTS (SELECT 1 FROM `trading_positions`  t WHERE t.`user_id` = u.`id`)
    OR EXISTS (SELECT 1 FROM `manual_positions`   t WHERE t.`user_id` = u.`id`)
    OR EXISTS (SELECT 1 FROM `trading_sessions`   t WHERE t.`user_id` = u.`id`)
    OR EXISTS (SELECT 1 FROM `trading_boards`     t WHERE t.`user_id` = u.`id`)
    OR EXISTS (SELECT 1 FROM `funded_accounts`    t WHERE t.`user_id` = u.`id`)
    OR EXISTS (SELECT 1 FROM `trading_challenges` t WHERE t.`user_id` = u.`id`)
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. 0084 — the unique index that guards a desk's channel list
-- ---------------------------------------------------------------------------
-- `key` is how a saved tile references a channel, so two rows sharing one
-- (team_id, key) make "which channel is open" ambiguous. Worse, the seeding path
-- in marketNewsStreams.ts states in its own comment that it relies on this index
-- for idempotency — its `onConflictDoNothing()` has had no constraint to conflict
-- on, so two requests racing on a desk's first load could double-insert the whole
-- starter set.
--
-- Duplicates therefore have to be cleared before the index can be created, or
-- CREATE UNIQUE INDEX fails and takes the migration down with it. The earliest
-- row per (team_id, key) is the survivor: it is the one a saved tile has been
-- pointing at, and keeping it means nobody's watching list changes.
--
-- Nothing outside this table references a channel row's id, so deleting the
-- later duplicates is contained.
DELETE FROM `market_news_channels`
WHERE `id` NOT IN (
  SELECT `id` FROM (
    SELECT `id`,
           ROW_NUMBER() OVER (
             PARTITION BY `team_id`, `key`
             ORDER BY `created_at` ASC, `id` ASC
           ) AS rn
    FROM `market_news_channels`
  )
  WHERE rn = 1
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `market_news_channels_team_key`
  ON `market_news_channels` (`team_id`, `key`);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. 0086 — give the starter channels their real YouTube ids
-- ---------------------------------------------------------------------------
-- Never registered in the journal, so none of it ran. `SEED_CHANNELS` now carries
-- these ids inline, which fixes every desk seeded since — but a desk seeded
-- BEFORE that change still has empty `channel_id` values, and a row with no id
-- cannot embed at all. The background resolver fills those in eventually, but
-- only when YouTube is reachable from the server, so the tiles stay dead until
-- then for no reason.
--
-- Only rows that are still empty are touched: a desk that resolved its own id, or
-- pointed the row at a different channel, keeps what it has.
--
-- 0086's file is deleted in this change rather than left in the tree. It has
-- never run anywhere and never will, and an orphan migration that looks applied
-- is exactly what made this take so long to spot.
UPDATE `market_news_channels`
SET `channel_id` = 'UCEAZeUIeJs0IjQiqTCdVSIg', `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `key` = 'yahoofinance' AND `channel_id` = '';
--> statement-breakpoint

UPDATE `market_news_channels`
SET `channel_id` = 'UCIALMKvObZNtJ6AmdCLP7Lg', `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `key` = 'bloomberg' AND `channel_id` = '';
--> statement-breakpoint

UPDATE `market_news_channels`
SET `channel_id` = 'UCAzhpt9DmG6PnHXjmJTvRGQ', `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `key` = 'fed' AND `channel_id` = '';
--> statement-breakpoint

-- Reuters runs a rolling news stream, so it carries the 24/7 tag alongside
-- Bloomberg and Yahoo Finance. The Fed is left as-is: it is dark between
-- meetings, and its tile shows the FOMC countdown rather than pretending
-- otherwise.
UPDATE `market_news_channels`
SET `always_on` = 1, `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `key` = 'reuters' AND `always_on` = 0;
