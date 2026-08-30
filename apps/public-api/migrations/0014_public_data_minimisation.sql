-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Three cleanups, all of them making the database match what the code already
-- does. Public Candidate V 2.0 changed the beta-access route in two ways and
-- neither change reaches rows written before it shipped, so until this runs the
-- Privacy Policy's statements are true of new rows and false of old ones.
--
-- 1. THE OPTIONAL NOTE IS GONE FROM THE FORM AND THE ROUTE, so the column is an
--    archive of text nobody will ever read again. A free-text box on a form that
--    mentions trading invites people to volunteer their broker, their account
--    size and their financial situation; the point of removing the field was to
--    stop holding that, which is not achieved while the old values sit here. The
--    COLUMN stays — dropping it would break nothing but buys nothing either, and
--    an empty column is a clearer record of the decision than an absent one.
update public_early_access_requests set note = null where note is not null;

-- 2. THE BETA-ACCESS RATE LIMITER USED TO STORE A RAW IP ADDRESS in a column
--    named `key_hash`. Every authentication path hashed it; this one did not.
--    Every row in that bucket is therefore suspect, and none of them is worth
--    keeping: these are one-hour counters, so deleting them costs nothing beyond
--    resetting the limit for anyone mid-window. Rows written since the fix are
--    keyed hashes and are deleted here too, because telling them apart is not
--    worth the query it would take.
delete from public_rate_limits where bucket = 'early_access';

-- 3. A RECOVERY EVENT HAS NO REASON TO OUTLIVE THE ACCOUNT. It was declared
--    `on delete set null`, which reads like a deliberate choice to keep it and
--    was almost certainly copied from `public_audit_events` directly above it in
--    the same file. The row holds an id and three timestamps — no token, no
--    address, nothing about a person — so keeping it protects nothing and costs
--    a paragraph in the Privacy Policy explaining a table that survives account
--    deletion. Cascading leaves audit events as the ONE intentionally retained
--    table, which is a far simpler thing to disclose and to keep true.
alter table public_recovery_events drop constraint public_recovery_events_account_id_fkey;
alter table public_recovery_events add constraint public_recovery_events_account_id_fkey
  foreign key (account_id) references public_accounts(id) on delete cascade;
