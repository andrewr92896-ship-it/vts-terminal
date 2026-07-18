import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { StudyGame } from './StudyGame';
import { TeamStudyGame } from './TeamStudyGame';
import { consumeStudyDeck, peekStudyView } from './studiesNav';
import {
  SERIES65_QUESTION_COUNT,
  SERIES65_TOPICS,
  SERIES65_VOCAB_COUNT,
} from './series65Meta';

// What the learner has chosen to play. `null` shows the picker; a selection
// renders that game with a back path to the picker.
type Selection = { kind: 'series65' } | { kind: 'deck'; id: string } | null;

// The Study Game section: a picker of every game the learner can play — the
// built-in Series 65 track (owner's team only) plus the team's own study games
// built in Study Creation. Games are created in Study Creation and *played*
// here. Deep-links (Study Hub / Progress "Play the Study Game", or a deck's
// Play button in Study Creation) skip the picker and open their game directly.
export function StudyGameHub({
  theme,
  canSeries65,
  onNavigate,
}: {
  theme: Theme;
  canSeries65: boolean;
  onNavigate: (screen: string) => void;
}) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);
  const muted = '#a99ff0';

  const [decks, setDecks] = useState<TeamDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Seed the selection from any deep-link: a requested deck opens straight away;
  // a pending Series 65 view (quiz/test/flashcards) drops into that game, which
  // consumes the view itself on mount.
  const [selection, setSelection] = useState<Selection>(() => {
    const deckId = consumeStudyDeck();
    if (deckId) return { kind: 'deck', id: deckId };
    if (canSeries65 && peekStudyView()) return { kind: 'series65' };
    return null;
  });

  useEffect(() => {
    let alive = true;
    api
      .studyDecks()
      .then((r) => {
        if (!alive) return;
        setDecks(r.decks);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (selection?.kind === 'series65') {
    return <StudyGame theme={theme} onBack={() => setSelection(null)} />;
  }
  if (selection?.kind === 'deck') {
    return <TeamStudyGame theme={theme} deckId={selection.id} onBack={() => setSelection(null)} />;
  }

  const hasGames = canSeries65 || decks.length > 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Study Game</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          Pick a game to play. Build your own in <strong>Study Creation</strong>.
        </p>
      </div>

      {/* Series 65 — the built-in track, owner's team only. */}
      {canSeries65 && (
        <div style={{ ...card(theme), borderLeft: `3px solid ${theme.accent}`, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>Series 65</h3>
            <span style={badge(theme)}>Built in</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#d7ccff', lineHeight: 1.55 }}>
            The self-quiz across the four exam areas, weighted to the real exam. Level up as you answer,
            drill custom subsections, and track your accuracy against the pass line.
          </p>
          <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
            {SERIES65_QUESTION_COUNT} questions · {SERIES65_TOPICS.length} topics · {SERIES65_VOCAB_COUNT} flashcards
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setSelection({ kind: 'series65' })} style={primaryBtn(theme, accentGrad)}>
              Play Series 65
            </button>
          </div>
        </div>
      )}

      {/* Team study games — built in Study Creation, played here. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '18px 0 10px' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Your team’s study games</h3>
        <button onClick={() => onNavigate('st_decks')} style={ghostBtn(theme)}>
          ✦ Create a study game
        </button>
      </div>

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>Loading your team’s study games…</div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          Couldn’t load your team’s study games. Try again in a moment.
        </div>
      ) : decks.length === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No team study games yet</div>
          <div style={{ fontSize: 12.5, color: muted, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            {hasGames
              ? 'Build one in Study Creation — AI-generated from a topic, or from a file you upload — and it shows up here to play.'
              : 'Build your first one in Study Creation — AI-generated from a topic, or from a file you upload — and it shows up here to play.'}
          </div>
          <button onClick={() => onNavigate('st_decks')} style={{ ...primaryBtn(theme, accentGrad), marginTop: 16 }}>
            Open Study Creation
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
          {decks.map((d) => (
            <GameCard
              key={d.id}
              deck={d}
              theme={theme}
              muted={muted}
              onPlay={() => setSelection({ kind: 'deck', id: d.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({
  deck,
  theme,
  muted,
  onPlay,
}: {
  deck: TeamDeck;
  theme: Theme;
  muted: string;
  onPlay: () => void;
}) {
  const sourceLabel = deck.source === 'ai_topic' ? 'AI-generated' : deck.source === 'upload' ? 'From a file' : 'Sample';
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{deck.name}</h3>
        <span style={badge(theme)}>{sourceLabel}</span>
      </div>
      {deck.description && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#d7ccff', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {deck.description}
        </p>
      )}
      <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
        {deck.questionCount} question{deck.questionCount === 1 ? '' : 's'}
        {deck.categories.length > 0 && ` · ${deck.categories.slice(0, 3).join(' · ')}`}
        {deck.createdByName && ` · by ${deck.createdByName}`}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={onPlay} disabled={deck.questionCount === 0} style={{ ...primaryBtn(theme, accentGradient(theme)), minHeight: 38, opacity: deck.questionCount === 0 ? 0.6 : 1 }}>
          Play
        </button>
      </div>
    </div>
  );
}

function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '18px 18px',
  };
}

function badge(theme: Theme): CSSProperties {
  return {
    flex: 'none',
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: theme.accent,
    border: `1px solid ${theme.accent}`,
    borderRadius: 5,
    padding: '2px 6px',
  };
}

function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontSize: 13,
    fontWeight: 700,
    padding: '11px 18px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}

function ghostBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 13,
    fontWeight: 600,
    padding: '9px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };
}
