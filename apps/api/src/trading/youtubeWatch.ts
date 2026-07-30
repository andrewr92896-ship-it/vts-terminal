import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketNewsStreams, users } from '../db/schema.js';
import { config } from '../config.js';
import { sendToUsers } from '../notifications/push.js';
import { sendPushoverToUsers } from '../notifications/pushover.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { listFollowedChannels } from './marketNewsStreams.js';
import {
  cachedChannelIdForHandle,
  fetchLiveState,
  isQuotaError,
  quotaStatus,
  resolveHandle,
  youtubeConfigured,
  type LiveState,
} from './youtube.js';

// Background watch for the Market News live-stream wall. Two jobs per tick:
// resolve any handle-only channel to its `UC…` id (once, cached), and refresh
// the live state of every channel anyone follows. Whoever armed the bell on a
// channel gets a go-live notification the moment it flips offline → live.
//
// The poll list is the UNION of every trader's channels, deduped — the desk
// mostly follows the same handful of channels, so this costs the same whether
// one trader or twenty are watching.
//
// Quota still shapes the cadence, even at the cheap 2-units-per-check path
// youtube.ts uses. The defaults below — every 5 minutes, 8 channels per tick —
// cost at most 288 ticks × 8 × 2 ≈ 4,600 units/day, comfortably inside the
// 10,000/day default budget with room for handle resolution. CHANNELS_PER_TICK
// is the backstop that keeps a desk following 30 channels from blowing through
// it: each tick refreshes only the least-recently-checked ones, round-robin, so
// adding channels lengthens each channel's refresh interval instead of
// multiplying the daily spend. The ledger in youtube.ts stops the sweep
// outright once the day's budget is gone.
const WATCH_MS = Math.max(60, Number(process.env.YOUTUBE_WATCH_SECONDS) || 300) * 1000;
const CHANNELS_PER_TICK = Math.max(1, Number(process.env.YOUTUBE_CHANNELS_PER_TICK) || 8);

// channelId -> when it was last refreshed, so the round-robin can pick the
// stalest channels each tick.
const lastChecked = new Map<string, number>();
// channelId -> was it live at the previous observation? Drives the edge detect
// for go-live notifications (only an offline → live transition notifies).
const wasLive = new Map<string, boolean>();
// Guards against overlapping ticks if a sweep runs long.
let running = false;

export async function tickYoutubeWatch(): Promise<void> {
  if (!youtubeConfigured() || running) return;
  running = true;
  try {
    const channels = await listFollowedChannels();
    if (channels.length === 0) return;

    // 1) Resolve handles we don't have an id for yet (1 unit each, cached).
    for (const c of channels) {
      if (c.channelId || !c.handle) continue;
      try {
        await resolveHandle(c.handle);
      } catch (err) {
        if (isQuotaError(err)) return;
        console.error('YouTube handle resolve error:', err);
      }
    }

    // 2) Refresh live state for the stalest channels, round-robin.
    const ids = [
      ...new Set(
        channels
          .map((c) => c.channelId || (c.handle ? cachedChannelIdForHandle(c.handle) ?? '' : ''))
          .filter(Boolean),
      ),
    ];
    const due = ids
      .sort((a, b) => (lastChecked.get(a) ?? 0) - (lastChecked.get(b) ?? 0))
      .slice(0, CHANNELS_PER_TICK);

    for (const id of due) {
      let state: LiveState | null;
      try {
        state = await fetchLiveState(id);
      } catch (err) {
        if (isQuotaError(err)) return;
        // Stamp it anyway: without this a channel that fails every time stays
        // permanently "stalest" and monopolises the per-tick slots, starving
        // every other channel. It goes to the back of the queue and retries on
        // its normal turn.
        lastChecked.set(id, Date.now());
        console.error('YouTube live-state error:', err);
        continue;
      }
      // null = over budget; leave the previous reading to age out on its TTL.
      if (!state) return;
      lastChecked.set(id, Date.now());

      const before = wasLive.get(id);
      wasLive.set(id, state.live);
      // Notify only on a genuine offline → live edge. `before === undefined` is
      // the first observation after a restart: staying quiet there avoids
      // buzzing everyone about a stream that was already running.
      if (state.live && before === false) {
        await notifyGoLive(id, state).catch((err) => console.error('Go-live notify error:', err));
      }
    }
  } finally {
    running = false;
  }
}

// Buzz everyone who armed the bell for this channel. Each trader's row holds
// their own channel list and notify map, so we match on the channel's id or
// handle within that row. Demo excluded; delivery is best-effort.
async function notifyGoLive(channelId: string, state: LiveState): Promise<void> {
  const rows = await db
    .select({
      userId: marketNewsStreams.userId,
      channels: marketNewsStreams.channels,
      notify: marketNewsStreams.notify,
      username: users.username,
    })
    .from(marketNewsStreams)
    .innerJoin(users, eq(users.id, marketNewsStreams.userId));

  const recipients: string[] = [];
  let channelName = 'A channel';
  for (const r of rows) {
    if (r.username === DEMO_USERNAME) continue;
    let notify: Record<string, unknown>;
    let chans: { key?: unknown; name?: unknown; handle?: unknown; channelId?: unknown }[];
    try {
      notify = JSON.parse(r.notify) as Record<string, unknown>;
      chans = JSON.parse(r.channels) as typeof chans;
    } catch {
      continue;
    }
    if (!Array.isArray(chans)) continue;
    // The row stores whatever the trader saved: an id for some channels, only a
    // handle for others. A handle matches this channelId only when the resolver
    // has actually mapped it there — never by string similarity.
    const match = chans.find((c) => {
      const id = typeof c.channelId === 'string' ? c.channelId : '';
      if (id) return id === channelId;
      const h = typeof c.handle === 'string' ? c.handle : '';
      return !!h && cachedChannelIdForHandle(h) === channelId;
    });
    if (!match) continue;
    const key = typeof match.key === 'string' ? match.key : '';
    if (!key || notify[key] !== true) continue;
    if (typeof match.name === 'string' && match.name) channelName = match.name;
    recipients.push(r.userId);
  }
  if (recipients.length === 0) return;

  const title = `${channelName} is live`;
  const body = state.streamTitle ?? 'Streaming now on YouTube.';
  await Promise.all([
    sendToUsers(recipients, { title, body, url: '/?screen=news', tag: `golive-${channelId}` }),
    sendPushoverToUsers(recipients, { title, message: body }),
  ]);
}

// Start the background YouTube watch. Production-only, and only when a Data API
// key is set — with no key there is nothing to poll and every channel correctly
// reads offline.
export function startYoutubeWatch(): void {
  if (!config.isProd || !youtubeConfigured()) return;
  const tick = () => {
    void tickYoutubeWatch().catch((err) => console.error('YouTube watch error:', err));
  };
  setTimeout(tick, 20 * 1000);
  const timer = setInterval(tick, WATCH_MS);
  timer.unref?.();
  const q = quotaStatus();
  console.log(
    `[youtube] live-stream watch on — every ${WATCH_MS / 1000}s, ${CHANNELS_PER_TICK} channel(s)/tick, ${q.budget} units/day`,
  );
}
