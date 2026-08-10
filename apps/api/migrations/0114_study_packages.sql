-- Study Packages: the owner-facing unit for newly created Study content.
--
-- Everything Studies holds today is scoped by `team_id` through
-- contentScopeId(viewer): content belongs to a group, and you reach it by being
-- in that group. That is the wrong shape for a public product — a stranger who
-- signs up is in no group, and Study sharing must not be a trading/private-group
-- feature. A package belongs to a PERSON, and is reached by being its owner, by
-- having been shared with it, or (later) by it being published.
--
-- Both models run side by side deliberately. Every column added here is
-- nullable, so every existing game, set and guide keeps `package_id = null` and
-- goes on resolving through the scope rules exactly as before. Nothing is
-- converted, and nothing needs to be: the new creation path produces
-- package-backed content, and the old content is not touched.
CREATE TABLE `study_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`subject` text,
	`audience` text,
	`depth` text,
	`format_version` integer DEFAULT 1 NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- Listing a person's own packages is the common read.
CREATE INDEX `study_packages_owner_idx` ON `study_packages` (`owner_user_id`);
--> statement-breakpoint
-- A package's category blueprint, with STABLE IDS.
--
-- This is the correction the package layer exists to make. Categories are
-- identified by NAME everywhere in the legacy model — on the deck, on every
-- question's `topic`, in the weights map, and in each learner's own per-category
-- statistics. Renaming one therefore resets everybody's history for it: the new
-- name matches nothing and the old name's record is stranded under a label that
-- no longer exists. Here the id is the identity and the name is only what it is
-- currently called.
CREATE TABLE `study_package_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`seq` integer NOT NULL,
	`name` text NOT NULL,
	`weight` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `study_packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_package_categories_package_idx` ON `study_package_categories` (`package_id`);
--> statement-breakpoint
-- Lesson plans belonging to a package: ordered, structured teaching content.
-- Its own table rather than another blob inside the deck's game state, because a
-- lesson is CONTENT and that state is one learner's PROGRESS. No scoring engine
-- of its own in V1.
CREATE TABLE `study_package_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`objective` text,
	`body` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `study_packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_package_lessons_package_idx` ON `study_package_lessons` (`package_id`);
--> statement-breakpoint
-- Which package each content component belongs to. NULL means legacy content and
-- is the overwhelming majority: it keeps the scope rules it has always used.
--
-- These carry no FOREIGN KEY clause on purpose. SQLite only permits ADD COLUMN
-- with a REFERENCES clause when foreign keys are off, and this database never
-- turns the pragma on (see db/index.ts) — so a clause written here would be
-- inert decoration that also constrains how the column can be added. The drizzle
-- schema still declares the relationship for documentation, and every cleanup
-- that matters is explicit in code, which is this repo's standing convention for
-- child rows (see the per-user delete list in admin/service.ts).
ALTER TABLE `study_decks` ADD `package_id` text;
--> statement-breakpoint
-- What a game's category weights are FOR, stated rather than inferred.
--
-- The legacy rule reads the weights themselves as the setting: no weights means
-- unweighted, and any weights at all means weight both the DRAW and the SCORE.
-- Those are two independent choices, and an author who wants per-category
-- tracking without changing which questions come up has no way to say so. NULL
-- preserves the legacy reading exactly, which is every game that exists today,
-- so nothing already stored changes meaning.
ALTER TABLE `study_decks` ADD `category_weight_mode` text;
--> statement-breakpoint
ALTER TABLE `study_flashcard_sets` ADD `package_id` text;
--> statement-breakpoint
ALTER TABLE `study_guides` ADD `package_id` text;
--> statement-breakpoint
-- The stable category a question belongs to, for a package-backed deck.
--
-- `topic` stays and stays populated with the category's current name: it is the
-- compatibility field every existing player, editor and test path reads, which
-- is why none of them had to change. Where both are present the ID is the
-- identity — a rename rewrites the topic strings and leaves this alone.
ALTER TABLE `study_deck_questions` ADD `category_id` text;
--> statement-breakpoint
CREATE INDEX `study_decks_package_idx` ON `study_decks` (`package_id`);
--> statement-breakpoint
CREATE INDEX `study_flashcard_sets_package_idx` ON `study_flashcard_sets` (`package_id`);
--> statement-breakpoint
CREATE INDEX `study_guides_package_idx` ON `study_guides` (`package_id`);
