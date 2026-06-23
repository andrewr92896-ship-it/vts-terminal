import { useState } from 'react';
import { ApiError } from '../api/client';

// Reusable "Brief me" support for dashboards: a hook that asks Claude (Sonnet)
// for a short plain-text read of the screen, plus presentational cards. Each
// screen passes its own fetcher (an api.* call) and accent color.
export function useAiBrief(fetcher: () => Promise<{ brief: string }>) {
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setBrief((await fetcher()).brief);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 503
            ? 'Claude isn’t configured yet — an API key needs to be set on the server.'
            : e.message
          : 'Brief failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, brief, error, dismiss: () => { setBrief(null); setError(null); } };
}

export function BriefButton({ onClick, busy, accent, accentText = '#05231a' }: { onClick: () => void; busy: boolean; accent: string; accentText?: string }) {
  return (
    <button onClick={onClick} disabled={busy} style={{ border: 'none', background: accent, color: accentText, fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
      {busy ? 'Briefing…' : '✨ Brief me'}
    </button>
  );
}

export function BriefCard({ brief, accent, onDismiss }: { brief: string; accent: string; onDismiss: () => void }) {
  return (
    <div style={{ position: 'relative', background: 'rgba(255,255,255,.03)', border: `1px solid ${accent}55`, borderLeft: `3px solid ${accent}`, borderRadius: 12, padding: '13px 15px', marginBottom: 16 }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: accent, marginBottom: 6 }}>Claude · Sonnet</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: '#dfe7fa', whiteSpace: 'pre-wrap' }}>{brief}</div>
      <button onClick={onDismiss} style={{ position: 'absolute', top: 9, right: 12, background: 'none', border: 'none', color: '#7488a5', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
  );
}

export function BriefError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div onClick={onDismiss} style={{ marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }}>
      {message} — click to dismiss.
    </div>
  );
}
