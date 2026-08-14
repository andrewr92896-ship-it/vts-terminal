-- Capital per (trader, broker account).
--
-- The single deposited/withdrawn pair on `trading_desk_settings` could not
-- describe a desk where more than one broker account sits under one login: the
-- sync summed every account's funding into one figure, so a trader holding
-- their own account beside a partner's saw the two added together with no way
-- to separate them or to sync one without the other.
--
-- `account_key` is a `broker_connections.id`, or 'other' for capital that is
-- not behind a connected account. No foreign key, deliberately: removing a
-- connection must not delete the record of money that was paid into it.
--
-- The existing figures are carried across by `backfillCapitalAccounts()` on
-- boot rather than here — the rule for splitting one summed figure into per
-- account rows needs to read each trader's connections and know which of them
-- can be synced, which is code, not SQL. The old columns are left in place as
-- the archive; nothing reads them after the move.
CREATE TABLE IF NOT EXISTS `trading_capital_accounts` (
	`user_id` text NOT NULL,
	`account_key` text NOT NULL,
	`deposited_capital` real,
	`withdrawn_capital` real,
	`deposited_sync` integer DEFAULT 0 NOT NULL,
	`withdrawn_sync` integer DEFAULT 0 NOT NULL,
	`synced_deposited` real,
	`synced_withdrawn` real,
	`currency` text,
	`capital_synced_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `account_key`)
);
