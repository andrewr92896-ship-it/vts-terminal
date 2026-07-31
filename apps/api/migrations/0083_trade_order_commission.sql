-- Record what the broker actually charged on a fill, in account currency.
--
-- Worth storing rather than inferring: on a spread-priced OANDA account this is
-- 0, and that zero is the only authoritative answer to "was anything taken on
-- top of the spread?" — the question a per-pip figure that looks small always
-- prompts. Null on rows where nothing was charged yet (a resting order) or
-- where the broker did not report it.
ALTER TABLE `trading_orders` ADD `commission` real;
