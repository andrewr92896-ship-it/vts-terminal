-- A broker connection's name should say whose it is AND where it is —
-- "Andrew's OANDA", "Andrew's Kraken" — because the desk now trades at more than
-- one venue and a label naming only the owner leaves two chips on the Live Wall
-- that cannot be told apart.
--
-- Only labels this app wrote itself are touched, matched in full, so a
-- connection anybody renamed by hand keeps the name they gave it. The seeded
-- "Andrew's …" labels already carry a name, so they keep it; a bare venue label
-- belongs to whoever added it from the UI without typing one, and is left
-- nameless rather than guessing whose it is.

UPDATE broker_connections SET label = 'Andrew''s OANDA'
WHERE broker = 'oanda' AND label = 'Andrew''s Trades';

UPDATE broker_connections SET label = 'Andrew''s Kraken'
WHERE broker = 'kraken' AND label = 'Andrew''s Crypto';

UPDATE broker_connections SET label = 'OANDA'
WHERE broker = 'oanda' AND label IN ('Oanda', 'oanda');

UPDATE broker_connections SET label = 'Kraken'
WHERE broker = 'kraken' AND label IN ('kraken', 'Kraken Pro');
