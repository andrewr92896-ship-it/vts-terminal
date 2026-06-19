CREATE TABLE `todo_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`n` integer NOT NULL,
	`icon` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`tag` text,
	`life` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `todo_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`section_id` text NOT NULL,
	`text` text NOT NULL,
	`position` integer NOT NULL,
	`hyphen` integer DEFAULT false NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`due_at` integer,
	`interval_days` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `todo_sections`(`id`) ON UPDATE no action ON DELETE cascade
);
