import { useEffect, useState } from 'react';
import { employeeApi, type AnnouncementView } from '../api';
import { EMP, fmtDateTime } from '../theme';
import {
  Banner,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Pill,
  ScreenHeader,
  TextArea,
} from '../ui';
import { Icon } from '../../components/Icon';

// Internal announcements. Everyone reads; portal admins post. Deliberately not
// the main portal's announcements table — nothing written here is visible to
// members of the trading portal.

export function Announcements({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<AnnouncementView[] | null>(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const titlePlaceholder = 'Short, plain headline';
  const bodyPlaceholder = 'What everyone needs to know.';

  function load() {
    employeeApi
      .announcements()
      .then((r) => setItems(r.announcements))
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  async function post() {
    if (busy) return;
    if (!title.trim() || !body.trim()) {
      setFormError('A title and body are required');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await employeeApi.createAnnouncement({ title: title.trim(), body: body.trim(), pinned });
      setTitle('');
      setBody('');
      setPinned(false);
      setComposing(false);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(a: AnnouncementView) {
    try {
      const r = await employeeApi.updateAnnouncement(a.id, { pinned: !a.pinned });
      setItems(r.announcements);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(a: AnnouncementView) {
    if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try {
      await employeeApi.deleteAnnouncement(a.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <Empty icon="x-circle">{error}</Empty>;
  if (!items) {
    return (
      <Empty icon="refresh-cw">
        {"Loading…"}
      </Empty>
    );
  }

  return (
    <div>
      <ScreenHeader
        icon="megaphone"
        title={"Announcements"}
        subtitle={
          "Internal notices for staff. Nothing posted here is visible anywhere in the member-facing portal."
        }
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setComposing((v) => !v)}>
              <Icon name="plus" size={14} />
              {composing ? (
                "Cancel"
              ) : (
                "New announcement"
              )}
            </Button>
          )
        }
      />

      {composing && canManage && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: 'grid', gap: 13 }}>
            <Field label={"Title"}>
              <Input value={title} onChange={setTitle} maxLength={160} placeholder={titlePlaceholder} />
            </Field>
            <Field label={"Body"}>
              <TextArea value={body} onChange={setBody} rows={6} maxLength={8000} placeholder={bodyPlaceholder} />
            </Field>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12.5,
                color: EMP.muted,
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              {"Pin to the top"}
            </label>
            <ErrorNote>{formError}</ErrorNote>
            <div>
              <Button variant="primary" onClick={post} disabled={busy}>
                {busy ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Empty icon="megaphone">
          {"No announcements yet."}
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 13 }}>
          {items.map((a) => (
            <Card key={a.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 650, color: EMP.text }}>{a.title}</span>
                    {a.pinned && (
                      <Pill tone="accent">
                        {"Pinned"}
                      </Pill>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: EMP.faint, marginTop: 5, fontFamily: EMP.mono }}>
                    {a.authorName ? `${a.authorName} · ` : ''}
                    {fmtDateTime(a.createdAt)}
                  </div>
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <Button onClick={() => togglePin(a)} title={a.pinned ? 'Unpin' : 'Pin'}>
                      <Icon name={a.pinned ? 'chevron-down' : 'chevron-up'} size={13} />
                    </Button>
                    <Button variant="danger" onClick={() => remove(a)} title="Delete">
                      <Icon name="trash-2" size={13} />
                    </Button>
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: EMP.muted,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {a.body}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!canManage && items.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Banner>
            {"Only portal administrators can post here. Ask one of them if something needs announcing."}
          </Banner>
        </div>
      )}
    </div>
  );
}
