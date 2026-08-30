-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- WHO AGREED TO WHAT, WHEN, AND TO EXACTLY WHICH WORDS.
--
-- This is the record half of the clickwrap. A tick box with no row behind it
-- proves nothing a year later; what makes it evidence is being able to say which
-- version was on the screen and produce that text unchanged. `text_sha256` is
-- what pins the text: the document lives in the terminal's bundle and in git,
-- and the hash is what stops anybody — including us — claiming afterwards that
-- the wording was different.
--
-- APPEND-ONLY. Nothing updates or deletes a row. A person who accepts version 1
-- and later version 2 has two rows, not one overwritten one, because "when did
-- they agree to the current terms" and "did they ever see the old ones" are
-- different questions and both have to be answerable.
--
-- ONE ROW PER DOCUMENT rather than one row per session of clicking. The three
-- required items are versioned independently — the acknowledgement can be
-- reworded without the Privacy Policy changing — so "is this account current?"
-- is a direct query rather than an interpretation of a blob.
--
-- NO IP ADDRESS. Every other identifying value in this database is hashed or
-- absent, and an address adds nothing here: the account is already named, and
-- the session that did the accepting was already authenticated.
--
-- CASCADE, like everything else the account owns. An acceptance record for a
-- deleted account is a record about a person we no longer hold anything else
-- about, which is exactly the thing the deletion promise says does not happen.
-- The audit event stays, as it does for every other act.
create table if not exists public_document_acceptances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  -- 'acknowledgement' | 'terms' | 'privacy'. Plain text rather than an enum, so
  -- adding a required document is a code change and not a migration.
  document text not null,
  version text not null,
  text_sha256 text not null,
  accepted_at timestamptz not null default now()
);
create index if not exists public_document_acceptances_account_idx
  on public_document_acceptances(account_id, document);
