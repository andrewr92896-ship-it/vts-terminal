import {
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
} from 'react';
import { api, ApiError } from '../api/client';

// A small, reusable "Fill with AI" helper for manual-entry forms. The user can
// describe the entry in plain English and/or drop a screenshot — from a file
// (click or drag) or pasted off the clipboard — and Claude reads it into the
// form's fields. It never submits; it only pre-fills, so the user reviews and
// saves with the form's own button. Drop it next to any add form and map the
// returned fields onto that form's state via onFill.

interface AiEntryProps {
  kind: string; // backend extractor kind (see apps/api/src/ai/extract.ts)
  onFill: (fields: Record<string, unknown>) => void;
  label?: string; // entity noun, e.g. "deal", "trade", "expense"
  notePlaceholder?: string;
  accent?: string; // theme accent for the trigger/active states
  disabled?: boolean;
}

const BORDER = '#2a2d33';
const PANEL = '#15171b';
const FIELD = '#0e0f12';
const MUTED = '#8b9098';

// Pick a readable text color (near-black or white) for text sitting on top of
// the accent, so the "Fill form" button stays legible for any workspace accent.
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#0b0c0f';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#0b0c0f' : '#fff';
}

export function AiEntry({ kind, onFill, label = 'entry', notePlaceholder, accent = '#6b8afd', disabled }: AiEntryProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function readImage(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setMediaType(file.type);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        readImage(it.getAsFile());
        e.preventDefault();
        return;
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    readImage(e.dataTransfer?.files?.[0]);
  }

  async function fill() {
    const text = note.trim();
    if (busy || (!text && !image)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await api.aiExtract({
        kind,
        note: text || undefined,
        imageBase64: image || undefined,
        mediaType: image ? mediaType : undefined,
      });
      const count = Object.keys(res.fields).length;
      if (count === 0) {
        setError("Couldn't read any fields — add a clearer screenshot or more detail.");
        return;
      }
      onFill(res.fields);
      setDone(`Filled ${count} field${count === 1 ? '' : 's'} — review and save.`);
      setNote('');
      setImage(null);
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 503
            ? 'Claude isn’t configured yet — an API key needs to be set on the server.'
            : e.message
          : 'Could not read that',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          disabled={disabled}
          title={`Describe the ${label} or drop a screenshot and let Claude fill it in`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11.5,
            fontWeight: 600,
            color: accent,
            background: 'transparent',
            border: `1px solid ${accent}55`,
            borderRadius: 7,
            padding: '6px 11px',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <span style={{ fontSize: 12 }}>✦</span> Fill with AI
        </button>
        {done && <span style={{ fontSize: 11.5, color: '#a7d8bf' }}>✓ {done}</span>}
      </div>
    );
  }

  const ready = !busy && (note.trim() !== '' || !!image);

  return (
    <div
      style={{
        border: `1px solid ${accent}55`,
        borderRadius: 9,
        background: PANEL,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 600, color: accent }}>
        <span style={{ marginRight: 6 }}>✦</span>
        Fill {label} with AI
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: MUTED, fontWeight: 500 }}>note and/or screenshot</span>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && fill()}
        placeholder={notePlaceholder ?? `Describe the ${label}…`}
        style={field}
      />

      <div
        tabIndex={0}
        onPaste={onPaste}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `1px dashed ${dragOver ? accent : BORDER}`,
          borderRadius: 8,
          background: dragOver ? `${accent}11` : FIELD,
          padding: image ? 7 : '14px 12px',
          textAlign: 'center',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {image ? (
          <img
            src={image}
            alt="screenshot preview"
            style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 5, display: 'block', margin: '0 auto' }}
          />
        ) : (
          <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            <span style={{ fontSize: 16, marginRight: 6 }}>📋</span>
            Drop or paste a screenshot here, or click to upload a file.
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => readImage(e.target.files?.[0])}
      />

      {error && <div style={{ fontSize: 11.5, color: '#ffb4ab' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={fill}
          disabled={!ready}
          style={{
            border: 'none',
            background: accent,
            color: readableOn(accent),
            fontWeight: 700,
            fontSize: 12,
            padding: '7px 14px',
            borderRadius: 7,
            cursor: ready ? 'pointer' : 'default',
            opacity: ready ? 1 : 0.5,
          }}
        >
          {busy ? 'Reading…' : 'Fill form'}
        </button>
        {image && (
          <button type="button" onClick={() => setImage(null)} style={ghost}>
            Clear image
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          style={{ ...ghost, marginLeft: 'auto' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

const field: CSSProperties = {
  background: FIELD,
  border: `1px solid ${BORDER}`,
  borderRadius: 7,
  color: '#eceef0',
  fontSize: 12.5,
  padding: '9px 11px',
  outline: 'none',
};
const ghost: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#c9cdd4',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER}`,
  padding: '6px 11px',
  borderRadius: 7,
  cursor: 'pointer',
};
