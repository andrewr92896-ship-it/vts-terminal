-- Broker credentials were re-encrypted under a hardened scheme, and every stored
-- credential has to be entered again once.
--
-- The old envelope (`v1:…`) was written with a key derived by a single unsalted
-- SHA-256 — from CREDENTIALS_KEY when it was set, and otherwise from
-- SESSION_SECRET, which itself fell back to a literal in this repository whenever
-- NODE_ENV was not "production". It carried no key id, so nothing could say which
-- key wrote a record, and no additional authenticated data, so a ciphertext could
-- be moved between rows and still decrypt.
--
-- All of that changes how a ciphertext is produced and read, so a v1 record
-- cannot be migrated in place — there is no way to re-encrypt what this migration
-- cannot decrypt. The reset is the cost of the fix, and it is being paid now,
-- while the only accounts on the terminal belong to the owner's own team.
--
-- The rows are KEPT, not deleted: the label, broker, and "count trades since"
-- cutoff all survive, so reconnecting is pasting a key into the connection that
-- is already there rather than setting one up from scratch. `secret_enc` is left
-- as it is — it is unreadable, and overwriting it would gain nothing that
-- re-entering the credential does not do a moment later.
--
-- `manual` connections are deliberately untouched. They hold no credential at all
-- (their encrypted payload is an empty object), so there is nothing for anyone to
-- re-enter, and marking a hand-entered book inactive would take it off the Live
-- Wall for no reason. `repairManualConnectionSecrets()` re-seals those on boot —
-- the half a migration cannot do, the same split as the connection-label backfill.
UPDATE `broker_connections`
SET
  `active` = 0,
  `last_status` = 'error',
  `last_error` = 'Your broker credentials need to be entered again. The terminal''s credential encryption was upgraded and the stored copy can no longer be read. Open Trade Analysis, then Live Brokers, and re-enter this account''s key to reconnect it.',
  `last_checked_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  `updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE `broker` <> 'manual';
