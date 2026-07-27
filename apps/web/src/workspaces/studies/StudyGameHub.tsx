import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { TeamStudyGame } from './TeamStudyGame';
import { DeckTestMode } from './DeckTestMode';
import { DeckProgress } from './DeckProgress';
import { StudyDisclaimer } from './StudyDisclaimer';
import { consumeStudyDeck } from './studiesNav';
import { loadAddedSamples, saveAddedSamples } from './sampleGames';

// What this section does with the game the learner picks.
export type StudyTarget = 'play' | 'test' | 'progress';
type Selection = { id: string; view: StudyTarget } | null;
// The two views this hub toggles between: your own picked list, or the gallery
// of built-in portal games you can add to it.
type Mode = 'list' | 'browse';

// Two distinct card colors so the source of a game reads at a glance: games your
// team made (violet) vs. games built into the portal (sky blue).
const CUSTOM_ACCENT = '#a78bfa';
const BUILTIN_ACCENT = '#38bdf8';
const accentFor = (deck: TeamDeck) => (deck.isSample ? BUILTIN_ACCENT : CUSTOM_ACCENT);

const COPY: Record<StudyTarget, { title: string; blurb: string; action: string; empty: string }> = {
  play: {
    title: 'Study Game',
    blurb: 'Pick a game to play. Build your own in Study Creation.',
    action: 'Play',
    empty: 'Browse the built-in games to add ready-made ones, or build your own in Study Creation — AI-generated from a topic, or from a file you upload.',
  },
  test: {
    title: 'Practice Tests',
    blurb: 'Pick a game to test yourself on — a graded practice test drawn from its questions.',
    action: 'Practice test',
    empty: 'Browse the built-in games to add ready-made ones, or build your own in Study Creation, then sit a graded practice test on it here.',
  },
  progress: {
    title: 'Progress',
    blurb: 'Pick a game to see your level, accuracy, and best run.',
    action: 'View progress',
    empty: 'Browse the built-in games to add ready-made ones, or build and play your own in Study Creation to start tracking progress here.',
  },
};

