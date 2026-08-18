-- Auto-send: a standing choice to invite one other Founder onto every trade
-- that fills, instead of being asked about each one.
--
-- Two columns rather than one, because "on" and "who" are different facts and a
-- single id column doing both would make turning it off lose the choice of
-- recipient. Both are per-user and set only by their owner.
--
-- DEFAULT OFF, deliberately. Switching it on makes somebody else's phone sound
-- for trades they did not ask about, so it is a choice each Founder makes for
-- themselves rather than a default anybody inherits — the same rule the group
-- nudge and the alert opt-ins follow.
--
-- `auto_invite_user_id` carries no foreign key on purpose: the recipient's
-- eligibility is re-read from their roles on every fill, so a stale id resolves
-- to nobody and sends nothing rather than needing a cascade to tidy it.
ALTER TABLE founder_trade_prefs ADD COLUMN auto_invite INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE founder_trade_prefs ADD COLUMN auto_invite_user_id TEXT;
