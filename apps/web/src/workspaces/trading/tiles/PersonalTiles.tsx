import { useMemo, useState, type CSSProperties } from 'react';
import { api } from '../../../api/client';
import { usePrivacy } from '../../../privacy/privacy';
import type { BoardTile } from '../../../api/types';
import { BORDER, FAINT, GOLD, GREEN, MONO, MUTED, RED, TEXT } from '../tvChart';
import { fmtRelative } from '../newsFormat';
import {
  HIDDEN,
  TileFrame,
  TileMessage,
  TileRow,
  TileSelect,
  TileStat,
  money,
  pct,
  plColor,
  signedMoney,
  useTileData,
} from './TileFrame';

// The My Terminal tiles: the reader's own money, their list, and what the
// terminal has been saying. None of these touch a broker or place an order —
// they restate screens the account already has, on the one board.

export interface TileProps {
  tile: BoardTile;
  editing: boolean;
  onChange: (patch: Partial<BoardTile>) => void;
  onRemove: () => void;
}

const SLOW = 300_000; // 5 min — none of this moves tick by tick
const MEDIUM = 120_000;

// ---- Net Worth ----------------------------------------------------------
//
// Everything you own minus everything you owe. Two properties carried over from
// the Net Worth screen itself, because they are the whole reason that screen is
// trustworthy: an incomplete total is REFUSED rather than approximated (a net
// worth missing a chunk looks complete when it is not), and the tile says which
// part of the figure is tracked automatically versus typed in by hand.
export function NetWorthTile({ tile, editing, onRemove }: TileProps) {
  const { privacy } = usePrivacy();
  const { data, error } = useTileData(() => api.netWorth(90), SLOW);

  const spark = useMemo(() => (data ? data.history.map((p) => p.netWorth) : []), [data]);
  const change = useMemo(() => {
    if (!data || data.history.length < 2) return null;
    const first = data.history[0].netWorth;
    const last = data.history[data.history.length - 1].netWorth;
    return { abs: last - first, days: data.history.length };
  }, [data]);

  return (
    <TileFrame
      title={tile.title || 'Net Worth'}
      icon="scale"
      editing={editing}
      onRemove={onRemove}
      status={data ? <span style={stamp}>{data.tracked.available ? 'Tracked' : 'Incomplete'}</span> : null}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && (
        <>
          <TileStat
            label="Net worth"
            value={privacy ? HIDDEN : data.totals.netWorth == null ? '—' : money(data.totals.netWorth)}
            color={data.totals.netWorth == null ? MUTED : '#fff'}
            sub={
              // The screen's own rule: when the tracked side cannot be totalled
              // there is no headline figure, and the note says why. Approximating
              // it would look complete while missing a chunk.
              data.totals.netWorth == null
                ? data.tracked.note ?? 'Part of the tracked side could not be read.'
                : change && change.abs !== 0
                  ? `${signedMoney(privacy ? null : change.abs)} over ${change.days} days`
                  : null
            }
          />
          {spark.length > 1 && <Sparkline points={spark} />}
          <TileRow label="Assets" value={privacy ? HIDDEN : money(data.totals.assets)} />
          <TileRow label="Liabilities" value={privacy ? HIDDEN : money(data.totals.liabilities)} color={RED} />
          <TileRow
            label="Investments"
            value={privacy ? HIDDEN : data.tracked.available ? money(data.tracked.investments) : '—'}
          />
          {data.tracked.tradingEnabled && (
            <TileRow
              label="Trading equity"
              value={privacy ? HIDDEN : data.tracked.available ? money(data.tracked.trading) : '—'}
            />
          )}
          <TileRow label="Entered by hand" value={privacy ? HIDDEN : money(data.totals.manualAssets)} />
        </>
      )}
    </TileFrame>
  );
}

