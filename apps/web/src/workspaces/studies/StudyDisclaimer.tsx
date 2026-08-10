import type { CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { Icon } from '../../components/Icon';
import { AFFILIATION_NOTICE, EDUCATIONAL_NOTICE, RIGHTS_NOTICE, SCORE_NOTICE } from './compliance';

// A small, reusable disclaimer strip shown across the study-game surfaces (the
// game launcher, the player, graded tests, and progress).
//
// Study content is team-built and may teach *about* a third party's method,
// brand, or name — e.g. a game covering a well-known finance philosophy. This
// strip keeps that content in the terminal's low-liability posture (see CLAUDE.md
// "informational only, not investment advice"): it says the content is
// educational, is not affiliated with or endorsed by anyone it references, and
// is not financial/investment/legal/tax advice.
//
// The WORDING lives in `compliance.ts`, not here, and so does every other
// compliance sentence in Studies. One file holds the terminal's whole position
// so a review can read it in one screen and an edit is one edit.
//
// Reuse it by rendering <StudyDisclaimer theme={theme} /> at the foot of a study
// screen; pass `style` to tweak spacing where a screen needs it.

export function StudyDisclaimer({ theme, style }: { theme: Theme; style?: CSSProperties }) {
  return (
    <ComplianceNote theme={theme} style={style} icon="scale">
      {`${EDUCATIONAL_NOTICE} ${AFFILIATION_NOTICE}`}
    </ComplianceNote>
  );
}

/**
 * What a score is not — drawn on the leaderboard and deliberately nowhere else.
 * A ranked list of people is the one place a study percentage could be read as a
 * claim about investment ability.
 */
export function ScoreNote({ theme, style }: { theme: Theme; style?: CSSProperties }) {
  return (
    <ComplianceNote theme={theme} style={style} icon="scale">
      {SCORE_NOTICE}
    </ComplianceNote>
  );
}

/**
 * Rights — shown where a creator is about to hand material to their own AI, or
 * bring material of their own back in. Those are the two points where "am I
 * allowed to use this?" actually arises, so it appears at those two and not on
 * every wizard card.
 */
export function RightsNote({ theme, style }: { theme: Theme; style?: CSSProperties }) {
  return (
    <ComplianceNote theme={theme} style={style} icon="scale">
      {RIGHTS_NOTICE}
    </ComplianceNote>
  );
}

// The one strip every compliance notice is drawn in, so they read as the same
// kind of thing wherever they appear.
function ComplianceNote({
  theme,
  style,
  icon,
  children,
}: {
  theme: Theme;
  style?: CSSProperties;
  icon: string;
  children: string;
}) {
  return (
    <div style={{ ...wrap(theme), ...style }}>
      <Icon name={icon} size={15} color={theme.accent} style={{ flex: 'none', marginTop: 1, opacity: 0.85 }} />
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: DIM }}>{children}</p>
    </div>
  );
}

// A dim violet that reads as de-emphasized secondary text on the studies navy.
const DIM = '#8f86b5';

function wrap(theme: Theme): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 16,
    padding: '10px 13px',
    background: 'rgba(255,255,255,.03)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 10,
  };
}
