-- Feature Access: which optional parts of the portal each user has turned on.
-- Advanced Trading (the desk) and, nested under it, Funded Account (the
-- prop-challenge tracker). Everything else — Markets, Investments, Studies, My
-- Portal, Site Help — is included with every account and has no row here.
--
-- Off is the default for a new account. `trading_ack_at` stamps when the user
-- acknowledged that the desk places real orders with their own broker; the desk
-- cannot be enabled without it.
CREATE TABLE IF NOT EXISTS `user_features` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL UNIQUE REFERENCES `users`(`id`) ON DELETE CASCADE,
  `advanced_trading` integer DEFAULT 0 NOT NULL,
  `funded` integer DEFAULT 0 NOT NULL,
  `trading_ack_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- Grandfather every existing account into what it can already see today. Before
-- this change every signed-in user reached Advanced Trading, so they all keep
-- it; nobody loses their desk on deploy. The acknowledgement is stamped for
-- them too — they have been trading here already, so re-consenting is noise.
--
-- Funded follows the old gate exactly (the `funded` role, which admins and
-- founder-level users passed implicitly), so the same people keep seeing the
-- challenge tracker. From here on the opt-in is the only gate and the role is
-- retired.
INSERT INTO `user_features` (
  `id`, `user_id`, `advanced_trading`, `funded`, `trading_ack_at`, `created_at`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))),
  `id`,
  1,
  CASE
    WHEN COALESCE(`roles`, '') LIKE '%"funded"%'
      OR COALESCE(`roles`, '') LIKE '%"admin"%'
      OR COALESCE(`roles`, '') LIKE '%"founder"%'
      OR COALESCE(`roles`, '') LIKE '%"software_developer"%'
    THEN 1
    ELSE 0
  END,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `users`
WHERE `id` NOT IN (SELECT `user_id` FROM `user_features`);
