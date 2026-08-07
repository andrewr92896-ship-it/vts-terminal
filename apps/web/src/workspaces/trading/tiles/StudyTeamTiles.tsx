import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { useNowTick } from '../../../hooks/useNowTick';
import type { Flashcard } from '../../../api/types';
import { BORDER2, FAINT, GOLD, GREEN, MONO, MUTED, TEXT } from '../tvChart';
import { fmtRelative } from '../newsFormat';
import { deckGameKey, deckLifetimeAccuracy, parseDeckGame } from '../../studies/studyEngine';
import { overallLevel } from '../../studies/gameEngine';
import { TileFrame, TileMessage, TileRow, TileSelect, TileStat, useTileData } from './TileFrame';
import type { TileProps } from './PersonalTiles';

// The Studies and Team tiles.

const SLOW = 300_000;
const CHAT_POLL = 30_000;

// The study surfaces all carry `StudyDisclaimer`, for a reason that applies here
// too: study content is team-built and may teach *about* a third party's method,
// brand or name. A tile that puts a flashcard on the board is showing that same
// content, so it makes the same statement — shortened to fit a tile footer,
// never dropped.
const STUDY_NOTE = 'Educational content only — not financial, investment, legal or tax advice.';

// ---- Study progress ------------------------------------------------------
//
// Level, streak and accuracy on one study game. The per-deck state is a
// per-device localStorage record (studyEngine.ts) rather than a server reading,
// so the tile reads it the same way the study screens do — through
// `deckGameKey` / `parseDeckGame`, never by hand-rolling the key, which is what
// keeps the wall and the game agreeing about a level.
export function StudyStatsTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { user } = useAuth();
  const { data, error } = useTileData('studies:decks', () => api.studyDecks(), SLOW);
  // Re-read the stored progress periodically: playing a game writes to
  // localStorage, and the tile should catch up without a reload.
  const tick = useNowTick(20_000);

  const decks = data?.decks ?? [];
  const deck = decks.find((d) => d.id === tile.deckId) ?? decks[0];

  const state = useMemo(() => {
    if (!deck || !user?.id) return null;
    try {
      return parseDeckGame(localStorage.getItem(deckGameKey(user.id, deck.id)), deck.categories);
    } catch {
      // Storage unavailable (private browsing, a locked-down browser) — the tile
      // simply has no progress to show, which is true.
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, user?.id, tick]);

  const level = state ? overallLevel(state.totalCorrect) : null;
  const accuracy = state ? deckLifetimeAccuracy(state) : null;

  return (
    <TileFrame
      title={tile.title || 'Study Progress'}
      icon="gamepad-2"
      editing={editing}
      onRemove={onRemove}
      controls={
        <TileSelect
          value={deck?.id ?? ''}
          onChange={(v) => onChange({ deckId: v })}
          title="Which study game"
          options={decks.map((d) => ({ value: d.id, label: d.name }))}
        />
      }
      status={deck ? <span style={stamp}>{deck.name}</span> : null}
      footer={STUDY_NOTE}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && !deck && <TileMessage>{"No study games yet."}</TileMessage>}
      {deck && !state && <TileMessage>Not played yet — {deck.questionCount} questions ready.</TileMessage>}
      {deck && state && level && (
        <>
          <TileStat
            label={`Level ${level.mainIndex + 1} · ${level.main.name}`}
            value={
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                <span>{level.sub}</span>
                <span style={{ fontSize: 13, color: GOLD, letterSpacing: 1 }}>{level.stars}</span>
              </span>
            }
            sub={level.isMax ? 'Top of the ladder.' : `${level.toNext} correct to the next sub-level`}
          />
          <TileRow label="Correct answers" value={state.totalCorrect} strong />
          <TileRow label="Best streak" value={state.bestStreak} color={GOLD} />
          {accuracy != null && (
            <TileRow label="Accuracy" value={`${accuracy.toFixed(0)}%`} color={accuracy >= 70 ? GREEN : TEXT} />
          )}
          <TileRow label="Questions" value={deck.questionCount} />
        </>
      )}
    </TileFrame>
  );
}

