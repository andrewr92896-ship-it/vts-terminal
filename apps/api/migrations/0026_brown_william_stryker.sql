CREATE TABLE `truth_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`url` text,
	`posted_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
