import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useResponsive } from '../hooks/useMediaQuery';
import { accentGradient, type Theme } from '../theme/themes';
import { tutorialFor } from '../help/tutorials';
import { PATCH_NOTES } from '../meta/version';
import { canAccessWorkspace } from '../auth/access';
import { api, ApiError } from '../api/client';
import type { Announcement, ChatChannel, ChatMessage, User } from '../api/types';

// The corner hub: one "?" button that expands a small panel with the per-screen
// how-to, the chats (trading + website), patch notes, and announcements.

type Tab = 'how' | 'chat' | 'notes' | 'news';

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function dayTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function HelpHub({ screen, theme, user }: { screen: string; theme: Theme; user: User }) {
  const { isPhone } = useResponsive();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('how');
  const accentGrad = accentGradient(theme);
  const canTrade = canAccessWorkspace(user.roles, 'trading');

  const TABS: { key: Tab; label: string }[] = [
    { key: 'how', label: 'How to' },
    { key: 'chat', label: 'Chat' },
    { key: 'notes', label: 'Patch notes' },
    { key: 'news', label: 'News' },
  ];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Help, chat, and announcements"
        title="Help, chat, and announcements"
        style={{
          position: 'fixed',
          right: isPhone ? 14 : 22,
          bottom: isPhone ? 14 : 22,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: `1px solid ${theme.accent}`,
          background: accentGrad,
          color: theme.accentText,
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,.45)',
          zIndex: 45,
        }}
      >
        {open ? '×' : '?'}
      </button>

      {open && (
        <>
          {/* Outside-click catcher (transparent, closes the popover). */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
          <div
            role="dialog"
            aria-label="Help and chat"
            style={{
              position: 'fixed',
              right: isPhone ? 0 : 22,
              left: isPhone ? 0 : 'auto',
              bottom: isPhone ? 0 : 78,
              width: isPhone ? '100%' : 'min(700px, 95vw)',
              height: isPhone ? '85vh' : 'min(620px, 80vh)',
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
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 12px', borderBottom: '1px solid #1d3560', flexWrap: 'wrap' }}>
              {TABS.map((t) => {
                const on = t.key === tab;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: '7px 13px',
                      borderRadius: 7,
                      border: 'none',
                      cursor: 'pointer',
                      color: on ? theme.accentText : '#9fb0d6',
                      background: on ? accentGrad : 'transparent',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#7488b5', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>
                {'×'}
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {tab === 'how' && <HowTo screen={screen} theme={theme} />}
              {tab === 'chat' && <ChatPanel theme={theme} user={user} canTrade={canTrade} isPhone={isPhone} />}
              {tab === 'notes' && <PatchNotes theme={theme} />}
              {tab === 'news' && <Announcements theme={theme} user={user} />}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ---- How to (per-screen tutorial) ----
function HowTo({ screen, theme }: { screen: string; theme: Theme }) {
  const t = tutorialFor(screen);
  return (
    <div style={{ overflowY: 'auto', padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#eef3ff', marginBottom: 8 }}>{t.title}</div>
      {t.intro && <p style={{ margin: '0 0 14px', fontSize: 13, color: '#aebcd8', lineHeight: 1.6 }}>{t.intro}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {t.steps.map((s, i) => (
          <div key={i} style={{ ...panel(theme) }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#eef3ff', marginBottom: 4 }}>
              {i + 1}. {s.title}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.6 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Patch notes ----
function PatchNotes({ theme }: { theme: Theme }) {
  return (
    <div style={{ overflowY: 'auto', padding: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {PATCH_NOTES.map((p) => (
          <div key={p.version} style={panel(theme)}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>{p.version}</span>
              <span style={{ fontSize: 11, color: '#7488b5', fontFamily: "'IBM Plex Mono', monospace" }}>{p.date}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {p.notes.map((n, i) => (
                <li key={i} style={{ fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.55 }}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Announcements ----
function Announcements({ theme, user }: { theme: Theme; user: User }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accentGrad = accentGradient(theme);

  useEffect(() => {
    let alive = true;
    api
      .announcements()
      .then((r) => alive && (setItems(r.announcements), setCanManage(r.canManage), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function add() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.addAnnouncement(title.trim(), body.trim());
      setItems(r.announcements);
      setTitle('');
      setBody('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      setItems((await api.removeAnnouncement(id)).announcements);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove');
    }
  }

  return (
    <div style={{ overflowY: 'auto', padding: 18 }}>
      {canManage && !user.isDemo && (
        <div style={{ ...panel(theme), marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#7488b5', marginBottom: 8 }}>
            Post an announcement
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={3} style={{ ...inputStyle, marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={add} disabled={busy || !title.trim() || !body.trim()} style={{ marginTop: 10, border: 'none', background: accentGrad, color: theme.accentText, fontWeight: 700, fontSize: 12.5, padding: '9px 16px', borderRadius: 8, cursor: 'pointer', opacity: busy || !title.trim() || !body.trim() ? 0.6 : 1 }}>
            {busy ? 'Posting...' : 'Post'}
          </button>
        </div>
      )}

      {error && <div style={banner}>{error}</div>}

      {!loaded ? (
        <div style={{ color: '#9fb0d6', fontSize: 12.5 }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ color: '#9fb0d6', fontSize: 12.5 }}>No announcements yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((a) => (
            <div key={a.id} style={panel(theme)}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eef3ff' }}>{a.title}</span>
                <span style={{ fontSize: 10.5, color: '#7488b5', fontFamily: "'IBM Plex Mono', monospace", flex: 'none' }}>{dayTime(a.createdAt)}</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{a.body}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 10.5, color: '#7e92c0' }}>{a.author}</span>
                {canManage && !user.isDemo && (
                  <button onClick={() => remove(a.id)} style={{ background: 'none', border: 'none', color: '#ff9a9a', fontSize: 11.5, cursor: 'pointer' }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Chat (two columns) ----
function ChatPanel({ theme, user, canTrade, isPhone }: { theme: Theme; user: User; canTrade: boolean; isPhone: boolean }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isPhone ? 'column' : 'row', gap: 1, background: '#16294f' }}>
      {canTrade && <ChatColumn channel="trading" label="Trading desk" theme={theme} user={user} />}
      <ChatColumn channel="general" label="Website" theme={theme} user={user} />
    </div>
  );
}

const POLL_MS = 5000;

function ChatColumn({ channel, label, theme, user }: { channel: ChatChannel; label: string; theme: Theme; user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accentGrad = accentGradient(theme);

  const load = useCallback(async () => {
    try {
      const r = await api.chatMessages(channel);
      setMessages(r.messages);
    } catch {
      // Stay quiet on a transient poll failure; the next tick retries.
    }
  }, [channel]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.sendChat(channel, text);
      setMessages(r.messages);
      setInput('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#0a1730' }}>
      <div style={{ padding: '9px 12px', borderBottom: '1px solid #16294f', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent }}>
        {label}
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <div style={{ color: '#6f84b2', fontSize: 12, textAlign: 'center', marginTop: 16 }}>No messages yet.</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              {!m.mine && <div style={{ fontSize: 10, color: '#7e92c0', margin: '0 0 2px 2px' }}>{m.author}</div>}
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
              <div style={{ fontSize: 9, color: '#5d72a0', textAlign: m.mine ? 'right' : 'left', marginTop: 2 }}>{clockTime(m.createdAt)}</div>
            </div>
          ))
        )}
      </div>
      {error && <div style={{ ...banner, margin: '0 10px' }}>{error}</div>}
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
            placeholder="Message"
            style={{ ...inputStyle, flex: 1, marginTop: 0 }}
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            style={{ border: 'none', background: accentGrad, color: theme.accentText, fontWeight: 700, fontSize: 12.5, padding: '0 14px', borderRadius: 8, cursor: 'pointer', opacity: busy || !input.trim() ? 0.55 : 1 }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

function panel(_theme: Theme): CSSProperties {
  return { background: 'rgba(11,26,58,.5)', border: '1px solid #16294f', borderRadius: 10, padding: '12px 14px' };
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#091633',
  border: '1px solid #1c3a7a',
  borderRadius: 7,
  color: '#eef3ff',
  fontSize: 12.5,
  padding: '9px 11px',
  outline: 'none',
};

const banner: CSSProperties = {
  fontSize: 12,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '8px 11px',
  marginBottom: 12,
};
