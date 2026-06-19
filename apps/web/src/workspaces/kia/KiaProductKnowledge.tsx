// Placeholder for the Claude-powered Product Knowledge chat (Stage 4). Topic
// chips and input are shown but disabled, matching the To Do command bar
// approach.

const TOPICS = [
  'Telluride towing',
  'EV9 range & charging',
  'Sportage Hybrid MPG',
  'Reset maintenance light',
  'K4 trims',
  'Kia Access setup',
];

export function KiaProductKnowledge() {
  return (
    <div style={{ maxWidth: 860, color: '#eceef0', animation: 'fadeIn .25s ease' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, color: '#fff' }}>Product Knowledge</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#9aa0a8' }}>
        Claude-powered specs, trims, incentives, and troubleshooting. Connects in Stage 4.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {TOPICS.map((t) => (
          <span key={t} style={{ fontSize: 11.5, color: '#9aa0a8', background: 'rgba(187,22,43,.06)', border: '1px solid #3a2329', borderRadius: 16, padding: '7px 13px' }}>
            {t}
          </span>
        ))}
      </div>
      <div style={{ background: '#15171b', border: '1px solid #2a2d33', borderRadius: 11, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 440 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ alignSelf: 'flex-start', maxWidth: '84%', padding: '11px 13px', borderRadius: 10, background: 'rgba(28,31,37,.85)', border: '1px solid #2c2f36' }}>
            <div style={{ fontSize: 9.5, color: '#e07a86', letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 4 }}>Claude</div>
            <div style={{ fontSize: 12.5, color: '#e6e8ea', lineHeight: 1.55 }}>
              The product knowledge assistant arrives in Stage 4. It will answer specs, towing and payload, EV range and charging, trims, incentives, and troubleshooting.
            </div>
          </div>
        </div>
        <div style={{ padding: '13px 15px', borderTop: '1px solid #25282e', display: 'flex', gap: 9 }}>
          <input disabled placeholder="Available in Stage 4..." style={{ flex: 1, background: '#0e0f12', border: '1px solid #2c2f36', borderRadius: 7, padding: '11px 13px', color: '#6b7079', fontSize: 12.5, outline: 'none' }} />
          <button disabled style={{ border: 'none', background: 'linear-gradient(180deg,#BB162B,#8d0f20)', color: '#fff', fontWeight: 600, fontSize: 13, padding: '0 18px', borderRadius: 7, opacity: 0.5 }}>Send</button>
        </div>
      </div>
    </div>
  );
}
