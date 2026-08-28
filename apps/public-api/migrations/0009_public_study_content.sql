-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Flashcard sets and study presentations. The public terminal renders the
-- portal's own Flashcards and Study Presentations screens, so the stored shape
-- is the private side's (apps/api/src/studies/{flashcardStore,guideStore}.ts).
--
-- Both belong to ONE account. There is no scope column, no team dimension and
-- nothing here that could make a set or a presentation somebody else's — the
-- sharing half of Studies is a product decision and is deliberately unbuilt.

create table public_flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  name text not null,
  description text,
  -- How it was made. The AI paths are switched off on the public side, so this
  -- is server-owned: nothing a client sends may claim a set was generated.
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_flashcard_sets_owner_idx on public_flashcard_sets (account_id, created_at desc);

-- `seq` is the card's position, assigned by the server. Unlike a study
-- question's seq nothing keys a saved draw on it, but it is still the server's
-- to assign: a client-supplied one could collide with itself and silently drop
-- a card on the way in.
create table public_flashcards (
  set_id uuid not null references public_flashcard_sets(id) on delete cascade,
  seq integer not null,
  term text not null,
  def text not null,
  topic text,
  primary key (set_id, seq)
);

-- A presentation keeps its slides as ONE JSON blob, exactly as the private side
-- does. That is a good way to hold a presentation together and a hopeless way to
-- identify a slide — an array position changes the moment somebody drags a slide
-- up the deck — so every slide carries its own `id` INSIDE the blob, minted by
-- the server the first time it is written and preserved through every edit and
-- reorder afterwards.
--
-- The id has to ROUND-TRIP through the editor or every save looks like a deck of
-- brand new slides. It is minted on WRITE only: a read that invented identity
-- would hand out a different id each time it ran.
--
-- Slides are stored rather than a separate table because a presentation is only
-- ever read and written whole, and a slides table would be a rewrite of a
-- storage model that works.
create table public_study_guides (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  name text not null,
  description text,
  -- Each slide is {id, title, body, image}. `image` is a base64 data URL of a
  -- screenshot the author attached, which is why the routes that write this
  -- carry a much larger body allowance than everything else.
  slides jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_study_guides_owner_idx on public_study_guides (account_id, created_at desc);
