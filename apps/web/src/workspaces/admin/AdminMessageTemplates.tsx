import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import type { MessageTemplate, MessageTemplateKind } from '../../api/types';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import {
  panel,
  SectionHeader,
  primaryBtn,
  ghostBtn,
  ghostDangerBtn,
  dangerSolidBtn,
  inputStyle,
  fieldLabel,
  msgStyle,
  Badge,
} from './adminUi';
import { Icon } from '../../components/Icon';

// Admin ▸ Message Templates — a shared library of reusable text-message and
// email templates admins copy out of the portal. Every admin can read and copy;
// only software developers (founder-level) can add, edit, or delete a template.
// The headline interaction is a right-click context menu on any template with a
// "Copy" option (a visible Copy button covers touch devices, where there is no
// right-click).

type Draft = {
  id: string | null; // null while creating a new template
  kind: MessageTemplateKind;
  title: string;
  subject: string;
  body: string;
};

const emptyDraft: Draft = { id: null, kind: 'sms', title: '', subject: '', body: '' };

function kindLabel(kind: MessageTemplateKind): string {
  return kind === 'email' ? 'Email' : 'Text message';
}

export function AdminMessageTemplates({ theme }: { theme: Theme }) {
  const { user } = useAuth();
  const canAuthor = !!user?.access.founder; // software developers / founders only
  const accentGrad = accentGradient(theme);

  const [items, setItems] = useState<MessageTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null); // open editor, or null
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // The floating right-click menu: which template, and where on screen.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminMessageTemplates()
      .then((r) => alive && (setItems(r.templates), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // Close the context menu on any outside click, scroll, or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  async function copy(id: string, text: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    } catch {
      setError('Couldn’t copy — select the text and copy it manually.');
    }
  }

  // The full copyable text of a template: for an email, its subject line then a
  // blank line then the body; for a text message, just the body.
  function fullText(t: MessageTemplate): string {
    if (t.kind === 'email' && t.subject) return `Subject: ${t.subject}\n\n${t.body}`;
    return t.body;
  }

  function openContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    // Clamp so the menu never spills off the right/bottom edge.
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setMenu({ id, x: Math.max(8, x), y: Math.max(8, y) });
  }

  async function save() {
    if (!draft) return;
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) {
      setError('Give the template a title and some text.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kind: draft.kind,
        title,
        subject: draft.kind === 'email' ? draft.subject.trim() : '',
        body,
      };
      const r = draft.id
        ? await api.adminUpdateMessageTemplate(draft.id, payload)
        : await api.adminCreateMessageTemplate(payload);
      setItems(r.templates);
      setDraft(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const r = await api.adminDeleteMessageTemplate(id);
      setItems(r.templates);
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  const menuTemplate = menu ? items.find((t) => t.id === menu.id) ?? null : null;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <SectionHeader
        title="Message Templates"
        subtitle="Reusable text-message and email templates. Right-click a template (or use its Copy button) to copy it, then paste it wherever you need it."
      />

      {error && <div style={msgStyle(false)}>{error}</div>}

      {canAuthor ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button
            onClick={() => {
              setError(null);
              setDraft({ ...emptyDraft });
            }}
            style={primaryBtn(theme, accentGrad)}
          >
            {"+ New template"}
          </button>
        </div>
      ) : (
        <div style={{ ...panel(theme), marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="code" size={15} color="#8ea3cc" />
          <span style={{ fontSize: 12, color: '#9fb0d6' }}>
            {"Only software developers can add or change templates. You can copy any template below."}
          </span>
        </div>
      )}

      {/* Editor (create / edit) — founders only */}
      {draft && canAuthor && (
        <div style={{ ...panel(theme), marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#eef3ff', marginBottom: 12 }}>
            {draft.id ? (
              "Edit template"
            ) : (
              "New template"
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['sms', 'email'] as MessageTemplateKind[]).map((k) => {
              const on = draft.kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setDraft({ ...draft, kind: k })}
                  style={{
                    ...ghostBtn,
                    borderColor: on ? theme.accent : '#2a4170',
                    color: on ? '#eef3ff' : '#cfe0ff',
                    background: on ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.18)',
                  }}
                >
                  {kindLabel(k)}
                </button>
              );
            })}
          </div>

          <label style={fieldLabel}>
            {"Title"}
          </label>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="e.g. New member welcome"
            style={{ ...inputStyle, marginBottom: 12 }}
          />

          {draft.kind === 'email' && (
            <>
              <label style={fieldLabel}>
                {"Subject line"}
              </label>
              <input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                placeholder="Email subject"
                style={{ ...inputStyle, marginBottom: 12 }}
              />
            </>
          )}

          <label style={fieldLabel}>
            {"Template text"}
          </label>
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="Write the message or email body here…"
            rows={7}
            style={{ ...inputStyle, marginBottom: 12, resize: 'vertical', lineHeight: 1.5 }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void save()} disabled={saving} style={{ ...primaryBtn(theme, accentGrad), opacity: saving ? 0.6 : 1 }}>
              {draft.id ? (
                "Save changes"
              ) : (
                "Create template"
              )}
            </button>
            <button onClick={() => setDraft(null)} disabled={saving} style={ghostBtn}>
              {"Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {!loaded ? (
        <div style={{ color: '#9fb0d6', fontSize: 12.5 }}>
          {"Loading…"}
        </div>
      ) : items.length === 0 ? (
        <div style={panel(theme)}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#9fb0d6' }}>
            {"No templates yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((t) => (
            <div
              key={t.id}
              onContextMenu={(e) => openContextMenu(e, t.id)}
              style={{ ...panel(theme) }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <Icon name={t.kind === 'email' ? 'file-text' : 'message-square'} size={15} color={theme.accent} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#eef3ff' }}>{t.title}</span>
                <Badge color={t.kind === 'email' ? '#6C9EFF' : '#34D399'}>
                  {kindLabel(t.kind).toUpperCase()}
                </Badge>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7488b5' }}>
                  {copiedId === t.id ? (
                    <span style={{ color: '#7fe0c0', fontWeight: 600 }}>
                      {"Copied ✓"}
                    </span>
                  ) : (
                    "Right-click to copy"
                  )}
                </span>
              </div>

              {t.kind === 'email' && t.subject && (
                <div style={{ fontSize: 11.5, color: '#9fb0d6', marginBottom: 6 }}>
                  <span style={{ color: '#7488b5' }}>
                    {"Subject: "}
                  </span>
                  {t.subject}
                </div>
              )}

              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: '#ccd7ef',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {t.body}
              </p>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => void copy(t.id, fullText(t))} style={ghostBtn}>
                  {"Copy"}
                </button>
                {canAuthor &&
                  (confirmDelete === t.id ? (
                    <>
                      <button onClick={() => void remove(t.id)} style={dangerSolidBtn}>
                        {"Confirm delete"}
                      </button>
                      <button onClick={() => setConfirmDelete(null)} style={ghostBtn}>
                        {"Cancel"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setError(null);
                          setDraft({ id: t.id, kind: t.kind, title: t.title, subject: t.subject ?? '', body: t.body });
                        }}
                        style={ghostBtn}
                      >
                        {"Edit"}
                      </button>
                      <button onClick={() => setConfirmDelete(t.id)} style={ghostDangerBtn}>
                        {"Delete"}
                      </button>
                    </>
                  ))}
                {t.createdByName && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7488b5' }}>{t.createdByName}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating right-click menu */}
      {menu && menuTemplate && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: menu.y,
            left: menu.x,
            zIndex: 1000,
            minWidth: 176,
            background: '#0b1a3a',
            border: '1px solid #2a4170',
            borderRadius: 9,
            boxShadow: '0 12px 32px rgba(0,0,0,.5)',
            padding: 5,
          }}
        >
          <MenuItem
            icon="copy"
            onClick={() => {
              void copy(menuTemplate.id, fullText(menuTemplate));
              setMenu(null);
            }}
          >
            {menuTemplate.kind === 'email' ? 'Copy email' : 'Copy message'}
          </MenuItem>
          {menuTemplate.kind === 'email' && menuTemplate.subject && (
            <MenuItem
              icon="copy"
              onClick={() => {
                void copy(menuTemplate.id, menuTemplate.subject ?? '');
                setMenu(null);
              }}
            >
              {"Copy subject only"}
            </MenuItem>
          )}
          {canAuthor && (
            <>
              <div style={{ height: 1, background: '#1d3560', margin: '5px 4px' }} />
              <MenuItem
                icon="pencil"
                onClick={() => {
                  setError(null);
                  setDraft({
                    id: menuTemplate.id,
                    kind: menuTemplate.kind,
                    title: menuTemplate.title,
                    subject: menuTemplate.subject ?? '',
                    body: menuTemplate.body,
                  });
                  setMenu(null);
                }}
              >
                {"Edit"}
              </MenuItem>
              <MenuItem
                icon="trash-2"
                danger
                onClick={() => {
                  setConfirmDelete(menuTemplate.id);
                  setMenu(null);
                }}
              >
                {"Delete"}
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: hover ? 'rgba(255,255,255,.06)' : 'transparent',
        color: danger ? '#ff8a80' : '#dbe6ff',
        fontSize: 12.5,
        fontWeight: 600,
        padding: '9px 10px',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      <Icon name={icon} size={14} color={danger ? '#ff8a80' : '#9fb0d6'} />
      {children}
    </button>
  );
}
