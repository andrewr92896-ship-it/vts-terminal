import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';
import { ScreenTitle } from './ScreenTitle';
import {
  AMBER,
  BORDER,
  BORDER2,
  CARD,
  CONFIDENCE_STATED,
  DIRECTION_LABEL,
  FAINT,
  GOLD,
  GREEN,
  INPUT_BG,
  MUTED,
  OUTCOME,
  PANEL,
  RED,
  TEXT,
  noteStamp,
  pill,
  weekLabel,
} from './notesFormat';
import type {
  NoteDirection,
  NoteInput,
  NoteKind,
  NoteOutcome,
  NoteTradeLink,
  NotesData,
  TradingNote,
} from '../../api/types';

// Trading Notes — the week board, what you still owe an answer on, your own
// record, and the observations feed.
//
// The three rules the server enforces are the three things this screen has to
// SHOW, or the feature reads as a notes app that occasionally refuses an edit:
//
//   1. A published call is frozen — so a locked call says so, with the reason.
//   2. Nobody sees a call before its window opens — so an unrevealed call of
//      your own says it is still sealed, rather than looking broken.
//   3. A call that could not be settled is never scored — so `unsettleable` is
//      drawn neutral, counted apart from the hit rate, and says why.

const REFRESH_MS = 60_000;

