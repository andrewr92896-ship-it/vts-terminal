import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { NewsItem } from '../../api/types';
import { Icon } from '../../components/Icon';
import { fmtDayKey, fmtRelative } from '../trading/newsFormat';

// The News workspace's World and Politics feeds.
//
// ONE component behind both keys, parameterized by topic — they are the same
// screen reading a different category, and two files would drift.
//
// Deliberately plainer than Market News, and the omissions are the design:
//
//   • No bias glyph, no impact chip, no "how this affects the desk" note. Market
//     News earns those because a rate decision genuinely does move an
//     instrument. A flood or an election does not have a read-through the
//     terminal can honestly supply, and inventing one would be exactly the
//     advice-flavoured surface the product exists to avoid.
//   • No AI summary of any kind, for the same reason.
//   • Sources are wire services only (owner decision, 2026-08). Reuters and AP
//     report rather than opine, which is the one editorial position that is
//     defensible to everybody. The rail names them so a reader can see where
//     the coverage comes from.
//
// What is left is a list of headlines, newest first, bucketed by day, each
// linking out to the publisher. That is the whole feature, and it should stay
// that way.

const TOPIC_META = {
  world: {
    title: 'World',
    blurb: 'International reporting from the wire services.',
    icon: 'globe',
  },
  politics: {
    title: 'Politics',
    blurb: 'Political reporting from the wire services.',
    icon: 'landmark',
  },
} as const;

export function GeneralNews({ topic }: { topic: 'world' | 'politics' }) {
  const meta = TOPIC_META[topic];
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError('');
    setSource(null);
    const load = () =>
      api
        .generalNews(topic)
        .then((r) => {
          if (alive) setItems(r.headlines);
        })
        .catch((e) => {
          if (alive) setError(e instanceof ApiError ? e.message : 'Could not load the feed');
        });
    void load();
    // Wire copy moves through the day; five minutes matches the server's own
    // poll, so a faster client poll would only re-read the same rows.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [topic]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const h of items ?? []) if (h.source) set.add(h.source);
    return [...set].sort();
  }, [items]);

  const shown = useMemo(
    () => (source ? (items ?? []).filter((h) => h.source === source) : items ?? []),
    [items, source],
  );

  // Bucketed by day, newest first. `fmtDayKey` is Eastern on purpose — it is the
  // same day-bucketing rule the rest of the terminal uses, so a story does not
  // move between days depending on who is reading it.
  const days = useMemo(() => {
    const out: { key: string; items: NewsItem[] }[] = [];
    for (const h of shown) {
      const key = fmtDayKey(h.publishedAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(h);
      else out.push({ key, items: [h] });
    }
    return out;
  }, [shown]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 40px' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name={meta.icon} size={19} color="#93B4FF" />
          <h2 style={{ margin: 0, fontSize: 19, color: '#eef3ff' }}>{meta.title}</h2>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8298c4' }}>{meta.blurb}</p>
      </div>

      {sources.length > 1 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          <button type="button" onClick={() => setSource(null)} style={pill(source === null)}>
            All sources
          </button>
          {sources.map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)} style={pill(source === s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <div style={errBox}>{error}</div>}

      {items == null && !error ? (
        <div style={{ color: '#8298c4', fontSize: 13 }}>Loading…</div>
      ) : shown.length === 0 && !error ? (
        <div style={emptyBox}>
          Nothing here yet. Headlines arrive as the wires publish them.
        </div>
      ) : (
        days.map((d) => (
          <div key={d.key} style={{ marginBottom: 22 }}>
            <div style={dayLabel}>{d.key}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.items.map((h) => (
                <Story key={h.id} item={h} />
              ))}
            </div>
          </div>
        ))
      )}

      <p style={footNote}>
        Reporting from third-party wire services, shown for information only. VTS
        Terminal does not write, edit, or endorse any of it.
      </p>
    </div>
  );
}

function Story({ item }: { item: NewsItem }) {
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#eef3ff', lineHeight: 1.5 }}>
          {item.title}
        </span>
        {item.url && <Icon name="external-link" size={11} color="#7488b5" />}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: 11, color: '#7488b5' }}>
        {item.source && <span>{item.source}</span>}
        <span>{fmtRelative(item.publishedAt)}</span>
      </div>
      {item.body && (
        <p style={{ margin: '7px 0 0', fontSize: 12, lineHeight: 1.6, color: '#aebcd8' }}>
          {item.body}
        </p>
      )}
    </>
  );

  if (!item.url) return <div style={storyCard}>{body}</div>;
  return (
    // rel=noopener: an outbound link to a third-party site must not get a handle
    // back into the signed-in terminal.
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...storyCard, textDecoration: 'none', display: 'block' }}
    >
      {body}
    </a>
  );
}

const pill = (active: boolean): CSSProperties => ({
  background: active ? 'rgba(147,180,255,.16)' : 'transparent',
  border: `1px solid ${active ? '#4a6ba8' : '#1d3560'}`,
  borderRadius: 999,
  color: active ? '#cfe0ff' : '#8298c4',
  fontSize: 11.5,
  padding: '5px 12px',
  cursor: 'pointer',
});
const storyCard: CSSProperties = {
  border: '1px solid #1d3560',
  background: 'rgba(11,26,58,.5)',
  borderRadius: 10,
  padding: '12px 14px',
};
const dayLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 9,
};
const errBox: CSSProperties = {
  color: '#ffb4ab',
  fontSize: 12.5,
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 11px',
  marginBottom: 14,
};
const emptyBox: CSSProperties = {
  border: '1px solid #1d3560',
  background: 'rgba(11,26,58,.5)',
  borderRadius: 10,
  padding: '16px 18px',
  fontSize: 13,
  color: '#8298c4',
};
const footNote: CSSProperties = {
  marginTop: 26,
  paddingTop: 14,
  borderTop: '1px solid #1d3560',
  fontSize: 10.5,
  lineHeight: 1.6,
  color: '#7488b5',
};
