import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { useAuth } from '../../../auth/AuthContext';
import { useResponsive } from '../../../hooks/useMediaQuery';
import type { Theme } from '../../../theme/themes';
import { APP_VERSION } from '../../../meta/version';
import { isFounder } from '../../../auth/access';
import { reportProblem } from '../../../lib/reportProblem';
import {
  DRAFT_VERSION,
  PROVIDER_LABELS,
  emptyBlueprint,
  needsExternalAi,
  nextStep,
  stepError,
  stepsFor,
  type StepId,
  type StudyPackageBlueprint,
} from './blueprint';
import {
  clearDraft,
  loadAiOnboarded,
  loadDraft,
  loadProvider,
  newDraftId,
  saveAiOnboarded,
  saveDraft,
  saveProvider,
  setDraftStage,
} from './draft';
import { StepCard } from './steps';
import { WizardDevPanel } from './WizardDevPanel';
import { BORDER, MUTED, PAGE, Progress, TEXT, ErrorLine, primaryBtn, secondaryBtn } from './wizardUi';

// The Study Package creation wizard.
//
// One structural question at a time, branching on the answers, ending at a
// review screen. It describes the SHAPE of a package and never writes any of it:
// nothing here calls the API at all, so nothing exists in the database because
// somebody opened the wizard or reached the last card. The blueprint is handed
// to whatever comes next — the AI handoff, or the manual entry path.
//
// It calls no VTS AI endpoint, deliberately and by construction: the content
// comes from the user's own third-party AI, or from their keyboard.

export type WizardRoute = 'ai_handoff' | 'manual';

export interface WizardResult {
  draftId: string;
  blueprint: StudyPackageBlueprint;
  route: WizardRoute;
}

