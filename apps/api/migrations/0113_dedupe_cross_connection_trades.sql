-- Remove the second copy of every OANDA trade that was re-imported under a
-- replacement connection.
--
-- `trading_positions` has two writers: the Live Wall reconcile, which records a
-- trade it polled while open, and the closed-trade backfill, which ingests
-- OANDA's authoritative closed-trade page. The backfill deduped against the rows
-- it already held ON THAT CONNECTION ROW — but trade ids are numbered per OANDA
-- ACCOUNT, not per connection row. So when the 2026-08-02 credential reset
-- deactivated every connection and a trader reconnected by ADDING a connection
-- rather than re-keying the dead one, the backfill saw an account it had no
-- history for and re-imported all 500 of its closed trades. Every trade the live
-- poll had already captured ended up stored twice, and both legs counted toward
-- the desk's trade count, win rate and P/L.
--
-- The backfill now resolves a row's OANDA account rather than its connection row
-- (`differentAccount` in backfill.ts), so it cannot double-import again, and a
-- second connection to an account already connected is refused outright
-- (`assertAccountNotAlreadyConnected` in connections.ts). This repairs what the
-- old rule already wrote.
--
-- Same shape of fault as migration 0077 and the same treatment: keep the
-- reconcile leg, because it carries the stop, target, planned entry, strategy
-- and timeframe the broker's closed-trade record cannot supply; overwrite its
-- fills from the backfill twin, which is authoritative; then drop the twin.
--
-- Two legs are the same trade when they agree on all of: owner, OANDA trade id,
-- instrument, side, entry price and open time. Both writers read those from the
-- same OANDA fields (`t.id`, `t.instrument`, `t.price`, `t.openTime`), so a real
-- pair matches exactly, and two trades from genuinely different accounts would
-- have to collide on every one of them.
--
-- A backfill row is recognised by what only the live poll could have supplied
-- being absent — no stop, target, planned entry, strategy, timeframe, mark or
-- open P/L — together with `first_seen_at = closed_at`, which the backfill sets
-- deliberately (a trade it never saw live is stamped as first seen when it
-- closed) and reconcile cannot produce, having first seen the trade while it was
-- still open.
--
-- Soft-deleted rows are left out of the merge and the delete, exactly as in
-- 0077: a leg the trader removed by hand stays removed, and its key still blocks
-- a re-import.
--
-- `substr(key, instr(key, 'oanda:') + 6)` is the trade id ('oanda:' is 6
-- characters). A connection id is a UUID, so it can never contain that literal
-- and the first match is always the right one.

UPDATE trading_positions AS keep
SET exit_price  = twin.exit_price,
    realized_pl = twin.realized_pl,
    entry_price = twin.entry_price,
    units       = twin.units,
    closed_at   = twin.closed_at,
    -- A leg whose connection was deactivated while the trade was still open was
    -- never closed by reconcile (it only closes a position whose source answered
    -- that cycle), so it can still be sitting open. The broker says otherwise.
    status      = 'closed'
FROM trading_positions AS twin
WHERE keep.broker = 'oanda'
  AND twin.broker = 'oanda'
  AND keep.deleted_at IS NULL
  AND twin.deleted_at IS NULL
  AND keep.id <> twin.id
  AND keep.user_id = twin.user_id
  AND keep.connection_id IS NOT twin.connection_id
  AND instr(keep.key, 'oanda:') > 0
  AND instr(twin.key, 'oanda:') > 0
  AND substr(keep.key, instr(keep.key, 'oanda:') + 6)
      = substr(twin.key, instr(twin.key, 'oanda:') + 6)
  AND keep.instrument = twin.instrument
  AND keep.side = twin.side
  AND keep.entry_price = twin.entry_price
  AND keep.opened_at IS twin.opened_at
  -- twin: written by the backfill
  AND twin.status = 'closed'
  AND twin.closed_at IS NOT NULL
  AND twin.first_seen_at = twin.closed_at
  AND twin.planned_entry IS NULL
  AND twin.take_profit IS NULL
  AND twin.stop_loss IS NULL
  AND twin.trailing_stop_loss IS NULL
  AND twin.current_price IS NULL
  AND twin.unrealized_pl IS NULL
  AND twin.strategy IS NULL
  AND twin.timeframe IS NULL
  -- keep: carries something only the live poll could know. Tested on columns
  -- this statement does not itself write, so the delete below re-evaluates it
  -- identically.
  AND (keep.planned_entry IS NOT NULL
       OR keep.take_profit IS NOT NULL
       OR keep.stop_loss IS NOT NULL
       OR keep.trailing_stop_loss IS NOT NULL
       OR keep.current_price IS NOT NULL
       OR keep.unrealized_pl IS NOT NULL
       OR keep.strategy IS NOT NULL
       OR keep.timeframe IS NOT NULL);
--> statement-breakpoint
DELETE FROM trading_positions
WHERE broker = 'oanda'
  AND deleted_at IS NULL
  AND status = 'closed'
  AND closed_at IS NOT NULL
  AND first_seen_at = closed_at
  AND planned_entry IS NULL
  AND take_profit IS NULL
  AND stop_loss IS NULL
  AND trailing_stop_loss IS NULL
  AND current_price IS NULL
  AND unrealized_pl IS NULL
  AND strategy IS NULL
  AND timeframe IS NULL
  AND instr(key, 'oanda:') > 0
  AND EXISTS (
    SELECT 1
    FROM trading_positions AS keep
    WHERE keep.broker = 'oanda'
      AND keep.deleted_at IS NULL
      AND keep.id <> trading_positions.id
      AND keep.user_id = trading_positions.user_id
      AND keep.connection_id IS NOT trading_positions.connection_id
      AND instr(keep.key, 'oanda:') > 0
      AND substr(keep.key, instr(keep.key, 'oanda:') + 6)
          = substr(trading_positions.key, instr(trading_positions.key, 'oanda:') + 6)
      AND keep.instrument = trading_positions.instrument
      AND keep.side = trading_positions.side
      AND keep.entry_price = trading_positions.entry_price
      AND keep.opened_at IS trading_positions.opened_at
      AND (keep.planned_entry IS NOT NULL
           OR keep.take_profit IS NOT NULL
           OR keep.stop_loss IS NOT NULL
           OR keep.trailing_stop_loss IS NOT NULL
           OR keep.current_price IS NOT NULL
           OR keep.unrealized_pl IS NOT NULL
           OR keep.strategy IS NOT NULL
           OR keep.timeframe IS NOT NULL)
  );
--> statement-breakpoint
-- A trade replaced more than once has no reconcile leg to keep: every copy is a
-- backfill import, so the two statements above leave them all standing. Keep the
-- earliest and drop the rest. Ordering by first_seen_at then id is a strict
-- total order within a group, so exactly one row survives rather than the legs
-- deleting each other.
DELETE FROM trading_positions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id,
                          substr(key, instr(key, 'oanda:') + 6),
                          instrument,
                          side,
                          entry_price,
                          opened_at
             ORDER BY first_seen_at, id
           ) AS leg
    FROM trading_positions
    WHERE broker = 'oanda'
      AND deleted_at IS NULL
      AND status = 'closed'
      AND closed_at IS NOT NULL
      AND first_seen_at = closed_at
      AND planned_entry IS NULL
      AND take_profit IS NULL
      AND stop_loss IS NULL
      AND trailing_stop_loss IS NULL
      AND current_price IS NULL
      AND unrealized_pl IS NULL
      AND strategy IS NULL
      AND timeframe IS NULL
      AND instr(key, 'oanda:') > 0
  )
  WHERE leg > 1
);
