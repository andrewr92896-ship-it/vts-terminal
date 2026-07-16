CREATE TABLE `study_decks` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_by` text,
	`source` text NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`categories` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `study_deck_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`team_id` text NOT NULL,
	`seq` integer NOT NULL,
	`topic` text NOT NULL,
	`stem` text NOT NULL,
	`options` text NOT NULL,
	`answer` text NOT NULL,
	`explanation` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `study_decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_deck_game` (
	`user_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `deck_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_id`) REFERENCES `study_decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_deck_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`attempted` integer NOT NULL,
	`correct` integer NOT NULL,
	`best_step` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_id`) REFERENCES `study_decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_decks_team_idx` ON `study_decks` (`team_id`);--> statement-breakpoint
CREATE INDEX `study_deck_questions_deck_idx` ON `study_deck_questions` (`deck_id`);--> statement-breakpoint
CREATE INDEX `study_deck_runs_deck_idx` ON `study_deck_runs` (`deck_id`);