// The launcher shared by the Study Game, Test Mode, and Progress sections: a
// picker of the study games in the learner's list. Games your team builds in
// Study Creation show up here automatically; the example games built into the
// portal live in the Browse gallery until you add them. Picking a game opens the
// chosen experience (play / test / progress). A deep-link (a deck's Play button
// in Study Creation) skips the picker and opens its game directly.
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
  const { user } = useAuth();
  const muted = '#a99ff0';
  const copy = COPY[target];

  const [decks, setDecks] = useState<TeamDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>('list');
  // Which built-in games the learner has added to their own list (device-local).
  const [added, setAdded] = useState<Set<string>>(() => loadAddedSamples(user?.id));
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

  const toggleAdded = (id: string) => {
    setAdded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveAddedSamples(user?.id, next);
      return next;
    });
  };

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

  const builtIn = decks.filter((d) => d.isSample);
  // Your list: everything your team made, plus any built-in games you added.
  const myGames = decks.filter((d) => !d.isSample || added.has(d.id));

  const openGame = (id: string) => setSelection({ id, view: target });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
          {copy.title}
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          {copy.blurb}
        </p>
      </div>

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          {"Loading your study games…"}
        </div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          {"Couldn’t load your study games. Try again in a moment."}
        </div>
      ) : mode === 'browse' ? (
        <>
          <div style={headerRow}>
            <h3 style={sectionHeading}>
              {"Browse study games"}
            </h3>
            <button onClick={() => setMode('list')} style={ghostBtn(theme)}>
              {"← Back to your games"}
            </button>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: muted, maxWidth: 560, lineHeight: 1.5 }}>
            {"Ready-made games built into the portal. Add the ones you want and they’ll show up in your study games."}
          </p>
          {builtIn.length === 0 ? (
            <div style={{ ...card(theme), color: muted, fontSize: 13, textAlign: 'center' }}>
              {"No built-in games are available right now."}
            </div>
          ) : (
            <div style={grid(isPhone)}>
              {builtIn.map((d) => (
                <GameCard
                  key={d.id}
                  deck={d}
                  theme={theme}
                  muted={muted}
                  accent={accentFor(d)}
                  action={copy.action}
                  onPick={() => openGame(d.id)}
                  addState={{ added: added.has(d.id), onToggle: () => toggleAdded(d.id) }}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={headerRow}>
            <h3 style={sectionHeading}>
              {"Your study games"}
            </h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setMode('browse')} style={ghostBtn(theme)}>
                {"Browse Study Games"}
              </button>
              <button onClick={() => onNavigate('st_decks')} style={ghostBtn(theme)}>
                {"✦ Create a study game"}
              </button>
            </div>
          </div>

          {myGames.length === 0 ? (
            <div style={{ ...card(theme), textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                {"No study games yet"}
              </div>
              <div style={{ fontSize: 12.5, color: muted, maxWidth: 440, margin: '0 auto', lineHeight: 1.55 }}>
                {copy.empty}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
                {builtIn.length > 0 && (
                  <button onClick={() => setMode('browse')} style={accentBtn(BUILTIN_ACCENT)}>
                    {"Browse Study Games"}
                  </button>
                )}
                <button onClick={() => onNavigate('st_decks')} style={ghostBtn(theme)}>
                  {"Open Study Creation"}
                </button>
              </div>
            </div>
          ) : (
            <div style={grid(isPhone)}>
              {myGames.map((d) => (
                <GameCard
                  key={d.id}
                  deck={d}
                  theme={theme}
                  muted={muted}
                  accent={accentFor(d)}
                  action={copy.action}
                  onPick={() => openGame(d.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !loadError && <StudyDisclaimer theme={theme} />}
    </div>
  );
}

function GameCard({
  deck,
  theme,
  muted,
  accent,
  action,
  onPick,
  addState,
}: {
  deck: TeamDeck;
  theme: Theme;
  muted: string;
  accent: string;
  action: string;
  onPick: () => void;
  // Present only in the Browse gallery: add/remove this built-in game.
  addState?: { added: boolean; onToggle: () => void };
}) {
  const sourceLabel = deck.isSample
    ? 'Built-in'
    : deck.source === 'ai_topic'
      ? 'AI-generated'
      : deck.source === 'upload'
        ? 'From a file'
        : 'Custom';
  const noQuestions = deck.questionCount === 0;
  return (
    <div style={gameCard(accent)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{deck.name}</h3>
        <span style={badge(accent)}>{sourceLabel}</span>
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
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={onPick} disabled={noQuestions} style={{ ...accentBtn(accent), minHeight: 38, opacity: noQuestions ? 0.6 : 1 }}>
          {action}
        </button>
        {addState &&
          (addState.added ? (
            <button onClick={addState.onToggle} style={ghostBtn(theme)}>
              ✓ Added · Remove
            </button>
          ) : (
            <button onClick={addState.onToggle} style={ghostBtn(theme)}>
              ＋ Add to my games
            </button>
          ))}
      </div>
    </div>
  );
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
  margin: '0 0 10px',
};

const sectionHeading: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' };

function grid(isPhone: boolean): CSSProperties {
  return { display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 };
}

// Neutral card for loading / error / empty states.
function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '18px 18px',
  };
}

// A game tile, tinted by its source color (custom vs. built-in).
function gameCard(accent: string): CSSProperties {
  return {
    background: `linear-gradient(180deg, ${accent}14, ${accent}08)`,
    border: `1px solid ${accent}59`,
    borderRadius: 14,
    padding: '16px 18px 18px',
  };
}

function badge(accent: string): CSSProperties {
  return {
    flex: 'none',
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: accent,
    border: `1px solid ${accent}`,
    borderRadius: 5,
    padding: '2px 6px',
  };
}

function accentBtn(accent: string): CSSProperties {
  return {
    border: 'none',
    background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
    color: '#0b1020',
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
