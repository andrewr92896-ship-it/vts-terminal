import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import type { StepId, StudyPackageBlueprint } from './blueprint';
import { FAINT, MUTED, secondaryBtn } from './wizardUi';

// Developer capabilities inside the REAL wizard.
//
// There is deliberately no second, developer-flavoured copy of Studies. This is
// a panel at the foot of the ordinary wizard, drawn only for a founder-level
// reader, and it does exactly three things: it names the step you are on, it
// lets you jump to another one on the current path, and it shows the blueprint
// as it stands.
//
// Everything here is READ or NAVIGATE. Nothing skips a validation, nothing
// commits, and nothing switches a safeguard off — jumping to a step is something
// Back and Continue can already do, just slowly, and the blueprint is the same
// object the review card renders in prose. Clearing the draft is the wizard's
// own "Start over".
//
// It is hidden while previewing as another tier, because the whole value of the
// preview is seeing what that account sees.

const DEV_BORDER = 'rgba(255,159,69,.35)';
const DEV_TINT = 'rgba(255,159,69,.06)';
const DEV_INK = '#FF9F45';

export function WizardDevPanel({
  theme,
  stepId,
  steps,
  blueprint,
  draftId,
  onJump,
  onClearDraft,
}: {
  theme: Theme;
  stepId: StepId;
  /** The path the current answers produce — jumping is bounded by it. */
  steps: StepId[];
  blueprint: StudyPackageBlueprint;
  draftId: string;
  onJump: (s: StepId) => void;
  onClearDraft: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showJson, setShowJson] = useState(false);

  return (
    <div style={{ marginTop: 18, border: `1px solid ${DEV_BORDER}`, background: DEV_TINT, borderRadius: 10, padding: 11 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          color: DEV_INK,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} color={DEV_INK} />
        <span style={{ flex: 1 }}>
          {'Step '}
          <code style={{ fontFamily: 'ui-monospace, monospace' }}>{stepId}</code>
        </span>
        <span style={{ fontWeight: 500, color: FAINT, fontSize: 11.5 }}>{'developer'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 11.5, color: FAINT, fontFamily: 'ui-monospace, monospace' }}>
            {`draft ${draftId} · blueprint v${blueprint.draftVersion} · ${steps.length} steps on this path`}
          </div>

          {/* Jumping is bounded by the path the answers actually produce, so it
              cannot land on a card the blueprint has no place for. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {steps.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onJump(s)}
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: `1px solid ${s === stepId ? DEV_INK : theme.navBorder}`,
                  background: s === stepId ? 'rgba(255,159,69,.14)' : 'transparent',
                  color: s === stepId ? DEV_INK : MUTED,
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              style={{ ...secondaryBtn(theme), fontSize: 11.5, padding: '6px 10px', minHeight: 0 }}
            >
              {showJson ? 'Hide the blueprint' : 'Show the blueprint'}
            </button>
            <button
              type="button"
              onClick={onClearDraft}
              style={{ ...secondaryBtn(theme), fontSize: 11.5, padding: '6px 10px', minHeight: 0 }}
            >
              {'Clear the draft'}
            </button>
          </div>

          {showJson && (
            <textarea
              readOnly
              value={JSON.stringify(blueprint, null, 2)}
              rows={12}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${theme.navBorder}`,
                background: '#0d1630',
                color: '#dfe7fa',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
                lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