// ---- Investment portfolio ----------------------------------------------
//
// What the long-term portfolio is worth and how it is split. Three rules the
// Investments workspace enforces and this tile has to keep, or it would state
// something the workspace itself refuses to:
//   - an unpriced holding is never worth zero. It is excluded and COUNTED.
//   - a day move is only shown when live quotes cover enough of the book.
//   - market gain is separated from money that was merely added.
export function PortfolioTile({ tile, editing, onRemove }: TileProps) {
  const { privacy } = usePrivacy();
  const { data, error } = useTileData(() => api.investmentPortfolio(), SLOW);
  const t = data?.totals;
  // The same coverage floor the Portfolio Overview screen uses: below it, a day
  // move would describe a fraction of the book while reading as the whole.
  const showDay = !!t && t.dayChangeCoverage >= 0.6;

  return (
    <TileFrame
      title={tile.title || 'Investment Portfolio'}
      icon="landmark"
      editing={editing}
      onRemove={onRemove}
      status={data ? <span style={stamp}>{data.holdings.length} holdings</span> : null}
      footer="Informational only — a tracker, not investment advice."
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && t && (
        <>
          <TileStat
            label="Portfolio value"
            value={privacy ? HIDDEN : money(t.value)}
            sub={showDay ? <span style={{ color: plColor(t.dayChange) }}>{signedMoney(privacy ? null : t.dayChange)} today</span> : null}
          />
          <TileRow
            label="Market gain"
            value={privacy ? HIDDEN : signedMoney(t.gain)}
            color={plColor(t.gain)}
            strong
          />
          {t.gainPct != null && <TileRow label="Return" value={pct(t.gainPct)} color={plColor(t.gainPct)} />}
          <TileRow label="Cash" value={privacy ? HIDDEN : money(t.cash)} />
          {data.allocation.byClass.slice(0, 3).map((b) => (
            <TileRow key={b.key} label={b.label} value={`${b.pct.toFixed(0)}%`} />
          ))}
          {/* Never silently understated: an unpriced holding is excluded from
              every total, so the tile says how much it could not see. */}
          {t.unpricedCount > 0 && (
            <div style={noteLine}>
              {t.unpricedCount} holding{t.unpricedCount === 1 ? '' : 's'} not priced, and excluded from the total.
            </div>
          )}
        </>
      )}
    </TileFrame>
  );
}

// ---- To Do --------------------------------------------------------------

export function TodoTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { data, error } = useTileData(() => api.getTodo(), MEDIUM);
  const limit = tile.limit ?? 8;

  const sections = data?.sections ?? [];
  const chosen = tile.todoSectionId && tile.todoSectionId !== 'all'
    ? sections.filter((s) => s.id === tile.todoSectionId)
    : sections;
  const items = chosen.flatMap((s) => s.items.filter((i) => !i.done).map((i) => ({ ...i, section: s.title })));
  const shown = items.slice(0, limit);

  return (
    <TileFrame
      title={tile.title || 'To Do'}
      icon="list-todo"
      count={data ? items.length : null}
      editing={editing}
      onRemove={onRemove}
      controls={
        <TileSelect
          value={tile.todoSectionId ?? 'all'}
          onChange={(v) => onChange({ todoSectionId: v })}
          title="Which list to show"
          options={[{ value: 'all', label: 'Every list' }, ...sections.map((s) => ({ value: s.id, label: s.title }))]}
        />
      }
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && items.length === 0 && <TileMessage>{"Nothing open."}</TileMessage>}
      {shown.map((i) => (
        <div key={i.id} style={itemRow}>
          <span style={{ color: i.overdue ? RED : i.dueToday ? GOLD : FAINT, fontSize: 12, lineHeight: 1, flex: 'none' }}>
            {i.overdue ? '●' : '○'}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.4 }}>{i.text}</div>
            <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2 }}>{i.section}</div>
          </div>
          {i.timer && <span style={{ fontSize: 9.5, color: MUTED, fontFamily: MONO, flex: 'none' }}>{i.timer}</span>}
        </div>
      ))}
      {items.length > shown.length && <div style={noteLine}>{items.length - shown.length} more.</div>}
    </TileFrame>
  );
}

