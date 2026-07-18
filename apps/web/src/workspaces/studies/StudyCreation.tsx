import type { CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { TeamStudyDecks } from './TeamStudyDecks';
import { TeamFlashcards } from './TeamFlashcards';
import { StudyGuideCreator } from './StudyGuides';

// The "Study Creation" section — the one place a team builds its own study
// content. Three makers stacked: study games (quizzes), flashcard sets
// (term/definition cards), and study guides (slide decks, from scratch or an
// uploaded PowerPoint). The finished guides are presented from the separate
// "Study Guides" section (StudyGuidesLibrary).
export function StudyCreation({
  theme,
  onNavigate,
}: {
  theme: Theme;
  onNavigate?: (screen: string) => void;
}) {
  const divider: CSSProperties = {
    maxWidth: 900,
    margin: '0 auto',
    width: '100%',
    borderTop: `1px solid ${theme.navBorder}`,
    paddingTop: 24,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, animation: 'fadeIn .25s ease' }}>
      <TeamStudyDecks theme={theme} onNavigate={onNavigate} />
      <div style={divider}>
        <TeamFlashcards theme={theme} />
      </div>
      <div style={divider}>
        <StudyGuideCreator theme={theme} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
