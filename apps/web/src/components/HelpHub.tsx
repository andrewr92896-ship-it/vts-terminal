import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useResponsive } from '../hooks/useMediaQuery';
import { accentGradient, type Theme } from '../theme/themes';
import { tutorialFor } from '../help/tutorials';
import { PATCH_NOTES } from '../meta/version';
import { canAccessWorkspace, isAdmin } from '../auth/access';
import { api, ApiError } from '../api/client';
import type { Announcement, ChatChannel, ChatMessage, User } from '../api/types';

// The corner hub: one "?" button that expands a small panel with the per-screen
// how-to, the chats (trading + website), patch notes, and announcements.

type Tab = 'how' | 'chat' | 'notes' | 'news';

// Activity sources the hub watches. Each can raise a toast naming what dropped.
// `tab` is the hub tab to open on click (null = no in-hub destination).
type ActivitySource = 'chat' | 'announcements' | 'news';
const SOURCE_TOAST: Record<ActivitySource, { label: string; tab: Tab | null }> = {
  chat: { label: 'New chat message', tab: 'chat' },
  announcements: { label: 'New announcement', tab: 'news' },
  news: { label: 'New market news', tab: null },
};

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function dayTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SEEN_KEY = 'vts-hub-seen';
const ACTIVITY_MS = 30_000;

