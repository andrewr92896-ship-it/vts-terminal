import { useEffect, type CSSProperties } from 'react';

// A small, styled confirmation popup used in place of the browser's native
// window.confirm — which is easy to miss and can be suppressed in an installed
// (standalone) PWA. Renders a modal with a dimmed backdrop, a clear warning, and
// a primary/cancel pair. `danger` tints the confirm button red for destructive
// actions like deleting an account.

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Esc cancels; only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <>
      <div onClick={() => !busy && onCancel()} style={backdrop} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" style={dialog}>
        <div id="confirm-title" style={titleStyle}>{title}</div>
        <div id="confirm-msg" style={msgStyle}>{message}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onCancel} disabled={busy} style={cancelBtn}>{cancelLabel}</button>
          <button onClick={onConfirm} disabled={busy} style={{ ...confirmBtn, ...(danger ? dangerBtn : {}), opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4,10,26,.62)',
  zIndex: 300,
  animation: 'fadeIn .18s ease',
};
const dialog: CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%,-50%)',
  width: 'min(420px, calc(100vw - 32px))',
  background: 'linear-gradient(180deg,#12235a,#0c1a40)',
  border: '1px solid #2a4488',
  borderRadius: 14,
  padding: '20px 22px',
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
  zIndex: 301,
  color: '#eef3ff',
  animation: 'popIn .22s ease',
};
const titleStyle: CSSProperties = { fontSize: 16, fontWeight: 700, color: '#fff' };
const msgStyle: CSSProperties = { fontSize: 13, lineHeight: 1.6, color: '#b9c8ee', marginTop: 8 };
const cancelBtn: CSSProperties = {
  border: '1px solid #2a4488',
  background: 'rgba(255,255,255,.05)',
  color: '#cfe0ff',
  fontSize: 13,
  fontWeight: 600,
  padding: '10px 16px',
  borderRadius: 9,
  cursor: 'pointer',
  minHeight: 42,
};
const confirmBtn: CSSProperties = {
  border: 'none',
  background: 'linear-gradient(180deg,#EBCB74,#C9A24B)',
  color: '#0c2768',
  fontSize: 13,
  fontWeight: 700,
  padding: '10px 18px',
  borderRadius: 9,
  cursor: 'pointer',
  minHeight: 42,
};
const dangerBtn: CSSProperties = {
  background: 'linear-gradient(180deg,#ef5468,#c9384b)',
  color: '#fff',
};
