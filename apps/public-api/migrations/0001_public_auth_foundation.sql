-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
create extension if not exists pgcrypto;

create table public_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  force_password_change boolean not null default false,
  temporary_password_expires_at timestamptz,
  private_group_warning boolean not null default false,
  disabled boolean not null default false,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public_auth_challenges (
  token_hash text primary key, account_id uuid not null references public_accounts(id) on delete cascade,
  code_hash text not null, expires_at timestamptz not null, attempts integer not null default 0,
  consumed_at timestamptz, created_at timestamptz not null default now()
);
create table public_sessions (
  token_hash text primary key, account_id uuid not null references public_accounts(id) on delete cascade,
  expires_at timestamptz not null, force_password_change boolean not null default false,
  revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public_trusted_devices (
  token_hash text primary key, account_id uuid not null references public_accounts(id) on delete cascade,
  expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public_rate_limits (
  bucket text not null, key_hash text not null, window_started timestamptz not null,
  count integer not null, primary key(bucket,key_hash)
);
create table public_recovery_events (
  id uuid primary key default gen_random_uuid(), account_id uuid references public_accounts(id) on delete set null,
  expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
);
create table public_market_layouts (
  account_id uuid primary key references public_accounts(id) on delete cascade,
  layout jsonb not null, updated_at timestamptz not null default now()
);
create table public_audit_events (
  id bigint generated always as identity primary key, event text not null,
  account_id uuid references public_accounts(id) on delete set null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index public_auth_challenges_expiry_idx on public_auth_challenges(expires_at);
create index public_sessions_account_idx on public_sessions(account_id);
create index public_trusted_devices_account_idx on public_trusted_devices(account_id);
