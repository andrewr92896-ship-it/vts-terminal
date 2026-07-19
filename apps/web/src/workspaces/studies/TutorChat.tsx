import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { EditableText } from '../../copy/SiteCopy';

type Msg = { role: 'user' | 'assistant'; content: string };

// A back-and-forth chat with the study tutor about one question or term.
// `context` is a short preamble (the question text, or the term + definition)
// that is folded into the first user turn so every reply stays on-topic, while
// the user only ever sees what they typed. Mount with a `key` (question id or
// term) so switching cards starts a fresh conversation.
export function TutorChat({
  theme,
  context,
  seedLabel,
  seedPrompt,
  placeholder = 'Ask VTS AI…',
  isPhone = false,
  onActivity,
}: {
  theme: Theme;
  context: string;
  // Optional one-tap opener (e.g. "More Details") sent as the first message.
  seedLabel?: string;
  seedPrompt?: string;
  placeholder?: string;
  isPhone?: boolean;
  // Fired when the user actually sends something (the seed opener or a typed
  // message), so a parent can react — e.g. pause flashcard auto-rotation so the
  // card does not flip away mid-conversation.
  onActivity?: () => void;
}) {
  const accentGrad = accentGradient(theme);
  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest turn in view as the conversation grows.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    onActivity?.();
    const nextDisplay: Msg[] = [...chat, { role: 'user', content: t }];
    setChat(nextDisplay);
    setInput('');
    setBusy(true);
    setErr(null);
    try {
      // Fold the context into the first user message only.
      const payload: Msg[] = nextDisplay.map((m, i) =>
        i === 0 && m.role === 'user' ? { role: 'user', content: `${context}\n\n${m.content}` } : m,
      );
      const { reply } = await api.studyTutorChat(payload);
      setChat([...nextDisplay, { role: 'assistant', content: reply }]);
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 503
            ? 'VTS AI isn’t configured yet — an API key needs to be set on the server.'
            : e.message
          : 'Could not reach the tutor.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(chat.length > 0 || busy) && (
        <div
          ref={threadRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxHeight: 280,
            overflowY: 'auto',
            padding: '4px 2px',
          }}
        >
          {chat.map((m, i) => (
            <div key={i} style={m.role === 'user' ? userRow : assistantRow}>
              <div style={m.role === 'user' ? userBubble(theme) : assistantBubble(theme, isPhone)}>
                {m.role === 'assistant' && (
                  <div style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, marginBottom: 4 }}>
                    <EditableText id="tutor.badge" text="VTS AI tutor" />
                  </div>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div style={assistantRow}>
              <div style={{ ...assistantBubble(theme, isPhone), color: '#a99ff0' }}>
                <EditableText id="tutor.thinking" text="Thinking…" />
              </div>
            </div>
          )}
        </div>
      )}

      {err && (
        <div
          onClick={() => setErr(null)}
          style={{ fontSize: 12, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '8px 11px', cursor: 'pointer' }}
        >
          {err} — click to dismiss.
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {seedLabel && seedPrompt && chat.length === 0 && (
          <button
            onClick={() => void send(seedPrompt)}
            disabled={busy}
            style={{ ...detailBtn(theme), opacity: busy ? 0.6 : 1 }}
            title="Get a plain-language explanation, then ask follow-ups"
          >
            {seedLabel}
          </button>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 180 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={busy}
            placeholder={chat.length ? 'Ask a follow-up…' : placeholder}
            aria-label="Ask VTS AI"
            maxLength={2000}
            style={{
              flex: 1,
              minWidth: 100,
              // fontSize must be >= 16px so iOS Safari doesn't auto-zoom the viewport when the field is focused.
              fontSize: 16,
              padding: '9px 12px',
              borderRadius: 8,
              border: `1px solid ${theme.navBorder}`,
              background: 'rgba(255,255,255,.05)',
              color: '#eef3ff',
              outline: 'none',
            }}
          />
          <button
            onClick={() => void send(input)}
            disabled={busy || !input.trim()}
            aria-label="Send message to VTS AI"
            style={{
              border: 'none',
              background: accentGrad,
              color: theme.accentText,
              fontSize: 14,
              fontWeight: 700,
              padding: '9px 13px',
              borderRadius: 8,
              cursor: 'pointer',
              opacity: busy || !input.trim() ? 0.6 : 1,
            }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

const userRow: CSSProperties = { display: 'flex', justifyContent: 'flex-end' };
const assistantRow: CSSProperties = { display: 'flex', justifyContent: 'flex-start' };

function userBubble(theme: Theme): CSSProperties {
  return {
    maxWidth: '85%',
    fontSize: 12.5,
    lineHeight: 1.5,
    color: '#fff',
    background: 'rgba(255,255,255,.08)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: '10px 10px 2px 10px',
    padding: '8px 11px',
    whiteSpace: 'pre-wrap',
  };
}

function assistantBubble(theme: Theme, isPhone: boolean): CSSProperties {
  return {
    maxWidth: '90%',
    fontSize: isPhone ? 13 : 13.5,
    lineHeight: 1.6,
    color: '#dfe7fa',
    background: 'rgba(255,255,255,.04)',
    border: `1px solid ${theme.navBorder}`,
    borderLeft: `3px solid ${theme.accent}`,
    borderRadius: '10px 10px 10px 2px',
    padding: '9px 12px',
    whiteSpace: 'pre-wrap',
  };
}

function detailBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.accent}`,
    background: 'rgba(255,255,255,.05)',
    color: '#fff',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '9px 14px',
    borderRadius: 8,
    cursor: 'pointer',
  };
}
