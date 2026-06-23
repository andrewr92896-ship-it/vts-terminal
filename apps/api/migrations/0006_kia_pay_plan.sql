ALTER TABLE `kia_settings` ADD `commission_bp` integer DEFAULT 1350 NOT NULL;--> statement-breakpoint
ALTER TABLE `kia_settings` ADD `review_required` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `kia_settings` ADD `review_req_pct` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `kia_settings` ADD `bonus_tiers` text;--> statement-breakpoint
UPDATE `kia_settings` SET `bonus_tiers` = '[{"units":12,"amount":500},{"units":15,"amount":1000},{"units":19,"amount":2000}]' WHERE `bonus_tiers` IS NULL;