export function HelpHub({ screen, theme, user }: { screen: string; theme: Theme; user: User }) {
  const { isPhone } = useResponsive();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('how');
  const accentGrad = accentGradient(theme);
  const canTrade = canAccessWorkspace(user.roles, 'trading');

  // The activity poll drives both the unread dot and the toast notifications.
  // Each source (chat, announcements, market news) is tracked separately so a
  // toast can name what dropped. The first poll only sets a baseline, so we
  // never toast or nag for things that happened before this session.
  const [latest, setLatest] = useState(0);
  const [seen, setSeen] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SEEN_KEY) : null;
    return v ? Number(v) : -1;
  });
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const openRef = useRef(open);
  openRef.current = open;

  const [toasts, setToasts] = useState<{ id: number; source: ActivitySource }[]>([]);
  const baselineRef = useRef<Record<ActivitySource, number> | null>(null);
  const toastSeq = useRef(0);

  function pushToast(source: ActivitySource) {
    const id = (toastSeq.current += 1);
    setToasts((t) => [...t, { id, source }].slice(-3));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  }
  function dismissToast(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await api.hubActivity();
        if (!alive) return;
        const cur: Record<ActivitySource, number> = { chat: r.chat, announcements: r.announcements, news: r.news };
        const max = Math.max(cur.chat, cur.announcements, cur.news);
        setLatest(max);
        if (seenRef.current < 0) {
          // No record yet: start from the current state so we never nag on day one.
          setSeen(max);
          try {
            localStorage.setItem(SEEN_KEY, String(max));
          } catch {
            // Storage may be blocked; the dot just relies on session state.
          }
        }
        // Toast any source that advanced since the baseline, unless the hub is
        // already open (the user is looking). The first poll only baselines.
        const prev = baselineRef.current;
        if (prev && !openRef.current) {
          (['news', 'chat', 'announcements'] as ActivitySource[]).forEach((s) => {
            if (cur[s] > prev[s]) pushToast(s);
          });
        }
        baselineRef.current = cur;
      } catch {
        // Transient failure: keep the last values and retry next tick.
      }
    }
    void tick();
    const id = window.setInterval(tick, ACTIVITY_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const hasUnread = seen >= 0 && latest > seen;

  // While the hub is open, keep "seen" current so activity that arrives during
  // the session does not re-flag the dot the moment it closes.
  useEffect(() => {
    if (open && latest > seen) {
      setSeen(latest);
      try {
        localStorage.setItem(SEEN_KEY, String(latest));
      } catch {
        // ignore storage failures
      }
    }
  }, [open, latest, seen]);

  function openHub() {
    setOpen(true);
    setToasts([]);
    setSeen(latest);
    try {
      localStorage.setItem(SEEN_KEY, String(latest));
    } catch {
      // ignore storage failures
    }
  }

  function onToastClick(source: ActivitySource) {
    const dest = SOURCE_TOAST[source].tab;
    if (dest) {
      setTab(dest);
      openHub();
    }
    setToasts([]);
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'how', label: 'How to' },
    { key: 'chat', label: 'Chat' },
    { key: 'notes', label: 'Patch notes' },
    { key: 'news', label: 'News' },
  ];

  return (
    <>
      <button
        onClick={() => (open ? setOpen(false) : openHub())}
        aria-label={hasUnread ? 'Help and chat (new activity)' : 'Help, chat, and announcements'}
        title="Help, chat, and announcements"
        style={{
          position: 'fixed',
          right: isPhone ? 14 : 22,
          bottom: isPhone ? 14 : 22,
          width: 46,
          height: 46,
          borderRadius: '50%',
          border: `1px solid ${theme.accent}`,
          // The brand mark (navy with the gold V) when closed; the accent fill
          // with a close glyph when open.
          background: open ? accentGrad : '#0A2A6B',
          color: theme.accentText,
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,.45)',
          zIndex: 45,
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {open ? (
          '×'
        ) : (
          <img src="/icon-192.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        {hasUnread && !open && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 1,
              right: 1,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#ef5468',
              border: '2px solid #081226',
            }}
          />
        )}
      </button>

      {/* Toast notifications, stacked just above the hub button. */}
      {!open && toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            right: isPhone ? 14 : 22,
            bottom: (isPhone ? 14 : 22) + 58,
            zIndex: 46,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              onClick={() => onToastClick(t.source)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                maxWidth: 'min(280px, 80vw)',
                background: '#0c1c3c',
                border: `1px solid ${theme.accent}`,
                borderRadius: 10,
                boxShadow: '0 10px 30px rgba(0,0,0,.5)',
                padding: '10px 12px',
                cursor: 'pointer',
                animation: 'popIn .2s ease',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accent, flex: 'none' }} />
              <span style={{ fontSize: 12.5, color: '#eef3ff', fontWeight: 600, flex: 1 }}>
                {SOURCE_TOAST[t.source].label}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(t.id);
                }}
                aria-label="Dismiss"
                style={{ background: 'none', border: 'none', color: '#7488b5', fontSize: 16, lineHeight: 1, cursor: 'pointer', flex: 'none' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

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
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={120} style={inputStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={3} maxLength={4000} style={{ ...inputStyle, marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }} />
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
  // Admins can remove any message; everyone can remove their own.
  const canModerate = isAdmin(user.roles);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isPhone ? 'column' : 'row', gap: 1, background: '#16294f' }}>
      {canTrade && <ChatColumn channel="trading" label="Trading desk" theme={theme} user={user} canModerate={canModerate} />}
      <ChatColumn channel="general" label="Website" theme={theme} user={user} canModerate={canModerate} />
    </div>
  );
}

const POLL_MS = 5000;

function ChatColumn({ channel, label, theme, user, canModerate }: { channel: ChatChannel; label: string; theme: Theme; user: User; canModerate: boolean }) {
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

  // Auto-scroll to the newest message on the first load and when the viewer is
  // already near the bottom, but leave them alone if they have scrolled up to
  // read history (so a 5s poll does not yank them back down).
  const prevLen = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    const firstFill = prevLen.current === 0 && messages.length > 0;
    if (firstFill || nearBottom) el.scrollTo({ top: el.scrollHeight });
    prevLen.current = messages.length;
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

  async function del(id: string) {
    setError(null);
    try {
      setMessages((await api.deleteChat(channel, id)).messages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete');
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: m.mine ? 'flex-end' : 'flex-start', marginTop: 2 }}>
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
            maxLength={1000}
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
