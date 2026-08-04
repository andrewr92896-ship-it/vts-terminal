import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasEntitlement } from '../../auth/access';
import type { PremiumFeature } from '../../api/types';
import { TierMark } from '../../components/TierMark';
import { UpgradeNotice } from '../../components/UpgradeNotice';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';

type Msg = { role: 'user' | 'assistant'; content: string };

// A back-and-forth chat with the study tutor about one question or term.
// `context` is a short preamble (the question text, or the term + definition)
// that is folded into the first user turn so every reply stays on-topic, while
// the user only ever sees what they typed. Mount with a `key` (question id or
// term) so switching cards starts a fresh conversation.
//
// **The two halves are on different tiers** (owner decision, 2026-08). The
// one-tap opener — "Break this down" in the study game, "More Details" on a
// flashcard — is `studyExplain` (Premium); typing your own question, opener or
// follow-up, is `studyAsk` (Max). Both controls are drawn for everyone with their
// star / diamond, the same rule the sidebar rows and the Studies tiles follow: a
// free account has to be able to see what upgrading would give it. The server
// enforces it on the shape of the request (`routes/ai.ts`), so this is the
// signposting, not the gate.
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
  const { user } = useAuth();
  const canExplain = hasEntitlement(user, 'studyExplain');
  const canAsk = hasEntitlement(user, 'studyAsk');
  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Which feature the reader just reached without the tier for it, so the prompt
  // names the right one. Cleared as soon as they use the half they do hold.
  const [locked, setLocked] = useState<PremiumFeature | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest turn in view as the conversation grows.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, busy]);

  async function send(text: string, seed = false) {
    const t = text.trim();
    if (!t || busy) return;
    // A follow-up is always the typed half, whatever opened the thread.
    const needed: PremiumFeature = seed && chat.length === 0 ? 'studyExplain' : 'studyAsk';
    if (!(needed === 'studyExplain' ? canExplain : canAsk)) {
      setLocked(needed);
      return;
    }
    setLocked(null);
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
      const { reply } = await api.studyTutorChat(payload, { seed });
      setChat([...nextDisplay, { role: 'assistant', content: reply }]);
    } catch (e) {
      // The server is the enforcer, so honour its answer over the entitlement
      // this client read at mount — a membership that lapsed mid-session shows
      // the upgrade prompt rather than a bare error.
      if (e instanceof ApiError && e.status === 402) {
        // Put the thread and the box back the way they were: nothing was sent,
        // so nothing should look sent.
        setChat(chat);
        if (!seed) setInput(t);
        setLocked(needed);
        return;
      }
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
                    {"VTS AI tutor"}
                  </div>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div style={assistantRow}>
              <div style={{ ...assistantBubble(theme, isPhone), color: '#a99ff0' }}>
                {"Thinking…"}
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

      {/* Shown in place of nothing happening when a locked control is pressed —
          the control itself stays where it was, marked, rather than disappearing. */}
      {locked && <UpgradeNotice feature={locked} compact />}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {seedLabel && seedPrompt && chat.length === 0 && (
          <button
            onClick={() => void send(seedPrompt, true)}
            disabled={busy}
            style={{ ...detailBtn(theme), opacity: busy ? 0.6 : 1 }}
            title="Get a plain-language explanation, then ask follow-ups"
          >
            {seedLabel}
            <TierMark tier="premium" size={12} dim={!canExplain} />
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
          {/* Marks the typed half. It sits after the send button rather than on
              it, so the diamond reads as the price of the field beside it and not
              as decoration on an arrow. */}
          <TierMark tier="max" size={13} dim={!canAsk} />
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
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
