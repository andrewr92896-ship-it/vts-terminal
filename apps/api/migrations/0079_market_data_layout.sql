-- Market Data board layout, one row per trader: the ordered pinned strip, the
-- series they removed, and any metric they entered themselves. The catalog of
-- series lives in code; this stores only the personal arrangement over it.
CREATE TABLE IF NOT EXISTS `market_data_layout` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL UNIQUE REFERENCES `users`(`id`) ON DELETE CASCADE,
  `pinned` text DEFAULT '[]' NOT NULL,
  `hidden` text DEFAULT '[]' NOT NULL,
  `custom` text DEFAULT '[]' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
