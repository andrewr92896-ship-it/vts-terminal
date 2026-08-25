import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketNewsStreams, users } from '../db/schema.js';
import { config } from '../config.js';
import { sendToUsers } from '../notifications/push.js';
import { sendPushoverToUsers } from '../notifications/pushover.js';
import { sendSmsToUsers } from '../notifications/sms.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import {
  channelsWithId,
  listFollowedChannels,
  persistResolvedIds,
  resolvedChannelId,
} from './marketNewsStreams.js';
import {
  fetchLiveState,
  isQuotaError,
  quotaStatus,
  resolveHandle,
  youtubeConfigured,
  type LiveState,
} from './youtube.js';

// Background watch for the Market News live-stream wall. Two jobs per tick:
// resolve any handle-only catalog channel to its `UC…` id (once, cached), and
// refresh live state for the channels due a check. Whoever armed the bell on a
// channel gets a go-live notification the moment it flips offline → live.
//
// The work list is the **code-resident catalog**, not anything per user, which
// is what makes this affordable at any scale: every viewer reads one shared
// cache, so the cost is the same for one trader or a hundred thousand. See
// marketNewsStreams.ts for why the catalog is fixed.
//
// Quota still shapes the cadence, even at the cheap 2-units-per-check path
// youtube.ts uses. The defaults below — every 5 minutes, 8 channels per tick —
// cost at most 288 ticks × 8 × 2 ≈ 4,600 units/day, comfortably inside the
// 10,000/day default budget with room for handle resolution. CHANNELS_PER_TICK
// is the backstop if the catalog ever grows: each tick refreshes only the
// least-recently-checked channels, round-robin, so adding one lengthens every
// channel's refresh interval instead of multiplying the daily spend. The ledger
// in youtube.ts stops the sweep outright once the day's budget is gone.
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
    // A row whose handle field is a /channel/ URL already carries its id, so
    // resolvedChannelId answers for free and no unit is spent here.
    for (const c of channels) {
      if (resolvedChannelId(c) || !c.handle) continue;
      try {
        await resolveHandle(c.handle);
      } catch (err) {
        if (isQuotaError(err)) return;
        console.error('YouTube handle resolve error:', err);
      }
    }

    // Write back any id resolved above. Without this a handle-only channel is
    // embeddable only while this process's cache holds it, and goes dark again
    // on the next deploy until the poller happens to resolve it a second time.
    await persistResolvedIds().catch((err) => console.error('YouTube id persist error:', err));

    // 2) Refresh live state for the stalest channels, round-robin.
    const ids = [
      ...new Set(
        channels.map(resolvedChannelId).filter(Boolean),
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

// Buzz everyone who armed the bell for this channel. With the catalog in code,
// the channel resolves to a single key and each trader's row only has to be
// checked for that key. Demo excluded; delivery is best-effort.
async function notifyGoLive(channelId: string, state: LiveState): Promise<void> {
  // Which desks follow this channel? The same channel can sit on several walls
  // under different keys, so match by resolved id and check each desk's own key.
  const followers = await channelsWithId(channelId);
  if (followers.length === 0) return;
  const keyByTeam = new Map(followers.map((f) => [f.teamId, f.key]));

  const rows = await db
    .select({
      userId: marketNewsStreams.userId,
      notify: marketNewsStreams.notify,
      username: users.username,
      teamId: users.teamId,
    })
    .from(marketNewsStreams)
    .innerJoin(users, eq(users.id, marketNewsStreams.userId));

  const recipients: string[] = [];
  for (const r of rows) {
    if (r.username === DEMO_USERNAME) continue;
    // The scope key mirrors channelScope(): a trader on no team has their own.
    const key = keyByTeam.get(r.teamId ?? `user:${r.userId}`);
    if (!key) continue;
    try {
      const notify = JSON.parse(r.notify) as Record<string, unknown>;
      if (notify[key] === true) recipients.push(r.userId);
    } catch {
      continue;
    }
  }
  if (recipients.length === 0) return;

  const title = `${followers[0].name} is live`;
  const body = state.streamTitle ?? 'Streaming now on YouTube.';
  await Promise.all([
    sendToUsers(
      recipients,
      { title, body, url: '/?screen=news', tag: `golive-${channelId}` },
      { category: 'system' },
    ),
    sendPushoverToUsers(recipients, { title, message: body }, 'system', { category: 'system' }),
    sendSmsToUsers(recipients, { title, body }, { category: 'system' }),
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