// ---- Notes --------------------------------------------------------------
//
// A scratchpad saved with the board rather than in a table of its own. A board
// is already per-user JSON, so this needs no migration; the trade-off, stated
// plainly, is that the note belongs to the board it sits on.
export function NotesTile({ tile, editing, onChange, onRemove }: TileProps) {
  // Held locally while typing so every keystroke does not re-render the whole
  // grid; the board picks it up on blur, which is also when it becomes unsaved
  // work rather than on each character.
  const [draft, setDraft] = useState(tile.noteText ?? '');

  return (
    <TileFrame title={tile.title || 'Notes'} icon="pencil" editing={editing} onRemove={onRemove}>
      <textarea
        className="no-drag"
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
        onBlur={() => {
          if (draft !== (tile.noteText ?? '')) onChange({ noteText: draft });
        }}
        placeholder="…"
        style={noteArea}
      />
    </TileFrame>
  );
}

// ---- Announcements ------------------------------------------------------

export function AnnouncementsTile({ tile, editing, onRemove }: TileProps) {
  const { data, error } = useTileData(() => api.announcements(), SLOW);
  const shown = (data?.announcements ?? []).slice(0, tile.limit ?? 8);

  return (
    <TileFrame
      title={tile.title || 'Announcements'}
      icon="megaphone"
      count={data ? data.announcements.length : null}
      editing={editing}
      onRemove={onRemove}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && shown.length === 0 && <TileMessage>{"No announcements yet."}</TileMessage>}
      {shown.map((a) => (
        <div key={a.id} style={feedRow}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', lineHeight: 1.35 }}>{a.title}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: FAINT, fontFamily: MONO, flex: 'none' }}>
              {fmtRelative(a.createdAt)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#b8c6e6', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</div>
          <div style={{ fontSize: 9.5, color: FAINT, marginTop: 4 }}>{a.author}</div>
        </div>
      ))}
    </TileFrame>
  );
}

// ---- What's new (patch notes) -------------------------------------------

export function PatchNotesTile({ tile, editing, onRemove }: TileProps) {
  const { data, error } = useTileData(() => api.patchNotes(), SLOW);
  const shown = (data?.notes ?? []).slice(0, tile.limit ?? 5);

  return (
    <TileFrame title={tile.title || "What's New"} icon="file-text" editing={editing} onRemove={onRemove}>
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && shown.length === 0 && <TileMessage>{"No release notes yet."}</TileMessage>}
      {shown.map((n) => (
        <div key={n.id} style={feedRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={versionPill}>{n.version}</span>
            {n.dateLabel && <span style={{ fontSize: 9.5, color: FAINT, fontFamily: MONO }}>{n.dateLabel}</span>}
          </div>
          {n.notes.map((it, k) => (
            <div key={k} style={{ fontSize: 11.5, color: '#cdd9f3', lineHeight: 1.5, marginBottom: 2 }}>
              · {it}
            </div>
          ))}
        </div>
      ))}
    </TileFrame>
  );
}

// ---- A tiny inline sparkline -------------------------------------------
//
// Drawn as a plain SVG polyline rather than pulling in a chart library for one
// 40px trace. Flat series get a mid-height line instead of a divide by zero.
function Sparkline({ points }: { points: number[] }) {
  const w = 100;
  const h = 28;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = span === 0 ? h / 2 : h - ((p - lo) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const rising = points[points.length - 1] >= points[0];
  return (
    <div style={{ padding: '0 14px 10px' }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 30, display: 'block' }}>
        <path d={d} fill="none" stroke={rising ? GREEN : RED} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const stamp: CSSProperties = { fontSize: 10, color: FAINT, whiteSpace: 'nowrap' };
const noteLine: CSSProperties = {
  padding: '8px 14px',
  fontSize: 10.5,
  color: FAINT,
  lineHeight: 1.5,
  borderTop: `1px solid rgba(22,41,79,.55)`,
};
const itemRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  padding: '8px 12px',
  borderBottom: `1px solid rgba(22,41,79,.5)`,
};
const feedRow: CSSProperties = { padding: '9px 12px', borderBottom: `1px solid rgba(22,41,79,.5)` };
const versionPill: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: GOLD,
  border: `1px solid rgba(235,203,116,.4)`,
  borderRadius: 5,
  padding: '1px 6px',
  fontFamily: MONO,
};
const noteArea: CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  resize: 'none',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: TEXT,
  fontSize: 12.5,
  lineHeight: 1.6,
  fontFamily: 'inherit',
  padding: '11px 13px',
  display: 'block',
  borderTop: `1px solid ${BORDER}`,
};
