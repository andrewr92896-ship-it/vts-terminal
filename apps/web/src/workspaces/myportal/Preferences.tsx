import { useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { SectionHeader, panel, panelLabel } from '../admin/adminUi';
import { getTradeLayout, setTradeLayout, type Layout } from '../trading/preferences';

// My Terminal ▸ Preferences. Per-user, per-device view choices that persist
// locally (no server round-trip). Today it holds the Trade Log's deck-vs-tape
// layout, moved off the Trade Log header so the toolbar stays lean.
export function Preferences({ theme }: { theme: Theme }) {
  const [layout, setLayout] = useState<Layout>(() => getTradeLayout());

  function choose(v: Layout) {
    setLayout(v);
    setTradeLayout(v);
  }

  const opts: { key: Layout; label: string; desc: string }[] = [
    { key: 'deck', label: 'Deck', desc: 'Roomy cards — one tile per trade with the full breakdown.' },
    { key: 'tape', label: 'Tape', desc: 'Dense rows — more trades on screen at once.' },
  ];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 40px' }}>
      <SectionHeader
        title="Preferences"
        subtitle="Your personal view choices. Saved for you on this device."
      />

      <section style={panel(theme)}>
        <div style={panelLabel}>
          {"Trade Log layout"}
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          {"How the Trade Log lays out your trades. This replaces the Deck / Tape switch that used to sit in the Trade Log header."}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {opts.map((o) => {
            const active = layout === o.key;
            return (
              <button
                key={o.key}
                onClick={() => choose(o.key)}
                style={{
                  ...optCard,
                  borderColor: active ? C.gold : C.line2,
                  background: active ? 'rgba(235,203,116,.1)' : 'rgba(255,255,255,.03)',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700, color: active ? C.gold : C.text }}>{o.label}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{o.desc}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const optCard: CSSProperties = {
  flex: '1 1 200px',
  textAlign: 'left',
  border: `1px solid ${C.line2}`,
  borderRadius: 10,
  padding: '12px 14px',
  cursor: 'pointer',
};
