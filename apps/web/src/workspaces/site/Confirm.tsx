import { useEffect, useRef, type ReactNode } from 'react';
import { C, tint } from '../../theme/tokens';
import { DEPLOY } from './deploy';

/**
 * The confirmation dialog.
 *
 * `window.confirm` would do the job and is what the file screens use, but this
 * one sits in front of the two controls that change what the world sees — Save
 * and Deploy — and a browser dialog cannot say which is which, cannot carry the
 * deploy colour, and reads as something the page did by accident. Here the
 * dialog looks like the button that opened it.
 *
 * Escape closes it and the confirming button takes focus on open, so it can be
 * answered without reaching for the mouse. The backdrop closes it too: this is
 * a question, never a trap.
 */
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  tone = 'normal',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'normal' | 'deploy' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    // Capture, so the editor's own Escape handling never sees a keypress meant
    // to dismiss this.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  const accent =
    tone === 'deploy' ? DEPLOY.bg : tone === 'danger' ? '#d99aa8' : C.gold;
  const accentText = tone === 'deploy' ? DEPLOY.text : tone === 'danger' ? '#2a0d14' : C.goldText;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(3,8,20,.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          background: C.panel2,
          border: `1px solid ${tone === 'deploy' ? DEPLOY.line : C.line2}`,
          borderRadius: 14,
          padding: '24px 26px',
          boxShadow: '0 24px 60px rgba(0,0,0,.5)',
        }}
      >
        <h2 style={{ margin: 0, font: `700 1.05rem/1.3 ${C.sans}`, color: C.text }}>{title}</h2>
        <div style={{ margin: '10px 0 22px', font: `400 13.5px/1.7 ${C.sans}`, color: C.muted }}>{body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: `1px solid ${C.line2}`,
              background: 'transparent',
              color: C.muted,
              font: `500 13px/1 ${C.sans}`,
              fontFamily: C.sans,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            ref={button}
            type="button"
            onClick={onConfirm}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: tone === 'danger' ? tint('#d99aa8', 0.9) : accent,
              color: accentText,
              font: `700 13px/1 ${C.sans}`,
              fontFamily: C.sans,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
