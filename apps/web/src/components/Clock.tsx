import { useEffect, useState } from 'react';
import { subscribeZone, zoneAbbr, zoneFmt } from '../lib/timezone';

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
};

// Ticking clock, AM/PM, in the zone the user reads the terminal in (Eastern
// unless they have changed it in My Terminal ▸ Preferences). It is the
// terminal's continuous statement of which clock every other stamp is on —
// which is why the compact stamps elsewhere can stay zone-free without becoming
// ambiguous.
//
// BOTH lines name the zone. The date rolls with it too (at 11:30 PM Eastern it
// already reads the next day in London), and on the zones a US reader is most
// likely to pick that is the only visible difference for most of the day — so
// the date line saying which clock it is on is what makes it checkable rather
// than something to be taken on trust.
//
// It subscribes to the setting because it stays mounted while the setting is
// changed; without that it would keep ticking in the old zone.
// `compact` renders a smaller single-line-ish version for the top bar.
export function Clock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const [, bumpZone] = useState(0);

  useEffect(() => subscribeZone(() => bumpZone((n) => n + 1)), []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeFmt = zoneFmt(TIME_OPTS);
  const dateFmt = zoneFmt(DATE_OPTS);

  return (
    <div style={{ textAlign: 'right', lineHeight: 1.15 }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: compact ? 11.5 : 14,
          fontWeight: 600,
          color: '#EBCB74',
          letterSpacing: '0.4px',
        }}
      >
        {timeFmt.format(now)} {zoneAbbr(now.getTime())}
      </div>
      <div style={{ fontSize: compact ? 8.5 : 10, color: '#7488b5', letterSpacing: '0.3px' }}>
        {dateFmt.format(now)} {zoneAbbr(now.getTime())}
      </div>
    </div>
  );
}
