import { useEffect, useState } from 'react';
import { useResponsive } from '../hooks/useMediaQuery';
import { accentGradient, type Theme } from '../theme/themes';
import { tutorialFor } from '../help/tutorials';

// A floating "?" help button shown on every page. It opens a short, step-by-step
// tutorial for the current screen. Text-only for now; tutorial steps can carry
// an optional screenshot later without changing this component.
export function PageHelp({ screen, theme }: { screen: string; theme: Theme }) {
  const { isPhone } = useResponsive();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const tutorial = tutorialFor(screen);

  // Always restart at the first step when opening, or when the page changes.
  useEffect(() => {
    setStep(0);
  }, [screen, open]);

  const accentGrad = accentGradient(theme);
  const total = tutorial.steps.length;
  const current = tutorial.steps[Math.min(step, total - 1)];
  const isLast = step >= total - 1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="How to use this page"
        title="How to use this page"
        style={{
          position: 'fixed',
          right: isPhone ? 14 : 22,
          bottom: isPhone ? 14 : 22,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: `1px solid ${theme.accent}`,
          background: accentGrad,
          color: theme.accentText,
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,.45)',
          zIndex: 45,
        }}
      >
        ?
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.5)',
              zIndex: 70,
              animation: 'fadeIn .2s ease',
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              left: '50%',
              bottom: isPhone ? 0 : '50%',
              top: isPhone ? 'auto' : '50%',
              transform: isPhone ? 'translateX(-50%)' : 'translate(-50%,-50%)',
              width: isPhone ? '100%' : 'min(480px, 94vw)',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'linear-gradient(180deg,#0b1a3a,#081226)',
              border: '1px solid #1d3560',
              borderRadius: isPhone ? '14px 14px 0 0' : 14,
              boxShadow: '0 24px 60px rgba(0,0,0,.55)',
              zIndex: 71,
              animation: 'popIn .25s ease',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '16px 20px',
                borderBottom: '1px solid #1d3560',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#eef3ff' }}>
                  {tutorial.title}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: theme.accent,
                    fontFamily: "'IBM Plex Mono', monospace",
                    marginTop: 3,
                  }}
                >
                  Step {Math.min(step + 1, total)} of {total}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#7488b5',
                  fontSize: 22,
                  lineHeight: 1,
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20 }}>
              {step === 0 && tutorial.intro && (
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#aebcd8', lineHeight: 1.6 }}>
                  {tutorial.intro}
                </p>
              )}

              {current && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#eef3ff', marginBottom: 6 }}>
                    {current.title}
                  </div>
                  {/* Optional screenshot slot — populated when images are added. */}
                  {current.image && (
                    <img
                      src={current.image}
                      alt=""
                      style={{
                        display: 'block',
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid #1d3560',
                        margin: '0 0 12px',
                      }}
                    />
                  )}
                  <p style={{ margin: 0, fontSize: 13, color: '#ccd7ef', lineHeight: 1.6 }}>
                    {current.body}
                  </p>
                </div>
              )}

              {/* Step dots */}
              <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
                {tutorial.steps.map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: i === step ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: i === step ? theme.accent : '#2a4170',
                      transition: 'width .15s ease',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Footer controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '14px 20px',
                borderTop: '1px solid #1d3560',
              }}
            >
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                style={{
                  border: '1px solid #2a4170',
                  background: 'rgba(0,0,0,.18)',
                  color: step === 0 ? '#4a5b7e' : '#cfe0ff',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '10px 16px',
                  borderRadius: 8,
                  cursor: step === 0 ? 'default' : 'pointer',
                  minHeight: 40,
                }}
              >
                Back
              </button>
              <button
                onClick={() => (isLast ? setOpen(false) : setStep((s) => s + 1))}
                style={{
                  border: 'none',
                  background: accentGrad,
                  color: theme.accentText,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '10px 18px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  minHeight: 40,
                }}
              >
                {isLast ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
