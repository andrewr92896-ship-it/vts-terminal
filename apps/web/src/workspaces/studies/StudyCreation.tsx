import type { Theme } from '../../theme/themes';
import { TeamStudyDecks } from './TeamStudyDecks';
import { StudyGuideCreator } from './StudyGuides';

// The "Study Creation" section — the one place a team builds its own study
// content. Two makers stacked: study games (quizzes) and study guides
// (slide decks, from scratch or an uploaded PowerPoint). The finished guides
// are presented from the separate "Study Guides" section (StudyGuidesLibrary).
export function StudyCreation({
  theme,
  onNavigate,
}: {
  theme: Theme;
  onNavigate?: (screen: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, animation: 'fadeIn .25s ease' }}>
      <TeamStudyDecks theme={theme} onNavigate={onNavigate} />
      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', borderTop: `1px solid ${theme.navBorder}`, paddingTop: 24 }}>
        <StudyGuideCreator theme={theme} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
