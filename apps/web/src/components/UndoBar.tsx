// A small "undo" toast shown after something is removed from a list. Fixed at
// the bottom center; the owning component manages its own auto-dismiss timer.
export function UndoBar({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 55,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: 'calc(100vw - 28px)',
        background: '#0c1c3c',
        border: '1px solid #1d3560',
        borderRadius: 10,
        padding: '10px 12px 10px 16px',
        boxShadow: '0 14px 36px rgba(0,0,0,.55)',
        animation: 'popIn .2s ease',
      }}
    >
      <span style={{ fontSize: 12.5, color: '#cfe0ff' }}>{message}</span>
      <button
        onClick={onUndo}
        style={{
          border: '1px solid #2a4170',
          background: 'rgba(255,255,255,.06)',
          color: '#eef3ff',
          fontWeight: 600,
          fontSize: 12.5,
          padding: '7px 14px',
          borderRadius: 7,
          cursor: 'pointer',
          minHeight: 36,
        }}
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: '#7488b5',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}
