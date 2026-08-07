import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { AiUsage, GuardrailHit } from '../api/types';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasEntitlement, tierOfFeature } from '../auth/access';
import { UpgradeNotice } from './UpgradeNotice';
import { TierMark } from './TierMark';
import { ReviewMark } from './ReviewMark';
import { GuardrailNotice, GuardrailPaused } from './GuardrailNotice';

interface AskClaudePanelProps {
  open: boolean;
  theme: Theme;
  workspace?: string; // workspace key (trading, studies, ...) for context
  workspaceLabel?: string; // human label, for display
  onClose: () => void;
  /** Sends the reader to My Terminal ▸ Premium Features when they lack the tier. */
  onOpenMembership?: () => void;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  // Set on an assistant turn that was a financial-advice refusal, so the notice
  // stays attached to the exchange it is about rather than floating at the
  // bottom of the panel where a later message would orphan it.
  guardrail?: GuardrailHit;
}

// Suggested prompts tailored to the current workspace.
const SUGGESTIONS_BY_WS: Record<string, string[]> = {
  myportal: ['What moved the market today?', 'What’s on the economic calendar this week?', 'How do I set up my Live Wall board?'],
  trading: ['How do I log a trade by hand?', 'What’s a healthy daily drawdown buffer?', 'How do I read slippage in my trade log?'],
  studies: ['Explain a concept from my study set', 'Quiz me on a topic', 'Give me a memory hook for a term'],
};
const DEFAULT_SUGGESTIONS = ['Summarize what this terminal can do', 'What can you help me with here?'];

