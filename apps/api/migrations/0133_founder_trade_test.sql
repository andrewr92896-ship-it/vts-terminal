-- A Founder trade invitation raised as a TEST — a full drill of the workflow,
-- from a real (minimum-size) order through to the funded screenshot.
--
-- It is a real invitation in every respect: the same state machine, the same
-- claim, the same reminders, the same audit. The one thing it changes is that
-- everything the recipient sees SAYS SO — the modal and the notification alike.
-- A test indistinguishable from a real fill gets acted on, and a workflow that
-- cries wolf is worse than one that stays quiet.
ALTER TABLE founder_trade_invites ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
