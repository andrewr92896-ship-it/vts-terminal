// One request per endpoint per board, however many tiles read it.
//
// The wall changed the economics of a poll. With seven tile kinds a board held a
// chart and a watchlist and every tile read something different; with
// two dozen, a realistic board has Trade Analysis beside Closed Trades (both
// the closed-trade history), Net Worth beside Portfolio (net worth reads the
// portfolio to build its own total), and two Market Data tiles pinned to
// different groups off one catalog. Every one of those pairs was two requests
// for one answer, forever, on a timer.
//
// So tiles fetch through here instead. Two rules, and they cover both ways the
// duplication happens:
//
//   - a request already IN FLIGHT is shared rather than started again. This is
//     the mount case: a board opening fires all its tiles at once.
//   - an answer younger than the caller's own staleness bound is returned as-is.
//     This is the steady-state case: two tiles polling the same endpoint on the
//     same interval drift into lockstep and would otherwise double every cycle.
//
// It is deliberately NOT a general cache with eviction and invalidation. Entries
// are small, bounded by the number of distinct endpoints the wall can read
// (about a dozen), and every one is replaced on its own tile's next poll — so
// there is nothing to evict and nothing to invalidate.

interface Entry {
  at: number;
  data: unknown;
  inflight?: Promise<unknown>;
}

const cache = new Map<string, Entry>();

/**
 * Fetch `key`, sharing the result with any other caller asking for the same key.
 *
 * `maxAgeMs` is the CALLER's tolerance, not a property of the entry — a tile
 * polling every 30s accepts a 20s-old answer, one polling every 5 minutes
 * accepts a much older one. Passing each caller's own bound means a slow tile
 * can reuse a fast tile's fresh answer, but never the reverse.
 */
export function sharedFetch<T>(key: string, fetcher: () => Promise<T>, maxAgeMs: number): Promise<T> {
  const hit = cache.get(key);
  if (hit) {
    // Someone else is already asking. Wait on their request rather than opening
    // a second one — this is what stops a board of twelve tiles from firing
    // three requests for the same endpoint the instant it opens.
    if (hit.inflight) return hit.inflight as Promise<T>;
    if (Date.now() - hit.at <= maxAgeMs) return Promise.resolve(hit.data as T);
  }

  const inflight = fetcher()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .catch((err) => {
      // A failed request must not leave a poisoned in-flight promise behind, or
      // every later caller would await a rejection that already happened. Drop
      // the in-flight marker but KEEP the last good answer: a tile whose refresh
      // failed goes on showing the previous reading, which is the whole point of
      // a wall of them.
      const cur = cache.get(key);
      if (cur?.inflight === inflight) {
        if ('data' in cur && cur.at > 0) cache.set(key, { at: cur.at, data: cur.data });
        else cache.delete(key);
      }
      throw err;
    });

  cache.set(key, { at: hit?.at ?? 0, data: hit?.data, inflight });
  return inflight as Promise<T>;
}

/** Drop a cached answer so the next read goes to the server. */
export function invalidateFeed(key: string): void {
  cache.delete(key);
}
