ALTER TABLE `kia_settings` ADD `pace_mode` text DEFAULT 'calendar' NOT NULL;--> statement-breakpoint
ALTER TABLE `kia_settings` ADD `off_days` text DEFAULT '[]' NOT NULL;