-- Display names become unique across the platform.
--
-- They are about to become the ONE public identity: the name on a public study
-- leaderboard, the name in a team roster, the name an invite is addressed to.
-- Two people called "Andrew" is a confusion the moment any of those is visible
-- to a stranger.
--
-- COLLISIONS ARE RESOLVED BEFORE THE INDEX IS BUILT, and that ordering is the
-- whole migration. A unique index added to a table that already violates it
-- fails, and a failed migration on boot is an outage — so the duplicates are
-- renamed first, in the same file, and only then is the constraint applied.
--
-- The rename appends a number to every duplicate EXCEPT the oldest holder of the
-- name: whoever registered it first keeps it exactly as they typed it, and the
-- later ones become "Andrew 2", "Andrew 3". That is the least surprising split —
-- it never takes a name away from the person who has been using it longest, and
-- the renamed accounts can change theirs to whatever they like afterwards.
--
-- Case-insensitive, because "andrew" and "Andrew" are the same name to every
-- human who reads them. The index is on lower(display_name) for the same reason.
UPDATE users
-- NOTE THE PARENTHESES around the +1. In SQLite `||` binds TIGHTER than `+`,
-- so `name || ' ' || (SELECT …) + 1` parses as `(name || ' ' || count) + 1` —
-- which coerces the whole concatenated string to a number and yields `1`. That
-- renamed every duplicate to "1" instead of "Andrew 2". Caught by applying this
-- migration to a database seeded with real duplicates; a typecheck cannot see it.
SET display_name = display_name || ' ' || ((
  SELECT COUNT(*)
  FROM users AS earlier
  WHERE lower(trim(earlier.display_name)) = lower(trim(users.display_name))
    AND earlier.created_at <= users.created_at
    AND earlier.id <> users.id
) + 1)
WHERE EXISTS (
  SELECT 1
  FROM users AS earlier
  WHERE lower(trim(earlier.display_name)) = lower(trim(users.display_name))
    AND earlier.created_at <= users.created_at
    AND earlier.id <> users.id
);
--> statement-breakpoint

-- Belt and braces: if the pass above still left a clash (identical created_at on
-- two rows makes the "earlier" test ambiguous), fall back to the row id, which is
-- unique by definition. Without this the index below could still fail to build.
UPDATE users
SET display_name = display_name || ' ' || substr(id, 1, 4)
WHERE EXISTS (
  SELECT 1
  FROM users AS other
  WHERE lower(trim(other.display_name)) = lower(trim(users.display_name))
    AND other.id <> users.id
);
--> statement-breakpoint

CREATE UNIQUE INDEX users_display_name_unique_idx ON users (lower(trim(display_name)));
