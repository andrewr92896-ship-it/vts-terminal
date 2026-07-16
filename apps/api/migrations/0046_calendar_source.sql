ALTER TABLE `trading_calendar` ADD `source` text;--> statement-breakpoint
UPDATE `trading_calendar` SET `source` = 'Forex Factory' WHERE `source` IS NULL;