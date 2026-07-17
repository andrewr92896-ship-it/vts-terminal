import { useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { TeamStudyDecks } from './TeamStudyDecks';
import { StudyGuides } from './StudyGuides';

// The Study Creation hub (the sidebar's "Study Creation" section). One place to
// make new study content: a study GAME (a quiz played for points) or a study
// GUIDE (a slide presentation built by conversation). A tab switches between the
// two builders; each keeps its own list of what the team has made.
type Tab = 'games' | 'guides';

export function StudyCreation({ theme }: { theme: Theme }) {
  const [tab, setTab] = useState<Tab>('games');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Study Creation</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#a99ff0' }}>
          Make something new for your team — a study game to play, or a study guide to present.
        </p>
      </div>

      <div style={{ display: 'inline-flex', border: `1px solid ${theme.navBorder}`, borderRadius: 999, overflow: 'hidden', marginBottom: 18 }}>
        <TabBtn theme={theme} active={tab === 'games'} onClick={() => setTab('games')} label="Study games" />
        <TabBtn theme={theme} active={tab === 'guides'} onClick={() => setTab('guides')} label="Study guides" />
      </div>

      {tab === 'games' ? <TeamStudyDecks theme={theme} /> : <StudyGuides theme={theme} />}
    </div>
  );
}

function TabBtn({
  theme,
  active,
  onClick,
  label,
}: {
  theme: Theme;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  const style: CSSProperties = {
    fontSize: 12.5,
    fontWeight: 600,
    padding: '9px 20px',
    cursor: 'pointer',
    border: 'none',
    background: active ? theme.accent : 'transparent',
    color: active ? theme.accentText : '#a99ff0',
  };
  return (
    <button onClick={onClick} style={style}>
      {label}
    </button>
  );
}
