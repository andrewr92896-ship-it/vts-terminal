import { useResponsive } from '../../hooks/useMediaQuery';
import { BrokerConnectionsPanel } from './BrokerConnectionsPanel';

const PAGE = '#081226';
const BORDER2 = '#1c3a7a';

// Live Wall "Connections" modal. The list + form live in the shared panel so the
// same management UI also appears in Account Settings.
export function BrokerConnections({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { isPhone } = useResponsive();
  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: isPhone ? 0 : '5vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isPhone ? '100%' : 'min(620px, 94vw)',
          height: isPhone ? '100%' : 'auto',
          maxHeight: isPhone ? '100%' : '90vh',
          overflowY: 'auto',
          background: PAGE,
          border: isPhone ? 'none' : `1px solid ${BORDER2}`,
          borderRadius: isPhone ? 0 : 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 61,
          animation: 'popIn .25s ease',
          color: '#eef3ff',
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            background: 'linear-gradient(90deg,#0a1f4d,#0c2768)',
            borderBottom: `1px solid ${BORDER2}`,
          }}
        >
          <strong style={{ fontSize: 15, color: '#fff' }}>{"Broker Connections"}</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#9fb0d6', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>
            ×
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <BrokerConnectionsPanel onChanged={onChanged} />
        </div>
      </div>
    </>
  );
}
