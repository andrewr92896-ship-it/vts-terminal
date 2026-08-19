-- Founder trade links, and notifications for BOTH directions.
--
-- WHY A TABLE RATHER THAN THE TWO COLUMNS IT REPLACES. Auto-send lived on
-- `founder_trade_prefs` as `auto_invite` + `auto_invite_user_id`, which could
-- only ever say "I send to ONE person", and could only be set by the sender. A
-- link is a row between two Founders instead, so a desk can run several at once
-- and — the point of the change — EITHER END CAN SWITCH IT ON. Wanting to
-- receive somebody's trades should not require walking them through their own
-- settings on their own device.
--
-- The row IS the switch: present means that sender's fills raise an invitation
-- to that recipient, absent means they do not. There is no enabled column,
-- because a disabled link and no link are the same fact and two ways of saying
-- it would eventually disagree.
--
-- `created_by_user_id` records which of the two set it up. It is history, not
-- permission: both parties can see and remove any link they are part of, so
-- nobody can be sending — or receiving — through something they cannot see.
CREATE TABLE IF NOT EXISTS founder_trade_links (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
-- One link per direction per pair. A→B and B→A are different rows, deliberately:
-- the two directions are independent, so switching one on says nothing about
-- the other.
CREATE UNIQUE INDEX IF NOT EXISTS founder_trade_links_pair_idx
  ON founder_trade_links(sender_user_id, recipient_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS founder_trade_links_sender_idx
  ON founder_trade_links(sender_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS founder_trade_links_recipient_idx
  ON founder_trade_links(recipient_user_id);
--> statement-breakpoint
-- Carry the existing auto-send choices across, so nobody's setting changes on
-- deploy. The old columns are KEPT rather than dropped — they are the record of
-- what was set before links existed, and nothing reads them any more.
INSERT OR IGNORE INTO founder_trade_links (id, sender_user_id, recipient_user_id, created_by_user_id, created_at)
SELECT
  'carry-' || `user_id`,
  `user_id`,
  `auto_invite_user_id`,
  `user_id`,
  `updated_at`
FROM `founder_trade_prefs`
WHERE `auto_invite` = 1 AND `auto_invite_user_id` IS NOT NULL;
--> statement-breakpoint
-- Being told what the person you invited decided. The send side of the
-- workflow's notifications, which until now had none at all: an invitation went
-- out and the sender heard nothing back unless they went looking.
--
-- Default ON at `normal`: it is a courtesy note about a decision the sender
-- asked for, not something worth breaking through silent mode for — unlike the
-- receive side, which defaults to `repeating` because it is asking somebody to
-- act.
ALTER TABLE founder_trade_prefs ADD COLUMN notify_on_response INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE founder_trade_prefs ADD COLUMN response_level TEXT NOT NULL DEFAULT 'normal';
