import { useCallback, useEffect, useRef, useState } from 'react';
import { C, tint } from '../../theme/tokens';
import { Panel, Screen } from './ui';
import { Icon } from '../../components/Icon';
import { api, type FilesPayload, type StoredFile } from './siteApi';

/**
 * Site Editor ▸ File Uploads.
 *
 * Files the portfolio hands to visitors — a résumé, a headshot, a certificate.
 * They live on the admin's volume and are served through the portfolio, so the
 * public link is on andrewramey.com and a visitor's browser never learns this
 * hostname from a link.
 *
 * EVERYTHING HERE IS PUBLIC AND THE SCREEN SAYS SO. There is deliberately no
 * per-file private switch: a control like that is set once and misremembered
 * forever, and the whole purpose of this section is files meant to be handed
 * out. Anything that should not be public does not belong here at all.
 *
 * A FILE'S URL IS A PROMISE. A résumé link gets pasted into applications and
 * sits in inboxes for months, so uploading the same filename REPLACES the file
 * at the same address rather than making a second one — and renaming, which
 * breaks those links, says so before it does it.
 */

const KB = 1024;
function size(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / KB / KB).toFixed(1)} MB`;
}

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const publicUrl = (slug: string) => `https://vitalistradingsystems.com/files/${slug}`;

