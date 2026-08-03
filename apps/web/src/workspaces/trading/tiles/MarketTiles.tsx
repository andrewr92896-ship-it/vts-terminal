import { useMemo, type CSSProperties } from 'react';
import { api } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { hasEntitlement } from '../../../auth/access';
import { usePrivacy } from '../../../privacy/privacy';
import { useNowTick } from '../../../hooks/useNowTick';
import { zoneAbbr, zoneFmt } from '../../../lib/timezone';
import type { MarketSeries, StreamChannel } from '../../../api/types';
import { BORDER2, FAINT, GOLD, GREEN, MONO, MUTED, RED, TEXT } from '../tvChart';
import { clockLabel, etClock, sessionOpen } from '../etClock';
import { embedSrc, liveKnown, shouldPlay } from '../streamEmbed';
import { HIDDEN, TileFrame, TileMessage, TileSelect, useTileData } from './TileFrame';
import type { TileProps } from './PersonalTiles';

// The Markets tiles that read public data: the series board, a live news
// channel, and the session clock. Nothing here touches a trade, a broker or a
// balance — the same reason these screens sit outside the Advanced Trading
// opt-in.

const SLOW = 300_000;
const STREAM_POLL = 45_000; // a channel going live must reach an open tile

// ---- Market Data ---------------------------------------------------------
//
// Rows off the same catalog the Market Data board reads, so a figure on the
// wall and the same figure on that screen come from one place. Two properties
// carried over deliberately, because dropping either would make the tile state
// something the board itself refuses to:
//   - a sample row is MARKED as sample. The board's whole honesty rule is that a
//     placeholder figure never passes as a live one.
//   - a row restates its own publisher, so the tile never implies an exchange
//     quoted a price that came from somewhere else.
export function MarketDataTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { privacy } = usePrivacy();
  const { data, error } = useTileData(() => api.marketData(), SLOW);

  const rows = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.series.map((s) => [s.id, s]));
    // Unknown ids are dropped on read — the same rule the saved Market Data
    // layout follows, so a catalog change never invalidates a saved board.
    const picked = (tile.seriesIds ?? []).map((id) => byId.get(id)).filter((s): s is MarketSeries => !!s);
    // An unconfigured tile falls back to the board's own default pins rather
    // than rendering an empty frame waiting to be told what to show.
    if (picked.length > 0) return picked;
    return data.defaultPins.map((id) => byId.get(id)).filter((s): s is MarketSeries => !!s);
  }, [data, tile.seriesIds]);

  const groups = data?.groups ?? [];

  return (
    <TileFrame
      title={tile.title || 'Market Data'}
      icon="line-chart"
      count={rows.length || null}
      editing={editing}
      onRemove={onRemove}
      controls={
        <TileSelect
          value={tile.seriesIds?.length ? 'custom' : 'default'}
          onChange={(v) => {
            if (v === 'default') return onChange({ seriesIds: [] });
            // Pin the chosen group's rows. A group is the useful unit here: the
            // alternative is a 75-row checklist inside a tile header.
            const ids = (data?.series ?? []).filter((s) => s.group === v).map((s) => s.id);
            onChange({ seriesIds: ids.slice(0, 12) });
          }}
          title="Which series to show"
          options={[
            { value: 'default', label: 'Default pins' },
            ...(tile.seriesIds?.length ? [{ value: 'custom', label: 'Chosen' }] : []),
            ...groups.map((g) => ({ value: g.key, label: g.label })),
          ]}
        />
      }
      footer="Informational only."
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && rows.length === 0 && <TileMessage>{"No series selected."}</TileMessage>}
      {rows.map((s) => (
        <div key={s.id} style={seriesRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.label}
            </div>
            <div style={{ fontSize: 9, color: FAINT, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
              {s.asOf}
              {/* Keep the board's marking accurate: a placeholder figure says so. */}
              {s.sample && <span style={sampleDot} title="Sample figure — no live source wired">Sample</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flex: '0 0 auto', marginLeft: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: MONO }}>
              {s.money && privacy ? HIDDEN : s.value}
              {s.unit && <span style={{ fontSize: 9, color: FAINT, marginLeft: 2 }}>{s.unit}</span>}
            </div>
            <div style={{ fontSize: 10, fontFamily: MONO, color: changeColor(s.changes[0]) }}>{s.changes[0]}</div>
          </div>
        </div>
      ))}
    </TileFrame>
  );
}

// A change column is already display-ready ("+0.42%", "−0.03"); colour it on its
// leading sign rather than reparsing a number out of it. Both the ASCII hyphen
// and the typographic minus appear.
function changeColor(v: string): string {
  const t = v.trim();
  if (t.startsWith('+')) return GREEN;
  if (t.startsWith('-') || t.startsWith('−')) return RED;
  return MUTED;
}

