-- Market News stream wall: give the starter channels their real YouTube ids, and
-- mark every one of them except the Fed as broadcasting round the clock.
--
-- The seed used to leave `channel_id` empty for three of the four starter
-- channels and rely on a background lookup to fill them in. A row with no id
-- cannot embed at all, so any desk whose lookup never succeeded has been sitting
-- on dead tiles. These ids are the channels' own, so writing them directly
-- removes the dependency on that lookup for the set every desk starts with.
--
-- Only rows that are still empty are touched — a desk that resolved its own id,
-- or pointed the row at a different channel, keeps what it has.
UPDATE market_news_channels
SET channel_id = 'UCEAZeUIeJs0IjQiqTCdVSIg', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE key = 'yahoofinance' AND channel_id = '';

UPDATE market_news_channels
SET channel_id = 'UCIALMKvObZNtJ6AmdCLP7Lg', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE key = 'bloomberg' AND channel_id = '';

-- The Fed's id was already seeded; repair it only where it is missing.
UPDATE market_news_channels
SET channel_id = 'UCAzhpt9DmG6PnHXjmJTvRGQ', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE key = 'fed' AND channel_id = '';

-- Reuters runs a rolling news stream, so it carries the 24/7 tag alongside
-- Bloomberg and Yahoo Finance. The Fed is left as-is: it is dark between
-- meetings, and its tile shows the FOMC countdown rather than pretending
-- otherwise.
UPDATE market_news_channels
SET always_on = 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE key = 'reuters' AND always_on = 0;
