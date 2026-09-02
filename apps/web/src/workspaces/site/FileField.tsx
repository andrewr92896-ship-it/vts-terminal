import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { C, tint } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import { api, fileUrl, type StoredFile } from './siteApi';
import type { LinkBehavior } from './types';
import { labelStyle } from './fields';

/**
 * Choosing an uploaded file, and deciding what a click on it does.
 *
 * TYPING A PATH WAS THE OLD ANSWER AND IT WAS A BAD ONE. The address of an
 * uploaded résumé is `/files/andrew-ramey-resume.pdf`, which has to be
 * remembered exactly, and a typo produces a link that 404s for visitors while
 * looking perfectly fine in the editor. Picking from the list cannot be typed
 * wrong.
 *
 * The box stays editable, because plenty of links are not files at all —
 * `#work`, a mailto:, somebody else's site — and a picker that replaced free
 * text would make those impossible.
 */

/**
 * The uploaded files, shared by every picker on the screen.
 *
 * A CONTEXT RATHER THAN A PROP, because links live at every depth of the form —
 * a section's buttons, a card's link, the band's call to action, the logo — and
 * threading the list to all of them is how one of them ends up without it. It
 * also means ONE request for the whole screen rather than one per field.
 *
 * `reload` is called when a picker is opened, so a file uploaded a moment ago in
 * File Uploads is there without a page refresh — otherwise the obvious sequence
 * (upload it, come back, link it) fails at the last step for no visible reason.
 */
type FilesValue = { files: StoredFile[]; reload: () => void };
const FilesContext = createContext<FilesValue>({ files: [], reload: () => {} });

export function useFiles(): FilesValue {
  return useContext(FilesContext);
}

export function FilesProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  // Every image picker asks on mount and a section holds several, so a burst of
  // asks is one request: skipped while one is in flight or just answered.
  const last = useRef(0);
  const reload = useCallback(() => {
    const now = Date.now();
    if (now - last.current < 1500) return;
    last.current = now;
    void (async () => {
      try {
        setFiles((await api.files()).files);
      } catch {
        // The pickers simply offer nothing. A link field that refused to render
        // because the file list was unreachable would be far worse.
      }
    })();
  }, []);
  useEffect(reload, [reload]);
  // Uploading happens on another screen, or another tab. Coming back here is
  // the moment to look again.
  useEffect(() => {
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);
  return <FilesContext.Provider value={{ files, reload }}>{children}</FilesContext.Provider>;
}

export const publicPath = (slug: string) => `/files/${slug}`;

const BEHAVIORS: { value: LinkBehavior; label: string; note: string }[] = [
  { value: 'link', label: 'Open', note: 'Goes to it. Another site opens in a new tab.' },
  { value: 'download', label: 'Download', note: 'Saves the file instead of opening it.' },
  { value: 'preview', label: 'Preview', note: 'Shows it on the page, with a download arrow.' },
];

