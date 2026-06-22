ALTER TABLE `users` ADD `created_username` text;--> statement-breakpoint
UPDATE `users` SET `created_username` = `username` WHERE `created_username` IS NULL;
