import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import { PROVIDER_LABELS, questionCountLabel } from './blueprint';
import type { WizardResult } from './PackageWizard';
import { AiOnboarding } from './steps';
import { BORDER, FAINT, MUTED, TEXT, secondaryBtn } from './wizardUi';

// Where a finished blueprint lands when the creator's own AI is going to write
// the content.
//
// Generating the handoff itself — the deterministic prompt their AI is pasted,
// and the import that reads back what it produces — is the next stage of this
// project and replaces the body of this panel. What is already true and worth
// keeping is the frame: the blueprint is complete and saved as a draft, and the
// "How do I use this?" walkthrough is permanently reachable from here, which is
// the one place the spec requires it to be.
export function HandoffPending({
  theme,
  result,
  onBack,
}: {
  theme: Theme;
  result: WizardResult;
  onBack: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const bp = result.blueprint;
  const provider = bp.aiProvider ? PROVIDER_LABELS[bp.aiProvider] : 'your AI';

  const parts = [
    // "However many my AI recommends" is already a sentence about questions —
    // appending the word again reads as nonsense.
    bp.questionCountMode === 'ai_recommend'
      ? 'as many questions as my AI recommends'
      : `${questionCountLabel(bp)} questions`,
    bp.categoriesEnabled ? 'categories' : null,
    bp.includeFlashcards ? 'flashcards' : null,
    bp.includePresentation ? 'a presentation' : null,
    bp.includeLessons ? 'lessons' : null,
  ].filter(Boolean) as string[];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <button onClick={onBack} style={secondaryBtn(theme)}>
          {"← Study Creation"}
        </button>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, background: 'rgba(255,255,255,.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <Icon name="layers" size={17} color={theme.accent} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{bp.packageName || 'Study package'}</h2>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          {bp.subject}
          {parts.length > 0 && ` — ${parts.join(', ')}.`}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: FAINT }}>
          {`Saved as a draft. The handoff you paste into ${provider} is generated in the next step.`}
        </p>

        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <Icon name="life-buoy" size={14} color="#dfe7fa" />
          {'How do I use this?'}
        </button>

        {showHelp && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            <AiOnboarding theme={theme} provider={provider} />
          </div>
        )}
      </div>
    </div>
  );
}
