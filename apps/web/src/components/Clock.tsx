import { useEffect, useState } from 'react';
import { subscribeZone, zoneAbbr, zoneFmt } from '../lib/timezone';

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

// Without seconds. Three characters of a ticking counter is not worth the width
// on a phone top bar — it was pushing the section name into an ellipsis, so the
// bar said what time it is and not where you are.
const TIME_OPTS_NO_SECONDS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
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
export function Clock({ compact = false, seconds = true }: { compact?: boolean; seconds?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const [, bumpZone] = useState(0);

  useEffect(() => subscribeZone(() => bumpZone((n) => n + 1)), []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeFmt = zoneFmt(seconds ? TIME_OPTS : TIME_OPTS_NO_SECONDS);
  const dateFmt = zoneFmt(DATE_OPTS);

  return (
    // The two class names are style hooks and nothing else — no rule in the
    // private terminal reads them. They exist so a narrow top bar can drop the
    // date line and keep the time on ONE line: at phone width this rendered as
    // "9:01:25 / PM ET" over two lines with the date and a second "ET" under it,
    // three lines of clock in a 64px bar.
    <div className="vts-clock" style={{ textAlign: 'right', lineHeight: 1.15 }}>
      <div
        className="vts-clock-time"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: compact ? 11.5 : 14,
          fontWeight: 600,
          color: '#EBCB74',
          letterSpacing: '0.4px',
          whiteSpace: 'nowrap',
        }}
      >
        {timeFmt.format(now)} {zoneAbbr(now.getTime())}
      </div>
      <div className="vts-clock-date" style={{ fontSize: compact ? 8.5 : 10, color: '#7488b5', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
        {dateFmt.format(now)} {zoneAbbr(now.getTime())}
      </div>
    </div>
  );
}
