-- An append-only record of every use of a stored broker credential.
--
-- Broker credentials on this desk can place real orders, and nothing recorded
-- that one had been used. After a leaked database, a rogue administrator or a
-- disputed trade there was no way to reconstruct what happened, and no answer to
-- the one question a customer will actually ask: "was my key used?".
--
-- Two tiers share this table. Anything that moves money or was asked for by a
-- person writes one detailed row; background polling upserts one row per
-- (connection, purpose, hour) and increments `count`. Without that split the
-- 10-second reconcile and the Live Wall poll would write thousands of rows per
-- connection per day into a SQLite file on a mounted volume.
--
-- No foreign keys on purpose: this record has to outlive the connection and the
-- account it describes, which is why `owner_username` is stored on the row. It
-- is deliberately excluded from the per-user delete list in admin/service.ts,
-- the same exception the employee audit log already takes.
CREATE TABLE `credential_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `connection_id` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `owner_username` text NOT NULL,
  `actor_user_id` text,
  `purpose` text NOT NULL,
  `source_ip` text,
  `occurred_at` integer NOT NULL,
  `hour_bucket` integer,
  `count` integer DEFAULT 1 NOT NULL,
  `ok` integer DEFAULT true NOT NULL,
  `error` text
);
--> statement-breakpoint
-- The aggregate upsert target. `hour_bucket` is NULL on an individual row, and
-- SQL treats NULLs as distinct in a unique index — so this constrains only the
-- aggregate tier and lets any number of individual rows share a hour.
CREATE UNIQUE INDEX `credential_audit_bucket_idx` ON `credential_audit` (`connection_id`, `purpose`, `hour_bucket`);
--> statement-breakpoint
-- Reading is always "this owner's recent use, newest first" — the panel a trader
-- sees on their own connections, and the admin view across everyone.
CREATE INDEX `credential_audit_owner_idx` ON `credential_audit` (`owner_user_id`, `occurred_at`);
