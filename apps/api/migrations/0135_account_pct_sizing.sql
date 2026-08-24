-- Sizing a position as a share of the account's own value.
--
-- "Account %" means the share of ACCOUNT VALUE the position's estimated margin
-- consumes. It is deliberately NOT a percentage-risk calculation and never reads
-- the stop loss — the two answer different questions, and a mode that quietly
-- did the other one would size trades nobody asked for.
--
-- WHAT IS STORED IS THE PERCENTAGE, NEVER THE UNITS IT WORKED OUT TO. An
-- account that grows should place a correspondingly larger trade from the same
-- button, which is only true if the saved intent is the share rather than a
-- snapshot of the size. Every figure around it — the margin, the money per pip,
-- the actual percentage after rounding — is re-derived from the live account and
-- the live quote through the desk's existing margin path.
--
-- EVERY COLUMN IS ADDITIVE AND EVERY DEFAULT IS THE OLD BEHAVIOUR, so no stored
-- setting changes meaning and nothing needs migrating by hand: a null mode still
-- reads as it always did, a null ladder still means "the built-in one", and
-- rounding starts off.
ALTER TABLE ticket_presets ADD COLUMN pct_presets TEXT;
--> statement-breakpoint
-- Optionally floor the money-per-pip a percentage works out to, so a size reads
-- as $3.50/pip rather than $3.82/pip. FLOOR, always — rounding up would commit
-- more of the account than the trader asked for, which is the one direction this
-- must never fail in.
ALTER TABLE ticket_presets ADD COLUMN pct_round INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE ticket_presets ADD COLUMN pct_round_increment REAL NOT NULL DEFAULT 0.5;
--> statement-breakpoint
-- The same choice for a Founder join. 'units' (null, and what every existing
-- setting is) keeps the fixed `default_units` size; 'account_pct' re-derives the
-- size at join time from the RECIPIENT'S own account value, their own quote and
-- their own margin requirement. The sender's size is not an input either way.
ALTER TABLE founder_trade_prefs ADD COLUMN size_mode TEXT;
--> statement-breakpoint
ALTER TABLE founder_trade_prefs ADD COLUMN size_pct REAL;
--> statement-breakpoint
ALTER TABLE founder_trade_prefs ADD COLUMN pct_round INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE founder_trade_prefs ADD COLUMN pct_round_increment REAL NOT NULL DEFAULT 0.5;
