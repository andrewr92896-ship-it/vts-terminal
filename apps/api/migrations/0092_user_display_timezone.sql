-- The clock a user reads the terminal on (My Terminal ▸ Preferences). Was a
-- per-device localStorage value; a time zone belongs to the person, so it moves
-- onto the account and follows them to every device they sign in on.
--
-- NULL means "never chosen", which resolves to Eastern — the clock every stamp
-- was on before the setting existed. The stored value is either the literal
-- 'auto' (follow whatever device is being used) or an IANA zone name.
ALTER TABLE `users` ADD COLUMN `display_timezone` text;
