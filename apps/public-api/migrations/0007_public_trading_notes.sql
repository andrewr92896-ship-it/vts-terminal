-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Trading Notes — a trader writes down what they think the market does next
-- BEFORE it does, and settles it against what happened. The public terminal
-- renders its own minimal composer over this, so the stored shape is the
-- private side's (apps/api/src/trading/notes.ts) minus the group half.
--
-- THREE RULES CARRY THE FEATURE, and without them it is a notes app:
--
--   1. A PUBLISHED CALL IS FROZEN. `locked_at` stamps it, and a window that has
--      OPENED locks the call whether or not anything was ever stamped —
--      afterwards only the reflection may be written. A track record that can be
--      edited after the fact is not a track record.
--   2. NOBODY SEES A CALL BEFORE ITS WINDOW OPENS. Moot here and kept anyway:
--      there are no groups on the public side, so every call is the author's own
--      and every read filters on the account. There is deliberately NO
--      visibility column and no route that could publish one.
--   3. A CALL THAT COULD NOT BE SETTLED IS NEVER SCORED AS WRONG.
--      `unsettleable` is a real outcome in the CHECK below, excluded from the
--      hit rate and reported on its own. Same rule as the Live Wall's
--      `unavailable` and Investments' `unpricedCount`: a thing that could not be
--      measured must never be reported as a measured one. Do not fold it into
--      the misses.
--
-- `week_key` IS STORED, NOT DERIVED. A trading week is an Eastern concept, like
-- every other day bucket in the terminal. Derived per reader, a call would move
-- between weeks the moment somebody changed their display zone, and the board
-- would silently rearrange itself with nothing entered or edited.
--
-- `direction` is only up/down, deliberately: those are the two a price feed can
-- settle without being told what "flat" means for this instrument. A rangebound
-- call is written freeform and settled by the person who made it, which is
-- honest; grading it against a band nobody chose is not.

create table public_trading_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  -- A PREDICTION carries a window, a deadline and an outcome it still owes; an
  -- OBSERVATION leaves all of those null and is never settled.
  kind text not null check (kind in ('prediction', 'observation')),
  title text not null,
  body text,
  instrument text,
  direction text check (direction in ('up', 'down')),
  target_price double precision,
  confidence integer check (confidence between 1 and 5),
  -- ET, Monday-based ISO week ('2026-W34'). Stored — see above.
  week_key text not null,
  window_opens_at timestamptz,
  deadline_at timestamptz,
  -- The mark the call was made against, stamped when the window opens. There is
  -- no price feed on the public side yet, so this stays null and a call with no
  -- explicit target is settled by its author rather than graded automatically.
  -- Left here rather than omitted: it is the column a feed lands in.
  open_price double precision,
  locked_at timestamptz,
  -- `partial` only ever comes from a person; `unsettleable` is never scored.
  outcome text check (outcome in ('hit', 'miss', 'partial', 'unsettleable')),
  settled_at timestamptz,
  settled_by text check (settled_by in ('auto', 'self')),
  settle_price double precision,
  settle_note text,
  reflection text,
  reflected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The week board is the read; the queue is the same rows filtered on what is
-- still owed, so one index serves both.
create index public_trading_notes_week_idx on public_trading_notes (account_id, week_key, created_at desc);
create index public_trading_notes_kind_idx on public_trading_notes (account_id, kind, created_at desc);
