import type { CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { EditableText } from '../../copy/SiteCopy';

// Study Hub landing: the studies overview. Everything is team-built — study
// games, flashcard sets, and study guides are all created in Study Creation and
// played/studied from their own sections.
export function StudyHub({ theme, onNavigate }: { theme: Theme; onNavigate: (screen: string) => void }) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);

  const cardStyle: CSSProperties = {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderLeft: `3px solid ${theme.accent}`,
    borderRadius: 14,
    padding: isPhone ? '20px 18px' : '26px 28px',
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
          <EditableText id="studyhub.title" text="Study Hub" />
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#a99ff0' }}>
          <EditableText
            id="studyhub.subtitle"
            text="Build your own study content and study it. Everything here is made by your team."
          />
        </p>
      </div>

      {/* Study games */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
            <EditableText id="studyhub.games.title" text="Study games" />
          </h3>
          <span style={tag(theme)}>
            <EditableText id="studyhub.games.tag" text="Quiz · level up" />
          </span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#d7ccff' }}>
          <EditableText
            id="studyhub.games.blurb"
            text="Build a quiz on any subject — have AI generate the questions from a topic you name, or upload a text file of your own questions or notes. Everyone on your team can play it, level up as they answer, sit a graded test on it, and compete on your team’s leaderboard."
          />
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button onClick={() => onNavigate('st_game')} style={primaryBtn(theme, accentGrad)}>
            <EditableText id="studyhub.games.play_btn" text="Play a study game" />
          </button>
          <button onClick={() => onNavigate('st_test')} style={ghostBtn(theme)}>
            <EditableText id="studyhub.games.test_btn" text="Practice tests" />
          </button>
          <button onClick={() => onNavigate('st_progress')} style={ghostBtn(theme)}>
            <EditableText id="studyhub.games.progress_btn" text="View progress" />
          </button>
        </div>
      </div>

      {/* Flashcards + guides */}
      <div style={{ ...cardStyle, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
            <EditableText id="studyhub.cards.title" text="Flashcards & guides" />
          </h3>
          <span style={tag(theme)}>
            <EditableText id="studyhub.cards.tag" text="Your team" />
          </span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#d7ccff' }}>
          In <strong>Study Creation</strong> you can also build flashcard sets — type the cards in, generate
          them from a topic with AI, or upload a glossary — then study them in the <strong>Flashcards</strong>
          section with the auto-rotate player. Build slide-deck study presentations there too (go back and forth with
          VTS AI, or upload a PowerPoint); your finished presentations live in <strong>Study Presentations</strong>, ready to present.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button onClick={() => onNavigate('st_cards')} style={primaryBtn(theme, accentGrad)}>
            <EditableText id="studyhub.cards.flashcards_btn" text="Open Flashcards" />
          </button>
          <button onClick={() => onNavigate('st_guides')} style={ghostBtn(theme)}>
            <EditableText id="studyhub.cards.guides_btn" text="Open Study Presentations" />
          </button>
        </div>
      </div>
    </div>
  );
}

function tag(theme: Theme): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: theme.accent,
    border: `1px solid ${theme.accent}`,
    borderRadius: 5,
    padding: '3px 8px',
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
    padding: '11px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}
