import { useEffect, useState } from 'react';

const TZ = 'America/New_York';

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

const dateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

// Ticking Eastern Time clock, AM/PM. Everything user-facing is ET per brief.
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 14,
          fontWeight: 600,
          color: '#EBCB74',
          letterSpacing: '0.5px',
        }}
      >
        {timeFmt.format(now)} ET
      </div>
      <div style={{ fontSize: 10, color: '#7488b5', letterSpacing: '0.4px' }}>
        {dateFmt.format(now)}
      </div>
    </div>
  );
}