const btn: CSSProperties = {
  padding: '7px 13px',
  borderRadius: 9,
  border: `1px solid ${BORDER2}`,
  background: 'transparent',
  color: TEXT,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
};
const goldBtn: CSSProperties = { ...btn, background: GOLD, borderColor: GOLD, color: '#1b1403', fontWeight: 700 };
const input: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${BORDER2}`,
  background: INPUT_BG,
  color: TEXT,
  fontSize: 13,
  boxSizing: 'border-box',
};
const label: CSSProperties = { fontSize: 11, color: FAINT, fontWeight: 700, letterSpacing: '.04em', marginBottom: 5 };
const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };
const section: CSSProperties = { ...card, marginBottom: 16 };

export function TradingNotes() {
  const { user } = useAuth();
  const readOnly = user?.username === 'demo';

  const [data, setData] = useState<NotesData | null>(null);
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState<NoteKind | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.tradingNotes(week));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load your notes');
    }
  }, [week]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  async function run<T>(p: Promise<T>): Promise<boolean> {
    setBusy(true);
    try {
      await p;
      await load();
      setErr(null);
      return true;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'That did not save');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const links = useMemo(() => {
    const m = new Map<string, NoteTradeLink>();
    for (const l of data?.tradeLinks ?? []) m.set(l.noteId, l);
    return m;
  }, [data]);

  if (err && !data) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading your notes…</div>;

  const { week: board, queue, stats, observations } = data;
  const mine = board.notes.filter((n) => n.isMine && n.kind === 'prediction');
  const theirs = board.notes.filter((n) => !n.isMine && n.kind === 'prediction');

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <ScreenTitle>Trading Notes</ScreenTitle>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            What you think the market does next, written down before it does — and what you make of it afterwards.
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn} onClick={() => setComposing(composing === 'observation' ? null : 'observation')}>
              + Observation
            </button>
            <button style={goldBtn} onClick={() => setComposing(composing === 'prediction' ? null : 'prediction')}>
              + Prediction
            </button>
          </div>
        )}
      </div>

      {err && (
        <div
          onClick={() => setErr(null)}
          style={{
            ...card,
            borderColor: RED,
            color: RED,
            fontSize: 12.5,
            marginBottom: 14,
            cursor: 'pointer',
          }}
        >
          {err} — click to dismiss.
        </div>
      )}

      {composing && (
        <Composer
          kind={composing}
          weekKey={board.weekKey}
          busy={busy}
          onCancel={() => setComposing(null)}
          onSave={async (input) => {
            const ok = await run(api.createNote({ ...input, kind: composing, title: input.title ?? '' }));
            if (ok) setComposing(null);
          }}
        />
      )}

      {queue.length > 0 && <Queue notes={queue} busy={busy} readOnly={readOnly} run={run} />}

      {/* ---- The week board ---- */}
      <div style={section}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>
              Week of {weekLabel(board.startsOn, board.endsOn)}
              {board.isCurrent && <span style={{ ...pill(GOLD), marginLeft: 8 }}>This week</span>}
            </div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 4 }}>
              Calls run Monday to Friday, Eastern.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btn} onClick={() => setWeek(board.prevWeek)}>
              ← Previous
            </button>
            {!board.isCurrent && (
              <button style={btn} onClick={() => setWeek(undefined)}>
                This week
              </button>
            )}
            <button style={btn} onClick={() => setWeek(board.nextWeek)}>
              Next →
            </button>
          </div>
        </div>

        <div style={{ ...label, marginBottom: 8 }}>YOUR CALLS</div>
        {mine.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 16 }}>
            No calls for this week yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {mine.map((n) => (
              <NoteCard key={n.id} note={n} link={links.get(n.id)} busy={busy} readOnly={readOnly} run={run} />
            ))}
          </div>
        )}

        <div style={{ ...label, marginBottom: 8 }}>YOUR GROUP</div>
        {theirs.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTED }}>
            {/* Deliberately says which of the two reasons this is empty. "Nothing
                here" on a blind board is indistinguishable from a broken one. */}
            Nobody in your group has a call showing for this week. Calls stay sealed until their window opens.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {theirs.map((n) => (
              <NoteCard key={n.id} note={n} busy={busy} readOnly run={run} />
            ))}
          </div>
        )}
      </div>

      {/* ---- Your record ---- */}
      <Record stats={stats} />

      {/* ---- Observations ---- */}
      <div style={section}>
        <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Observations</div>
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          Notes with no verdict owed — what you saw, kept in order.
        </div>
        {observations.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTED }}>Nothing written down yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {observations.map((n) => (
              <div key={n.id} style={{ ...card, background: PANEL, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap' }}>
                    {n.isMine ? 'You' : n.owner} · {noteStamp(n.createdAt)}
                  </div>
                </div>
                {n.body && (
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {n.instrument && <span style={pill(MUTED)}>{n.instrument}</span>}
                  {n.isMine && !readOnly && (
                    <ShareToggle note={n} busy={busy} run={run} />
                  )}
                  {n.isMine && !readOnly && (
                    <button
                      style={{ ...btn, padding: '3px 9px', fontSize: 11, borderColor: BORDER }}
                      disabled={busy}
                      onClick={() => void run(api.removeNote(n.id))}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Advice-flavoured surface: a screen of market calls, some of them other
          people's. Required, and deliberately the only such line here. */}
      <div style={{ fontSize: 11, color: FAINT, textAlign: 'center', padding: '4px 0 20px' }}>
        Trading Notes are a personal record, not a recommendation. Informational only, not investment advice.
      </div>
    </div>
  );
}

// ---- What you still owe an answer on ----
//
// Red while open, matching the Administrator Log's colour rule: this is the one
// thing on the screen that is actually waiting on somebody.
function Queue({
  notes,
  busy,
  readOnly,
  run,
}: {
  notes: TradingNote[];
  busy: boolean;
  readOnly: boolean;
  run: <T>(p: Promise<T>) => Promise<boolean>;
}) {
  return (
    <div style={{ ...section, borderColor: RED }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4, color: RED }}>
        Waiting on you ({notes.length})
      </div>
      <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
        A call is only worth making if you come back to it.
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} busy={busy} readOnly={readOnly} run={run} />
        ))}
      </div>
    </div>
  );
}

// ---- Your own record ----
function Record({ stats }: { stats: NotesData['stats'] }) {
  const excluded = stats.partial + stats.unsettleable;
  return (
    <div style={section}>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Your record</div>
      <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
        Yours alone — nobody else in your group sees this.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi
          label="Hit rate"
          /* Null rather than 0 when nothing has settled: "0%" reads as "you were
             wrong every time", which is a claim nothing supports. */
          value={stats.hitRate == null ? '—' : `${stats.hitRate.toFixed(0)}%`}
          sub={stats.hitRate == null ? 'Nothing settled yet' : `${stats.hits} of ${stats.scored} calls`}
        />
        <Kpi label="Running" value={String(stats.open)} sub="Not settled yet" />
        <Kpi label="Came true" value={String(stats.hits)} color={GREEN} />
        <Kpi label="Did not" value={String(stats.misses)} color={RED} />
      </div>

      {excluded > 0 && (
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
          {/* The honesty rule, stated where the number is. A call the terminal
              could not price is not a call you got wrong. */}
          {excluded} {excluded === 1 ? 'call is' : 'calls are'} left out of the hit rate
          {stats.partial > 0 && ` — ${stats.partial} settled as partly right`}
          {stats.partial > 0 && stats.unsettleable > 0 && ','}
          {stats.unsettleable > 0 && ` ${stats.unsettleable} could not be settled either way`}.
        </div>
      )}

      <div style={{ ...label, marginBottom: 8 }}>CALIBRATION</div>
      {stats.calibration.length === 0 ? (
        <div style={{ fontSize: 12.5, color: MUTED }}>
          Put a confidence on a call and this shows how often you are right at each level.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 2 }}>
            What you said, against what happened. The gap is the useful part.
          </div>
          {stats.calibration.map((c) => {
            const actual = (c.hits / c.calls) * 100;
            return (
              <div
                key={c.level}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 12.5,
                  padding: '7px 10px',
                  background: PANEL,
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 78 }}>
                  {'●'.repeat(c.level)}
                  <span style={{ color: FAINT }}>{'○'.repeat(5 - c.level)}</span>
                </span>
                <span style={{ color: MUTED }}>You said ~{c.stated}%</span>
                <span style={{ color: FAINT }}>→</span>
                <span style={{ fontWeight: 700, color: actual >= c.stated ? GREEN : AMBER }}>
                  {actual.toFixed(0)}% right
                </span>
                <span style={{ color: FAINT, fontSize: 11.5 }}>
                  ({c.hits} of {c.calls})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label: l, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, background: PANEL, minWidth: 132, flex: '1 1 132px', padding: 12 }}>
      <div style={label}>{l.toUpperCase()}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: color ?? TEXT }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ---- One prediction ----
function NoteCard({
  note: n,
  link,
  busy,
  readOnly,
  run,
}: {
  note: TradingNote;
  link?: NoteTradeLink;
  busy: boolean;
  readOnly: boolean;
  run: <T>(p: Promise<T>) => Promise<boolean>;
}) {
  const [reflecting, setReflecting] = useState(false);
  const [text, setText] = useState(n.reflection ?? '');
  const out = n.outcome ? OUTCOME[n.outcome] : null;

  return (
    <div style={{ ...card, background: PANEL, borderColor: n.awaiting ? RED : BORDER }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{n.title}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            {n.instrument && n.direction ? (
              <>
                <strong style={{ color: n.direction === 'up' ? GREEN : RED }}>
                  {n.instrument} {DIRECTION_LABEL[n.direction].toLowerCase()}
                </strong>
                {n.targetPrice != null && <span> to {n.targetPrice}</span>}
                {n.openPrice != null && <span style={{ color: FAINT }}> · from {n.openPrice}</span>}
              </>
            ) : (
              <span style={{ color: FAINT }}>No instrument — you settle this one yourself.</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {out && <span style={pill(out.color)}>{out.label}</span>}
          {!out && n.awaiting === 'settle' && <span style={pill(RED)}>Needs settling</span>}
          {!out && !n.awaiting && <span style={pill(FAINT)}>Running</span>}
          {n.awaiting === 'reflect' && <span style={pill(RED)}>Needs a reflection</span>}
          {n.confidence != null && <span style={pill(MUTED)}>~{CONFIDENCE_STATED[n.confidence]}%</span>}
        </div>
      </div>

      {n.body && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8, whiteSpace: 'pre-wrap' }}>{n.body}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 9, fontSize: 11, color: FAINT, flexWrap: 'wrap' }}>
        <span>{n.isMine ? 'You' : n.owner}</span>
        {n.deadlineAt != null && <span>Settles {noteStamp(n.deadlineAt)}</span>}
        {n.locked && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="file-lock-2" size={11} />
            {/* Says WHY it is locked. A control that refuses without a reason
                reads as broken rather than as the point of the feature. */}
            {n.visibility === 'group' ? 'Shared, so the call is fixed' : 'Window opened, so the call is fixed'}
          </span>
        )}
        {n.isMine && !n.revealed && <span>Sealed until {noteStamp(n.windowOpensAt ?? 0)}</span>}
      </div>

      {/* The settlement's own words — including why it could not be settled. */}
      {n.settleNote && (
        <div style={{ fontSize: 12, color: n.outcome === 'unsettleable' ? AMBER : MUTED, marginTop: 8 }}>
          {n.settleNote}
          {n.settledBy === 'auto' && <span style={{ color: FAINT }}> (settled automatically)</span>}
        </div>
      )}

      {/* Did you trade your own call? The reading nothing else gives you. */}
      {link && link.trades > 0 && (
        <div
          style={{
            fontSize: 12,
            marginTop: 8,
            padding: '7px 10px',
            borderRadius: 8,
            background: 'rgba(9,22,51,.6)',
            border: `1px solid ${link.againstCall ? AMBER : BORDER}`,
            color: link.againstCall ? AMBER : MUTED,
          }}
        >
          You took {link.trades} {link.trades === 1 ? 'trade' : 'trades'} in {n.instrument} that week
          {link.longs > 0 && link.shorts > 0
            ? ` (${link.longs} long, ${link.shorts} short)`
            : link.longs > 0
              ? ' (long)'
              : ' (short)'}
          {link.againstCall && ' — against your own call'}
          {link.realizedPl != null && `, ${link.realizedPl >= 0 ? '+' : ''}${link.realizedPl.toFixed(2)} realized`}.
        </div>
      )}

      {n.reflection && !reflecting && (
        <div
          style={{
            fontSize: 12.5,
            marginTop: 9,
            padding: '8px 10px',
            borderLeft: `3px solid ${GOLD}`,
            background: 'rgba(9,22,51,.5)',
            whiteSpace: 'pre-wrap',
            color: TEXT,
          }}
        >
          {n.reflection}
        </div>
      )}

      {n.isMine && !readOnly && (
        <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Settling by hand is offered whenever there is no verdict yet: a
              freeform call has no other route, and an auto-settling one may sit
              here for a pass or two before the watch reaches it. */}
          {n.outcome == null && n.awaiting === 'settle' && (
            <>
              <span style={{ fontSize: 11, color: FAINT }}>How did it go?</span>
              {(['hit', 'partial', 'miss'] as NoteOutcome[]).map((o) => (
                <button
                  key={o}
                  disabled={busy}
                  style={{ ...btn, padding: '4px 10px', fontSize: 11.5, borderColor: OUTCOME[o].color, color: OUTCOME[o].color }}
                  onClick={() => void run(api.settleNote(n.id, o))}
                >
                  {OUTCOME[o].label}
                </button>
              ))}
            </>
          )}
          {!reflecting && (
            <button style={{ ...btn, padding: '4px 10px', fontSize: 11.5 }} onClick={() => setReflecting(true)}>
              {n.reflection ? 'Edit reflection' : 'Add a reflection'}
            </button>
          )}
          {!n.locked && (
            <button
              style={{ ...btn, padding: '4px 10px', fontSize: 11.5, borderColor: BORDER }}
              disabled={busy}
              onClick={() => void run(api.removeNote(n.id))}
            >
              Delete
            </button>
          )}
          <ShareToggle note={n} busy={busy} run={run} />
        </div>
      )}

      {reflecting && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="What actually happened, and what you would do differently."
            style={{ ...input, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
            <button
              style={{ ...goldBtn, padding: '5px 12px', fontSize: 12 }}
              disabled={busy || !text.trim()}
              onClick={async () => {
                if (await run(api.reflectOnNote(n.id, text))) setReflecting(false);
              }}
            >
              Save
            </button>
            <button style={{ ...btn, padding: '5px 12px', fontSize: 12 }} onClick={() => setReflecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Share with the group, or take it back off the board.
//
// The wording says outright that sharing a prediction fixes it — that is the
// one consequence somebody would not expect from a button called "Share".
function ShareToggle({
  note: n,
  busy,
  run,
}: {
  note: TradingNote;
  busy: boolean;
  run: <T>(p: Promise<T>) => Promise<boolean>;
}) {
  const shared = n.visibility === 'group';
  return (
    <button
      disabled={busy}
      title={
        shared
          ? 'Take this off your group’s board. It stays locked.'
          : n.kind === 'prediction'
            ? 'Show your group. A shared call can no longer be edited.'
            : 'Show your group.'
      }
      style={{
        ...btn,
        padding: '4px 10px',
        fontSize: 11.5,
        borderColor: shared ? GOLD : BORDER2,
        color: shared ? GOLD : TEXT,
      }}
      onClick={() => void run(api.setNoteVisibility(n.id, shared ? 'private' : 'group'))}
    >
      {shared ? 'Shared with group' : 'Share with group'}
    </button>
  );
}

// ---- The composer ----
function Composer({
  kind,
  weekKey,
  busy,
  onSave,
  onCancel,
}: {
  kind: NoteKind;
  weekKey: string;
  busy: boolean;
  onSave: (input: NoteInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [instrument, setInstrument] = useState('');
  const [direction, setDirection] = useState<NoteDirection | null>(null);
  const [target, setTarget] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [share, setShare] = useState(false);
  const isPrediction = kind === 'prediction';

  return (
    <div style={{ ...section, borderColor: GOLD }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 12 }}>
        {isPrediction ? 'A call for this week' : 'Something you saw'}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={label}>{isPrediction ? 'THE CALL' : 'THE NOTE'}</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isPrediction ? 'Dollar keeps bidding into Friday' : 'Gold stalled at yesterday’s high again'}
          style={input}
          maxLength={200}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={label}>WHY</div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Your reasoning, so it is there when you look back."
          style={{ ...input, resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '1 1 160px' }}>
          <div style={label}>INSTRUMENT</div>
          <input
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            placeholder="EUR/USD"
            style={input}
            maxLength={40}
          />
        </div>
        {isPrediction && (
          <>
            <div style={{ flex: '1 1 160px' }}>
              <div style={label}>DIRECTION</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['up', 'down'] as NoteDirection[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(direction === d ? null : d)}
                    style={{
                      ...btn,
                      flex: 1,
                      borderColor: direction === d ? (d === 'up' ? GREEN : RED) : BORDER2,
                      color: direction === d ? (d === 'up' ? GREEN : RED) : TEXT,
                    }}
                  >
                    {DIRECTION_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <div style={label}>TARGET (OPTIONAL)</div>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="1.0900"
                inputMode="decimal"
                style={input}
              />
            </div>
          </>
        )}
      </div>

      {isPrediction && (
        <>
          {/* Stated plainly, because it is the one thing that decides whether the
              terminal can settle the call or the trader has to. */}
          <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
            {instrument.trim() && direction
              ? 'This one settles itself against the market on Friday.'
              : 'With an instrument and a direction, this settles itself on Friday. Without them, you settle it.'}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={label}>HOW SURE ARE YOU</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((c) => (
                <button
                  key={c}
                  onClick={() => setConfidence(c)}
                  style={{
                    ...btn,
                    padding: '5px 11px',
                    borderColor: confidence === c ? GOLD : BORDER2,
                    color: confidence === c ? GOLD : TEXT,
                  }}
                >
                  {c}
                </button>
              ))}
              <span style={{ fontSize: 11.5, color: FAINT }}>
                About {CONFIDENCE_STATED[confidence]}% sure
              </span>
            </div>
          </div>
        </>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED, marginBottom: 12 }}>
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
        Share with my group
        {isPrediction && share && (
          <span style={{ color: AMBER, fontSize: 11.5 }}>— a shared call can no longer be edited</span>
        )}
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={goldBtn}
          disabled={busy || !title.trim()}
          onClick={() =>
            void onSave({
              title: title.trim(),
              body: body.trim() || null,
              instrument: instrument.trim() || null,
              direction: isPrediction ? direction : null,
              targetPrice: isPrediction && target.trim() ? Number(target) : null,
              confidence: isPrediction ? confidence : null,
              visibility: share ? 'group' : 'private',
              weekKey,
            })
          }
        >
          Save
        </button>
        <button style={btn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
