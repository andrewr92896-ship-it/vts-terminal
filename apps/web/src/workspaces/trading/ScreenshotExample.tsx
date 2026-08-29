import type { CSSProperties } from 'react';
import { BORDER, BORDER2, FAINT, GOLD, GREEN, MONO, MUTED, RED, TEXT } from './tvChart';

// WHAT READING A SCREENSHOT LOOKS LIKE, WITHOUT READING ONE.
//
// The import panel asks somebody to hand over a picture of their trade history
// before it will tell them anything about what happens to it. This answers that
// question first: here is a screenshot, here is what came out of it, here is
// what would land on the account.
//
// It runs NO AI and calls no route on either terminal — it is a worked example,
// fixed in code. That is what makes it usable in the public terminal, where AI
// fails closed until the provider migration, and it is why the copy says
// "example" everywhere rather than implying anything was read.

interface ExampleRow {
  instrument: string;
  side: 'BUY' | 'SELL';
  size: string;
  open: string;
  close: string;
  profit: number;
  when: string;
}

// Deliberately not a flattering set: one loser, one break-even-ish scratch, and
// a duplicate that the importer would skip. A worked example that only ever
// shows wins is an advertisement rather than an explanation.
const ROWS: ExampleRow[] = [
  { instrument: 'EUR/USD', side: 'BUY', size: '1.00', open: '1.16412', close: '1.16589', profit: 177.0, when: 'Aug 26, 09:41 → 11:08' },
  { instrument: 'XAU/USD', side: 'SELL', size: '0.50', open: '4,641.20', close: '4,648.90', profit: -385.0, when: 'Aug 26, 12:02 → 12:47' },
  { instrument: 'GBP/USD', side: 'BUY', size: '0.75', open: '1.35901', close: '1.35908', profit: 5.25, when: 'Aug 26, 14:15 → 14:31' },
  { instrument: 'EUR/USD', side: 'BUY', size: '1.00', open: '1.16412', close: '1.16589', profit: 177.0, when: 'Aug 26, 09:41 → 11:08' },
];

const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`;

const wrap: CSSProperties = {
  marginTop: 12,
  border: `1px solid ${BORDER2}`,
  borderRadius: 10,
  overflow: 'hidden',
};
const head: CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(235,203,116,.07)',
  borderBottom: `1px solid ${BORDER}`,
  fontSize: 11,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: GOLD,
};
const cell: CSSProperties = { padding: '7px 10px', fontSize: 11.5, color: TEXT, whiteSpace: 'nowrap' };
const th: CSSProperties = { ...cell, fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, fontWeight: 600 };

export function ScreenshotExample({ onClose }: { onClose: () => void }) {
  return (
    <div style={wrap}>
      <div style={head}>Example — nothing was read, and nothing was logged</div>

      <div style={{ padding: '14px 16px', display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>1 · The screenshot you paste</div>
          {/* Drawn rather than shipped as an image: a picture of somebody's real
              platform is a picture of somebody's real account. */}
          <div style={{ background: '#0d1424', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontFamily: MONO, fontSize: 10.5, color: '#9db3d8', lineHeight: 1.75 }}>
            <div style={{ color: FAINT, marginBottom: 6 }}>Trade History — Aug 26</div>
            {ROWS.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>{r.side} {r.size} {r.instrument}</span>
                <span style={{ color: r.profit >= 0 ? GREEN : RED }}>{money(r.profit)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>2 · What comes back</div>
          <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Instrument</th><th style={th}>Side</th><th style={th}>Size</th>
                  <th style={th}>Open → Close</th><th style={{ ...th, textAlign: 'right' }}>P/L</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => {
                  // The fourth row is the same trade as the first. The importer
                  // dedupes on time + profit, so it is SHOWN as skipped rather
                  // than quietly dropped — a row that vanishes with no reason
                  // given is the thing people report as a bug.
                  const dupe = i === ROWS.length - 1;
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${BORDER}`, opacity: dupe ? 0.45 : 1 }}>
                      <td style={cell}>{r.instrument}</td>
                      <td style={{ ...cell, color: r.side === 'BUY' ? GREEN : RED }}>{r.side}</td>
                      <td style={cell}>{r.size}</td>
                      <td style={{ ...cell, fontFamily: MONO, fontSize: 10.5, color: MUTED }}>{r.when}</td>
                      <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, color: dupe ? FAINT : r.profit >= 0 ? GREEN : RED }}>
                        {dupe ? 'duplicate — skipped' : money(r.profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 9, lineHeight: 1.55 }}>
            3 trades added · 1 duplicate skipped. They land on the account you chose, and you can edit or
            delete any of them afterwards.
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: FAINT, lineHeight: 1.5, flex: 1 }}>
          A worked example, fixed in code. No image was read, no AI ran, and nothing was added to any
          account. Figures are illustrative and are not a record of anybody's trading.
        </span>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER2}`, borderRadius: 8, color: MUTED, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          Close example
        </button>
      </div>
    </div>
  );
}
