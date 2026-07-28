-- Remove the phantom second row every live-captured OANDA trade picked up.
--
-- Two writers fill `trading_positions`: the Live Wall reconcile, which keys a
-- position `<connectionId>:oanda:<tradeId>`, and the closed-trade backfill,
-- which used to key it `oanda:<tradeId>`. The backfill deduped on its own key
-- shape, so it never recognised a row reconcile had already written and every
-- trade seen live ended up stored twice — once with the real broker fill and
-- once with reconcile's estimate (the last polled bid/ask midpoint, which never
-- filled at all). Both legs then counted toward the desk's trade count and P/L.
--
-- The reconcile leg is the one kept: it carries the stop, target, planned entry,
-- strategy and timeframe that the broker's closed-trade record cannot supply.
-- Its fills are overwritten from its backfill twin, which is authoritative, and
-- the twin is then removed.
--
-- Soft-deleted rows are deliberately left out of the merge and the delete: a leg
-- the trader already removed by hand stays removed, and its key still blocks a
-- re-import. They are re-keyed in the last statement along with everything else,
-- so that block keeps working.
--
-- `substr(key, instr(key, 'oanda:') + 6)` is the trade id under either key
-- shape ('oanda:' is 6 characters). A connection id is a UUID, so it can never
-- contain the literal 'oanda:' and the first match is always the right one.

UPDATE trading_positions AS live
SET exit_price  = twin.exit_price,
    realized_pl = twin.realized_pl,
    entry_price = twin.entry_price,
    units       = twin.units,
    closed_at   = twin.closed_at,
    status      = 'closed'
FROM trading_positions AS twin
WHERE live.broker = 'oanda'
  AND twin.broker = 'oanda'
  AND live.deleted_at IS NULL
  AND twin.deleted_at IS NULL
  AND live.id <> twin.id
  AND live.user_id = twin.user_id
  AND live.connection_id IS NOT NULL
  AND live.connection_id = twin.connection_id
  AND live.key NOT LIKE 'oanda:%'
  AND twin.key LIKE 'oanda:%'
  AND substr(live.key, instr(live.key, 'oanda:') + 6) = substr(twin.key, 7);
--> statement-breakpoint
DELETE FROM trading_positions
WHERE broker = 'oanda'
  AND deleted_at IS NULL
  AND key LIKE 'oanda:%'
  AND EXISTS (
    SELECT 1
    FROM trading_positions AS live
    WHERE live.broker = 'oanda'
      AND live.deleted_at IS NULL
      AND live.id <> trading_positions.id
      AND live.user_id = trading_positions.user_id
      AND live.connection_id IS NOT NULL
      AND live.connection_id = trading_positions.connection_id
      AND live.key NOT LIKE 'oanda:%'
      AND substr(live.key, instr(live.key, 'oanda:') + 6) = substr(trading_positions.key, 7)
  );
--> statement-breakpoint
-- Bring the rows that had no twin (backfill-only trades, which are correct as
-- they stand) onto the same key shape as everything else, so one format is left
-- in the table and the dedupe has a single thing to match.
UPDATE trading_positions
SET key = connection_id || ':' || key
WHERE broker = 'oanda'
  AND connection_id IS NOT NULL
  AND key LIKE 'oanda:%';
