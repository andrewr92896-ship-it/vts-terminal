ALTER TABLE `users` ADD `roles` text;--> statement-breakpoint
UPDATE `users` SET `roles` = CASE `role`
  WHEN 'Admin' THEN '["admin"]'
  WHEN 'Trader' THEN '["trading","todo"]'
  WHEN 'Sales' THEN '["sales","todo"]'
  WHEN 'Viewer' THEN '["trading_viewer"]'
  ELSE '[]' END
WHERE `roles` IS NULL;