export function Files() {
  const [data, setData] = useState<FilesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.files());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file list.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      // One at a time rather than in parallel: the failures are per file, and a
      // batch that half-succeeds is a worse thing to explain than a queue.
      for (const file of Array.from(list)) {
        const res = await api.upload(file);
        setData((d) => (d ? { ...d, files: res.files } : d));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That upload failed.');
      void load();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(file: StoredFile) {
    if (!window.confirm(`Delete ${file.slug}? Any link to it stops working.`)) return;
    setBusy(true);
    try {
      const res = await api.deleteFile(file.slug);
      setData((d) => (d ? { ...d, files: res.files } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that.');
    } finally {
      setBusy(false);
    }
  }

  async function rename(file: StoredFile) {
    const base = file.slug.replace(/\.[^.]+$/, '');
    const next = window.prompt(
      `Rename ${file.slug}.\n\nThis CHANGES the public link — anywhere the old one is already pasted stops working. The file type cannot change.`,
      base,
    );
    if (next === null || next.trim() === base) return;
    setBusy(true);
    try {
      const res = await api.renameFile(file.slug, next.trim());
      setData((d) => (d ? { ...d, files: res.files } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename that.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      setCopied(slug);
      setTimeout(() => setCopied((s) => (s === slug ? null : s)), 1600);
    } catch {
      // Clipboard access can be refused. The link is on screen either way, so
      // this is a convenience failing rather than the feature failing.
      setError('Could not reach the clipboard — the link is written out above.');
    }
  }

  const files = data?.files ?? [];

  return (
    <Screen
      eyebrow="vitalistradingsystems.com"
      title="File Uploads"
      note="Files the site hands out — a PDF, an image, anything you want to link to or show. Everything here is public to anyone with the link."
    >
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        style={{
          display: 'grid',
          placeItems: 'center',
          gap: 10,
          padding: '38px 24px',
          borderRadius: 12,
          border: `1px dashed ${dragging ? C.gold : C.line2}`,
          background: dragging ? tint(C.gold, 0.06) : C.panel,
          cursor: busy ? 'progress' : 'pointer',
          textAlign: 'center',
          transition: 'border-color .15s ease, background-color .15s ease',
        }}
      >
        <input
          ref={input}
          type="file"
          multiple
          disabled={busy}
          onChange={(e) => void upload(e.target.files)}
          style={{ display: 'none' }}
        />
        <Icon name="upload" size={22} color={dragging ? C.gold : C.faint} />
        <span style={{ font: `600 14.5px/1.4 ${C.sans}`, color: C.text }}>
          {busy ? 'Uploading…' : 'Drop a file here, or click to choose one'}
        </span>
        <span style={{ font: `400 12.5px/1.6 ${C.sans}`, color: C.faint, maxWidth: '34rem' }}>
          {data ? `${data.allowed.join(' ')} · up to ${size(data.maxBytes)}` : ' '}
        </span>
      </label>

      {error && (
        <Notice tone="bad" title="Problem.">
          {error}
        </Notice>
      )}



      <div style={{ marginTop: 26 }}>
        {data === null && !error ? (
          <p style={{ margin: 0, font: `400 14px/1.6 ${C.sans}`, color: C.faint }}>Loading…</p>
        ) : files.length === 0 ? (
          <Panel>
            <p style={{ margin: 0, font: `400 14px/1.7 ${C.sans}`, color: C.muted }}>
              No files yet.
            </p>
          </Panel>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {files.map((f) => (
              <Panel key={f.slug} style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <span style={{ marginTop: 2, flex: 'none' }}>
                    <Icon name="file" size={18} color={C.faint} />
                  </span>
                  <div style={{ flex: '1 1 18rem', minWidth: 0 }}>
                    <div style={{ font: `600 14.5px/1.4 ${C.sans}`, color: C.text, wordBreak: 'break-all' }}>
                      {f.slug}
                    </div>
                    <div style={{ font: `400 12px/1.6 ${C.sans}`, color: C.faint, marginTop: 3 }}>
                      {size(f.size)}
                      {when(f.uploadedAt) ? ` · ${when(f.uploadedAt)}` : ''}
                    </div>
                    <a
                      href={`/files/${f.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        marginTop: 9,
                        font: `500 12px/1.5 ${C.mono}`,
                        color: C.gold,
                        wordBreak: 'break-all',
                        textDecoration: 'none',
                      }}
                    >
                      {publicUrl(f.slug)}
                    </a>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 'none' }}>
                    <RowButton onClick={() => void copy(f.slug)} disabled={busy}>
                      <Icon name={copied === f.slug ? 'check' : 'copy'} size={13} color={C.text} />
                      {copied === f.slug ? 'Copied' : 'Copy link'}
                    </RowButton>
                    <RowButton onClick={() => void rename(f)} disabled={busy}>
                      <Icon name="pencil" size={13} color={C.text} />
                      Rename
                    </RowButton>
                    <RowButton onClick={() => void remove(f)} disabled={busy} danger>
                      <Icon name="trash" size={13} color="#d99aa8" />
                      Delete
                    </RowButton>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>

      {files.length > 0 && (
        <p
          style={{
            margin: '18px 0 0',
            font: `400 12.5px/1.7 ${C.sans}`,
            color: C.faint,
            maxWidth: '46rem',
          }}
        >
          Uploading a file with the same name replaces the one already at that address, so a link
          you have already sent someone keeps working.
        </p>
      )}
    </Screen>
  );
}


function RowButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${danger ? tint('#d99aa8', 0.3) : C.line2}`,
        background: 'transparent',
        color: danger ? '#d99aa8' : C.text,
        font: `500 12.5px/1 ${C.sans}`,
        fontFamily: C.sans,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'warn' | 'bad';
  title: string;
  children: React.ReactNode;
}) {
  const hex = tone === 'bad' ? '#d99aa8' : C.gold;
  return (
    <div
      style={{
        marginTop: 16,
        padding: '16px 18px',
        borderRadius: 12,
        border: `1px solid ${tint(hex, 0.32)}`,
        background: tint(hex, 0.07),
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ color: hex, flex: 'none', marginTop: 1 }} aria-hidden="true">
        ⚠
      </span>
      <p style={{ margin: 0, font: `400 13.5px/1.75 ${C.sans}`, color: C.muted, maxWidth: '46rem' }}>
        <strong style={{ color: C.text, fontWeight: 600 }}>{title}</strong> {children}
      </p>
    </div>
  );
}
