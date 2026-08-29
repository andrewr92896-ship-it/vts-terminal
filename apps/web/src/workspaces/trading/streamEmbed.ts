import type { StreamChannel } from '../../api/types';

// What a live-stream tile actually plays, and whether we know enough to say a
// channel is dark. Shared by the Market News stream wall and the Live Wall's
// stream tile, so the two can never drift apart on the one rule here that is
// easy to get wrong and expensive when it is.

// The channel-based `live_stream?channel=` embed is the workhorse: it plays
// these channels reliably, it needs nothing but the channel id, and it shows
// YouTube's own card when the channel is dark. A specific video id is used only
// when the server resolved one it trusts — worth it for a *scheduled* broadcast
// (the Fed's waiting room, which the channel embed cannot show) and for the
// Data API's answer.
//
// Deliberately not "video id first". Pointing the player at a guessed id renders
// "This video is unavailable" on a channel that is broadcasting perfectly well,
// which is strictly worse than the channel embed — knowing a channel is live and
// knowing which video to play are separate facts, and only the second one breaks
// the tile when it is wrong.
export function embedSrc(c: StreamChannel): string {
  if (c.liveVideoId) return `https://www.youtube.com/embed/${c.liveVideoId}?autoplay=1&rel=0`;
  return c.channelId ? `https://www.youtube.com/embed/live_stream?channel=${c.channelId}&autoplay=1&rel=0` : '';
}

// Whether the server actually established this channel's state. When it did not,
// a surface must not say "Offline" — a tile can be playing perfectly well via
// the fallback embed while we have no reading, and calling that offline is
// simply false. Say nothing instead.
export function liveKnown(c: StreamChannel): boolean {
  return c.liveChecked === true;
}

// What a placeholder slot says. One string, exported, because the Market News
// wall and the Live Wall's stream tile both draw it and two copies of a sentence
// is two sentences that drift.
export const STREAM_PLACEHOLDER_TEXT = 'Live stream plays here';

// A channel with no player behind it. Checked BEFORE everything else in
// `shouldPlay`, so no code path can mount an embed for one.
export function isPlaceholder(c: StreamChannel): boolean {
  return c.placeholder === true;
}

// Whether to mount the player at all.
//
// The embedded player is the one authority on whether a stream is on: it plays
// when the channel is live and shows YouTube's own card when it is not. A
// server-side reading is a guess by comparison — from a datacenter a consent or
// redirect page is indistinguishable from a dark channel, so "dark" is the
// answer it gets wrong most often. So the player is attempted unless the channel
// was positively read as dark, and an `alwaysOn` channel is attempted
// regardless: letting the guess win once replaced a visibly-broadcasting 24/7
// channel with "not live right now".
export function shouldPlay(c: StreamChannel): boolean {
  if (isPlaceholder(c)) return false;
  if (c.embedBlocked) return false;
  if (c.alwaysOn) return true;
  if (!liveKnown(c)) return true;
  return c.live || !!c.upcoming;
}
