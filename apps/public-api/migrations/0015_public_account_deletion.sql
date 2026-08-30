-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- A pending account deletion, waiting on the confirmation link.
--
-- WHY A ROW RATHER THAN A SIGNED TOKEN WITH NO STORAGE: a deletion has to be
-- usable exactly once. A self-describing signed token can be replayed until it
-- expires, and the one thing that must not happen twice here is not the delete
-- itself — the second one finds nothing — but the account being deleted after
-- somebody changed their mind and the first link was already spent. `consumed_at`
-- is what makes "one use" a fact rather than a hope.
--
-- Only the HASH of the token is stored, like sessions, trusted devices and
-- sign-in codes: the database alone cannot be used to delete somebody's account.
--
-- CASCADE, so a pending request disappears with the account it was for. That
-- covers the ordinary case (the deletion completes and takes its own row with
-- it) and the odd one (an administrator removes the account first).
create table if not exists public_account_deletions (
  token_hash text primary key,
  account_id uuid not null references public_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists public_account_deletions_account_idx
  on public_account_deletions(account_id);
