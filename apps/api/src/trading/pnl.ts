// Shared trade-P/L window math, used by the OANDA capital card and the Funded
// accounts so both read the same way. Always built from trade realized P/L —
// deposits/withdrawals are never trades, so they never count as a "gain".

export interface PnlWindows {
  daily: number; // since the start of today (Eastern Time)
  weekly: number; // last 7 days
  monthly: number; // last 30 days
}

// Start of "today" in Eastern Time as a UTC timestamp, robust to the server's
// own timezone — we subtract the seconds elapsed since ET midnight from now.
export function etDayStart(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const secsIntoDay = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  return now - secsIntoDay * 1000 - (now % 1000);
}

// Total realized P/L over the day / 7-day / 30-day windows. Each item is a closed
// trade's P/L and the ms timestamp it closed at.
export function pnlWindows(trades: { ms: number; pl: number }[], now: number): PnlWindows {
  const sumSince = (since: number) =>
    Number(trades.reduce((s, t) => (t.ms >= since ? s + t.pl : s), 0).toFixed(2));
  return {
    daily: sumSince(etDayStart(now)),
    weekly: sumSince(now - 7 * 86_400_000),
    monthly: sumSince(now - 30 * 86_400_000),
  };
}
