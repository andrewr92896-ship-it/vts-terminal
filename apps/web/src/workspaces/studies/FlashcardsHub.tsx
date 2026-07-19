import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TeamFlashcardSet, TeamFlashcardSetDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { card } from './TeamStudyDecks';
import { FlashcardSetPlayer } from './FlashcardSetPlayer';

const muted = '#a99ff0';

// The Flashcards section: a launcher of the team's flashcard sets. Sets are
// *built* in Study Creation and *studied* here with the auto-rotate player —
// mirroring how study games are made in Study Creation and played in the Study
// Game section.
export function FlashcardsHub({ theme, onNavigate }: { theme: Theme; onNavigate: (screen: string) => void }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);

  const [sets, setSets] = useState<TeamFlashcardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .studyFlashcardSets()
      .then((r) => {
        if (!alive) return;
        setSets(r.sets);
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

  if (playing) {
    return <SetPlayer theme={theme} setId={playing} readOnly={readOnly} onBack={() => setPlaying(null)} />;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Flashcards</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          Pick a set to study with auto-rotate, topic filters, and “Ask VTS AI”. Build your own in <strong>Study Creation</strong>.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '0 0 10px' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Your team’s flashcard sets</h3>
        {!readOnly && (
          <button onClick={() => onNavigate('st_decks')} style={ghostBtn(theme)}>✦ Create a flashcard set</button>
        )}
      </div>

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>Loading your team’s flashcard sets…</div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          Couldn’t load your team’s flashcard sets. Try again in a moment.
        </div>
      ) : sets.length === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🃏</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No flashcard sets yet</div>
          <div style={{ fontSize: 12.5, color: muted, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            Build one in Study Creation — type the cards in, generate them from a topic with AI, or upload a text file — and it shows up here to study.
          </div>
          {!readOnly && (
            <button onClick={() => onNavigate('st_decks')} style={{ ...primaryBtn(theme, accentGrad), marginTop: 16 }}>
              Open Study Creation
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
          {sets.map((s) => (
            <SetCard key={s.id} set={s} theme={theme} onStudy={() => setPlaying(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SetCard({ set, theme, onStudy }: { set: TeamFlashcardSet; theme: Theme; onStudy: () => void }) {
  const sourceLabel =
    set.source === 'ai_topic'
      ? 'AI-generated'
      : set.source === 'upload'
        ? 'From a file'
        : set.source === 'from_game'
          ? 'From a study game'
          : set.source === 'sample'
            ? 'Sample'
            : 'Typed in';
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{set.name}</h3>
        <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '2px 6px' }}>
          {sourceLabel}
        </span>
      </div>
      {set.description && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#d7ccff', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {set.description}
        </p>
      )}
      <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
        {set.cardCount} card{set.cardCount === 1 ? '' : 's'}
        {set.topics.length > 0 && ` · ${set.topics.slice(0, 3).join(' · ')}`}
        {set.createdByName && ` · by ${set.createdByName}`}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={onStudy} disabled={set.cardCount === 0} style={{ ...primaryBtn(theme, accentGradient(theme)), minHeight: 38, opacity: set.cardCount === 0 ? 0.6 : 1 }}>
          Study
        </button>
      </div>
    </div>
  );
}

// Loads the full set (cards) then hands off to the auto-rotate player.
function SetPlayer({ theme, setId, readOnly, onBack }: { theme: Theme; setId: string; readOnly: boolean; onBack: () => void }) {
  const [set, setSet] = useState<TeamFlashcardSetDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .studyFlashcardSet(setId)
      .then((r) => alive && setSet(r.set))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [setId]);

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <button onClick={onBack} style={{ ...ghostBtn(theme), marginBottom: 8 }}>‹ All sets</button>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{set?.name ?? 'Flashcards'}</h2>
        {set && (
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            {set.cardCount} card{set.cardCount === 1 ? '' : 's'}
            {set.topics.length > 0 && ` · ${set.topics.length} topic${set.topics.length === 1 ? '' : 's'}`}
          </p>
        )}
      </div>
      {error ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>Couldn’t load that set. Try again in a moment.</div>
      ) : !set ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>Loading cards…</div>
      ) : (
        <FlashcardSetPlayer theme={theme} setId={set.id} name={set.name} cards={set.cards} readOnly={readOnly} embedded />
      )}
    </div>
  );
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
