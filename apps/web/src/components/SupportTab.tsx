import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { accentGradient, type Theme } from '../theme/themes';
import { api, ApiError } from '../api/client';
import type { SupportKind } from '../api/types';
import { Icon } from './Icon';

// The Support tab inside the corner chat bubble. The user picks a category — a
// bug, a suggestion, or a general question — and an AI assistant collects the
// details it needs. When the intake is complete the server files it to the
// matching admin section (bug → Bug Reports, suggestion → Suggestions, general
// → Support), and a red blinking dot flags it on the admin nav.

interface Msg {
  role: 'user' | 'ai';
  body: string;
}

const CATEGORIES: { kind: SupportKind; label: string; icon: string; blurb: string; greeting: string }[] = [
  {
    kind: 'bug',
    label: 'Report a bug',
    icon: 'bug',
    blurb: 'Something broke or looked wrong',
    greeting:
      'Sorry you hit a snag. Tell me what happened — what you were doing, what you expected, and what actually happened (and where in the app).',
  },
  {
    kind: 'suggestion',
    label: 'Suggestion',
    icon: 'lightbulb',
    blurb: 'An idea to improve the portal',
    greeting: "Love it — what's your idea? Tell me what you'd like to see and the problem it would solve.",
  },
  {
    kind: 'support',
    label: 'General support',
    icon: 'life-buoy',
    blurb: 'A question or something else',
    greeting: 'Happy to help. What do you need a hand with?',
  },
];

export function SupportTab({ theme, isDemo }: { theme: Theme; isDemo: boolean }) {
  const accentGrad = accentGradient(theme);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages, busy]);

  function pick(c: (typeof CATEGORIES)[number]) {
    setCat(c);
    setMessages([{ role: 'ai', body: c.greeting }]);
    setInput('');
    setDone(false);
    setError(null);
  }

  function reset() {
    setCat(null);
    setMessages([]);
    setInput('');
    setDone(false);
    setError(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || done || !cat) return;
    const next: Msg[] = [...messages, { role: 'user', body: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const r = await api.supportMessage(cat.kind, next);
      setMessages([...next, { role: 'ai', body: r.reply }]);
      if (r.submitted) setDone(true);
    } catch (e) {
      // Roll the failed turn back so they can retry.
      setMessages(messages);
      setInput(text);
      setError(e instanceof ApiError ? e.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (isDemo) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ background: 'rgba(108,158,255,.08)', border: `1px solid ${theme.accent}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <Icon name="life-buoy" size={18} color={theme.accent} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>Support</div>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: '#aebcd8' }}>
            Read-only demo. Sign in to the live portal to report a bug, send a suggestion, or ask for help.
          </p>
        </div>
      </div>
    );
  }

  // Category picker.
  if (!cat) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: '2px 2px 4px', fontSize: 12.5, color: '#aebcd8', lineHeight: 1.55 }}>
          What can we help with? Pick one and the assistant will ask a couple of quick questions, then send it to the
          admins.
        </p>
        {CATEGORIES.map((c) => (
          <button
            key={c.kind}
            onClick={() => pick(c)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textAlign: 'left',
              padding: '13px 14px',
              borderRadius: 12,
              border: '1px solid #1d3560',
              background: 'rgba(255,255,255,.03)',
              color: '#eef3ff',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                flex: 'none',
                width: 34,
                height: 34,
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(108,158,255,.1)',
                border: `1px solid ${theme.accent}`,
              }}
            >
              <Icon name={c.icon} size={17} color={theme.accent} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{c.label}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: '#8ea3cc', marginTop: 1 }}>{c.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  // Intake conversation.
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid #16294f' }}>
        <button
          onClick={reset}
          aria-label="Back to categories"
          title="Back"
          style={{ background: 'none', border: 'none', color: '#7e92c0', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
        >
          ‹
        </button>
        <Icon name={cat.icon} size={15} color={theme.accent} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#eef3ff' }}>{cat.label}</span>
      </div>

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && (
              <div style={{ fontSize: 10, color: '#7e92c0', margin: '0 2px 3px' }}>Support assistant</div>
            )}
            <div
              style={{
                maxWidth: '85%',
                fontSize: 12.5,
                lineHeight: 1.55,
                padding: '8px 11px',
                borderRadius: 10,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: m.role === 'user' ? '#06122c' : '#dfe7fa',
                background: m.role === 'user' ? theme.accent : 'rgba(255,255,255,.05)',
                border: m.role === 'user' ? 'none' : '1px solid #1d3560',
              }}
            >
              {m.body}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ fontSize: 11.5, color: '#7e92c0', margin: '0 2px' }}>Assistant is typing…</div>
        )}
      </div>

      {error && (
        <div style={{ margin: '0 10px', fontSize: 12, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '8px 11px' }}>
          {error}
        </div>
      )}

      {done ? (
        <div style={{ padding: 12, borderTop: '1px solid #16294f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#7fd6a3', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check-check" size={14} />
            Sent to the admins.
          </span>
          <button
            onClick={reset}
            style={{ border: 'none', background: accentGrad, color: theme.accentText, fontWeight: 700, fontSize: 12, padding: '8px 13px', borderRadius: 8, cursor: 'pointer' }}
          >
            New request
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #16294f' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Type your reply…"
            maxLength={4000}
            disabled={busy}
            style={inputStyle}
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            aria-label="Send"
            style={{ border: 'none', background: accentGrad, color: theme.accentText, fontWeight: 700, fontSize: 12.5, padding: '0 14px', borderRadius: 8, cursor: 'pointer', opacity: busy || !input.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center' }}
          >
            <Icon name="send" size={14} />
          </button>
        </div>
      )}
    </>
  );
}

const inputStyle: CSSProperties = {
  flex: 1,
  background: '#091633',
  border: '1px solid #1c3a7a',
  borderRadius: 7,
  color: '#eef3ff',
  fontSize: 12.5,
  padding: '9px 11px',
  outline: 'none',
};
