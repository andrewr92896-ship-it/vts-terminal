ALTER TABLE `session_alert_prefs` ADD `notify_pre_close` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `session_alert_prefs` ADD `pre_close_lead_min` integer DEFAULT 15 NOT NULL;
