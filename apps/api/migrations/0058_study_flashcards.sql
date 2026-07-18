CREATE TABLE `study_flashcard_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_by` text,
	`source` text NOT NULL,
	`topics` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `study_flashcard_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`team_id` text NOT NULL,
	`seq` integer NOT NULL,
	`term` text NOT NULL,
	`def` text NOT NULL,
	`topic` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `study_flashcard_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_flashcard_sets_team_idx` ON `study_flashcard_sets` (`team_id`);--> statement-breakpoint
CREATE INDEX `study_flashcard_cards_set_idx` ON `study_flashcard_cards` (`set_id`);
