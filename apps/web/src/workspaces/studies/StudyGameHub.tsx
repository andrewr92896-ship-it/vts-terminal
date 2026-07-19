import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { EditableText } from '../../copy/SiteCopy';
import { useResponsive } from '../../hooks/useMediaQuery';
import { TeamStudyGame } from './TeamStudyGame';
import { DeckTestMode } from './DeckTestMode';
import { DeckProgress } from './DeckProgress';
import { consumeStudyDeck } from './studiesNav';

// What this section does with the game the learner picks.
export type StudyTarget = 'play' | 'test' | 'progress';
type Selection = { id: string; view: StudyTarget } | null;

const COPY: Record<StudyTarget, { title: string; blurb: string; action: string; empty: string }> = {
  play: {
    title: 'Study Game',
    blurb: 'Pick a game to play. Build your own in Study Creation.',
    action: 'Play',
    empty: 'Build your first study game in Study Creation — AI-generated from a topic, or from a file you upload — and it shows up here to play.',
  },
  test: {
    title: 'Practice Tests',
    blurb: 'Pick a game to test yourself on — a graded practice test drawn from its questions.',
    action: 'Practice test',
    empty: 'Build a study game in Study Creation and you can sit a graded practice test on it here.',
  },
  progress: {
    title: 'Progress',
    blurb: 'Pick a game to see your level, accuracy, and best run.',
    action: 'View progress',
    empty: 'Build and play a study game in Study Creation to start tracking your progress here.',
  },
};

// The launcher shared by the Study Game, Test Mode, and Progress sections: a
// picker of every study game the learner's team built in Study Creation. Picking
// one opens the chosen experience (play / test / progress) for that game. Games
// are created in Study Creation and consumed here. A deep-link (a deck's Play
// button in Study Creation) skips the picker and opens its game directly.
export function StudyGameHub({
  theme,
  target,
  onNavigate,
}: {
  theme: Theme;
  target: StudyTarget;
  onNavigate: (screen: string) => void;
}) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);
  const muted = '#a99ff0';
  const copy = COPY[target];

  const [decks, setDecks] = useState<TeamDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // A deep-linked deck (from Study Creation's Play button) opens straight into
  // play, regardless of which section this is.
  const [selection, setSelection] = useState<Selection>(() => {
    const deckId = consumeStudyDeck();
    return deckId ? { id: deckId, view: 'play' } : null;
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

  if (selection) {
    const back = () => setSelection(null);
    if (selection.view === 'test') return <DeckTestMode theme={theme} deckId={selection.id} onBack={back} />;
    if (selection.view === 'progress')
      return (
        <DeckProgress
          theme={theme}
          deckId={selection.id}
          onBack={back}
          onPlay={() => setSelection({ id: selection.id, view: 'play' })}
        />
      );
    return <TeamStudyGame theme={theme} deckId={selection.id} onBack={back} />;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
          <EditableText id={`studygame.${target}.title`} text={copy.title} />
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          <EditableText id={`studygame.${target}.blurb`} text={copy.blurb} />
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '0 0 10px' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>
          <EditableText id="studygame.games_heading" text="Your team’s study games" />
        </h3>
        <button onClick={() => onNavigate('st_decks')} style={ghostBtn(theme)}>
          <EditableText id="studygame.create_btn" text="✦ Create a study game" />
        </button>
      </div>

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          <EditableText id="studygame.loading" text="Loading your team’s study games…" />
        </div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          <EditableText id="studygame.load_error" text="Couldn’t load your team’s study games. Try again in a moment." />
        </div>
      ) : decks.length === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            <EditableText id="studygame.empty_title" text="No study games yet" />
          </div>
          <div style={{ fontSize: 12.5, color: muted, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            <EditableText id={`studygame.${target}.empty`} text={copy.empty} />
          </div>
          <button onClick={() => onNavigate('st_decks')} style={{ ...primaryBtn(theme, accentGrad), marginTop: 16 }}>
            <EditableText id="studygame.open_creation" text="Open Study Creation" />
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
              action={copy.action}
              onPick={() => setSelection({ id: d.id, view: target })}
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
  action,
  onPick,
}: {
  deck: TeamDeck;
  theme: Theme;
  muted: string;
  action: string;
  onPick: () => void;
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
        <button onClick={onPick} disabled={deck.questionCount === 0} style={{ ...primaryBtn(theme, accentGradient(theme)), minHeight: 38, opacity: deck.questionCount === 0 ? 0.6 : 1 }}>
          {action}
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
