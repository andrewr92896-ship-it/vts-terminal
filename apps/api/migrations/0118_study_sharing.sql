-- Study sharing, and the public Study Library.
--
-- Sharing here is INDEPENDENT of trading/private groups, which is the reason the
-- package layer exists at all: one person hands a package to another by
-- username, and neither of them joins anything. No chat, no feed, no follows —
-- a share is permission to study somebody's content and nothing else.
CREATE TABLE `study_package_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`shared_by_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`responded_at` integer,
	FOREIGN KEY (`package_id`) REFERENCES `study_packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- One share relationship per person per package: offering the same package to
-- the same person twice is the same offer, not a second one. The unique index is
-- what makes a repeated share idempotent rather than a pile of duplicates.
CREATE UNIQUE INDEX `study_package_shares_one_each` ON `study_package_shares` (`package_id`,`recipient_user_id`);
--> statement-breakpoint
CREATE INDEX `study_package_shares_recipient_idx` ON `study_package_shares` (`recipient_user_id`);
--> statement-breakpoint
-- A creator asking VTS to publish a package. SUBMITTING IS NOT PUBLISHING: an
-- administrator reads it and decides, and only an approval makes it public.
--
-- `attestation_version` records WHICH wording the submitter agreed to. A blanket
-- boolean would not survive the wording changing — this says what was actually
-- put in front of them, which is the only version of that record worth keeping.
CREATE TABLE `study_package_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`submitted_by_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by_user_id` text,
	`admin_note` text,
	`attestation_version` text NOT NULL,
	`attested_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `study_packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `study_package_submissions_status_idx` ON `study_package_submissions` (`status`);
--> statement-breakpoint
CREATE INDEX `study_package_submissions_package_idx` ON `study_package_submissions` (`package_id`);
--> statement-breakpoint
-- A learner adding a published package to their own library.
--
-- Deliberately not a share row: a share is offered TO somebody, and this is
-- somebody helping themselves to public content. It is also what makes them a
-- participant on that package's leaderboard — reading a public package is open
-- to anyone, but appearing on its board means having chosen to study it.
CREATE TABLE `study_package_adds` (
	`user_id` text NOT NULL,
	`package_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `package_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `study_packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_package_adds_package_idx` ON `study_package_adds` (`package_id`);
