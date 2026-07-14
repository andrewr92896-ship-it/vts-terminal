ALTER TABLE `trading_desk_settings` ADD `break_even_mode` text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE `trading_desk_settings` ADD `break_even_amount` real DEFAULT 0 NOT NULL;
