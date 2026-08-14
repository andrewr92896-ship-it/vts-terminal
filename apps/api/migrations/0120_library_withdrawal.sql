-- Withdrawing a package from the public VTS Study Library.
--
-- Recorded ON THE APPROVED SUBMISSION rather than as a new row or a flag on the
-- package, because the submission IS the publication record: it carries the
-- attestation the creator agreed to and the administrator's decision, and a
-- withdrawal is the end of that particular publication. Stamping it here keeps
-- the whole life of one publication — asked for, reviewed, approved, withdrawn —
-- on the row an auditor already reads.
--
-- `status` is deliberately NOT changed to some withdrawn value: the submission
-- WAS approved, and rewriting that would destroy the record of the decision and
-- the attestation attached to it. A later publication gets its own row, so a
-- package that is published, withdrawn and published again has two complete
-- histories rather than one that has been edited twice.
ALTER TABLE `study_package_submissions` ADD `withdrawn_at` integer;
--> statement-breakpoint
ALTER TABLE `study_package_submissions` ADD `withdrawn_by_user_id` text REFERENCES users(id);
