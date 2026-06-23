CREATE TABLE `wealth_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`client_id` text,
	`current_age` integer DEFAULT 35 NOT NULL,
	`retirement_age` integer DEFAULT 65 NOT NULL,
	`end_age` integer DEFAULT 90 NOT NULL,
	`current_savings` integer DEFAULT 0 NOT NULL,
	`annual_contribution` integer DEFAULT 0 NOT NULL,
	`return_bp` integer DEFAULT 600 NOT NULL,
	`inflation_bp` integer DEFAULT 250 NOT NULL,
	`income_goal` integer DEFAULT 60000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
