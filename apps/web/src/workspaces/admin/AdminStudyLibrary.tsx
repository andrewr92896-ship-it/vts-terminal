import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { StudyPackageDetail, StudySubmission } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { Badge, SectionHeader, ghostBtn, inputStyle, msgStyle, panel, panelLabel, primaryBtn } from './adminUi';

// Admin ▸ Study Library — the moderation queue for the public library.
//
// SUBMITTING IS NOT PUBLISHING, and this screen is the reason that sentence is
// true: a creator asks, and content becomes public only because somebody here
// read it and approved it. Nothing publishes on a timer, and nothing publishes
// because it was shared privately with somebody.
//
// Three outcomes, and they are genuinely different:
//   • Approve — it goes into the VTS Study Library, and its content locks so
//     what people study cannot drift away from what was reviewed.
//   • Ask for changes — handed back to the creator, who can fix it and submit
//     again. Nothing about the package is altered.
//   • Reject — handed back, and not expected again in that form.
//
// The two hand-backs are identical in what they do to the package. They are kept
// apart because the creator reads them completely differently, and a note that
// says "fix the third category" filed as a rejection reads as a refusal.

const MUTED = '#8ea3cc';
const FAINT = '#6f84b0';

export function AdminStudyLibrary({ theme }: { theme: Theme }) {
  const grad = accentGradient(theme);
  const [submissions, setSubmissions] = useState<StudySubmission[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.adminStudySubmissions(filter === 'pending' ? 'pending' : undefined);
      setSubmissions(r.submissions);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', animation: 'fadeIn .25s ease' }}>
      <SectionHeader
        title="Study Library"
        subtitle="Study packages creators have asked VTS to publish. Approving is the only thing that makes one public."
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          style={{ ...ghostBtn, borderColor: filter === 'pending' ? theme.accent : undefined }}
          onClick={() => setFilter('pending')}
        >
          {'Waiting'}
        </button>
        <button
          style={{ ...ghostBtn, borderColor: filter === 'all' ? theme.accent : undefined }}
          onClick={() => setFilter('all')}
        >
          {'Everything'}
        </button>
      </div>

      {loading ? (
        <div style={{ ...panel(theme), color: MUTED, fontSize: 13 }}>{'Loading…'}</div>
      ) : loadError ? (
        <div style={{ ...panel(theme), color: '#ffb4ab', fontSize: 13 }}>
          {'Couldn’t load the submission queue. Try again in a moment.'}
        </div>
      ) : submissions.length === 0 ? (
        <div style={{ ...panel(theme), color: MUTED, fontSize: 13 }}>
          {filter === 'pending' ? 'Nothing is waiting to be reviewed.' : 'Nothing has been submitted yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {submissions.map((s) => (
            <div key={s.id} style={panel(theme)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#eef3ff' }}>{s.packageName}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
                    {[
                      s.packageSubject,
                      s.submitterName ? `by ${s.submitterName}` : 'creator since deleted',
                      new Date(s.submittedAt).toLocaleDateString(),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>

              {s.adminNote && (
                <div style={{ ...panelLabel, marginTop: 10, color: FAINT }}>{`Note: ${s.adminNote}`}</div>
              )}
              <div style={{ ...panelLabel, marginTop: 8, color: FAINT }}>
                {`Attested against ${s.attestationVersion}`}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button style={ghostBtn} onClick={() => setOpen(open === s.id ? null : s.id)}>
                  {open === s.id ? 'Hide the package' : 'Read the package'}
                </button>
                {s.status === 'pending' && (
                  <ReviewControls theme={theme} grad={grad} submissionId={s.id} onDone={(list) => setSubmissions(list)} />
                )}
                {s.status === 'approved' && (
                  <button
                    style={ghostBtn}
                    onClick={async () => {
                      try {
                        await api.unpublishStudyPackage(s.packageId);
                        await load();
                      } catch {
                        /* best-effort */
                      }
                    }}
                  >
                    {'Take it out of the library'}
                  </button>
                )}
              </div>

              {open === s.id && <PackagePreview theme={theme} packageId={s.packageId} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewControls({
  theme,
  grad,
  submissionId,
  onDone,
}: {
  theme: Theme;
  grad: string;
  submissionId: string;
  onDone: (submissions: StudySubmission[]) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'rejected' | 'changes_requested') {
    setBusy(true);
    setError(null);
    try {
      const r = await api.reviewStudySubmission(submissionId, decision, note.trim() || null);
      onDone(r.submissions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t record that decision.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="A note for the creator (optional, but read it back before rejecting)"
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={primaryBtn(theme, grad)} disabled={busy} onClick={() => void decide('approved')}>
          {'Approve and publish'}
        </button>
        <button style={ghostBtn} disabled={busy} onClick={() => void decide('changes_requested')}>
          {'Ask for changes'}
        </button>
        <button style={ghostBtn} disabled={busy} onClick={() => void decide('rejected')}>
          {'Reject'}
        </button>
      </div>
      {error && <div style={msgStyle(false)}>{error}</div>}
    </div>
  );
}

// What the reviewer is actually deciding about. Read through the ordinary
// package route, which already lets an admin reach any package.
function PackagePreview({ theme, packageId }: { theme: Theme; packageId: string }) {
  const [pkg, setPkg] = useState<StudyPackageDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getStudyPackage(packageId)
      .then((r) => {
        if (alive) setPkg(r.package);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [packageId]);

  if (failed) return <div style={{ fontSize: 12.5, color: '#ffb4ab', marginTop: 10 }}>{'Couldn’t read it.'}</div>;
  if (!pkg) return <div style={{ fontSize: 12.5, color: MUTED, marginTop: 10 }}>{'Loading…'}</div>;

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: `1px solid ${theme.navBorder}`,
        fontSize: 12.5,
        color: MUTED,
        lineHeight: 1.6,
      }}
    >
      {pkg.description && <p style={{ margin: '0 0 8px' }}>{pkg.description}</p>}
      <div>
        {[
          pkg.hasDeck ? 'Study game' : null,
          pkg.hasFlashcards ? 'Flashcards' : null,
          pkg.hasGuide ? 'Presentation' : null,
          pkg.lessonCount ? `${pkg.lessonCount} lessons` : null,
          pkg.audience ? `for ${pkg.audience}` : null,
          pkg.depth,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {pkg.categories.length > 0 && (
        <div style={{ marginTop: 8, color: FAINT }}>
          {pkg.categories.map((c) => `${c.name}${c.weight == null ? '' : ` ${c.weight}%`}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: StudySubmission['status'] }) {
  const color =
    status === 'approved'
      ? '#7de2b8'
      : status === 'pending'
        ? '#FF9F45'
        : status === 'changes_requested'
          ? '#EBCB74'
          : FAINT;
  const label =
    status === 'approved'
      ? 'Published'
      : status === 'pending'
        ? 'Waiting'
        : status === 'changes_requested'
          ? 'Changes asked for'
          : status === 'rejected'
            ? 'Rejected'
            : 'Withdrawn';
  return <Badge color={color}>{label}</Badge>;
}