export function LinkField({
  label,
  href,
  behavior,
  onHref,
  onBehavior,
}: {
  label: string;
  href: string;
  behavior: LinkBehavior | undefined;
  onHref: (v: string) => void;
  onBehavior: (v: LinkBehavior | undefined) => void;
}) {
  const { files, reload } = useFiles();
  const [picking, setPicking] = useState(false);
  const chosen = behavior ?? 'link';
  const isFile = href.startsWith('/files/');

  return (
    <div style={{ marginBottom: 16 }}>
      <span style={labelStyle}>{label}</span>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={href}
          onChange={(e) => onHref(e.target.value)}
          placeholder="#section, https://…, or pick a file"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${C.line2}`,
            background: C.panel2,
            color: C.text,
            font: `400 13.5px/1.5 ${C.mono}`,
          }}
        />
        <button
          type="button"
          onClick={() => {
            // Look again on open, so something uploaded a moment ago is here.
            if (!picking) reload();
            setPicking((v) => !v);
          }}
          title="Choose an uploaded file"
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 12px',
            borderRadius: 8,
            border: `1px solid ${picking ? C.gold : C.line2}`,
            background: picking ? tint(C.gold, 0.1) : 'transparent',
            color: picking ? C.gold : C.muted,
            font: `500 12.5px/1 ${C.sans}`,
            fontFamily: C.sans,
            cursor: 'pointer',
          }}
        >
          <Icon name="file" size={13} color={picking ? C.gold : C.muted} />
          File
        </button>
      </div>

      {picking && (
        <div
          style={{
            marginTop: 8,
            border: `1px solid ${C.line}`,
            borderRadius: 9,
            background: C.bg,
            maxHeight: 210,
            overflowY: 'auto',
          }}
        >
          {files.length === 0 ? (
            <p style={{ margin: 0, padding: '14px 14px', font: `400 12.5px/1.6 ${C.sans}`, color: C.faint }}>
              Nothing uploaded yet. Add files in Site Editor ▸ File Uploads.
            </p>
          ) : (
            files.map((f) => (
              <button
                key={f.slug}
                type="button"
                onClick={() => {
                  onHref(publicPath(f.slug));
                  setPicking(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  borderBottom: `1px solid ${C.line}`,
                  background: href === publicPath(f.slug) ? tint(C.gold, 0.1) : 'transparent',
                  color: href === publicPath(f.slug) ? C.gold : C.muted,
                  font: `500 12.5px/1.3 ${C.sans}`,
                  fontFamily: C.sans,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <Icon name="file" size={13} color={C.faint} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.slug}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/*
        Only shown once there is something to click. An empty link has no
        behaviour to choose, and offering one would be a control that does
        nothing.
      */}
      {href && (
        <div style={{ marginTop: 10 }}>
          <span style={{ ...labelStyle, marginBottom: 6 }}>When clicked</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BEHAVIORS.map((b) => (
              <button
                key={b.value}
                type="button"
                title={b.note}
                onClick={() => onBehavior(b.value === 'link' ? undefined : b.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 7,
                  border: `1px solid ${chosen === b.value ? C.gold : C.line2}`,
                  background: chosen === b.value ? tint(C.gold, 0.12) : 'transparent',
                  color: chosen === b.value ? C.gold : C.muted,
                  font: `500 12.5px/1 ${C.sans}`,
                  fontFamily: C.sans,
                  cursor: 'pointer',
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
          <p style={{ margin: '7px 0 0', font: `400 12px/1.6 ${C.sans}`, color: C.faint }}>
            {BEHAVIORS.find((b) => b.value === chosen)?.note}
            {chosen !== 'link' && !isFile && ' Works on files from File Uploads.'}
          </p>
        </div>
      )}
    </div>
  );
}

/** The same picker for an image, where there is no behaviour to choose. */
export function ImageField({
  label,
  src,
  onChange,
}: {
  label: string;
  src: string;
  onChange: (v: string) => void;
}) {
  const { files, reload } = useFiles();
  // The thumbnails are the picker — there is no "open" to look again on, so
  // mounting is the moment. Without it, upload-then-switch-section offered the
  // old list until something else happened to refocus the window.
  useEffect(reload, [reload]);
  const images = files.filter((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f.slug));
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {src && (
          <img
            src={src}
            alt=""
            style={{
              width: 56,
              height: 56,
              objectFit: 'cover',
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              flex: 'none',
              background: C.panel2,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {images.length === 0 ? (
              <span style={{ font: `400 12.5px/1.6 ${C.sans}`, color: C.faint }}>
                No images uploaded yet. Add them in Site Editor ▸ File Uploads.
              </span>
            ) : (
              images.map((f) => (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() => onChange(publicPath(f.slug))}
                  title={f.slug}
                  style={{
                    padding: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 7,
                    overflow: 'hidden',
                    border: `1px solid ${src === publicPath(f.slug) ? C.gold : C.line2}`,
                    background: C.panel2,
                    cursor: 'pointer',
                  }}
                >
                  <img
                    // Drawn from the portal's own file route: /files/ is the
                    // SITE's address for it and does not exist on this origin.
                    src={fileUrl(f.slug)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              ))
            )}
          </div>
          {src && (
            <button
              type="button"
              onClick={() => onChange('')}
              style={{
                marginTop: 8,
                background: 'none',
                border: 'none',
                padding: 0,
                color: C.faint,
                font: `500 12px/1 ${C.sans}`,
                fontFamily: C.sans,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Remove image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
