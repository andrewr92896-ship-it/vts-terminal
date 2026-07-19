import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PatchNoteEntry } from '../../api/types';
import { PATCH_NOTES } from '../../meta/version';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import {
  Badge,
  SectionHeader,
  dangerSolidBtn,
  fieldLabel,
  ghostBtn,
  ghostDangerBtn,
  inputStyle,
  msgStyle,
  panel,
  panelLabel,
  primaryBtn,
} from './adminUi';
import { EditableText } from '../../copy/SiteCopy';

// One line per bullet; blank lines dropped.
function linesToNotes(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Admin panel: author, review, and release patch notes. Notes start as drafts
// and only appear in Site Help once released.
export function AdminPatchNotes({ theme }: { theme: Theme }) {
  const accentGrad = accentGradient(theme);
  const [notes, setNotes] = useState<PatchNoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New-note form
  const [version, setVersion] = useState('');
  const [dateLabel, setDateLabel] = useState('');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editBody, setEditBody] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminPatchNotes()
      .then((r) => alive && setNotes(r.notes))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Failed to load patch notes'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function create() {
    const notesArr = linesToNotes(body);
    if (!version.trim() || notesArr.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await api.adminCreatePatchNote({ version: version.trim(), dateLabel: dateLabel.trim(), notes: notesArr });
      setNotes(r.notes);
      setVersion('');
      setDateLabel('');
      setBody('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the note');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(n: PatchNoteEntry) {
    setEditId(n.id);
    setEditVersion(n.version);
    setEditDate(n.dateLabel);
    setEditBody(n.notes.join('\n'));
    setConfirmDeleteId(null);
  }

  async function saveEdit(id: string) {
    const notesArr = linesToNotes(editBody);
    if (!editVersion.trim() || notesArr.length === 0) return;
    setBusyId(id);
    setError(null);
    try {
      const r = await api.adminUpdatePatchNote(id, { version: editVersion.trim(), dateLabel: editDate.trim(), notes: notesArr });
      setNotes(r.notes);
      setEditId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the note');
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(id: string, status: 'draft' | 'published') {
    setBusyId(id);
    setError(null);
    try {
      const r = await api.adminSetPatchNoteStatus(id, status);
      setNotes(r.notes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update status');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const r = await api.adminDeletePatchNote(id);
      setNotes(r.notes);
      setConfirmDeleteId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the note');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}><EditableText id="admin.notes.loading">Loading patch notes...</EditableText></div>;

  // The member-facing Site Help ▸ Patch notes merges these DB entries with the
  // compiled-in PATCH_NOTES history. Show that same bundled archive here (read
  // only) so the admin sees everything that is currently live, not just the
  // notes authored into the database. A DB entry that reuses a bundled version
  // label supersedes the bundled one, matching the member view.
  const dbVersions = new Set(notes.map((n) => n.version));
  const archive = PATCH_NOTES.filter((p) => !dbVersions.has(p.version));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="Patch Notes"
        subtitle="Write release notes, review them as a draft, then release. Only released notes show up in Site Help ▸ Patch notes for members."
      />

      {error && (
        <div onClick={() => setError(null)} style={{ ...msgStyle(false), marginBottom: 12, cursor: 'pointer' }}>
          {error} (dismiss)
        </div>
      )}

      {/* New note */}
      <div style={{ ...panel(theme), marginBottom: 18 }}>
        <div style={panelLabel}><EditableText id="admin.notes.new_heading">New release note</EditableText></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={fieldLabel}><EditableText id="admin.notes.f_version">Version</EditableText></label>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. Beta V 3.2" maxLength={60} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={fieldLabel}><EditableText id="admin.notes.f_date">Date (optional)</EditableText></label>
            <input value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} placeholder="Defaults to today" maxLength={60} style={inputStyle} />
          </div>
        </div>
        <label style={fieldLabel}><EditableText id="admin.notes.f_notes">Notes — one bullet per line</EditableText></label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder={'Added a new dashboard tile.\nFixed a bug on the Live Wall.'}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        <button
          onClick={create}
          disabled={creating || !version.trim() || linesToNotes(body).length === 0}
          style={{ ...primaryBtn(theme, accentGrad), marginTop: 10, opacity: creating || !version.trim() || linesToNotes(body).length === 0 ? 0.55 : 1 }}
        >
          {creating ? 'Saving…' : <EditableText id="admin.notes.save_draft">Save as draft</EditableText>}
        </button>
      </div>

      {/* Existing notes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.length === 0 && archive.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#8ea3cc' }}><EditableText id="admin.notes.empty">No patch notes yet.</EditableText></div>
        )}
        {notes.map((n) =>
          editId === n.id ? (
            <div key={n.id} style={{ ...panel(theme), border: `1px solid ${theme.accent}` }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={fieldLabel}>Version</label>
                  <input value={editVersion} onChange={(e) => setEditVersion(e.target.value)} maxLength={60} style={inputStyle} />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={fieldLabel}>Date</label>
                  <input value={editDate} onChange={(e) => setEditDate(e.target.value)} maxLength={60} style={inputStyle} />
                </div>
              </div>
              <label style={fieldLabel}>Notes — one bullet per line</label>
              <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => saveEdit(n.id)} disabled={busyId === n.id} style={primaryBtn(theme, accentGrad)}>Save</button>
                <button onClick={() => setEditId(null)} disabled={busyId === n.id} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div key={n.id} style={panel(theme)}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>{n.version}</span>
                <span style={{ fontSize: 11, color: '#7488b5', fontFamily: "'IBM Plex Mono', monospace" }}>{n.dateLabel}</span>
                {n.status === 'published' ? <Badge color="#2FC77E">Released</Badge> : <Badge color="#E5A43B">Draft</Badge>}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {n.notes.map((note, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.55 }}>{note}</li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {n.status === 'draft' ? (
                  <button onClick={() => setStatus(n.id, 'published')} disabled={busyId === n.id} style={primaryBtn(theme, accentGrad)}>
                    {busyId === n.id ? '…' : 'Release'}
                  </button>
                ) : (
                  <button onClick={() => setStatus(n.id, 'draft')} disabled={busyId === n.id} style={ghostBtn}>
                    Unpublish
                  </button>
                )}
                <button onClick={() => startEdit(n)} disabled={busyId === n.id} style={ghostBtn}>Edit</button>
                {confirmDeleteId === n.id ? (
                  <>
                    <button onClick={() => remove(n.id)} disabled={busyId === n.id} style={dangerSolidBtn}>Confirm delete</button>
                    <button onClick={() => setConfirmDeleteId(null)} disabled={busyId === n.id} style={ghostBtn}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(n.id)} disabled={busyId === n.id} style={ghostDangerBtn}>Delete</button>
                )}
              </div>
            </div>
          ),
        )}

        {/* Bundled archive — the compiled-in history members already see. These
            predate the database store, so they are read only here. */}
        {archive.length > 0 && (
          <div style={{ marginTop: notes.length > 0 ? 10 : 0, marginBottom: 2 }}>
            <div style={panelLabel}><EditableText id="admin.notes.archive_heading">Archive — live for members</EditableText></div>
            <div style={{ fontSize: 11.5, color: '#7488b5', lineHeight: 1.5 }}>
              <EditableText id="admin.notes.archive_blurb">These releases ship with the app and already appear in Site Help ▸ Patch notes. They are read only; to change history, re-create a release above.</EditableText>
            </div>
          </div>
        )}
        {archive.map((p) => (
          <div key={`bundled:${p.version}`} style={{ ...panel(theme), opacity: 0.9 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>{p.version}</span>
              <span style={{ fontSize: 11, color: '#7488b5', fontFamily: "'IBM Plex Mono', monospace" }}>{p.date}</span>
              <Badge color="#6E7EA8">Archived</Badge>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {p.notes.map((note, i) => (
                <li key={i} style={{ fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.55 }}>{note}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
