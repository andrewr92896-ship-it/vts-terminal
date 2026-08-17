-- Rollover close: a per-user plan of three timed alerts around the 5pm ET
-- rollover, fired only when the trader actually has a funded position open.
-- One row per user (unique user_id) — a desk has one rollover routine, not one
-- per account, and two rows would be two answers to "when do I get buzzed".
--
-- Times are ET wall-clock 'HH:MM', like trading_sessions, because rollover is an
-- Eastern event: derived per reader it would move with a display-zone change.
-- Levels reuse the notification ladder (silent/normal/alert/repeating) and are
-- plain TEXT with a default, exactly as notification_prefs stores them, so an
-- unrecognised value falls back in code rather than failing a constraint.
CREATE TABLE IF NOT EXISTS rollover_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  evaluate_on INTEGER NOT NULL DEFAULT 1,
  evaluate_at TEXT NOT NULL DEFAULT '16:30',
  evaluate_level TEXT NOT NULL DEFAULT 'normal',
  close_on INTEGER NOT NULL DEFAULT 1,
  close_at TEXT NOT NULL DEFAULT '16:45',
  close_level TEXT NOT NULL DEFAULT 'alert',
  recheck_on INTEGER NOT NULL DEFAULT 1,
  recheck_at TEXT NOT NULL DEFAULT '17:15',
  recheck_level TEXT NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rollover_plans_enabled_idx ON rollover_plans(enabled);
--> statement-breakpoint
-- What re-entering costs in commission at this prop firm, as the round-turn
-- charge per standard lot (100,000 units) in the account's own currency.
-- Nullable and never defaulted to zero: nothing can read a prop firm's
-- commission schedule, so an unstated rate is reported as unstated rather than
-- silently making re-entry look free.
ALTER TABLE funded_accounts ADD COLUMN commission_per_lot REAL;
