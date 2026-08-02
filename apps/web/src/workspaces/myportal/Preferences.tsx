import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { SectionHeader, inputStyle, panel, panelLabel } from '../admin/adminUi';
import { getTradeLayout, setTradeLayout, type Layout } from '../trading/preferences';
import {
  AUTO,
  usableZoneGroups,
  deviceZone,
  getDisplayZone,
  getZonePref,
  setZonePref,
  zoneFmt,
  zoneOffsetLabel,
} from '../../lib/timezone';

// My Terminal ▸ Preferences. Per-user, per-device view choices that persist
// locally (no server round-trip): the Trade Log's deck-vs-tape layout, moved off
// the Trade Log header so the toolbar stays lean, and the clock the terminal
// shows times on.
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

      <TimeZoneCard theme={theme} />

      <section style={{ ...panel(theme), marginTop: 16 }}>
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

// The clock every "when did this happen" reading in the terminal is shown on —
// the top-bar clock, a position's opened/closed stamps, an alert's arrival, a
// headline's time, the chart axis. Market hours, session windows and the Fed
// schedule stay Eastern whatever is picked here, since those are facts about the
// market rather than about the reader; the card says so, because nothing on the
// control could.
function TimeZoneCard({ theme }: { theme: Theme }) {
  const [pref, setPref] = useState<string>(() => getZonePref());
  // Re-render every second so the sample below the picker ticks like a clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function choose(v: string) {
    setPref(v);
    setZonePref(v);
  }

  // Built once. Every option carries its current offset, which costs a format
  // per zone — and this card re-renders every second to tick the sample below.
  // A zone's offset only moves at a DST boundary, never while somebody sits on
  // this screen.
  const groups = useMemo(
    () =>
      usableZoneGroups().map((g) => ({
        label: g.label,
        zones: g.zones.map((z) => ({ zone: z.zone, label: `${z.label} (${zoneOffsetLabel(z.zone)})` })),
      })),
    [],
  );

  const zone = getDisplayZone();
  const sample = zoneFmt(
    { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' },
    zone,
  ).format(now);

  return (
    <section style={panel(theme)}>
      <div style={panelLabel}>
        {"Time zone"}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
        {"Times across the terminal are shown on this clock. Market hours, strategy sessions and the Fed schedule stay on Eastern Time wherever you are — those are the market's hours, not yours."}
      </div>

      <select value={pref} onChange={(e) => choose(e.target.value)} style={{ ...inputStyle, marginTop: 12 }}>
        <option value={AUTO}>{`Automatic — follow this device (${deviceZone()})`}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.zones.map((z) => (
              <option key={z.zone} value={z.zone}>
                {z.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div
        style={{
          marginTop: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 13,
          color: C.gold,
          letterSpacing: '0.4px',
        }}
      >
        {sample}
      </div>
    </section>
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
