import { C } from '../theme/tokens';
import { Icon } from '../components/Icon';
import type { DemoDevice } from './PublicRuntime';

// ONE QUESTION AT THE DOOR OF THE DEMO: which device is this?
//
// It decides two things the terminal cannot ask again later without being in the
// way — which of the two default Live Wall layouts to load, and whether the
// sidebar starts open — and both are changeable afterwards, from the wall's
// toolbar and the sidebar's own toggle. Nothing here is a setting; it is a
// starting point.
//
// The viewport picks which answer is RECOMMENDED and nothing more. A visitor on
// a laptop showing somebody the phone layout is a real thing to want, which is
// exactly why this is a question rather than a measurement — and it is why the
// stacked board is a real arrangement rather than a narrow-screen rendering.
//
// A REAL ACCOUNT NEVER SEES THIS. It has its own saved board and sidebar state,
// and a question at sign-in that overwrote them would be worse than unhelpful.
export function PublicDeviceCard({ likely, onPick }: { likely: DemoDevice; onPick: (device: DemoDevice) => void }) {
  const options: { key: DemoDevice; icon: string; title: string; body: string }[] = [
    { key: 'desktop', icon: 'monitor', title: 'Desktop', body: 'Tiles side by side across the width, and the sidebar open.' },
    { key: 'mobile', icon: 'smartphone', title: 'Phone or tablet', body: 'One tile per row to scroll through, and the sidebar out of the way.' },
  ];
  return (
    <div className="vts-public-auth">
      <div className="vts-public-auth-card-wrap" style={{ gridColumn: '1 / -1' }}>
        <div className="vts-public-auth-card">
          <img className="vts-public-wordmark" src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems" />
          <h2>How are you looking at this?</h2>
          <p>The demo lays the board out differently on a phone. Pick one to start on — you can switch at any time from the Live Wall, and it changes nothing else.</p>
          <div style={{ display: 'grid', gap: 10, margin: '20px 0 4px' }}>
            {options.map((option) => (
              <button
                key={option.key}
                onClick={() => onPick(option.key)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', textAlign: 'left',
                  padding: '13px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${option.key === likely ? C.gold : C.line2}`,
                  background: option.key === likely ? 'rgba(235,203,116,.08)' : 'rgba(255,255,255,.02)',
                  color: C.text, font: 'inherit',
                }}
              >
                <Icon name={option.icon} size={19} color={option.key === likely ? C.gold : C.muted} />
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 13.5 }}>
                    {option.title}
                    {option.key === likely && <span style={{ marginLeft: 8, color: C.gold, fontSize: 10, letterSpacing: '0.8px' }}>LOOKS LIKE YOU</span>}
                  </strong>
                  <small style={{ display: 'block', marginTop: 3, color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}>{option.body}</small>
                </span>
              </button>
            ))}
          </div>
          <footer><span>Sample data · nothing is saved</span></footer>
        </div>
      </div>
    </div>
  );
}