// ---- Live stream ---------------------------------------------------------
//
// One financial news channel playing on the board. Which channels an account may
// play is a tier question (Yahoo Finance free, the rest Premium, your own Max) —
// so the picker lists every channel with its marker but only ever SELECTS a
// watchable one, and the server refuses the rest on read anyway.
export function StreamTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { user } = useAuth();
  const { data, error } = useTileData(() => api.marketNewsStreams(), STREAM_POLL);
  const channels = data?.streams.channels ?? [];

  // A channel is playable when the account reaches it: every account gets the
  // free row; Premium unlocks the seeded wall; Max adds your own.
  const watchable = (c: StreamChannel): boolean =>
    !!c.free || hasEntitlement(user, 'presetStreams') || hasEntitlement(user, 'customStreams');

  const chosen = channels.find((c) => c.key === tile.channelKey && watchable(c)) ?? channels.find(watchable);

  return (
    <TileFrame
      title={tile.title || chosen?.name || 'Live Stream'}
      icon="youtube"
      editing={editing}
      onRemove={onRemove}
      controls={
        <TileSelect
          value={chosen?.key ?? ''}
          onChange={(v) => onChange({ channelKey: v })}
          title="Which channel to play"
          options={channels.filter(watchable).map((c) => ({ value: c.key, label: c.name }))}
        />
      }
      status={
        chosen && liveKnown(chosen) && chosen.live ? (
          <span style={livePill}>LIVE</span>
        ) : chosen?.upcoming ? (
          <span style={{ ...livePill, color: GOLD, borderColor: GOLD }}>SOON</span>
        ) : null
      }
      bodyStyle={{ overflow: 'hidden', display: 'flex' }}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && !chosen && <TileMessage>{"No channel available on your membership."}</TileMessage>}
      {chosen && chosen.embedBlocked && (
        // Not a fault, and must not render as one: the broadcaster has
        // restricted embedding, and YouTube's way of saying so is a bare
        // "Video unavailable" box.
        <TileMessage>
          Live now · does not allow playback outside YouTube.{' '}
          <a
            href={`https://www.youtube.com/channel/${chosen.channelId}/live`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: GOLD, textDecoration: 'none' }}
          >
            Watch ↗
          </a>
        </TileMessage>
      )}
      {chosen && !chosen.embedBlocked && shouldPlay(chosen) && embedSrc(chosen) && (
        <iframe
          className="no-drag"
          src={embedSrc(chosen)}
          title={chosen.name}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ border: 'none', width: '100%', height: '100%', display: 'block', background: '#000' }}
        />
      )}
      {chosen && !chosen.embedBlocked && !shouldPlay(chosen) && (
        <TileMessage>{chosen.name} is not broadcasting right now.</TileMessage>
      )}
    </TileFrame>
  );
}

// ---- Market clock --------------------------------------------------------
//
// Which sessions are open now and when the next one opens. Deliberately on
// EASTERN time regardless of the reader's display zone, and labelled ET: a
// session window is a fact about the market, not about the reader — the same
// rule etClock.ts states for market hours and the FOMC schedule. The reader's
// own clock is shown beside it, named, so the tile answers both questions
// without either passing for the other.
const SESSIONS: { label: string; window: [number, number] }[] = [
  // ET minutes-of-day, matching the session rows on the Market Data board.
  { label: 'Sydney', window: [17 * 60, 2 * 60] },
  { label: 'Tokyo', window: [19 * 60, 4 * 60] },
  { label: 'London', window: [3 * 60, 11 * 60 + 30] },
  { label: 'New York', window: [8 * 60, 17 * 60] },
  { label: 'NYSE / Nasdaq', window: [9 * 60 + 30, 16 * 60] },
];

export function ClockTile({ tile, editing, onRemove }: TileProps) {
  // One tick a second so the readings and the clock stay live.
  const now = useNowTick(1000);
  const readerZone = zoneAbbr(now);
  const readerTime = zoneFmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
  const openCount = SESSIONS.filter((s) => sessionOpen(now, s.window)).length;

  return (
    <TileFrame
      title={tile.title || 'Market Clock'}
      icon="clock"
      count={`${openCount} open`}
      editing={editing}
      onRemove={onRemove}
      status={<span style={{ fontSize: 10, color: FAINT, fontFamily: MONO }}>{etClock(now)} ET</span>}
    >
      {SESSIONS.map((s) => {
        const open = sessionOpen(now, s.window);
        return (
          <div key={s.label} style={seriesRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <span style={{ ...dot, background: open ? GREEN : '#3b4a70' }} />
              <span style={{ fontSize: 12, color: TEXT }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 10, color: open ? GREEN : MUTED, fontFamily: MONO, flex: 'none' }}>
              {open ? `closes ${clockLabel(s.window[1])}` : `opens ${clockLabel(s.window[0])}`}
            </span>
          </div>
        );
      })}
      {/* Session windows are Eastern; the reader may be on another clock. Name
          both rather than letting one pass for the other. */}
      <div style={zoneLine}>
        Sessions in ET · your clock {readerTime} {readerZone}
      </div>
    </TileFrame>
  );
}

const seriesRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 12px',
  borderBottom: `1px solid rgba(22,41,79,.5)`,
};
const dot: CSSProperties = { width: 7, height: 7, borderRadius: '50%', flex: 'none' };
const zoneLine: CSSProperties = { padding: '9px 12px', fontSize: 10, color: FAINT, fontFamily: MONO, lineHeight: 1.5 };
const livePill: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '.5px',
  color: RED,
  border: `1px solid ${RED}`,
  borderRadius: 4,
  padding: '1px 5px',
};
const sampleDot: CSSProperties = {
  fontSize: 8.5,
  fontWeight: 700,
  color: GOLD,
  border: `1px solid ${BORDER2}`,
  borderRadius: 4,
  padding: '0 4px',
};