export function PackageWizard({
  theme,
  onClose,
  onComplete,
  readOnly = false,
}: {
  theme: Theme;
  onClose: () => void;
  onComplete: (result: WizardResult) => void;
  /** A demo account can walk the wizard but cannot finish it. */
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const userId = user?.id ?? 'anon';

  const [aiOnboarded, setAiOnboarded] = useState(() => loadAiOnboarded(userId));
  const [draftId, setDraftId] = useState(newDraftId);
  const [bp, setBp] = useState<StudyPackageBlueprint>(emptyBlueprint);
  const [stepId, setStepId] = useState<StepId>('subject');
  const [showError, setShowError] = useState(false);
  const [restored, setRestored] = useState(false);
  // Developer capabilities inside the real wizard. Founder-level only, and on
  // the EFFECTIVE roles — so a founder previewing as the public loses them,
  // which is what makes the preview a real preview.
  const canDebug = !!user && isFounder(user.roles);

  // Restore whatever was left unfinished. Runs once: the wizard is mounted fresh
  // each time it opens, and re-reading later would fight the debounced save.
  useEffect(() => {
    const saved = loadDraft(userId);
    if (saved) {
      setDraftId(saved.draftId);
      setBp(saved.blueprint);
      setStepId(saved.stepId);
      setRestored(true);
    } else {
      // Preselect the AI they used last time, so the provider card opens on the
      // answer they already gave once.
      const provider = loadProvider(userId);
      if (provider) setBp((b) => ({ ...b, aiProvider: provider }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const steps = useMemo(() => stepsFor(bp, { aiOnboarded }), [bp, aiOnboarded]);
  // A step can stop existing under you — turning categories off while standing
  // on the category editor. Fall back to the last step still in the path rather
  // than rendering a card the blueprint no longer has a place for.
  const index = steps.indexOf(stepId);
  const safeStep: StepId = index >= 0 ? stepId : steps[Math.max(0, steps.length - 1)];
  const safeIndex = Math.max(0, steps.indexOf(safeStep));

  // ---- Draft persistence ----
  //
  // Debounced, because typing a subject fires this per keystroke, and flushed on
  // unmount because leaving the screen is the exact case the draft exists for.
  const pending = useRef<{ blueprint: StudyPackageBlueprint; stepId: StepId } | null>(null);
  const timer = useRef<number | null>(null);
  const flush = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    if (p) {
      saveDraft(userId, { draftId, stepId: p.stepId, blueprint: p.blueprint, stage: 'wizard' });
      pending.current = null;
    }
  }, [userId, draftId]);

  useEffect(() => {
    pending.current = { blueprint: bp, stepId: safeStep };
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [bp, safeStep, flush]);

  useEffect(() => flush, [flush]);

  const patch = useCallback((p: Partial<StudyPackageBlueprint>) => {
    setShowError(false);
    setBp((b) => ({ ...b, ...p }));
  }, []);

  const error = stepError(bp, safeStep);

  const goNext = useCallback(() => {
    if (error) {
      setShowError(true);
      return;
    }
    if (safeStep === 'aiProvider' && bp.aiProvider) saveProvider(userId, bp.aiProvider);
    if (safeStep === 'aiOnboarding') {
      // Walked through once; never forced again.
      saveAiOnboarded(userId);
      setAiOnboarded(true);
    }
    setShowError(false);
    setStepId(nextStep(steps, safeStep, bp));
  }, [error, safeStep, steps, bp, userId]);

  const goBack = useCallback(() => {
    setShowError(false);
    if (safeIndex <= 0) {
      onClose();
      return;
    }
    setStepId(steps[safeIndex - 1]);
  }, [safeIndex, steps, onClose]);

  const startOver = useCallback(() => {
    clearDraft(userId);
    setBp(emptyBlueprint());
    setDraftId(newDraftId());
    setStepId('subject');
    setShowError(false);
    setRestored(false);
  }, [userId]);

  // Escape closes. The draft is already saved, so nothing is lost by leaving.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        flush();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, flush]);

  const onReview = safeStep === 'review';
  const usesAi = needsExternalAi(bp);
  const finishLabel = usesAi ? 'Create AI Handoff' : 'Continue to Manual Entry';

  const finish = () => {
    if (readOnly) return;
    flush();
    // Record that the draft is now standing on its ending, AFTER the flush that
    // writes it as 'wizard'. This is what lets Study Creation reopen on the
    // handoff — and on the same draft id, so the file the creator's AI built
    // against it is still accepted.
    setDraftStage(userId, 'ending');
    onComplete({ draftId, blueprint: bp, route: usesAi ? 'ai_handoff' : 'manual' });
  };

  return (
    <>
      <div
        onClick={() => {
          flush();
          onClose();
        }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a study package"
        style={{
          position: 'fixed',
          top: isPhone ? 0 : 'calc(7 * var(--vh))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isPhone ? '100%' : 'min(560px, calc(94 * var(--vw)))',
          height: isPhone ? '100%' : 'auto',
          maxHeight: isPhone ? '100%' : 'calc(86 * var(--vh))',
          display: 'flex',
          flexDirection: 'column',
          background: PAGE,
          border: isPhone ? 'none' : `1px solid ${BORDER}`,
          borderRadius: isPhone ? 0 : 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 61,
          animation: 'popIn .25s ease',
          color: TEXT,
        }}
      >
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${BORDER}`, flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
            <Icon name="layers" size={16} color={theme.accent} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#fff' }}>Create a study package</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                flush();
                onClose();
              }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}
            >
              <Icon name="x-circle" size={18} color={MUTED} />
            </button>
          </div>
          <Progress theme={theme} fraction={steps.length > 1 ? safeIndex / (steps.length - 1) : 0} />
        </div>

        {readOnly && (
          <div
            style={{
              flex: 'none',
              padding: '9px 16px',
              background: 'rgba(235,203,116,.1)',
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 12.5,
              color: '#EBCB74',
            }}
          >
            Preview only on the demo account — you can look through every step, but nothing can be created.
          </div>
        )}

        {restored && safeIndex > 0 && (
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 12.5,
              color: MUTED,
            }}
          >
            <Icon name="file-clock" size={13} color={MUTED} />
            <span style={{ flex: 1 }}>Picked up where you left off.</span>
            <button
              type="button"
              onClick={startOver}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.accent,
                fontWeight: 600,
                fontSize: 12.5,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
              }}
            >
              Start over
            </button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 20px' }}>
          <StepCard
            step={safeStep}
            bp={bp}
            patch={patch}
            theme={theme}
            provider={bp.aiProvider ? PROVIDER_LABELS[bp.aiProvider] : 'your AI'}
            onEdit={(s) => {
              setShowError(false);
              setStepId(s);
            }}
            onAdvance={goNext}
          />
          {showError && error && (
            <>
              <ErrorLine>{error}</ErrorLine>
              {/* A validation message the creator cannot act on is a bug in the
                  wizard, not in their answer. This carries the step id and the
                  blueprint version so they do not have to describe either. */}
              <button
                type="button"
                onClick={() =>
                  reportProblem({
                    intro: `The study package wizard would not let me continue. It said: ${error}`,
                    context: {
                      screen: 'st_decks',
                      step: safeStep,
                      component: 'wizard',
                      draftId,
                      blueprintVersion: DRAFT_VERSION,
                      appVersion: APP_VERSION,
                      errorMessages: [error],
                      tier: user?.access.membership.tier,
                      isDemo: user?.isDemo || undefined,
                      previewAs: user?.preview ?? undefined,
                    },
                  })
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: MUTED,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: '6px 0 0',
                }}
              >
                Report a problem
              </button>
            </>
          )}

          {/* Developer capabilities, in the REAL wizard rather than a second
              one. Founder-level only, and hidden while previewing as anybody
              else — seeing the product without them is the point. */}
          {canDebug && (
            <WizardDevPanel
              theme={theme}
              stepId={safeStep}
              steps={steps}
              blueprint={bp}
              draftId={draftId}
              onJump={(s) => {
                setShowError(false);
                setStepId(s);
              }}
              onClearDraft={startOver}
            />
          )}
        </div>

        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 16px',
            paddingBottom: isPhone ? 'calc(12px + env(safe-area-inset-bottom))' : 12,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <button type="button" onClick={goBack} style={secondaryBtn(theme)}>
            {safeIndex <= 0 ? 'Cancel' : 'Back'}
          </button>
          {onReview && (
            <button type="button" onClick={startOver} style={{ ...secondaryBtn(theme), color: MUTED }}>
              Start over
            </button>
          )}
          <div style={{ flex: 1 }} />
          {onReview ? (
            <button
              type="button"
              onClick={finish}
              disabled={readOnly}
              title={readOnly ? 'The demo account cannot create study content' : undefined}
              style={primaryBtn(theme, readOnly)}
            >
              {finishLabel}
            </button>
          ) : (
            <button type="button" onClick={goNext} style={primaryBtn(theme)}>
              Continue
            </button>
          )}
        </div>
      </div>
    </>
  );
}
