import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useResponsive } from '../hooks/useMediaQuery';
import { accentGradient, type Theme } from '../theme/themes';
import { api, ApiError } from '../api/client';
import { isAdmin } from '../auth/access';
import type { ChatMessage, TeamChatReason, User } from '../api/types';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

// The lower-right corner widget: the Team Chat, and only the team chat. The
// how-to guides, announcements, and patch notes now live in the Site Help
// workspace. The launcher is a chat bubble (not a circle) that shows an unread
// dot and toasts when a teammate sends a new message.

const SEEN_KEY = 'vts-teamchat-seen';
const POLL_OPEN = 5000;
const POLL_CLOSED = 20000;

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function TeamChat({
  open,
  onOpen,
  onClose,
  theme,
  user,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  theme: Theme;
  user: User;
}) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);
  const canModerate = isAdmin(user.roles);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [reason, setReason] = useState<TeamChatReason>('ok');
  const [teamName, setTeamName] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seen, setSeen] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SEEN_KEY) : null;
    return v ? Number(v) : 0;
  });
  const [toast, setToast] = useState<ChatMessage | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const baselineRef = useRef<number | null>(null);

  const latestFromOthers = messages.reduce((m, x) => (!x.mine && x.createdAt > m ? x.createdAt : m), 0);
  const hasUnread = !open && latestFromOthers > seen;

  const markSeen = useCallback((ts: number) => {
    setSeen(ts);
    try {
      localStorage.setItem(SEEN_KEY, String(ts));
    } catch {
      /* storage may be blocked */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.teamChat();
      setEligible(r.eligible);
      setReason(r.reason);
      setTeamName(r.teamName);
      setMessages(r.messages);

      // Toast the newest incoming message when the panel is closed. The first
      // poll only baselines, so we never nag for history at load.
      const newestOther = r.messages.filter((m) => !m.mine).slice(-1)[0];
      const prev = baselineRef.current;
      if (prev != null && !openRef.current && newestOther && newestOther.createdAt > prev) {
        setToast(newestOther);
        window.setTimeout(() => setToast((t) => (t?.id === newestOther.id ? null : t)), 7000);
      }
      baselineRef.current = newestOther ? newestOther.createdAt : prev ?? 0;
    } catch {
      // Transient failure: keep the last values and retry next tick.
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), open ? POLL_OPEN : POLL_CLOSED);
    return () => window.clearInterval(id);
  }, [load, open]);

  // Mark everything seen while open.
  useEffect(() => {
    if (open && latestFromOthers > seen) markSeen(latestFromOthers);
  }, [open, latestFromOthers, seen, markSeen]);

  // Auto-scroll to the newest message on first fill and when near the bottom.
  const prevLen = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    const firstFill = prevLen.current === 0 && messages.length > 0;
    if (firstFill || nearBottom) el.scrollTo({ top: el.scrollHeight });
    prevLen.current = messages.length;
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.sendTeamChat(text);
      setMessages(r.messages);
      setInput('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    setError(null);
    try {
      setMessages((await api.deleteTeamChat(id)).messages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete');
    }
  }

  function openPanel() {
    onOpen();
    setToast(null);
    if (latestFromOthers) markSeen(latestFromOthers);
  }

  return (
    <>
      {/* Launcher — a chat bubble, not a circle. */}
      <button
        onClick={() => (open ? onClose() : openPanel())}
        aria-label={hasUnread ? 'Team chat (new messages)' : 'Team chat'}
        title="Team chat"
        style={{
          position: 'fixed',
          right: isPhone ? 14 : 22,
          bottom: isPhone ? 14 : 22,
          width: 52,
          height: 52,
          // A speech-bubble shape: three rounded corners and one pointed
          // bottom-left "tail", so the launcher reads as a chat bubble.
          borderRadius: '50% 50% 50% 6px',
          border: `1px solid ${theme.accent}`,
          background: open ? accentGrad : '#0A2A6B',
          color: open ? theme.accentText : theme.accent,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,.45)',
          zIndex: 45,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={open ? 'x-circle' : 'message-circle'} size={22} />
        {hasUnread && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 13,
              height: 13,
              borderRadius: '50%',
              background: '#ef5468',
              border: '2px solid #060f24',
            }}
          />
        )}
      </button>

      {/* Toast for a new incoming message when closed. */}
      {!open && toast && (
        <div
          onClick={openPanel}
          style={{
            position: 'fixed',
            right: isPhone ? 14 : 22,
            bottom: (isPhone ? 14 : 22) + 66,
            zIndex: 46,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 'min(300px, 82vw)',
            background: '#0c1c3c',
            border: `1px solid ${theme.accent}`,
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,.5)',
            padding: '10px 12px',
            cursor: 'pointer',
            animation: 'popIn .2s ease',
          }}
        >
          <Avatar name={toast.author} src={toast.avatar} size={30} accent={theme.accent} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#eef3ff' }}>{toast.author}</div>
            <div style={{ fontSize: 12, color: '#aebcd8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {toast.body}
            </div>
          </div>
        </div>
      )}

      {open && (
        <>
          <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
          <div
            role="dialog"
            aria-label="Team chat"
            style={{
              position: 'fixed',
              right: isPhone ? 0 : 22,
              left: isPhone ? 0 : 'auto',
              bottom: isPhone ? 0 : 84,
              width: isPhone ? '100%' : 'min(420px, 95vw)',
              height: isPhone ? '82vh' : 'min(560px, 78vh)',
              display: 'flex',
              flexDirection: 'column',
              background: 'linear-gradient(180deg,#0b1a3a,#081226)',
              border: '1px solid #1d3560',
              borderRadius: isPhone ? '14px 14px 0 0' : 14,
              boxShadow: '0 24px 60px rgba(0,0,0,.55)',
              zIndex: 60,
              animation: 'popIn .2s ease',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: '1px solid #1d3560' }}>
              <Icon name="message-circle" size={17} color={theme.accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#eef3ff' }}>Team chat</div>
                <div style={{ fontSize: 10.5, color: '#7e92c0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {eligible && teamName ? teamName : 'Your trading team'}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#7488b5', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>
                ×
              </button>
            </div>

            {/* Body */}
            {eligible === false ? (
              <NotOnTeam reason={reason} accent={theme.accent} />
            ) : (
              <>
                <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {messages.length === 0 ? (
                    <div style={{ color: '#6f84b2', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
                      No messages yet. Say hello to your team.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} style={{ display: 'flex', gap: 8, flexDirection: m.mine ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                        <Avatar name={m.author} src={m.avatar} size={28} accent={theme.accent} />
                        <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                          {!m.mine && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 0 2px 2px' }}>
                              <span style={{ fontSize: 10, color: '#7e92c0' }}>{m.author}</span>
                              <UserBadges roles={m.roles} badges={m.badges} size={11} gap={2} />
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.5,
                              padding: '7px 10px',
                              borderRadius: 10,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              color: m.mine ? '#06122c' : '#dfe7fa',
                              background: m.mine ? theme.accent : 'rgba(255,255,255,.05)',
                              border: m.mine ? 'none' : '1px solid #1d3560',
                            }}
                          >
                            {m.body}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            <span style={{ fontSize: 9, color: '#5d72a0' }}>{clockTime(m.createdAt)}</span>
                            {(m.mine || canModerate) && !user.isDemo && (
                              <button
                                onClick={() => void del(m.id)}
                                aria-label="Delete message"
                                title="Delete message"
                                style={{ background: 'none', border: 'none', color: '#7e6f6f', fontSize: 9, cursor: 'pointer', padding: 0 }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {error && (
                  <div style={{ margin: '0 10px', fontSize: 12, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '8px 11px' }}>
                    {error}
                  </div>
                )}
                {user.isDemo ? (
                  <div style={{ padding: '10px 12px', borderTop: '1px solid #16294f', fontSize: 11.5, color: '#7488b5' }}>
                    Read-only demo. Sign in to the live portal to chat.
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
                      placeholder="Message your team"
                      maxLength={1000}
                      style={inputStyle}
                    />
                    <button
                      onClick={() => void send()}
                      disabled={busy || !input.trim()}
                      style={{ border: 'none', background: accentGrad, color: theme.accentText, fontWeight: 700, fontSize: 12.5, padding: '0 14px', borderRadius: 8, cursor: 'pointer', opacity: busy || !input.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Icon name="send" size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// Shown when the viewer is not on a trading team — explains the feature.
function NotOnTeam({ reason, accent }: { reason: TeamChatReason; accent: string }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          background: 'rgba(108,158,255,.08)',
          border: `1px solid ${accent}`,
          borderRadius: 12,
          padding: '16px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <Icon name="users" size={18} color={accent} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>Team chat is a trading-team feature</div>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: '#aebcd8' }}>
          Team chat is a private channel shared only with your trading team — a place to post your
          session bias, share setups and levels, and ask each other questions in real time. Messages
          stay within your team and never fan out to other desks.
        </p>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: '#8ea3cc' }}>
        {reason === 'no_trading'
          ? 'Your account isn’t on the trading desk yet, so there’s no team to chat with. Ask an admin to add you to the Trading workspace and a trading team to unlock it.'
          : 'You’re not assigned to a trading team yet. Ask an admin to add you to a team, and this channel will connect you with your teammates.'}
      </p>
    </div>
  );
}

const inputStyle: CSSProperties = {
  flex: 1,
  marginTop: 0,
  background: '#091633',
  border: '1px solid #1c3a7a',
  borderRadius: 7,
  color: '#eef3ff',
  fontSize: 12.5,
  padding: '9px 11px',
  outline: 'none',
};
