CREATE TABLE `user_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`expires_at` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`note` text,
	`granted_by` text,
	`granted_by_name` text,
	`granted_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_memberships_user_id_unique` ON `user_memberships` (`user_id`);
--> statement-breakpoint
CREATE TABLE `admin_log` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`actor_id` text,
	`actor_name` text,
	`target_user_id` text,
	`target_name` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`resolved_by_name` text,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `admin_log_created_idx` ON `admin_log` (`created_at`);
--> statement-breakpoint
CREATE TABLE `dev_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`author_kind` text DEFAULT 'user' NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`seed_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dev_blog_posts_seed_key_unique` ON `dev_blog_posts` (`seed_key`);
--> statement-breakpoint
CREATE TABLE `dev_blog_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`body` text NOT NULL,
	`author_kind` text DEFAULT 'user' NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `dev_blog_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `early_access_requests` ADD `status` text DEFAULT 'new' NOT NULL;
--> statement-breakpoint
INSERT INTO `user_memberships` (
	`id`, `user_id`, `tier`, `expires_at`, `source`, `note`,
	`granted_by`, `granted_by_name`, `granted_at`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	`id`,
	'max',
	NULL,
	'grandfather',
	'Grandfathered when memberships shipped — on the terminal before it was a paid product.',
	NULL,
	'VTS Development',
	CAST(strftime('%s','now') AS INTEGER) * 1000,
	CAST(strftime('%s','now') AS INTEGER) * 1000,
	CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `users`
WHERE `active` = 1;
