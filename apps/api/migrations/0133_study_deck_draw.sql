-- Where a learner is up to in a study game's shuffled pass — on the ACCOUNT,
-- not on the device.
--
-- The pass (which questions are still to be asked before any repeats) was kept
-- in localStorage, which is per browser. Somebody who studies on a phone and a
-- laptop therefore had two independent passes: each device worked through its
-- own copy of the deck, so the same questions came round on both while other
-- questions went unasked on either. Reported by the owner, 2026-08, as heavy
-- repeats on a 400-question deck.
--
-- Keyed (user_id, deck_id) exactly like study_deck_game beside it, and for the
-- same reason: a shared package is one deck id that everybody plays, and each
-- learner keeps their own row against it.
--
-- A SEPARATE TABLE rather than a column on study_deck_game, deliberately. That
-- row's `state` is the scoring blob the leaderboard reads and is normalized on
-- every write; the pass is neither scored nor ranked, and folding a second,
-- differently-shaped payload into a validated one is how a save comes to drop
-- half of what it was given.
--
-- `pass` is an opaque JSON string, read only by the web app, which validates it
-- against the deck as it stands and discards anything it does not recognise.
-- The server stores it and never interprets it.
CREATE TABLE IF NOT EXISTS study_deck_draw (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL REFERENCES study_decks(id) ON DELETE CASCADE,
  pass TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, deck_id)
);
