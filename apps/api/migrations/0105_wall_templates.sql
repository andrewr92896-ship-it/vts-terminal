-- Live Wall templates — the default layouts a free account gets, editable from
-- the Developer Terminal instead of only by a deploy.
--
-- DRAFT THEN PUBLISH (owner decision, 2026-08). `published_tiles` is what every
-- free account opens; `draft_tiles` is what the developer is working on. Editing
-- changes only the draft, and Publish copies it across. Without that split, a
-- half-moved tile is what every unpaid user sees for as long as it takes to
-- finish arranging the board.
--
-- The code presets in presetLayouts.ts stay as the SEED, the same way the
-- built-in study games work: they are what a fresh install starts with, and
-- after that the rows are the source of truth. A template deleted here is gone
-- until somebody adds it back; the seed only fills in what is missing.
CREATE TABLE wall_templates (
  id TEXT PRIMARY KEY,
  -- Stable key, matching the code preset it was seeded from ('markets',
  -- 'desk', 'personal'). This is what a free account's remembered layout choice
  -- is stored against, so it must not change once seeded.
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  blurb TEXT NOT NULL,
  -- JSON array of { kind, x, y, w, h }. The arrangement only — a template never
  -- carries anyone's data, and the notes tile's text is not part of it.
  published_tiles TEXT NOT NULL,
  -- The work in progress. Equal to published_tiles until somebody edits.
  draft_tiles TEXT NOT NULL,
  -- Whether the draft differs from what is live, kept as a column rather than
  -- compared on read so the list can show it without parsing two blobs per row.
  has_draft INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- A template can be taken out of circulation without being deleted. A free
  -- account holding a remembered choice that points at a hidden template falls
  -- back to the first visible one.
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
