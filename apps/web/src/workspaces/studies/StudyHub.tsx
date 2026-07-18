import type { CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import {
  SERIES65_QUESTION_COUNT,
  SERIES65_TOPICS,
  SERIES65_VOCAB_COUNT,
} from './series65Meta';
import { requestStudyView } from './studiesNav';
import { useAuth } from '../../auth/AuthContext';
import { canUseSeries65 } from '../../auth/access';

// Study Hub landing: the subject list. Series 65 is the first (and currently
// only) live track; the buttons jump to its quiz, flashcards, and progress.
export function StudyHub({ theme, onNavigate }: { theme: Theme; onNavigate: (screen: string) => void }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const accentGrad = accentGradient(theme);
  // Series 65 is licensed content limited to the owner's team; every other team
  // (and the demo) uses their own team-built study games instead.
  const showSeries65 = canUseSeries65(user);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Study Hub</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#a99ff0' }}>
          Pick a subject to study. Your quiz progress is saved on this device.
        </p>
      </div>

      {/* Series 65 subject card — owner's team only */}
      {showSeries65 && (
      <div
        style={{
          background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
          border: `1px solid ${theme.navBorder}`,
          borderLeft: `3px solid ${theme.accent}`,
          borderRadius: 14,
          padding: isPhone ? '20px 18px' : '26px 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>Series 65</h3>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '3px 8px' }}>
            Uniform Investment Adviser Law Exam
          </span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#d7ccff' }}>
          A self-quiz game across the four exam areas — Economic Factors, Investment Vehicles, Client
          Recommendations, and Laws &amp; Ethics — weighted to the real exam. Level up as you answer
          correctly (the page recolors to your level), and watch your lifetime accuracy against the
          ~72% pass line. Or sit a full 100-question mock test drawn to the real exam mix — its
          answers count toward your level too, and your score goes on the leaderboard.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(3,1fr)', gap: 10, margin: '18px 0' }}>
          <Stat label="Questions" value={String(SERIES65_QUESTION_COUNT)} theme={theme} />
          <Stat label="Topics" value={String(SERIES65_TOPICS.length)} theme={theme} />
          <Stat label="Flashcards" value={String(SERIES65_VOCAB_COUNT)} theme={theme} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => { requestStudyView('quiz'); onNavigate('st_game'); }} style={primaryBtn(theme, accentGrad)}>
            Play the Study Game
          </button>
          <button onClick={() => { requestStudyView('test'); onNavigate('st_game'); }} style={ghostBtn(theme)}>
            Take a mock test
          </button>
          <button onClick={() => { requestStudyView('cards'); onNavigate('st_game'); }} style={ghostBtn(theme)}>
            Flashcards
          </button>
          <button onClick={() => onNavigate('st_progress')} style={ghostBtn(theme)}>
            View progress
          </button>
        </div>
      </div>
      )}

      {/* Team Study Games — available to everyone. A team builds its own quiz
          (AI-generated from a topic, or from an uploaded file) and the whole team
          plays it with the same level-up mechanics. */}
      <div
        style={{
          marginTop: showSeries65 ? 14 : 0,
          background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
          border: `1px solid ${theme.navBorder}`,
          borderLeft: `3px solid ${theme.accent}`,
          borderRadius: 14,
          padding: isPhone ? '20px 18px' : '26px 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>Team Study Creation</h3>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '3px 8px' }}>
            Your team
          </span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#d7ccff' }}>
          Build your own study content for your team on any subject. In <strong>Study Creation</strong>,
          make a study game — have AI generate the questions from a topic you name, or upload a text file
          of your own questions or notes — and everyone can play it, level up, and compete on your team’s
          leaderboard. Also build a slide-deck study guide there: go back and forth with VTS AI, or upload
          a PowerPoint, and add your own screenshots. Your finished guides live in <strong>Study Guides</strong>,
          ready to present like a walkthrough.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button onClick={() => onNavigate('st_decks')} style={primaryBtn(theme, accentGrad)}>
            Open Study Creation
          </button>
          <button onClick={() => onNavigate('st_guides')} style={ghostBtn(theme)}>
            Open Study Guides
          </button>
        </div>
      </div>

      <p style={{ margin: '16px 2px 0', fontSize: 11.5, color: '#8a7fc8' }}>
        {showSeries65
          ? 'More subjects can be added later — this hub is built to hold additional tracks.'
          : 'Series 65 questions are copyrighted, so they stay within the owner’s team. Build your own team study games above.'}
      </p>
    </div>
  );
}

function Stat({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#a99ff0' }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 4 }}>{value}</div>
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
    padding: '11px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}
