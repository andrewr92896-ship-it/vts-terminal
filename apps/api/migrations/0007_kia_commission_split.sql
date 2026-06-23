ALTER TABLE `kia_settings` ADD `commission_mode` text DEFAULT 'total' NOT NULL;--> statement-breakpoint
ALTER TABLE `kia_settings` ADD `commission_front_bp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `kia_settings` ADD `commission_back_bp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `kia_deals` ADD `front_profit` integer;--> statement-breakpoint
ALTER TABLE `kia_deals` ADD `back_profit` integer;
