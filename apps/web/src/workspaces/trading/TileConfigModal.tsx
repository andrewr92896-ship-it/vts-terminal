import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BORDER2 } from './tvChart';

// A centered settings dialog for a board tile. Rendered through a portal to
// document.body so its size is independent of the tile it belongs to — a short
// watchlist tile would otherwise clip the panel to a sliver (the tile and the
// grid item both clip overflow, and react-grid-layout's transform means even
// position:fixed can't escape the tile). Click the backdrop or press Escape to
// close.
export function TileConfigModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close only when the press starts on the backdrop itself (not on a child that
  // bubbles up). Using the event target keeps a drag that begins inside the
  // panel — e.g. selecting text in an input — from dismissing the modal.
  const closeIfBackdrop = (e: React.SyntheticEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className="no-drag" style={overlay} onMouseDown={closeIfBackdrop} onTouchStart={closeIfBackdrop}>
      <div style={panel}>{children}</div>
    </div>,
    document.body,
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(3,8,20,.6)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};
const panel: React.CSSProperties = {
  width: 340,
  maxWidth: 'calc(92 * var(--vw))',
  maxHeight: 'calc(85 * var(--vh))',
  overflowY: 'auto',
  background: 'rgba(8,18,42,.99)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 12,
  padding: 16,
  boxShadow: '0 24px 70px rgba(0,0,0,.6)',
};
