import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useNowTick } from '../../hooks/useNowTick';
import type { BoardTile, NewsBias, NewsImpact, NewsItem } from '../../api/types';
import { decodeEntities, fmtRelative } from './newsFormat';
import { NEWS_FEEDS, newsFeeds } from './newsRelevance';
import { BORDER, BORDER2, FAINT, GOLD, GREEN, MONO, MUTED, PANEL, RED, TEXT } from './tvChart';
import { ScrollLockButton } from './scrollLock';

const REFRESH_MS = 120_000;
const AMBER = '#e0a23a';

const IMPACT: Record<NewsImpact, { label: string; color: string }> = {
  high: { label: 'High', color: RED },
  medium: { label: 'Med', color: AMBER },
  low: { label: 'Low', color: FAINT },
};
const BIAS: Record<NewsBias, { label: string; color: string; arrow: string }> = {
  bullish: { label: 'Bullish', color: GREEN, arrow: '▲' },
  bearish: { label: 'Bearish', color: RED, arrow: '▼' },
  neutral: { label: 'Neutral', color: MUTED, arrow: '●' },
};

// The topic subfeeds a News tile can be pinned to: every headline, or one of the
// classified subfeeds (Fed, EUR/USD, Bitcoin, …). Mirrors the Market News tabs.
const FEED_OPTIONS: { key: string; label: string }[] = [{ key: 'all', label: 'All news' }, ...NEWS_FEEDS];

// A live market-news headline feed for the chart board — the same classified
// headlines as the Market News screen, filtered to a topic subfeed chosen per
// tile and saved with the preset. Every impact level shows (each headline is
// still badged High/Med/Low). Polls on its own interval and keeps the last
// snapshot on a failed refresh.
export function NewsTile({
  tile,
  editing,
  onChange,
  onRemove,
}: {
  tile: BoardTile;
  editing: boolean;
  onChange: (patch: Partial<BoardTile>) => void;
  onRemove: () => void;
}) {
  // Keep the "x ago" times fresh between data polls.
  useNowTick();
  const [headlines, setHeadlines] = useState<NewsItem[] | null>(null);
  // Whether the server is tagging headlines at all. Same reason as Market News:
  // a stored bias is real, an untagged headline's 'neutral' is just the column
  // default, and showing both as though they meant the same thing is worse than
  // showing neither. The High/Med/Low chip is unaffected — that one comes from
  // the feed's own per-source setting, not from the AI.
  const [aiTagging, setAiTagging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api.marketNews();
      if (!alive.current) return;
      setHeadlines(d.headlines);
      setAiTagging(!!d.aiTagging);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (firstLoad.current) setError(e instanceof ApiError ? e.message : 'Could not load news');
    } finally {
      firstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  const feed = tile.newsFeed ?? 'all';

  const shown = useMemo(() => {
    if (!headlines) return [];
    // Show every impact level; the per-headline High/Med/Low badge conveys impact.
    return headlines.filter((h) => feed === 'all' || newsFeeds(h).includes(feed));
  }, [headlines, feed]);

  const feedLabel = FEED_OPTIONS.find((f) => f.key === feed)?.label ?? 'All news';

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && (
            // Classed so the board can hide it where the header is not a drag
            // handle — a phone, where the tile moves with the cell's arrows.
            <span className="tile-grip" style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>
              ⠿
            </span>
          )}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Market News'}</span>
          {headlines && <span style={countChip}>{shown.length}</span>}
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ScrollLockButton />
          {editing ? (
            <>
              {/* Topic subfeed picker — saved with the preset. */}
              <select
                value={feed}
                onChange={(e) => onChange({ newsFeed: e.target.value })}
                style={miniSelect}
                title="Which news feed to show"
              >
                {FEED_OPTIONS.map((f) => (
                  <option key={f.key} value={f.key} style={{ background: '#091633', color: TEXT }}>{f.label}</option>
                ))}
              </select>
              <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">✕</button>
            </>
          ) : (
            <span style={{ fontSize: 10, color: FAINT, whiteSpace: 'nowrap' }}>{feedLabel}</span>
          )}
        </div>
      </div>

      <div style={body}>
        {!headlines && !error && <div style={hint}>{"Loading news…"}</div>}
        {error && !headlines && <div style={{ ...hint, color: '#ffb4ab' }}>{error}</div>}
        {headlines && shown.length === 0 && (
          <div style={hint}>No {feed === 'all' ? '' : `${feedLabel} `}headlines yet. New stories appear here automatically.</div>
        )}
        {shown.map((h) => (
          <HeadlineRow key={h.id} h={h} showBias={aiTagging} />
        ))}
      </div>
    </div>
  );
}

function HeadlineRow({ h, showBias }: { h: NewsItem; showBias: boolean }) {
  const bi = BIAS[h.bias];
  const im = IMPACT[h.impact];
  return (
    <div style={{ ...row, borderLeft: `3px solid ${showBias ? bi.color : 'transparent'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {showBias && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: bi.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 8 }}>{bi.arrow}</span>{bi.label}
          </span>
        )}
        <span style={{ ...chip, color: im.color, borderColor: im.color }}>{im.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: FAINT, fontFamily: MONO }}>{fmtRelative(h.publishedAt)}</span>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', lineHeight: 1.35 }}>{decodeEntities(h.title)}</div>
      {h.tradeNote ? (
        <div style={{ fontSize: 11, color: '#cdd9f3', lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{decodeEntities(h.tradeNote)}</div>
      ) : h.body ? (
        <div style={{ fontSize: 11, color: '#b8c6e6', lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{decodeEntities(h.body)}</div>
      ) : null}
      {(h.source || h.url) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          {h.source && <span style={{ fontSize: 10, color: MUTED }}>{h.source}</span>}
          {h.url && (
            <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: GOLD, textDecoration: 'none' }}>Source ↗</a>
          )}
        </div>
      )}
    </div>
  );
}

const tileWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  background: 'rgba(9,20,46,1)',
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  overflow: 'hidden',
};
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 10px',
  background: PANEL,
  borderBottom: `1px solid ${BORDER}`,
  flex: '0 0 auto',
};
const body: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' };
const row: CSSProperties = { padding: '9px 11px', borderBottom: `1px solid rgba(22,41,79,.6)` };
const hint: CSSProperties = { padding: '18px 14px', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 };
const countChip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: GOLD,
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 5,
  padding: '1px 6px',
};
const chip: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.3px',
  color: MUTED,
  border: `1px solid ${BORDER2}`,
  borderRadius: 5,
  padding: '1px 6px',
};
const miniSelect: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: TEXT,
  background: 'rgba(4,12,30,.6)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 6px',
  outline: 'none',
  cursor: 'pointer',
  maxWidth: 130,
};
const iconBtn: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#cfe',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 7px',
  cursor: 'pointer',
};
