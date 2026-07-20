import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { accentGradient, type Theme } from '../theme/themes';
import { api, ApiError } from '../api/client';
import type { SupportKind } from '../api/types';
import { EditableText } from '../copy/SiteCopy';
import {
  loadThreads,
  saveThreads,
  loadActiveId,
  saveActiveId,
  newThreadId,
  threadTitle,
  type SupportThread,
} from '../lib/supportThreads';
import { Icon } from './Icon';

// The Support tab inside the corner chat bubble. The user picks a category — a
// bug, a suggestion, or a general question — and an AI assistant collects the
// details it needs. When the intake is complete the server files it to the
// matching admin section (bug → Bug Reports, suggestion → Suggestions, general
// → Support), and a red blinking dot flags it on the admin nav.
//
// Conversations are persisted per-user in localStorage (see lib/supportThreads):
// closing the bubble no longer throws away an in-progress request, previous
// requests are listed at the top so they can be reopened, and anything typed but
// not sent is restored as a draft.

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

function categoryFor(kind: SupportKind) {
  return CATEGORIES.find((c) => c.kind === kind) ?? CATEGORIES[2];
}

function whenLabel(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SupportTab({ theme, isDemo, userId }: { theme: Theme; isDemo: boolean; userId: string }) {
  const accentGrad = accentGradient(theme);

  const [threads, setThreads] = useState<SupportThread[]>(() => (isDemo ? [] : loadThreads(userId)));
  const [activeId, setActiveId] = useState<string | null>(() => (isDemo ? null : loadActiveId(userId)));
  // Whether a submitted thread's composer has been reopened to add a follow-up.
  const [followUp, setFollowUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  // Persist threads + which one is open, so reopening the bubble restores state.
  useEffect(() => {
    if (!isDemo) saveThreads(userId, threads);
  }, [isDemo, userId, threads]);
  useEffect(() => {
    if (!isDemo) saveActiveId(userId, active ? active.id : null);
  }, [isDemo, userId, active?.id]);

  // Reset the follow-up composer whenever the open thread changes.
  useEffect(() => {
    setFollowUp(false);
    setError(null);
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [active?.messages, busy, activeId]);

  function patchThread(id: string, patch: Partial<SupportThread>, touch = true) {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: touch ? Date.now() : t.updatedAt } : t)),
    );
  }

  function startThread(kind: SupportKind) {
    const c = categoryFor(kind);
    const now = Date.now();
    const thread: SupportThread = {
      id: newThreadId(),
      kind,
      messages: [{ role: 'ai', body: c.greeting }],
      draft: '',
      submitted: false,
      createdAt: now,
      updatedAt: now,
    };
    setThreads((prev) => [thread, ...prev]);
    setActiveId(thread.id);
    setError(null);
  }

  function openThread(id: string) {
    setActiveId(id);
  }

  function backToList() {
    setActiveId(null);
    setError(null);
  }

  function removeThread(id: string) {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  }

  async function send() {
    if (!active) return;
    const text = active.draft.trim();
    if (!text || busy) return;
    const id = active.id;
    const prevMessages = active.messages;
    const next = [...prevMessages, { role: 'user' as const, body: text }];
    // Optimistically show the user's turn and clear the draft.
    patchThread(id, { messages: next, draft: '' });
    setBusy(true);
    setError(null);
    try {
      const r = await api.supportMessage(active.kind, next);
      patchThread(id, {
        messages: [...next, { role: 'ai', body: r.reply }],
        submitted: active.submitted || r.submitted,
      });
      if (r.submitted) setFollowUp(false);
    } catch (e) {
      // Roll the failed turn back so they can retry, restoring the draft.
      patchThread(id, { messages: prevMessages, draft: text }, false);
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
            <div style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>
              <EditableText id="support.demo.title">Support</EditableText>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: '#aebcd8' }}>
            <EditableText id="support.demo.body">
              Read-only demo. Sign in to the live portal to report a bug, send a suggestion, or ask for help.
            </EditableText>
          </p>
        </div>
      </div>
    );
  }

  // Category picker + previous-requests history.
  if (!active) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {threads.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: '#7e92c0', margin: '0 2px' }}>
              <EditableText id="support.history.title">Previous requests</EditableText>
            </div>
            {threads.map((t) => {
              const cat = categoryFor(t.kind);
              const status = t.submitted
                ? { id: 'support.status.sent', label: 'Sent', color: '#7fd6a3' }
                : t.messages.some((m) => m.role === 'user')
                  ? { id: 'support.status.open', label: 'In progress', color: theme.accent }
                  : { id: 'support.status.draft', label: 'Draft', color: '#c9b06a' };
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: '1px solid #1d3560',
                    background: 'rgba(255,255,255,.02)',
                  }}
                >
                  <button
                    onClick={() => openThread(t.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      color: '#eef3ff',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        flex: 'none',
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(108,158,255,.1)',
                        border: `1px solid ${theme.accent}`,
                      }}
                    >
                      <Icon name={cat.icon} size={14} color={theme.accent} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12.5,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {threadTitle(t, cat.label)}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 10.5, color: '#8ea3cc' }}>
                        <span style={{ color: status.color, fontWeight: 600 }}>
                          <EditableText id={status.id}>{status.label}</EditableText>
                        </span>
                        <span>·</span>
                        <span>{whenLabel(t.updatedAt)}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => removeThread(t.id)}
                    aria-label="Delete this request from your history"
                    title="Delete from history"
                    style={{ flex: 'none', background: 'none', border: 'none', color: '#6f84b2', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 4px' }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ margin: '2px 2px 4px', fontSize: 12.5, color: '#aebcd8', lineHeight: 1.55 }}>
          <EditableText id="support.picker.intro">
            What can we help with? Pick one and the assistant will ask a couple of quick questions, then send it to the
            admins.
          </EditableText>
        </p>
        {CATEGORIES.map((c) => (
          <button
            key={c.kind}
            onClick={() => startThread(c.kind)}
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
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>
                <EditableText id={`support.cat.${c.kind}.label`}>{c.label}</EditableText>
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: '#8ea3cc', marginTop: 1 }}>
                <EditableText id={`support.cat.${c.kind}.blurb`}>{c.blurb}</EditableText>
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  const cat = categoryFor(active.kind);
  const showComposer = !active.submitted || followUp;

  // Intake conversation.
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid #16294f' }}>
        <button
          onClick={backToList}
          aria-label="Back to your requests"
          title="Back"
          style={{ background: 'none', border: 'none', color: '#7e92c0', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
        >
          ‹
        </button>
        <Icon name={cat.icon} size={15} color={theme.accent} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#eef3ff' }}>
          <EditableText id={`support.cat.${active.kind}.label`}>{cat.label}</EditableText>
        </span>
      </div>

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {active.messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && (
              <div style={{ fontSize: 10, color: '#7e92c0', margin: '0 2px 3px' }}>
                <EditableText id="support.assistant.name">Support assistant</EditableText>
              </div>
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
          <div style={{ fontSize: 11.5, color: '#7e92c0', margin: '0 2px' }}>
            <EditableText id="support.typing">Assistant is typing…</EditableText>
          </div>
        )}
      </div>

      {error && (
        <div style={{ margin: '0 10px', fontSize: 12, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '8px 11px' }}>
          {error}
        </div>
      )}

      {active.submitted && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid #16294f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#7fd6a3', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check-check" size={14} />
            <EditableText id="support.sent">Sent to the admins.</EditableText>
          </span>
          {!followUp && (
            <button
              onClick={() => setFollowUp(true)}
              style={{ border: `1px solid ${theme.accent}`, background: 'transparent', color: '#dfe7fa', fontWeight: 600, fontSize: 12, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}
            >
              <EditableText id="support.followup">Add a follow-up</EditableText>
            </button>
          )}
        </div>
      )}

      {showComposer && (
        <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: active.submitted ? 'none' : '1px solid #16294f' }}>
          <input
            value={active.draft}
            onChange={(e) => patchThread(active.id, { draft: e.target.value }, false)}
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
            disabled={busy || !active.draft.trim()}
            aria-label="Send"
            style={{ border: 'none', background: accentGrad, color: theme.accentText, fontWeight: 700, fontSize: 12.5, padding: '0 14px', borderRadius: 8, cursor: 'pointer', opacity: busy || !active.draft.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center' }}
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