export function AskClaudePanel({
  open,
  theme,
  workspace,
  workspaceLabel,
  onClose,
  onOpenMembership,
}: AskClaudePanelProps) {
  const { user } = useAuth();
  // VTS AI is paid. The button stays in the top bar for everyone on purpose —
  // hiding it would leave a free account unable to discover the feature exists —
  // so the panel opens as normal and the composer is replaced by the upgrade
  // notice. The server refuses /api/ai/ask with a 402 regardless.
  const canUseAi = hasEntitlement(user, 'ai');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-null while AI features are paused after repeated financial-advice
  // requests. Read on open as well as set on a rejected send, so re-opening the
  // panel inside a pause explains itself rather than looking broken.
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  // The whole usage payload: the text allowance this panel spends, the separate
  // screenshot allowance, and — for an admin — what the terminal spent on its
  // own schedule.
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // The guardrail pause, read when the panel opens: a user who tripped it in
  // another tab (or reloaded) should meet the explanation, not a composer that
  // rejects everything they type.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .aiGuardrailStatus()
      .then((r) => {
        if (alive) setPausedUntil(r.timeoutUntil);
      })
      .catch(() => {
        /* best effort — the send path reports it too */
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // Load the monthly-usage counter when the panel opens.
  useEffect(() => {
    if (!open) return;
    api
      .aiUsage()
      .then((u) => {
        setRemaining(u.remaining);
        setUsage(u);
      })
      .catch(() => {
        setRemaining(null);
        setUsage(null);
      });
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
      const { reply, guardrail } = await api.askAi(next, workspace);
      setMessages([...next, { role: 'assistant', content: reply, guardrail }]);
      if (guardrail?.timeoutUntil) setPausedUntil(guardrail.timeoutUntil);
      api
        .aiUsage()
        .then((u) => {
          setRemaining(u.remaining);
          setUsage(u);
        })
        .catch(() => {
          /* keep the last figures */
        });
    } catch (e) {
      // 423 is the guardrail pause and is NOT an error to show in red — the
      // user is not broken, they are waiting. It gets its own card, so the
      // message list is left alone and the composer explains itself.
      if (e instanceof ApiError && e.status === 423) {
        const until = (e.body as { timeoutUntil?: number } | null)?.timeoutUntil;
        setPausedUntil(typeof until === 'number' ? until : Date.now() + 30 * 60 * 1000);
        setMessages(next);
        return;
      }
      const msg =
        e instanceof ApiError
          ? e.status === 503
            ? 'VTS AI isn’t configured yet — an API key needs to be set on the server.'
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
          height: 'var(--app-h)',
          width: 'min(440px, calc(94 * var(--vw)))',
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
            <strong style={{ fontSize: 14, color: '#eef3ff' }}>Ask VTS AI</strong>
            {/* The top-bar button opens for everyone, so the panel is where the
                feature can say what it costs. Drawn for a Max member too — the
                mark states a price, it is not a lock. */}
            <TierMark tier={tierOfFeature('ai', user?.access.membership)} size={12} />
            <ReviewMark id="ai" size={12} />
            {workspaceLabel && <span style={{ fontSize: 11, color: '#7e92c0' }}>· {workspaceLabel}</span>}
            <span style={{ fontSize: 9.5, color: '#6f84b0', border: '1px solid #234584', borderRadius: 4, padding: '1px 6px', fontFamily: "'IBM Plex Mono', monospace" }}>VTS AI</span>
            {remaining != null && (
              <span title="Questions left this month" style={{ fontSize: 9.5, color: remaining <= 5 ? '#e0a23a' : '#6f84b0', fontFamily: "'IBM Plex Mono', monospace" }}>
                {remaining} left
              </span>
            )}
            {/* The screenshot allowance is separate and much smaller, so it is
                worth showing before somebody runs into it mid-import. */}
            {usage && (
              <span
                title="Screenshot reads left this month — a separate allowance from questions"
                style={{ fontSize: 9.5, color: usage.vision.remaining <= 3 ? '#e0a23a' : '#6f84b0', fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {usage.vision.remaining} screenshots
              </span>
            )}
            {/* Admins only: what the terminal spent tagging news and explaining
                calendar releases. Not an allowance — nothing caps it. */}
            {usage?.system != null && (
              <span
                title="Background AI this month (news tagging, calendar explainers) — not capped"
                style={{ fontSize: 9.5, color: '#6f84b0', fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {usage.system} system
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
          {!canUseAi && (
            <UpgradeNotice feature="ai" onOpenMembership={onOpenMembership} />
          )}
          {canUseAi && messages.length === 0 && !busy && (
            <div style={{ color: '#aebcd8', fontSize: 13, lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>{workspaceLabel ? `Ask anything about ${workspaceLabel} or the rest of the terminal.` : 'Ask anything about the terminal, your workflow, trading, or finances.'} Powered by VTS AI.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => void send(s)} style={chip(theme)}>{s}</button>
                ))}
              </div>
              {/* Stated up front, not only after somebody trips a limit. Two
                  facts, and the second matters as much as the first: the team can
                  read these conversations, and the team cannot read your trading
                  data. Saying only the first would be a warning; saying both is
                  the actual arrangement. */}
              <p style={privacyLine}>
                VTS AI explains things — it can’t give financial or investment advice.
                These conversations aren’t private and can be reviewed by the team.
                Your trading data is separate: positions, results, balances and broker
                keys are never read by administrators, and only a software developer
                can reach them, only to keep them secure.
              </p>
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
              {/* Attached to the exchange it is about, so a later message does
                  not orphan it at the bottom of the panel. */}
              {m.guardrail && <GuardrailNotice hit={m.guardrail} />}
            </div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', color: '#7488b5', fontSize: 12, fontStyle: 'italic' }}>VTS AI is thinking…</div>}
          {/* The standing pause, for a panel opened inside one. Suppressed when
              the last turn already carries its own notice, which says the same
              thing with more context. */}
          {pausedUntil != null &&
            pausedUntil > Date.now() &&
            !messages[messages.length - 1]?.guardrail && (
              <div style={{ alignSelf: 'stretch' }}>
                <GuardrailPaused until={pausedUntil} />
              </div>
            )}
          {error && <div style={{ color: '#ffb4ab', fontSize: 12.5, background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 11px' }}>{error}</div>}
        </div>

        {/* Composer — replaced by the upgrade notice above when the account
            cannot reach VTS AI, so there is no box to type a question into that
            would only come back refused. */}
        {canUseAi && (
        <div style={{ padding: 14, borderTop: `1px solid ${theme.navBorder}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask VTS AI…  (Enter to send)"
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
        )}
      </aside>
    </>
  );
}

const privacyLine: CSSProperties = {
  marginTop: 16,
  marginBottom: 0,
  paddingTop: 12,
  borderTop: '1px solid #1d3560',
  fontSize: 10.5,
  lineHeight: 1.6,
  color: '#7488b5',
};

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
