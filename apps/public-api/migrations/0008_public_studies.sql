-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Study games: the quiz decks, their questions, and each learner's progress
-- through them. The public terminal renders the portal's own Study Game,
-- Practice Test and Progress screens, so the stored shape is the private side's
-- (apps/api/src/studies/*) minus the halves that need other people.
--
-- WHAT IS DELIBERATELY ABSENT
--
--   * NO LEADERBOARD. On the private side a built-in game is ranked across every
--     copy of itself on the whole install. Doing that here would put one public
--     visitor's display name and accuracy on a stranger's screen — a product and
--     privacy decision with a moderation dimension (display names are typed by
--     the person), not something to arrive at as a side effect of porting a
--     table. Every deck reports `hasLeaderboard: false` and there is no board
--     route, so the client hides the tab rather than opening an empty one.
--   * NO TEAM OR PACKAGE SCOPE. A deck belongs to one account. There is no
--     `scope_id` here and no column that could make a deck somebody else's.
--   * NO SEEDED CONTENT. A new account starts with no games, and the screen says
--     so. Seeding invented games would be the same fabrication the Live Wall's
--     `sample` union and the funded-account fix exist to prevent: a thing nobody
--     created must not stand in for one somebody did.

create table public_study_decks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  name text not null,
  description text,
  -- How it was made. 'upload' is the reviewed-questions path; the AI paths are
  -- switched off on the public side until the provider migration.
  source text not null default 'upload',
  -- The category NAMES this game covers, in the author's order.
  categories jsonb not null default '[]'::jsonb,
  -- What each category is worth when a practice test is scored the way the real
  -- exam is — {name: weight}, as the author typed them. NULL means the author
  -- never set weights and the game scores plainly, which is deliberately NOT the
  -- same as every weight being zero (a paper with nothing on it).
  category_weights jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_study_decks_owner_idx on public_study_decks (account_id, created_at desc);

-- `seq` is the question's STABLE identity within its deck, not its position.
-- The saved draw (which questions have been asked this round) is keyed by seq, so
-- an index would point at a different question the moment one is added or
-- deleted — silently, and only for learners mid-round.
create table public_study_questions (
  deck_id uuid not null references public_study_decks(id) on delete cascade,
  seq integer not null,
  topic text not null default '',
  stem text not null,
  -- Four options, each {label, text}. Stored whole because a question is only
  -- ever read and written as a unit.
  options jsonb not null,
  answer text not null check (answer in ('A', 'B', 'C', 'D')),
  explanation text,
  -- Which game a question originally came from, on a combined game. Null on an
  -- ordinary one.
  source_name text,
  primary key (deck_id, seq)
);

-- One row per learner per deck. The state is the client's own serialized blob;
-- the server stores it whole rather than modelling it, exactly as the private
-- side does, because the level ladder and streak scoring live in the shared
-- engine and a second server-side interpretation of them would be a second
-- answer to "what level am I".
create table public_study_deck_game (
  account_id uuid not null references public_accounts(id) on delete cascade,
  deck_id uuid not null references public_study_decks(id) on delete cascade,
  state text not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, deck_id)
);

-- A banked run. Resetting progress clears the live state, and this row is the
-- only trace the run happened — without it "reset" would quietly mean "delete my
-- history", which is a worse default than keeping three numbers.
create table public_study_deck_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  deck_id uuid not null references public_study_decks(id) on delete cascade,
  attempted integer not null,
  correct integer not null,
  best_step integer not null,
  created_at timestamptz not null default now()
);
create index public_study_deck_runs_owner_idx on public_study_deck_runs (account_id, deck_id, created_at desc);
