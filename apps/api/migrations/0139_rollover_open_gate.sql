-- Rollover close: say WHETHER an event needs an open trade, and WHICH KIND.
--
-- Both were hard-coded. Evaluate and Close only fired while a FUNDED position
-- was open; the recheck did not require one at all; and no other kind of open
-- trade — a broker position, a hand-kept one — could be asked about. A trader
-- who wanted a plain 4:30 reminder, or who wanted their live broker book to
-- count, had no way to say so.
--
-- EVERY DEFAULT BELOW IS THE OLD BEHAVIOUR, exactly: 'funded' alone, evaluate
-- and close gated on something being open, the recheck not. So no stored plan
-- changes meaning and nothing needs migrating by hand.
--
-- `open_kinds` is a comma-separated subset of 'funded', 'broker', 'manual' —
-- one answer to one question, and a fourth kind later costs no migration. An
-- empty or unrecognised value falls back to 'funded' in code rather than
-- silencing a routine somebody relies on.
ALTER TABLE rollover_plans ADD COLUMN open_kinds TEXT DEFAULT 'funded' NOT NULL;
--> statement-breakpoint
ALTER TABLE rollover_plans ADD COLUMN evaluate_require_open INTEGER DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE rollover_plans ADD COLUMN close_require_open INTEGER DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE rollover_plans ADD COLUMN recheck_require_open INTEGER DEFAULT false NOT NULL;
