-- Down for maintenance, per site (owner request, 2026-09): the marketing page
-- can be taken off the air from the Site Editor's Settings screen, the way the
-- owner's portfolio can from its admin. The site asks the portal for this on a
-- short interval and serves a notice while it is on.
--
-- On site_documents rather than its own table: it is one fact about the site,
-- beside the two documents that are the other facts about it. NULL and 0 both
-- mean off, so a row written before this column existed changes nothing.
ALTER TABLE `site_documents` ADD `maintenance` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `site_documents` ADD `maintenance_updated_at` integer;
