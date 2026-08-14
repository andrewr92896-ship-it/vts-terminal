import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { StudyPackage } from '../../api/types';
import { Icon } from '../../components/Icon';
import type { Theme } from '../../theme/themes';

// YOUR STUDY PACKAGES — the list, on the screen that makes them.
//
// A package was creatable and then unreachable: Study Creation offered only
// "create another", and the Study Packages screen could share it, publish it and
// archive it but never change it. So a package created without its study game —
// which the wizard allows, since a blueprint that asks for no questions produces
// no deck — could not be finished, and a creator who had already had their AI
// write the questions had nowhere to put them. Reported by the owner.
//
// Two actions, and they are different jobs:
//   FINISH  adds a part the package does not have, through the ordinary AI
//           handoff, written against the categories it already carries.
//   UPDATE  renames it, and opens each part it DOES have in the maker that
//           edits it — package content is listed in those makers alongside
//           standalone content, which is true and was not discoverable.

export function YourPackages({
  theme,
  onFinish,
  onEditPart,
}: {
  theme: Theme;
  onFinish: (packageId: string) => void;
  onEditPart: (part: 'games' | 'flashcards' | 'guides') => void;
}) {
  const [packages, setPackages] = useState<StudyPackage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { packages: p } = await api.listStudyPackages();
      setPackages(p.filter((x) => x.mine));
      setFailed(false);
    } catch {
      setFailed(true);
      setPackages([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Nothing to say before the first read, and nothing to say to somebody with
  // no packages — the Create tile below is already the whole answer for them.
  if (!packages || (packages.length === 0 && !failed)) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ margin: '0 0 10px', fontSize: 11.5, fontWeight: 600, letterSpacing: '.4px', color: '#6f84b0' }}>
        {'YOUR STUDY PACKAGES'}
      </div>
      {failed ? (
        <div style={{ ...card(theme), fontSize: 12.5, color: '#ffb4a8' }}>
          {'Could not read your packages. '}
          <button onClick={() => void load()} style={linkBtn(theme)}>
            {'Try again'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {packages.map((p) => (
            <PackageRow
              key={p.id}
              theme={theme}
              pkg={p}
              open={open === p.id}
              onToggle={() => setOpen((v) => (v === p.id ? null : p.id))}
              onFinish={() => onFinish(p.id)}
              onEditPart={onEditPart}
              onRenamed={() => void load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PackageRow({
  theme,
  pkg,
  open,
  onToggle,
  onFinish,
  onEditPart,
  onRenamed,
}: {
  theme: Theme;
  pkg: StudyPackage;
  open: boolean;
  onToggle: () => void;
  onFinish: () => void;
  onEditPart: (part: 'games' | 'flashcards' | 'guides') => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(pkg.name);
  const [subject, setSubject] = useState(pkg.subject ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const holds = [
    pkg.hasDeck ? 'Study game' : null,
    pkg.hasFlashcards ? 'Flashcards' : null,
    pkg.hasGuide ? 'Presentation' : null,
    pkg.lessonCount ? `${pkg.lessonCount} lessons` : null,
  ].filter(Boolean);
  const missing = [
    !pkg.hasDeck ? 'a study game' : null,
    !pkg.hasFlashcards ? 'flashcards' : null,
    !pkg.hasGuide ? 'a presentation' : null,
  ].filter(Boolean) as string[];

  // A published package's content is locked while it is in the library, so
  // neither action would be honoured — say so rather than drawing a button the
  // server will refuse.
  const locked = pkg.visibility === 'public';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateStudyPackage(pkg.id, { name: name.trim(), subject: subject.trim() || null });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
      onRenamed();
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{pkg.name}</div>
          <div style={{ fontSize: 12, color: '#8ea3cc', marginTop: 3 }}>
            {holds.length ? holds.join(' · ') : 'Nothing in it yet'}
          </div>
          {missing.length > 0 && !locked && (
            <div style={{ fontSize: 12, color: '#e9b356', marginTop: 4 }}>
              {`Missing ${missing.join(', ')}.`}
            </div>
          )}
          {locked && (
            <div style={{ fontSize: 12, color: '#8ea3cc', marginTop: 4 }}>
              {'In the VTS Study Library, so its content is locked. Withdraw it to make changes.'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {missing.length > 0 && !locked && (
            <button onClick={onFinish} style={primary(theme)}>
              {'Finish'}
            </button>
          )}
          <button onClick={onToggle} style={ghost(theme)}>
            {open ? 'Close' : 'Update'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display: 'grid', gap: 8, maxWidth: 460 }}>
            <label style={{ fontSize: 12, color: '#8ea3cc' }}>
              {'Name'}
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} style={input(theme)} />
            </label>
            <label style={{ fontSize: 12, color: '#8ea3cc' }}>
              {'Subject'}
              <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} style={input(theme)} />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => void save()} disabled={busy || locked || !name.trim()} style={primary(theme, busy || locked || !name.trim())}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              {saved && <span style={{ fontSize: 12, color: '#46d68c' }}>{'Saved'}</span>}
              {error && <span style={{ fontSize: 12, color: '#ffb4a8' }}>{error}</span>}
            </div>
          </div>

          {holds.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: '#8ea3cc', marginBottom: 7 }}>
                {'Its content is edited in the makers below, where it is listed alongside everything else you have made.'}
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {pkg.hasDeck && (
                  <button onClick={() => onEditPart('games')} style={ghost(theme)}>
                    <Icon name="gamepad-2" size={13} color="#dfe7fa" />
                    {' Edit the study game'}
                  </button>
                )}
                {pkg.hasFlashcards && (
                  <button onClick={() => onEditPart('flashcards')} style={ghost(theme)}>
                    <Icon name="copy" size={13} color="#dfe7fa" />
                    {' Edit the flashcards'}
                  </button>
                )}
                {pkg.hasGuide && (
                  <button onClick={() => onEditPart('guides')} style={ghost(theme)}>
                    <Icon name="presentation" size={13} color="#dfe7fa" />
                    {' Edit the presentation'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function card(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 12,
    padding: 14,
    background: 'rgba(255,255,255,.02)',
  };
}

function primary(theme: Theme, disabled = false): CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 9,
    border: 'none',
    background: disabled ? 'rgba(255,255,255,.12)' : theme.accent,
    color: disabled ? '#8ea3cc' : '#0b1020',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
  };
}

function ghost(theme: Theme): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '8px 13px',
    borderRadius: 9,
    border: `1px solid ${theme.navBorder}`,
    background: 'transparent',
    color: '#dfe7fa',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function linkBtn(theme: Theme): CSSProperties {
  return {
    border: 'none',
    background: 'none',
    color: theme.accent,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  };
}

function input(theme: Theme): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 4,
    padding: '9px 11px',
    borderRadius: 9,
    border: `1px solid ${theme.navBorder}`,
    background: '#0d1630',
    color: '#eef3ff',
    fontSize: 13.5,
  };
}
