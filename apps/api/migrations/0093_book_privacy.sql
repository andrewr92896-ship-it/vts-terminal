-- Private mode: whether a trader's open book is visible to their teammates.
--
-- Before this, joining a team broadcast your whole book to it — instrument,
-- direction, entry, size, stop, target, live P&L, open time — with no consent
-- step and no way out. `share_book` is that consent, and it lives beside the
-- Advanced Trading opt-in because it is the same kind of thing: a per-user
-- switch with an acknowledgement stamped against it.
--
-- Off is the default, so a new member of a team starts private and their book
-- becomes visible only once they say so. `book_ack_at` stamps when they read
-- what sharing exposes; the stamp survives switching back to private, so
-- somebody returning is not asked twice.
ALTER TABLE `user_features` ADD `share_book` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_features` ADD `book_ack_at` integer;
--> statement-breakpoint
-- Grandfather everyone already on a team. They are sharing today — that is what
-- the terminal has always done — so they keep sharing and nobody's Live Wall
-- goes dark on deploy. The acknowledgement is stamped for them too: their book
-- has been on the team's wall all along, so asking them to consent to what is
-- already true would be noise.
--
-- Two statements because a user on a team may have no `user_features` row at
-- all: migration 0083 wrote a row for every account existing then, but accounts
-- created since only get one when they first toggle something. The insert
-- covers those, the update covers the rest.
--
-- Traders on no team are deliberately left private. They have nobody to share
-- with, so there is nothing to grandfather; if they join a team later, the
-- consent step is the point.
INSERT INTO `user_features` (
  `id`, `user_id`, `advanced_trading`, `funded`, `trading_ack_at`,
  `share_book`, `book_ack_at`, `created_at`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))),
  `id`,
  0,
  0,
  NULL,
  1,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `users`
WHERE `team_id` IS NOT NULL
  AND `id` NOT IN (SELECT `user_id` FROM `user_features`);
--> statement-breakpoint
UPDATE `user_features`
SET
  `share_book` = 1,
  `book_ack_at` = COALESCE(`book_ack_at`, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  `updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE `user_id` IN (SELECT `id` FROM `users` WHERE `team_id` IS NOT NULL);
