CREATE TABLE `trading_be_overrides_new` (
	`owner_id` text NOT NULL DEFAULT 'desk',
	`instrument` text NOT NULL,
	`mode` text NOT NULL DEFAULT 'percent',
	`pct` real NOT NULL DEFAULT 0,
	`amount` real NOT NULL DEFAULT 0,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `instrument`)
);
--> statement-breakpoint
INSERT INTO `trading_be_overrides_new` (`owner_id`, `instrument`, `mode`, `pct`, `amount`, `updated_at`) SELECT 'desk', `instrument`, `mode`, `pct`, `amount`, `updated_at` FROM `trading_be_overrides`;
--> statement-breakpoint
DROP TABLE `trading_be_overrides`;
--> statement-breakpoint
ALTER TABLE `trading_be_overrides_new` RENAME TO `trading_be_overrides`;
