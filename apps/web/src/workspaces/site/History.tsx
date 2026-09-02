import { useEffect, useState } from 'react';
import { C, tint } from '../../theme/tokens';
import { DEPLOY } from './deploy';
import { Icon } from '../../components/Icon';
import { api, type SavedVersion } from './siteApi';
import type { Model } from './types';

/**
 * Saved versions — the last twenty.
 *
 * Revert answers "undo everything since my last save". This answers "what did
 * this look like on Tuesday", which after a few days of editing is the question
 * people actually have, and Revert cannot reach.
 *
 * SELECTING A VERSION ONLY PREVIEWS IT. Restoring is a second, confirmed act,
 * and it loads the version as the WORKING state rather than deploying it — so
 * bringing an old version back goes through Save and Deploy like anything else.
 * A one-press control that changed the live site from a list of timestamps is
 * the kind of button people hit by accident.
 *
 * Closing the panel puts the preview back on what is being edited, so leaving
 * it can never strand somebody looking at a version they did not choose.
 */

function when(iso: string | null): string {
  if (!iso) return 'unknown time';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function History({
  open,
  onClose,
  onPreview,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  /** Draw this model in the preview. Null puts the working state back. */
  onPreview: (model: Model | null) => void;
  onRestore: (model: Model) => void;
}) {
  const [versions, setVersions] = useState<SavedVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setError(null);
    void (async () => {
      try {
        setVersions((await api.versions()).versions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the version list.');
      }
    })();
  }, [open]);

  // Leaving the panel must never strand the preview on a version.
  useEffect(() => {
    if (!open) onPreview(null);
  }, [open, onPreview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  async function pick(v: SavedVersion) {
    setSelected(v.id);
    setBusy(true);
    setError(null);
    try {
      onPreview((await api.version(v.id)).model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that version.');
    } finally {
      setBusy(false);
    }
  }

  async function restore(v: SavedVersion) {
    if (
      !window.confirm(
        `Bring back the version from ${when(v.at)}?\n\nIt becomes what you are editing. Nothing is saved or deployed until you press Save or Deploy, and anything unsaved right now is replaced.`,
      )
    )
      return;
    setBusy(true);
    try {
      onRestore((await api.version(v.id)).model);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore that version.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      aria-label="Saved versions"
      style={{
        width: 300,
        flex: 'none',
        borderLeft: `1px solid ${C.line}`,
        background: C.panel2,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '13px 16px',
          borderBottom: `1px solid ${C.line}`,
          flex: 'none',
        }}
      >
        <Icon name="history" size={15} color={C.gold} />
        <span style={{ flex: 1, font: `600 13px/1.3 ${C.sans}`, color: C.text }}>Saved versions</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 4, display: 'inline-flex' }}
        >
          <Icon name="x" size={15} color={C.faint} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        {error && (
          <p style={{ margin: '0 0 12px', font: `400 12.5px/1.6 ${C.sans}`, color: '#d99aa8' }}>{error}</p>
        )}
        {versions === null && !error ? (
          <p style={{ margin: 0, font: `400 13px/1.6 ${C.sans}`, color: C.faint }}>Loading…</p>
        ) : versions && versions.length === 0 ? (
          <p style={{ margin: 0, font: `400 13px/1.7 ${C.sans}`, color: C.faint }}>
            Nothing saved yet. Each time you press Save, a version is kept here.
          </p>
        ) : (
          (versions ?? []).map((v, i) => {
            const active = selected === v.id;
            return (
              <div
                key={v.id}
                style={{
                  border: `1px solid ${active ? C.gold : C.line}`,
                  background: active ? tint(C.gold, 0.08) : 'transparent',
                  borderRadius: 9,
                  padding: '11px 12px',
                  marginBottom: 8,
                }}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pick(v)}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: busy ? 'progress' : 'pointer',
                    fontFamily: C.sans,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, font: `600 12.5px/1.4 ${C.sans}`, color: active ? C.gold : C.text }}>
                      {when(v.at)}
                    </span>
                    {i === 0 && (
                      <Tag text="Latest" colour={C.faint} />
                    )}
                    {v.deployed && <Tag text="Deployed" colour={DEPLOY.accent} />}
                  </span>
                  <span style={{ display: 'block', font: `400 11.5px/1.5 ${C.mono}`, color: C.faint, marginTop: 4 }}>
                    {v.sections} section{v.sections === 1 ? '' : 's'}
                  </span>
                </button>

                {active && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void restore(v)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 7,
                        border: `1px solid ${C.line2}`,
                        background: 'transparent',
                        color: C.text,
                        font: `500 12px/1 ${C.sans}`,
                        fontFamily: C.sans,
                        cursor: busy ? 'progress' : 'pointer',
                      }}
                    >
                      Bring this back
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p
        style={{
          margin: 0,
          padding: '10px 14px',
          borderTop: `1px solid ${C.line}`,
          font: `400 11.5px/1.6 ${C.sans}`,
          color: C.faint,
          flex: 'none',
        }}
      >
        The last 20 saves. Selecting one shows it in the preview; nothing changes until you bring it
        back.
      </p>
    </aside>
  );
}

function Tag({ text, colour }: { text: string; colour: string }) {
  return (
    <span
      style={{
        font: `500 9.5px/1 ${C.mono}`,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: colour,
        border: `1px solid ${tint(colour, 0.4)}`,
        borderRadius: 999,
        padding: '4px 7px',
        flex: 'none',
      }}
    >
      {text}
    </span>
  );
}
