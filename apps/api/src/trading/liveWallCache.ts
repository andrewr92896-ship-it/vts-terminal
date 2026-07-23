import type { BrokerLiveResult, LiveTrade } from './types.js';

// Per-team Live Wall snapshot cache.
//
// The expensive part of a Live Wall render is the broker fan-out (loadDesk) +
// reconcile. Every open Live Wall AND every home-screen widget on a team was
// doing that work independently, so a team of N traders each running a few
// widgets polled the *same* broker accounts N× per cycle. This collapses all of
// those concurrent, identical renders into a single broker fetch per team:
//
//   • Short TTL — callers within the window share the last snapshot.
//   • Single-flight — concurrent misses for the same team await ONE load, so a
//     burst of widget refreshes never fans out to the broker more than once.
//
// It caches only the shared, team-level broker part; the per-viewer bits
// (funded merge, designation colours, break-even settings) are applied after,
// so what each viewer sees is unchanged. Only the "live" path uses this — the
// no-connection sample path is viewer-attributed and cheap, so it stays direct.

// The shared, team-level result of one broker fetch + reconcile.
export interface DeskSnapshot {
  generatedAt: number; // when the brokers were actually polled
  brokers: BrokerLiveResult[];
  withSlip: LiveTrade[]; // broker positions, slippage-tagged, pre designation/gate/funded
  note: string | null;
}

// Default 8s: under the client Live Wall's 10s poll (so the web stays fresh)
// while still collapsing every concurrent widget/viewer on a team into one
// fetch. Set LIVE_WALL_CACHE_MS=0 to disable caching but keep single-flight.
const TTL_MS = Math.max(0, Number(process.env.LIVE_WALL_CACHE_MS) || 8000);

interface Entry {
  at: number;
  snapshot: DeskSnapshot;
}
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<DeskSnapshot>>();

// Drop stale entries so the map can't grow without bound as team-less users
// (each keyed solo:<id>) come and go. Cheap and only runs when the map is large.
function prune(now: number) {
  if (cache.size < 200) return;
  for (const [k, v] of cache) {
    if (now - v.at >= TTL_MS) cache.delete(k);
  }
}

// Serve a team's desk snapshot from the short-TTL, single-flight cache. `load`
// does the real broker fetch + reconcile and only runs on a genuine miss.
export async function getDeskSnapshot(
  key: string,
  load: () => Promise<DeskSnapshot>,
): Promise<DeskSnapshot> {
  const now = Date.now();
  if (TTL_MS > 0) {
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) return hit.snapshot;
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    try {
      const snapshot = await load();
      if (TTL_MS > 0) {
        cache.set(key, { at: Date.now(), snapshot });
        prune(Date.now());
      }
      return snapshot;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
