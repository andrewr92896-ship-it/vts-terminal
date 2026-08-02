import { useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { TeamStudyDecks } from './TeamStudyDecks';
import { TeamFlashcards } from './TeamFlashcards';
import { StudyGuideCreator } from './StudyGuides';
import { ActionTile } from './ActionTile';
import { useResponsive } from '../../hooks/useMediaQuery';

// The "Study Creation" section — the one place a team builds its own study
// content. Three makers: study games (quizzes), flashcard sets (term/definition
// cards), and study presentations (slide decks, from scratch or an uploaded
// PowerPoint). Finished presentations are shown from the separate Study
// Presentations section (StudyGuidesLibrary).
//
// A chooser rather than three makers stacked down one page (owner decision,
// 2026-08): stacked, every maker's full list and form loaded at once, so the
// screen opened three feet long and the thing you came to build was somewhere in
// the middle of it. Picking a tile opens one maker with a way back.
type Maker = 'games' | 'flashcards' | 'guides';

export function StudyCreation({
  theme,
  onNavigate,
}: {
  theme: Theme;
  onNavigate?: (screen: string) => void;
}) {
  const { isPhone } = useResponsive();
  const [maker, setMaker] = useState<Maker | null>(null);

  if (maker) {
    return (
      <div style={{ animation: 'fadeIn .25s ease' }}>
        <div style={{ maxWidth: 900, margin: '0 auto 14px', width: '100%' }}>
          <button onClick={() => setMaker(null)} style={backBtn(theme)}>
            {"← All makers"}
          </button>
        </div>
        {maker === 'games' && <TeamStudyDecks theme={theme} />}
        {maker === 'flashcards' && <TeamFlashcards theme={theme} />}
        {maker === 'guides' && <StudyGuideCreator theme={theme} onNavigate={onNavigate} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
          {"Study Creation"}
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8ea3cc' }}>
          {"Build your team’s own study content."}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
          gap: 12,
        }}
      >
        <ActionTile
          theme={theme}
          icon="gamepad-2"
          title="Study games"
          subtitle="Write your own questions, generate them with VTS AI, or upload a file."
          feature="studyCreation"
          onClick={() => setMaker('games')}
          onLockedClick={() => onNavigate?.('my_access')}
        />
        <ActionTile
          theme={theme}
          icon="copy"
          title="Flashcard sets"
          subtitle="Type the cards in, generate them from a topic, or upload a text file."
          feature="studyCreation"
          onClick={() => setMaker('flashcards')}
          onLockedClick={() => onNavigate?.('my_access')}
        />
        <ActionTile
          theme={theme}
          icon="presentation"
          title="Study presentations"
          subtitle="Draft the slides with VTS AI, or upload a PowerPoint."
          feature="studyCreation"
          onClick={() => setMaker('guides')}
          onLockedClick={() => onNavigate?.('my_access')}
        />
      </div>
    </div>
  );
}

function backBtn(theme: Theme): CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 600,
    color: '#dfe7fa',
    background: 'rgba(255,255,255,.05)',
    border: `1px solid ${theme.navBorder}`,
    padding: '8px 13px',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}