// ---- Flashcards ----------------------------------------------------------
//
// One card from a set, turned over on the board. Deliberately a single card
// rather than a list: a list of terms beside their definitions is a document,
// and the whole point of a flashcard is that the answer is hidden until you
// have tried to recall it.
export function FlashcardsTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { data, error } = useTileData('studies:flashcardSets', () => api.studyFlashcardSets(), SLOW);
  const sets = data?.sets ?? [];
  const set = sets.find((s) => s.id === tile.deckId) ?? sets[0];

  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);

  // Pull the chosen set's cards. Kept separate from the list poll: the list is
  // small and cheap, the cards are only needed for the one set on screen.
  useEffect(() => {
    let alive = true;
    if (!set) {
      setCards(null);
      return;
    }
    void api
      .studyFlashcardSet(set.id)
      .then((r) => {
        if (!alive) return;
        setCards(r.set.cards);
        setAt(0);
        setShown(false);
      })
      .catch(() => {
        if (alive) setCards(null);
      });
    return () => {
      alive = false;
    };
  }, [set?.id]);

  const card = cards && cards.length > 0 ? cards[at % cards.length] : null;

  return (
    <TileFrame
      title={tile.title || 'Flashcards'}
      icon="copy"
      count={cards ? `${(at % (cards.length || 1)) + 1}/${cards.length}` : null}
      editing={editing}
      onRemove={onRemove}
      controls={
        <TileSelect
          value={set?.id ?? ''}
          onChange={(v) => onChange({ deckId: v })}
          title="Which set"
          options={sets.map((s) => ({ value: s.id, label: s.name }))}
        />
      }
      status={set ? <span style={stamp}>{set.name}</span> : null}
      footer={STUDY_NOTE}
      bodyStyle={{ display: 'flex', flexDirection: 'column' }}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && !set && <TileMessage>{"No flashcard sets yet."}</TileMessage>}
      {set && !card && <TileMessage>{"Loading cards…"}</TileMessage>}
      {card && (
        <>
          <div
            className="no-drag"
            onClick={() => setShown((v) => !v)}
            style={cardFace}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setShown((v) => !v);
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.6px', color: FAINT, marginBottom: 8 }}>
              {shown ? 'DEFINITION' : 'TERM'}
            </div>
            <div style={{ fontSize: shown ? 12.5 : 15, fontWeight: shown ? 500 : 700, color: '#fff', lineHeight: 1.5 }}>
              {shown ? card.def : card.term}
            </div>
            {card.topic && <div style={{ fontSize: 10, color: FAINT, marginTop: 9 }}>{card.topic}</div>}
          </div>
          <div style={cardBar}>
            <button className="no-drag" onClick={() => setShown((v) => !v)} style={cardBtn}>
              {shown ? 'Hide' : 'Reveal'}
            </button>
            <button
              className="no-drag"
              onClick={() => {
                setAt((v) => v + 1);
                setShown(false);
              }}
              style={cardBtn}
            >
              {"Next"}
            </button>
          </div>
        </>
      )}
    </TileFrame>
  );
}

