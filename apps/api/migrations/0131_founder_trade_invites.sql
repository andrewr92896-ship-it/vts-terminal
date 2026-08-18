-- Founder trade coordination: one Founder invites another onto a trade they
-- have just placed, and the recipient authorizes their own.
--
-- Three tables, and the split matters. `founder_trade_invites` is the
-- SERVER-AUTHORITATIVE workflow — the terminal reads its modal state from this
-- row and nowhere else, so a refresh, a relogin, a second tab or a deploy all
-- resolve to the same required action. `founder_trade_events` is the audit
-- timeline, append-only, so what happened can be reconstructed afterwards.
-- `founder_trade_prefs` is the recipient's OWN default size — deliberately not
-- copied from the inviter, which is the one thing this workflow must never do.
--
-- No role column anywhere: who is eligible is read from users.roles through the
-- existing authorization system on every request, so revoking Founder takes
-- effect at once rather than leaving a stale grant behind in here.
CREATE TABLE IF NOT EXISTS founder_trade_invites (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The inviter's own order-journal row (trading_orders.id) this invite was
  -- raised from. No foreign key: the journal is the inviter's and an invite
  -- must outlive it, the same reason the credential audit carries no keys.
  source_ref TEXT NOT NULL,
  source_connection_id TEXT,
  source_trade_id TEXT,
  -- The trade as it stood WHEN THE INVITE WAS MADE. Snapshotted rather than
  -- read back later: the recipient is deciding about the trade they were told
  -- about, and the inviter may have moved their stop since.
  instrument TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  -- The inviter's size, for display only. It is never what the recipient trades.
  inviter_units REAL,
  status TEXT NOT NULL DEFAULT 'primary_pending',
  primary_decision TEXT,
  primary_decided_at INTEGER,
  primary_order_ref TEXT,
  primary_fill_price REAL,
  primary_units REAL,
  primary_connection_id TEXT,
  -- The last failure, kept ON the row so a failed JOIN is still on screen when
  -- the recipient comes back to retry it.
  primary_error TEXT,
  funded_decision TEXT,
  funded_decided_at INTEGER,
  -- The funded-trade screenshot, as a client-scaled JPEG data URL. Stored
  -- inline like avatars and study-guide slides — this deploy has no blob store.
  proof_image TEXT,
  proof_uploaded_at INTEGER,
  completed_at INTEGER,
  -- Reminder bookkeeping for the server-side watch. `notify_count` bounds the
  -- retries so an unresolved workflow can never become an endless siren.
  last_notified_at INTEGER,
  notify_count INTEGER NOT NULL DEFAULT 0,
  -- An in-flight JOIN. Held for a short window so two tabs, a double-click or a
  -- retried request cannot both reach the broker.
  claim_token TEXT,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
-- One invite per source trade per recipient. This is the duplicate-invite guard:
-- a repeated create for the same fill returns the invite that already exists
-- rather than raising a second modal about one trade.
CREATE UNIQUE INDEX IF NOT EXISTS founder_trade_invites_source_idx
  ON founder_trade_invites(source_ref, recipient_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS founder_trade_invites_recipient_idx
  ON founder_trade_invites(recipient_user_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS founder_trade_invites_inviter_idx
  ON founder_trade_invites(inviter_user_id, created_at);
--> statement-breakpoint
-- The audit timeline. `actor_user_id` NULL means the terminal acted on its own
-- schedule (a reminder, a lapsed claim) rather than a person — the same
-- convention credential_audit uses for its background rows.
CREATE TABLE IF NOT EXISTS founder_trade_events (
  id TEXT PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES founder_trade_invites(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  kind TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS founder_trade_events_invite_idx
  ON founder_trade_events(invite_id, created_at);
--> statement-breakpoint
-- The recipient's own trading preference for this workflow. Null size is "not
-- stated" and is never read as a default number: a JOIN with no configured size
-- is refused and the modal asks for one, rather than sending an order at a size
-- nobody chose.
CREATE TABLE IF NOT EXISTS founder_trade_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_connection_id TEXT,
  default_units REAL,
  reminder_every_seconds INTEGER NOT NULL DEFAULT 300,
  reminder_level TEXT NOT NULL DEFAULT 'repeating',
  updated_at INTEGER NOT NULL
);
