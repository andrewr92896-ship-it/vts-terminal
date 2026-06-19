// Placeholder feed. Real headlines get wired to a source later (same as the
// To Do command bar and Product Knowledge chat). Sample items below mirror
// the prototype so the layout is reviewable.

const SAMPLE = [
  { title: 'Kia EV9 earns 2026 IIHS Top Safety Pick+', summary: 'The three-row electric SUV cleared updated front-crash testing, a strong family-buyer talking point.', tag: 'EV9', source: 'Kia Newsroom', age: '10m ago' },
  { title: '2.9% APR live on Sportage Hybrid through month-end', summary: 'Captive financing promo sharpens payments versus RAV4 Hybrid.', tag: 'Incentive', source: 'KMA Dealer Comms', age: '50m ago' },
  { title: '2026 Telluride refresh reaches dealers next month', summary: 'Updated fascia, larger center display, revised trim packaging.', tag: 'Telluride', source: 'Automotive News', age: '2h ago' },
  { title: 'Kia America posts record Q2 SUV sales', summary: 'Telluride and Sportage led volume; EV9 allocation increased for Q3.', tag: 'Corporate', source: 'Kia Newsroom', age: '5h ago' },
  { title: 'EV6 OTA update improves DC fast-charge curve', summary: 'Software refresh trims 10-80% charge time, a talking point for EV-curious shoppers.', tag: 'EV6', source: 'InsideEVs', age: '1d ago' },
];

export function KiaNews() {
  return (
    <div style={{ maxWidth: 900, color: '#eceef0', animation: 'fadeIn .25s ease' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, color: '#fff' }}>Kia News</h2>
      <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#9aa0a8' }}>
        Product, incentive, and corporate headlines relevant to the floor.
      </p>
      <div
        style={{
          display: 'inline-block',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          color: '#e0a23a',
          border: '1px solid #5a4423',
          background: 'rgba(224,162,58,.1)',
          borderRadius: 5,
          padding: '3px 9px',
          marginBottom: 16,
        }}
      >
        Sample feed — live source wired later
      </div>
      {SAMPLE.map((n) => (
        <div
          key={n.title}
          style={{
            display: 'flex',
            gap: 14,
            padding: '15px 16px',
            marginBottom: 11,
            background: '#15171b',
            border: '1px solid #2a2d33',
            borderLeft: '3px solid #BB162B',
            borderRadius: 9,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#e07a86', background: 'rgba(187,22,43,.14)', border: '1px solid #4a2228', padding: '2px 7px', borderRadius: 4 }}>{n.tag}</span>
              <span style={{ fontSize: 10.5, color: '#7d828a', fontFamily: "'IBM Plex Mono', monospace" }}>{n.source} · {n.age}</span>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: '#f1f2f4', lineHeight: 1.35 }}>{n.title}</div>
            <div style={{ fontSize: 12, color: '#9aa0a8', lineHeight: 1.5, marginTop: 5 }}>{n.summary}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