// ---- Study leaderboard ---------------------------------------------------
//
// Where you stand on one of the terminal's built-in study games, against every
// other player on the install. Live rows and banked runs both come back from the
// same endpoint; the tile shows them in score order the way the game's own
// leaderboard does, with the reader's row marked.
//
// The picker lists ONLY built-in games (owner decision, 2026-08): a game somebody
// made has no leaderboard at all, and offering one in the dropdown would put an
// endpoint that answers 404 behind every selection.
export function LeaderboardTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { data: deckList } = useTileData('studies:decks', () => api.studyDecks(), SLOW);
  const decks = (deckList?.decks ?? []).filter((d) => d.isSample);
  const deck = decks.find((d) => d.id === tile.deckId) ?? decks[0];

  // The key names the deck, not just the endpoint: two leaderboard tiles set to
  // different games must not share one answer. `no-deck` keeps the key stable
  // (and therefore the shared entry harmless) before the deck list arrives.
  const { data, error } = useTileData(
    `studies:leaderboard:${deck?.id ?? 'no-deck'}`,
    () => (deck ? api.studyDeckLeaderboard(deck.id) : Promise.resolve({ entries: [] })),
    CHAT_POLL,
    [deck?.id],
  );

  const rows = useMemo(
    () => [...(data?.entries ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, tile.limit ?? 8),
    [data, tile.limit],
  );

  return (
    <TileFrame
      title={tile.title || 'Study Leaderboard'}
      icon="trophy"
      count={data ? data.entries.length : null}
      editing={editing}
      onRemove={onRemove}
      controls={
        <TileSelect
          value={deck?.id ?? ''}
          onChange={(v) => onChange({ deckId: v })}
          title="Which study game"
          options={decks.map((d) => ({ value: d.id, label: d.name }))}
        />
      }
      status={deck ? <span style={stamp}>{deck.name}</span> : null}
      footer={STUDY_NOTE}
    >
      {!deckList && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {deckList && !deck && <TileMessage>{"No study games yet."}</TileMessage>}
      {deck && data && rows.length === 0 && <TileMessage>{"Nobody has played this one yet."}</TileMessage>}
      {rows.map((e, i) => (
        <div key={e.id} style={{ ...msgRow, display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: i === 0 ? GOLD : FAINT, fontFamily: MONO, flex: '0 0 16px' }}>
            {i + 1}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: e.isMe ? 700 : 500,
                color: e.isMe ? GOLD : TEXT,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {e.name}
              {e.archived && <span style={{ fontSize: 9, color: FAINT, marginLeft: 5 }}>past run</span>}
            </div>
            <div style={{ fontSize: 9.5, color: FAINT, marginTop: 1 }}>
              {e.correct}/{e.attempted} correct
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: '#fff', flex: 'none' }}>
            {e.score == null ? '—' : `${e.score.toFixed(0)}%`}
          </span>
        </div>
      ))}
    </TileFrame>
  );
}

// ---- Team chat -----------------------------------------------------------
//
// The desk's latest messages. Read-only on the wall: the corner chat bubble is
// where a message is written, and putting a second composer on a draggable tile
// would mean two places that can send, with the tile's the one that scrolls away
// mid-sentence.
export function TeamChatTile({ tile, editing, onRemove }: TileProps) {
  const { data, error } = useTileData('team:chat', () => api.teamChat(), CHAT_POLL);
  const limit = tile.limit ?? 8;
  // Newest last, the way a conversation reads, but only the tail of it.
  const messages = (data?.messages ?? []).slice(-limit);

  return (
    <TileFrame
      title={tile.title || 'Group Chat'}
      icon="message-square"
      editing={editing}
      onRemove={onRemove}
      status={data?.teamName ? <span style={stamp}>{data.teamName}</span> : null}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && !data.eligible && <TileMessage>{"Group chat is not available for this account."}</TileMessage>}
      {data && data.eligible && messages.length === 0 && <TileMessage>{"No messages yet."}</TileMessage>}
      {messages.map((m) => (
        <div key={m.id} style={msgRow}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: GOLD }}>{m.author}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: FAINT, fontFamily: MONO, flex: 'none' }}>
              {fmtRelative(m.createdAt)}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#cdd9f3', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {m.body}
          </div>
        </div>
      ))}
    </TileFrame>
  );
}

const stamp: CSSProperties = {
  fontSize: 10,
  color: FAINT,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 120,
};
const msgRow: CSSProperties = { padding: '8px 12px', borderBottom: `1px solid rgba(22,41,79,.5)` };
const cardFace: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '16px 18px',
  cursor: 'pointer',
};
const cardBar: CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  gap: 7,
  padding: '8px 10px',
  borderTop: `1px solid ${BORDER2}`,
};
const cardBtn: CSSProperties = {
  flex: 1,
  fontSize: 11,
  fontWeight: 600,
  color: MUTED,
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
