-- Market News live-stream setup, one row per trader: the YouTube channels they
-- follow plus their personal viewing state (open streams and their order, the
-- docked stream, the desired column count, and per-channel go-live alerts). The
-- channel catalog is per user, not shared; a trader with no row falls back to
-- the default channel set in code.
CREATE TABLE IF NOT EXISTS `market_news_streams` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL UNIQUE REFERENCES `users`(`id`) ON DELETE CASCADE,
  `channels` text DEFAULT '[]' NOT NULL,
  `watching` text DEFAULT '[]' NOT NULL,
  `docked` text,
  `cols` integer DEFAULT 2 NOT NULL,
  `notify` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
