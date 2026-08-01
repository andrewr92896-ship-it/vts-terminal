-- Market News stream-wall channels, owned by the desk rather than by the code.
-- A trader pastes a YouTube link and the channel appears for their whole team,
-- so rows are scoped by `team_id` (or `user:<id>` for a trader on no team).
-- `key` is what a saved watching/notify entry references and never changes.
CREATE TABLE IF NOT EXISTS `market_news_channels` (
  `id` text PRIMARY KEY NOT NULL,
  `team_id` text NOT NULL,
  `key` text NOT NULL,
  `name` text NOT NULL,
  `handle` text DEFAULT '' NOT NULL,
  `channel_id` text DEFAULT '' NOT NULL,
  `always_on` integer DEFAULT 0 NOT NULL,
  `added_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- One row per key per desk: the key is how a saved tile references a channel,
-- so a duplicate would make "which channel is open" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS `market_news_channels_team_key`
  ON `market_news_channels` (`team_id`, `key`);
