import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { employeeApi, type DocCategory, type DocumentView } from '../api';
import { DOC_CATEGORY_LABELS, EMP, fmtDateTime, tint } from '../theme';
import { T, useCopy } from '../copy';
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Pill,
  ScreenHeader,
  Select,
  TextArea,
} from '../ui';
import { Icon } from '../../components/Icon';

// Handbook sections, policies, forms and process guides. A document is either
// inline text or a pointer to a file elsewhere — the portal deliberately does
// not host uploads, so there is no file store to leak.

const CATEGORY_OPTIONS: { value: DocCategory; label: string }[] = (
  ['policy', 'handbook', 'form', 'guide', 'other'] as DocCategory[]
).map((value) => ({ value, label: DOC_CATEGORY_LABELS[value] }));

export function Documents({ canManage }: { canManage: boolean }) {
  const [docs, setDocs] = useState<DocumentView[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<'all' | DocCategory>('all');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocCategory>('policy');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const titlePlaceholder = useCopy('emp.docs.title_ph', 'e.g. Expense policy');
  const summaryPlaceholder = useCopy('emp.docs.summary_ph', 'One line on what this covers');
  const bodyPlaceholder = useCopy('emp.docs.body_ph', 'The document text, or leave blank if you are linking out.');

  function load() {
    employeeApi
      .documents()
      .then((r) => setDocs(r.documents))
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!docs) return [];
    return filter === 'all' ? docs : docs.filter((d) => d.category === filter);
  }, [docs, filter]);

  async function create() {
    if (busy) return;
    if (!title.trim()) {
      setFormError('A title is required');
      return;
    }
    if (!body.trim() && !linkUrl.trim()) {
      setFormError('Add document text or a link');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await employeeApi.createDocument({
        title: title.trim(),
        category,
        summary: summary.trim() || null,
        body: body.trim() || null,
        linkUrl: linkUrl.trim() || null,
      });
      setTitle('');
      setSummary('');
      setBody('');
      setLinkUrl('');
      setCategory('policy');
      setComposing(false);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: DocumentView) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await employeeApi.deleteDocument(doc.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <Empty icon="x-circle">{error}</Empty>;
  if (!docs) {
    return (
      <Empty icon="refresh-cw">
        <T id="emp.docs.loading">Loading…</T>
      </Empty>
    );
  }

  return (
    <div>
      <ScreenHeader
        icon="file-text"
        title={<T id="emp.docs.title">Documents</T>}
        subtitle={
          <T id="emp.docs.subtitle">
            Policies, handbook sections, forms and process guides. Internal use only.
          </T>
        }
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setComposing((v) => !v)}>
              <Icon name="plus" size={14} />
              {composing ? <T id="emp.docs.cancel">Cancel</T> : <T id="emp.docs.new">New document</T>}
            </Button>
          )
        }
      />

      {composing && canManage && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: 'grid', gap: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 13 }}>
              <Field label={<T id="emp.docs.field_title">Title</T>}>
                <Input value={title} onChange={setTitle} maxLength={160} placeholder={titlePlaceholder} />
              </Field>
              <Field label={<T id="emp.docs.field_category">Category</T>}>
                <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
              </Field>
            </div>
            <Field label={<T id="emp.docs.field_summary">Summary</T>}>
              <Input value={summary} onChange={setSummary} maxLength={400} placeholder={summaryPlaceholder} />
            </Field>
            <Field label={<T id="emp.docs.field_body">Document text</T>}>
              <TextArea value={body} onChange={setBody} rows={8} maxLength={20000} placeholder={bodyPlaceholder} />
            </Field>
            <Field
              label={<T id="emp.docs.field_link">Link</T>}
              hint={<T id="emp.docs.link_hint">Optional. Must start with http:// or https://</T>}
            >
              <Input value={linkUrl} onChange={setLinkUrl} placeholder="https://" maxLength={2000} />
            </Field>
            <ErrorNote>{formError}</ErrorNote>
            <div>
              <Button variant="primary" onClick={create} disabled={busy}>
                {busy ? <T id="emp.docs.saving">Saving…</T> : <T id="emp.docs.save">Save document</T>}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          <T id="emp.docs.filter_all">All</T>
        </FilterChip>
        {CATEGORY_OPTIONS.map((c) => (
          <FilterChip key={c.value} active={filter === c.value} onClick={() => setFilter(c.value)}>
            {c.label}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty icon="file-text">
          <T id="emp.docs.empty">Nothing filed here yet.</T>
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map((doc) => {
            const isOpen = open === doc.id;
            return (
              <Card key={doc.id} pad={16}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14.5, fontWeight: 650, color: EMP.text }}>{doc.title}</span>
                      <Pill>{DOC_CATEGORY_LABELS[doc.category] ?? doc.category}</Pill>
                    </div>
                    {doc.summary && (
                      <div style={{ fontSize: 12.5, color: EMP.muted, marginTop: 5, lineHeight: 1.6 }}>
                        {doc.summary}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: EMP.faint, marginTop: 6, fontFamily: EMP.mono }}>
                      {doc.authorName ? `${doc.authorName} · ` : ''}
                      {fmtDateTime(doc.updatedAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flex: 'none', flexWrap: 'wrap' }}>
                    {doc.body && (
                      <Button onClick={() => setOpen(isOpen ? null : doc.id)}>
                        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={13} />
                        {isOpen ? <T id="emp.docs.hide">Hide</T> : <T id="emp.docs.read">Read</T>}
                      </Button>
                    )}
                    {doc.linkUrl && (
                      <a
                        href={doc.linkUrl}
                        target="_blank"
                        // noreferrer matters here: an internal document link must
                        // not tell the destination it came from this portal.
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none' }}
                      >
                        <Button>
                          <Icon name="external-link" size={13} />
                          <T id="emp.docs.open">Open</T>
                        </Button>
                      </a>
                    )}
                    {canManage && (
                      <Button variant="danger" onClick={() => remove(doc)} title="Delete">
                        <Icon name="trash-2" size={13} />
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && doc.body && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: `1px solid ${EMP.line}`,
                      fontSize: 13,
                      color: EMP.muted,
                      lineHeight: 1.75,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {doc.body}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 12,
        fontFamily: EMP.sans,
        cursor: 'pointer',
        border: `1px solid ${active ? EMP.accent : EMP.line2}`,
        background: active ? tint(EMP.accent, 0.1) : EMP.panel,
        color: active ? EMP.accent : EMP.muted,
      }}
    >
      {children}
    </button>
  );
}
