import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';
import { api, ApiError } from '../api/client';

interface AskClaudePanelProps {
  open: boolean;
  theme: Theme;
  workspace?: string; // workspace key (trading, studies, ...) for context
  workspaceLabel?: string; // human label, for display
  onClose: () => void;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

// Suggested prompts tailored to the current workspace.
const SUGGESTIONS_BY_WS: Record<string, string[]> = {
  trading: ['How do I log a trade by hand?', 'What’s a healthy daily drawdown buffer?', 'How do I read slippage in my trade log?'],
  studies: ['Explain the brochure rule (Series 65)', 'Quiz me on fiduciary duty', 'Define a discretionary account'],
  todo: ['How do recurring tasks work?', 'What can the command bar do?', 'Help me plan my week'],
};
const DEFAULT_SUGGESTIONS = ['Summarize what this portal can do', 'What can you help me with here?'];

export function AskClaudePanel({ open, theme, workspace, workspaceLabel, onClose }: AskClaudePanelProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Load the monthly-usage counter when the panel opens.
  useEffect(() => {
    if (!open) return;
    api.aiUsage().then((u) => setRemaining(u.remaining)).catch(() => setRemaining(null));
  }, [open]);

  const suggestions = (workspace && SUGGESTIONS_BY_WS[workspace]) || DEFAULT_SUGGESTIONS;

  if (!open) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const { reply } = await api.askAi(next, workspace);
      setMessages([...next, { role: 'assistant', content: reply }]);
      api.aiUsage().then((u) => setRemaining(u.remaining)).catch(() => { /* keep */ });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 503
            ? 'Claude isn’t configured yet — an API key needs to be set on the server.'
            : e.status === 429
              ? e.message
              : e.message
          : 'Request failed';
      setError(msg);
      if (e instanceof ApiError && e.status === 429) setRemaining(0);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, animation: 'fadeIn .2s ease' }} />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(440px, 94vw)',
          background: 'linear-gradient(180deg,#0b1a3a,#081226)',
          borderLeft: `1px solid ${theme.navBorder}`,
          boxShadow: '-16px 0 50px rgba(0,0,0,.5)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn .25s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: `1px solid ${theme.navBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: accentGradient(theme) }} />
            <strong style={{ fontSize: 14, color: '#eef3ff' }}>Ask Claude</strong>
            {workspaceLabel && <span style={{ fontSize: 11, color: '#7e92c0' }}>· {workspaceLabel}</span>}
            <span style={{ fontSize: 9.5, color: '#6f84b0', border: '1px solid #234584', borderRadius: 4, padding: '1px 6px', fontFamily: "'IBM Plex Mono', monospace" }}>Sonnet</span>
            {remaining != null && (
              <span title="AI requests left this month" style={{ fontSize: 9.5, color: remaining <= 5 ? '#e0a23a' : '#6f84b0', fontFamily: "'IBM Plex Mono', monospace" }}>
                {remaining} left
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setError(null); }} style={{ background: 'none', border: 'none', color: '#7488b5', fontSize: 11.5, cursor: 'pointer' }}>Clear</button>
            )}
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#7488b5', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && !busy && (
            <div style={{ color: '#aebcd8', fontSize: 13, lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>{workspaceLabel ? `Ask anything about ${workspaceLabel} or the rest of the portal.` : 'Ask anything about the portal, your workflow, trading, or finances.'} Powered by Claude Sonnet.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => void send(s)} style={chip(theme)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  padding: '10px 13px',
                  borderRadius: 12,
                  color: m.role === 'user' ? '#06122c' : '#dfe7fa',
                  background: m.role === 'user' ? theme.accent : 'rgba(255,255,255,.05)',
                  border: m.role === 'user' ? 'none' : `1px solid ${theme.navBorder}`,
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', color: '#7488b5', fontSize: 12, fontStyle: 'italic' }}>Claude is thinking…</div>}
          {error && <div style={{ color: '#ffb4ab', fontSize: 12.5, background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 11px' }}>{error}</div>}
        </div>

        {/* Composer */}
        <div style={{ padding: 14, borderTop: `1px solid ${theme.navBorder}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask Claude…  (Enter to send)"
              rows={2}
              // fontSize must be >= 16px so iOS Safari doesn't auto-zoom the viewport when the field is focused.
              style={{ flex: 1, resize: 'none', background: 'rgba(6,15,36,.6)', border: '1px solid #1d3560', borderRadius: 9, color: '#dfe7fa', padding: 11, fontSize: 16, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={() => void send(input)}
              disabled={busy || !input.trim()}
              style={{ border: 'none', background: accentGradient(theme), color: theme.accentText, fontWeight: 700, fontSize: 13, padding: '0 16px', height: 42, borderRadius: 9, cursor: busy || !input.trim() ? 'default' : 'pointer', opacity: busy || !input.trim() ? 0.55 : 1 }}
            >
              Send
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function chip(theme: Theme): CSSProperties {
  return {
    textAlign: 'left',
    fontSize: 12.5,
    color: '#cdd9f5',
    background: 'rgba(255,255,255,.04)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 8,
    padding: '9px 12px',
    cursor: 'pointer',
  };
}
