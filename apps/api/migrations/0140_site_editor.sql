-- The Site Editor (owner request, 2026-09): the marketing landing page at
-- vitalistradingsystems.com is edited from a founder-only workspace on the
-- private portal, the same way the owner's portfolio is edited from its admin.
--
-- THREE TABLES, KEYED BY SITE, so a second site is a row rather than a schema.
--
--   site_documents  one row per site: the DRAFT (what the editor writes on Save)
--                   and what is PUBLISHED (what the site serves). Editing is
--                   half-finished by nature, so the draft is never served —
--                   publish copies it. Both are JSON and NULL means "never".
--   site_versions   the last twenty saves, one row each, so "what did this look
--                   like on Tuesday" is answerable. Ids are zero-padded
--                   milliseconds so the string order is the time order.
--   site_files      uploaded files, stored as bytes in the row. This deploy has
--                   no blob store and the volume holds the database, which is
--                   the precedent avatars and trade screenshots already follow.
--
-- These tables belong to the site, not to a user, so they are deliberately NOT
-- in the per-user delete list.
CREATE TABLE `site_documents` (
  `site` text PRIMARY KEY NOT NULL,
  `draft` text,
  `published` text,
  `published_at` integer,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `site` text NOT NULL,
  `at` integer NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `deployed` integer DEFAULT false NOT NULL,
  `model` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `site_versions_site_idx` ON `site_versions` (`site`,`id`);
--> statement-breakpoint
CREATE TABLE `site_files` (
  `site` text NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `size` integer NOT NULL,
  `data` blob NOT NULL,
  `uploaded_at` integer NOT NULL,
  PRIMARY KEY(`site`, `slug`)
);
