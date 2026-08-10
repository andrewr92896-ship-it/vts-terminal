import { useMemo, useState } from 'react';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import { PROVIDER_LABELS } from './blueprint';
import { PACKAGE_FILE_NAME, buildHandoff } from './handoffPrompt';
import type { WizardResult } from './PackageWizard';
import { PackageImport } from './PackageImport';
import { AiOnboarding } from './steps';
import { BORDER, FAINT, MUTED, TEXT, primaryBtn, secondaryBtn } from './wizardUi';

// The AI ending of the wizard: take this to your own AI, bring back what it
// makes.
//
// The handoff is composed on this device from the blueprint — no VTS AI call to
// write it, and none to read the result. The terminal's part is the structure
// and the checking; the writing happens somewhere else entirely, which is what
// keeps this workflow free to run.

export function PackageHandoff({
  theme,
  result,
  onBack,
  onImported,
}: {
  theme: Theme;
  result: WizardResult;
  onBack: () => void;
  onImported: (pkg: { id: string; name: string }) => void;
}) {
  const bp = result.blueprint;
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showText, setShowText] = useState(false);
  const provider = bp.aiProvider ? PROVIDER_LABELS[bp.aiProvider] : 'your AI';

  const handoff = useMemo(() => buildHandoff(bp, result.draftId), [bp, result.draftId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handoff);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // A denied clipboard is not a dead end — the text is on the page.
      setShowText(true);
    }
  };

  const download = () => {
    const blob = new Blob([handoff], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vts-study-package-handoff.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <button onClick={onBack} style={secondaryBtn(theme)}>
          {'← Study Creation'}
        </button>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, background: 'rgba(255,255,255,.02)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
          <Icon name="layers" size={17} color={theme.accent} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{bp.packageName || 'Study package'}</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
          {`Copy this into ${provider}. It will ask you a few questions, then produce a file called ${PACKAGE_FILE_NAME} — bring that back below.`}
        </p>

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => void copy()} style={primaryBtn(theme)}>
            {copied ? 'Copied' : 'Copy the handoff'}
          </button>
          <button type="button" onClick={download} style={secondaryBtn(theme)}>
            Download it
          </button>
          <button type="button" onClick={() => setShowText((v) => !v)} style={secondaryBtn(theme)}>
            {showText ? 'Hide it' : 'Show it'}
          </button>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <Icon name="life-buoy" size={14} color="#dfe7fa" />
            {'How do I use this?'}
          </button>
        </div>

        {showText && (
          <textarea
            readOnly
            value={handoff}
            rows={16}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              marginTop: 12,
              width: '100%',
              boxSizing: 'border-box',
              padding: 12,
              borderRadius: 9,
              border: `1px solid ${BORDER}`,
              background: '#0d1630',
              color: TEXT,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11.5,
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
        )}

        {showHelp && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            <AiOnboarding theme={theme} provider={provider} />
            <p style={{ margin: '12px 0 0', fontSize: 12, color: FAINT, lineHeight: 1.55 }}>
              {`If ${provider} says the package is too long, ask it for one part at a time and add each part below.`}
            </p>
          </div>
        )}
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, background: 'rgba(255,255,255,.02)' }}>
        <PackageImport theme={theme} blueprint={bp} draftId={result.draftId} onImported={onImported} />
      </div>
    </div>
  );
}
