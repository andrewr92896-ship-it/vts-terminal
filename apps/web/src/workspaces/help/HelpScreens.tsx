import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { accentGradient, type Theme } from '../../theme/themes';
import { HOWTO_TOPICS, mergedTutorial } from '../../help/tutorials';
import { PATCH_NOTES } from '../../meta/version';
import { api, ApiError } from '../../api/client';
import type { Announcement, BugReport, PatchNoteEntry, User } from '../../api/types';
import { Icon } from '../../components/Icon';
import { EditableText } from '../../copy/SiteCopy';

// The Site Help workspace screens: How to, Announcements, Patch notes, Report a
// bug (AI intake), and Suggestion. These replace the old corner help hub tabs;
// the corner is now the Team Chat only.

function page(children: React.ReactNode) {
  return <div style={{ maxWidth: 820, margin: '0 auto', padding: '4px 2px 40px' }}>{children}</div>;
}

function panel(theme: Theme): CSSProperties {
  return {
    background: 'rgba(11,26,58,.5)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 12,
    padding: '16px 18px',
  };
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#091633',
  border: '1px solid #1c3a7a',
  borderRadius: 8,
  color: '#eef3ff',
  fontSize: 13,
  padding: '11px 13px',
  outline: 'none',
};

function Header({ title, subtitle }: { title: React.ReactNode; subtitle: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#eef3ff' }}>{title}</h2>
      <p style={{ margin: '5px 0 0', fontSize: 13, color: '#8ea3cc', lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}

function primaryBtn(theme: Theme, disabled = false): CSSProperties {
  return {
    border: 'none',
    background: accentGradient(theme),
    color: theme.accentText,
    fontWeight: 700,
    fontSize: 13,
    padding: '10px 18px',
    borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    minHeight: 42,
  };
}

// ---- How to ----
// Topics come from the shared HOWTO_TOPICS list (help/tutorials); the walkthrough
// text is the built-in copy with any admin overrides (Site Wording) layered on.
export function HelpHowTo({ theme }: { theme: Theme }) {
  const [topic, setTopic] = useState(HOWTO_TOPICS[0].key);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    api
      .siteContent()
      .then((r) => alive && setOverrides(r.howto))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const t = mergedTutorial(topic, overrides);
  return page(
    <>
      <Header
        title={<EditableText id="help.howto.title">How to</EditableText>}
        subtitle={<EditableText id="help.howto.subtitle">Step-by-step walkthroughs for the main areas of the portal.</EditableText>}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {HOWTO_TOPICS.map((tp) => {
          const on = tp.key === topic;
          return (
            <button
              key={tp.key}
              onClick={() => setTopic(tp.key)}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: '8px 13px',
                borderRadius: 999,
                border: `1px solid ${on ? theme.accent : theme.navBorder}`,
                cursor: 'pointer',
                color: on ? theme.accentText : '#aebcd8',
                background: on ? accentGradient(theme) : 'transparent',
              }}
            >
              {tp.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#eef3ff', marginBottom: 8 }}>{t.title}</div>
      {t.intro && <p style={{ margin: '0 0 16px', fontSize: 13, color: '#aebcd8', lineHeight: 1.6 }}>{t.intro}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {t.steps.map((s, i) => (
          <div key={i} style={panel(theme)}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#eef3ff', marginBottom: 4 }}>
              {i + 1}. {s.title}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.6 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </>,
  );
}

// ---- Patch notes ----
// One display row, whether from the admin-authored (published) notes or the
// bundled historical archive.
interface DisplayNote {
  key: string;
  version: string;
  date: string;
  notes: string[];
}

export function HelpPatchNotes({ theme }: { theme: Theme }) {
  // Admin-published notes come first (newest releases); the bundled PATCH_NOTES
  // fill in the historical archive for versions that predate the DB store.
  const [published, setPublished] = useState<PatchNoteEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .patchNotes()
      .then((r) => alive && setPublished(r.notes))
      .catch(() => alive && setPublished([]));
    return () => {
      alive = false;
    };
  }, []);

  const dbNotes: DisplayNote[] = (published ?? []).map((p) => ({
    key: `db:${p.id}`,
    version: p.version,
    date: p.dateLabel,
    notes: p.notes,
  }));
  const dbVersions = new Set(dbNotes.map((n) => n.version));
  const archive: DisplayNote[] = PATCH_NOTES.filter((p) => !dbVersions.has(p.version)).map((p) => ({
    key: `bundled:${p.version}`,
    version: p.version,
    date: p.date,
    notes: p.notes,
  }));
  const all = [...dbNotes, ...archive];

  return page(
    <>
      <Header
        title={<EditableText id="help.notes.title">Patch notes</EditableText>}
        subtitle={<EditableText id="help.notes.subtitle">What changed in each release of the portal.</EditableText>}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {all.map((p) => (
          <div key={p.key} style={panel(theme)}>
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
    </>,
  );
}

// ---- Announcements ----
function dayTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function HelpAnnouncements({ theme, user }: { theme: Theme; user: User }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return page(
    <>
      <Header
        title={<EditableText id="help.news.title">Announcements</EditableText>}
        subtitle={<EditableText id="help.news.subtitle">Desk-wide notices and updates from the admins.</EditableText>}
      />
      {canManage && !user.isDemo && (
        <div style={{ ...panel(theme), marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#7488b5', marginBottom: 8 }}>
            <EditableText id="help.news.post_heading">Post an announcement</EditableText>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={120} style={inputStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={3} maxLength={4000} style={{ ...inputStyle, marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={add} disabled={busy || !title.trim() || !body.trim()} style={{ ...primaryBtn(theme, busy || !title.trim() || !body.trim()), marginTop: 10 }}>
            {busy ? 'Posting...' : <EditableText id="help.news.post_btn">Post</EditableText>}
          </button>
        </div>
      )}

      {error && <div style={errorBanner}>{error}</div>}

      {!loaded ? (
        <div style={{ color: '#9fb0d6', fontSize: 12.5 }}><EditableText id="help.news.loading">Loading...</EditableText></div>
      ) : items.length === 0 ? (
        <div style={{ color: '#9fb0d6', fontSize: 12.5 }}><EditableText id="help.news.empty">No announcements yet.</EditableText></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((a) => (
            <div key={a.id} style={panel(theme)}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>{a.title}</span>
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
    </>,
  );
}

// ---- Report a bug (AI intake) ----
export function HelpBugReport({ theme, user }: { theme: Theme; user: User }) {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [active, setActive] = useState<BugReport | null>(null);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api
      .myBugReports()
      .then((r) => alive && setReports(r.reports))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [active]);

  async function start() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createBugReport(text);
      setActive(r.report);
      setReports((prev) => [r.report, ...prev]);
      setDraft('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not file report');
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text || busy || !active) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.replyBugReport(active.id, text);
      setActive(r.report);
      setReports((prev) => prev.map((p) => (p.id === r.report.id ? r.report : p)));
      setReply('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send reply');
    } finally {
      setBusy(false);
    }
  }

  if (user.isDemo) {
    return page(
      <>
        <Header
          title={<EditableText id="help.bug.title">Report a bug</EditableText>}
          subtitle={<EditableText id="help.bug.subtitle_demo">Tell us what went wrong and our assistant will help file it.</EditableText>}
        />
        <div style={panel(theme)}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#9fb0d6' }}><EditableText id="help.bug.demo">Read-only demo. Sign in to the live portal to report a bug.</EditableText></p>
        </div>
      </>,
    );
  }

  if (active) {
    const open = active.status === 'open';
    return page(
      <>
        <Header
          title={<EditableText id="help.bug.title">Report a bug</EditableText>}
          subtitle={<EditableText id="help.bug.subtitle_active">Our assistant reads your report and files a ticket for the admins.</EditableText>}
        />
        <div style={{ ...panel(theme), display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${theme.navBorder}` }}>
            <Icon name="bug" size={16} color={theme.accent} />
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#eef3ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active.summary}
            </div>
            <StatusPill status={active.status} accent={theme.accent} />
          </div>
          <div ref={threadRef} style={{ maxHeight: 380, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {active.messages.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: 10, color: '#7e92c0', margin: '0 2px 3px' }}>{m.role === 'ai' ? 'Support assistant' : 'You'}</div>
                <div
                  style={{
                    maxWidth: '85%',
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    padding: '9px 12px',
                    borderRadius: 10,
                    whiteSpace: 'pre-wrap',
                    color: m.role === 'user' ? '#06122c' : '#dfe7fa',
                    background: m.role === 'user' ? theme.accent : 'rgba(255,255,255,.05)',
                    border: m.role === 'user' ? 'none' : `1px solid ${theme.navBorder}`,
                  }}
                >
                  {m.body}
                </div>
              </div>
            ))}
          </div>
          {error && <div style={{ ...errorBanner, margin: '0 16px' }}>{error}</div>}
          {open ? (
            <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: `1px solid ${theme.navBorder}` }}>
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void sendReply())}
                placeholder="Add more detail…"
                maxLength={4000}
                style={inputStyle}
              />
              <button onClick={() => void sendReply()} disabled={busy || !reply.trim()} style={primaryBtn(theme, busy || !reply.trim())}>
                {busy ? '…' : <EditableText id="help.bug.send_reply">Send</EditableText>}
              </button>
            </div>
          ) : (
            <div style={{ padding: 14, borderTop: `1px solid ${theme.navBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#7fd6a3', fontWeight: 600 }}>
                <Icon name="check-check" size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                <EditableText id="help.bug.ticket_sent">Ticket sent to the admins.</EditableText>
              </span>
              <button onClick={() => setActive(null)} style={{ ...primaryBtn(theme), padding: '9px 14px', minHeight: 38 }}>
                <EditableText id="help.bug.report_another">Report another bug</EditableText>
              </button>
            </div>
          )}
        </div>
      </>,
    );
  }

  return page(
    <>
      <Header
        title={<EditableText id="help.bug.title">Report a bug</EditableText>}
        subtitle={<EditableText id="help.bug.subtitle">Tell us what went wrong. Our assistant will ask for anything missing, then file the ticket for the admins.</EditableText>}
      />
      <div style={panel(theme)}>
        <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#8ea3cc', marginBottom: 8 }}>
          <EditableText id="help.bug.what_happened">What happened?</EditableText>
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Describe the bug — what you were doing, what you expected, and what actually happened (and where in the app)."
          rows={5}
          maxLength={4000}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        {error && <div style={errorBanner}>{error}</div>}
        <button onClick={() => void start()} disabled={busy || !draft.trim()} style={{ ...primaryBtn(theme, busy || !draft.trim()), marginTop: 12 }}>
          {busy ? 'Sending…' : <EditableText id="help.bug.send_report">Send report</EditableText>}
        </button>
      </div>

      {reports.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#7488b5', marginBottom: 10 }}>
            <EditableText id="help.bug.your_reports">Your reports</EditableText>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setActive(r)}
                style={{ ...panel(theme), textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}
              >
                <Icon name="bug" size={15} color={theme.accent} />
                <span style={{ flex: 1, fontSize: 12.5, color: '#dfe7fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</span>
                <StatusPill status={r.status} accent={theme.accent} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>,
  );
}

function StatusPill({ status, accent }: { status: string; accent: string }) {
  const map: Record<string, { label: string; color: string }> = {
    open: { label: 'Needs detail', color: '#E5A43B' },
    submitted: { label: 'Sent to admins', color: '#2FC77E' },
    resolved: { label: 'Resolved', color: accent },
  };
  const s = map[status] ?? map.open;
  return (
    <span
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 9.5,
        fontWeight: 600,
        color: s.color,
        border: `1px solid ${s.color}`,
        borderRadius: 4,
        padding: '2px 7px',
        flex: 'none',
      }}
    >
      {s.label}
    </span>
  );
}

// ---- Suggestion ----
export function HelpSuggestion({ theme, user }: { theme: Theme; user: User }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.sendSuggestion(text);
      setBody('');
      setMsg({ ok: true, text: 'Thanks! Your suggestion was sent to the admins.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not send suggestion' });
    } finally {
      setBusy(false);
    }
  }

  return page(
    <>
      <Header
        title={<EditableText id="help.suggest.title">Suggestion</EditableText>}
        subtitle={<EditableText id="help.suggest.subtitle">Have an idea to improve the portal? Send it straight to the admins.</EditableText>}
      />
      <div style={panel(theme)}>
        {user.isDemo ? (
          <p style={{ margin: 0, fontSize: 12.5, color: '#9fb0d6' }}><EditableText id="help.suggest.demo">Read-only demo. Sign in to the live portal to send a suggestion.</EditableText></p>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#8ea3cc', marginBottom: 8 }}>
              <EditableText id="help.suggest.your_suggestion">Your suggestion</EditableText>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What would make the portal better? A feature, a tweak, anything."
              rows={5}
              maxLength={4000}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
            {msg && (
              <div style={msg.ok ? okBanner : errorBanner}>{msg.text}</div>
            )}
            <button onClick={() => void send()} disabled={busy || !body.trim()} style={{ ...primaryBtn(theme, busy || !body.trim()), marginTop: 12 }}>
              {busy ? 'Sending…' : <EditableText id="help.suggest.send">Send suggestion</EditableText>}
            </button>
          </>
        )}
      </div>
    </>,
  );
}

const errorBanner: CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '8px 11px',
};
const okBanner: CSSProperties = {
  marginTop: 12,
  fontSize: 12.5,
  color: '#7fe0c0',
  background: 'rgba(53,196,123,.1)',
  border: '1px solid rgba(53,196,123,.4)',
  borderRadius: 8,
  padding: '9px 12px',
};
