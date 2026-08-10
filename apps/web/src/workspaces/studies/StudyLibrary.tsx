import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import type {
  StudyLibraryEntry,
  StudyPackage,
  StudyPackageState,
  StudyShare,
  StudySubmission,
} from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useAuth } from '../../auth/AuthContext';
import { isFounder } from '../../auth/access';
import { Icon } from '../../components/Icon';

// Study Packages: what a person owns, what has been handed to them, and what
// VTS has published.
//
// The three lists are three different relationships to the same kind of thing,
// and keeping them visibly apart is the point of the screen:
//
//   • MINE — packages this account owns. Only these can be shared, submitted or
//     archived.
//   • SHARED WITH ME — packages somebody handed over by username. Read-only, and
//     the owner can take the access back at any time.
//   • THE VTS STUDY LIBRARY — packages an administrator read and approved.
//     Anyone can browse it; adding one puts it in your own list and puts you on
//     its leaderboard.
//
// None of it involves a group. A share reaches one named person and makes them a
// member of nothing, which is what lets Studies sharing work for somebody who
// signed up this morning.

const MUTED = '#a99ff0';
const FAINT = '#7d78ad';

type Tab = 'mine' | 'shared' | 'library';

export function StudyLibrary({ theme, onNavigate }: { theme: Theme; onNavigate?: (screen: string) => void }) {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;

  const [tab, setTab] = useState<Tab>('mine');
  const [packages, setPackages] = useState<StudyPackage[]>([]);
  const [archived, setArchived] = useState<StudyPackage[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, setPending] = useState<StudyShare[]>([]);
  const [accepted, setAccepted] = useState<StudyShare[]>([]);
  const [entries, setEntries] = useState<StudyLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pkgs, shares, lib] = await Promise.all([
        api.listStudyPackages(),
        api.sharedStudyPackages(),
        api.browseStudyLibrary(),
      ]);
      setPackages(pkgs.packages);
      setPending(shares.pending);
      setAccepted(shares.accepted);
      setEntries(lib.entries);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Archived packages are asked for separately, so a list nobody is looking at
  // costs no query.
  useEffect(() => {
    if (!showArchived) return;
    let alive = true;
    api
      .listStudyPackages(true)
      .then((r) => {
        if (alive) setArchived(r.packages);
      })
      .catch(() => {
        /* best-effort */
      });
  }, [showArchived, packages]);

  if (open) {
    return (
      <PackageDetail
        theme={theme}
        packageId={open}
        readOnly={readOnly}
        onClose={() => {
          setOpen(null);
          void load();
        }}
      />
    );
  }

  const mine = packages.filter((p) => p.mine);
  const takenUp = packages.filter((p) => !p.mine);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{'Study Packages'}</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: MUTED }}>
          {'Your packages, the ones shared with you, and the VTS Study Library.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {/* The count is everything the tab LISTS, which includes the packages
            other people handed over — a "0" above a list with a package in it
            reads as broken. */}
        <TabBtn theme={theme} active={tab === 'mine'} onClick={() => setTab('mine')} count={packages.length}>
          {'My packages'}
        </TabBtn>
        <TabBtn
          theme={theme}
          active={tab === 'shared'}
          onClick={() => setTab('shared')}
          count={pending.length + accepted.length}
          badge={pending.length}
        >
          {'Shared with me'}
        </TabBtn>
        <TabBtn theme={theme} active={tab === 'library'} onClick={() => setTab('library')} count={entries.length}>
          {'VTS Study Library'}
        </TabBtn>
      </div>

      {loading ? (
        <div style={{ ...card(theme), color: MUTED, fontSize: 13 }}>{'Loading your study packages…'}</div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          {'Couldn’t load your study packages. Try again in a moment.'}
        </div>
      ) : tab === 'mine' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mine.length === 0 && takenUp.length === 0 ? (
            <div style={{ ...card(theme), color: MUTED, fontSize: 13 }}>
              {'No study packages yet. Build one from Study Creation.'}
              {onNavigate && (
                <div style={{ marginTop: 12 }}>
                  <button style={primaryBtn(theme, accentGradient(theme))} onClick={() => onNavigate('st_decks')}>
                    {'Go to Study Creation'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {mine.map((p) => (
                <PackageRow key={p.id} pkg={p} theme={theme} onOpen={() => setOpen(p.id)} />
              ))}
              {takenUp.length > 0 && (
                <>
                  <SectionLabel>{'From other people'}</SectionLabel>
                  {takenUp.map((p) => (
                    <PackageRow key={p.id} pkg={p} theme={theme} onOpen={() => setOpen(p.id)} />
                  ))}
                </>
              )}
            </>
          )}

          <button style={ghostBtn(theme)} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          {showArchived &&
            (archived.length === 0 ? (
              <div style={{ ...card(theme), color: FAINT, fontSize: 12.5 }}>{'Nothing archived.'}</div>
            ) : (
              archived.map((p) => (
                <PackageRow key={p.id} pkg={p} theme={theme} onOpen={() => setOpen(p.id)} />
              ))
            ))}
        </div>
      ) : tab === 'shared' ? (
        <SharedWithMe
          theme={theme}
          pending={pending}
          accepted={accepted}
          readOnly={readOnly}
          onRespond={async (id, accept) => {
            const r = await api.respondToStudyShare(id, accept);
            setPending(r.pending);
            setAccepted(r.accepted);
            setPackages(r.packages);
          }}
          onOpen={(id) => setOpen(id)}
        />
      ) : (
        <LibraryBrowser
          theme={theme}
          entries={entries}
          readOnly={readOnly}
          onChange={(r) => {
            setEntries(r.entries);
            setPackages(r.packages);
          }}
          onOpen={(id) => setOpen(id)}
        />
      )}
    </div>
  );
}

// ---- Shared with me ----

function SharedWithMe({
  theme,
  pending,
  accepted,
  readOnly,
  onRespond,
  onOpen,
}: {
  theme: Theme;
  pending: StudyShare[];
  accepted: StudyShare[];
  readOnly: boolean;
  onRespond: (shareId: string, accept: boolean) => Promise<void>;
  onOpen: (packageId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const grad = accentGradient(theme);

  if (pending.length === 0 && accepted.length === 0) {
    return (
      <div style={{ ...card(theme), color: MUTED, fontSize: 13 }}>
        {'Nothing shared with you yet. Someone can share a study package with your username.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pending.length > 0 && <SectionLabel>{'Waiting for your answer'}</SectionLabel>}
      {pending.map((s) => (
        <div key={s.id} style={card(theme)}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{s.packageName}</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
            {`Shared by ${s.personName}${s.packageSubject ? ` · ${s.packageSubject}` : ''}`}
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                style={primaryBtn(theme, grad)}
                disabled={busy === s.id}
                onClick={async () => {
                  setBusy(s.id);
                  await onRespond(s.id, true).catch(() => undefined);
                  setBusy(null);
                }}
              >
                {'Accept'}
              </button>
              <button
                style={ghostBtn(theme)}
                disabled={busy === s.id}
                onClick={async () => {
                  setBusy(s.id);
                  await onRespond(s.id, false).catch(() => undefined);
                  setBusy(null);
                }}
              >
                {'Decline'}
              </button>
            </div>
          )}
        </div>
      ))}

      {accepted.length > 0 && <SectionLabel>{'Shared with you'}</SectionLabel>}
      {accepted.map((s) => (
        <button key={s.id} style={{ ...card(theme), textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => onOpen(s.packageId)}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{s.packageName}</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
            {`From ${s.personName}${s.packageSubject ? ` · ${s.packageSubject}` : ''}`}
          </div>
        </button>
      ))}
    </div>
  );
}

// ---- The published library ----

function LibraryBrowser({
  theme,
  entries,
  readOnly,
  onChange,
  onOpen,
}: {
  theme: Theme;
  entries: StudyLibraryEntry[];
  readOnly: boolean;
  onChange: (r: { entries: StudyLibraryEntry[]; packages: StudyPackage[] }) => void;
  onOpen: (packageId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const grad = accentGradient(theme);

  if (entries.length === 0) {
    return (
      <div style={{ ...card(theme), color: MUTED, fontSize: 13 }}>
        {'Nothing has been published to the VTS Study Library yet.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map((e) => (
        <div key={e.packageId} style={card(theme)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{e.name}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
                {[e.subject, e.ownerName ? `by ${e.ownerName}` : null, `${e.questionCount} questions`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {e.description && (
                <p style={{ margin: '8px 0 0', fontSize: 12.5, color: FAINT, lineHeight: 1.5 }}>{e.description}</p>
              )}
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {e.added ? (
                  <>
                    <button style={ghostBtn(theme)} onClick={() => onOpen(e.packageId)}>
                      {'Open'}
                    </button>
                    <button
                      style={ghostBtn(theme)}
                      disabled={busy === e.packageId}
                      onClick={async () => {
                        setBusy(e.packageId);
                        try {
                          onChange(await api.removeStudyLibraryPackage(e.packageId));
                        } catch {
                          /* best-effort */
                        }
                        setBusy(null);
                      }}
                    >
                      {'Remove'}
                    </button>
                  </>
                ) : (
                  <button
                    style={primaryBtn(theme, grad)}
                    disabled={busy === e.packageId}
                    onClick={async () => {
                      setBusy(e.packageId);
                      try {
                        onChange(await api.addStudyLibraryPackage(e.packageId));
                      } catch {
                        /* best-effort */
                      }
                      setBusy(null);
                    }}
                  >
                    {'Add to my library'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- One package ----

function PackageDetail({
  theme,
  packageId,
  readOnly,
  onClose,
}: {
  theme: Theme;
  packageId: string;
  readOnly: boolean;
  onClose: () => void;
}) {
  const grad = accentGradient(theme);
  const { user } = useAuth();
  // Founder-level only, and on the EFFECTIVE roles — so previewing as another
  // account hides it, which is what makes the preview worth having.
  const canDebug = !!user && isFounder(user.roles);
  const [pkg, setPkg] = useState<Awaited<ReturnType<typeof api.getStudyPackage>>['package'] | null>(null);
  const [shares, setShares] = useState<StudyShare[]>([]);
  const [submissions, setSubmissions] = useState<StudySubmission[]>([]);
  const [attestations, setAttestations] = useState<string[]>([]);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getStudyPackage(packageId)
      .then(async (r) => {
        if (!alive) return;
        setPkg(r.package);
        if (r.package.mine) {
          // Only an owner has a share list or a submission history to read; the
          // routes refuse anybody else, so asking would be a guaranteed 404.
          const [s, sub, att] = await Promise.all([
            api.listStudyPackageShares(packageId).catch(() => ({ shares: [] })),
            api.studyPackageSubmissions(packageId).catch(() => ({ submissions: [] })),
            api.studyLibraryAttestations().catch(() => ({ version: '', statements: [] as string[] })),
          ]);
          if (!alive) return;
          setShares(s.shares);
          setSubmissions(sub.submissions);
          setAttestations(att.statements);
        }
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [packageId]);

  async function share() {
    const h = handle.trim();
    if (!h) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.shareStudyPackage(packageId, h);
      setShares(r.shares);
      // The first share moves the package from private to shared, so the state
      // chip has to follow — otherwise it goes on calling a shared package
      // private until the screen is reopened.
      setPkg(r.package);
      setHandle('');
      setNotice(
        r.alreadyShared
          ? `${r.share.personName} already has this package.`
          : `Shared with ${r.share.personName}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t share that. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError || !pkg) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', color: '#eef3ff' }}>
        <button style={ghostBtn(theme)} onClick={onClose}>
          {'← Back'}
        </button>
        <div style={{ ...card(theme), marginTop: 12, color: loadError ? '#ffb4ab' : MUTED, fontSize: 13 }}>
          {loadError ? 'Couldn’t load that study package.' : 'Loading…'}
        </div>
      </div>
    );
  }

  const open = submissions.find((s) => s.status === 'pending');
  const lastDecision = submissions.find((s) => s.status === 'rejected' || s.status === 'changes_requested');
  // The most recent publication that has ended — what the creator sees instead
  // of an unexplained "not published any more".
  const lastWithdrawn = submissions.find((s) => s.withdrawnAt != null);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <button style={ghostBtn(theme)} onClick={onClose}>
        {'← Back'}
      </button>

      <div style={{ ...card(theme), marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{pkg.name}</h3>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
              {[pkg.subject, pkg.mine ? null : pkg.ownerName ? `by ${pkg.ownerName}` : null]
                .filter(Boolean)
                .join(' · ') || 'Study package'}
            </div>
          </div>
          <VisibilityChip pkg={pkg} />
        </div>
        {pkg.description && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: FAINT, lineHeight: 1.5 }}>{pkg.description}</p>
        )}
        <div style={{ fontSize: 12, color: FAINT, marginTop: 10 }}>
          {[
            pkg.hasDeck ? 'Study game' : null,
            pkg.hasFlashcards ? 'Flashcards' : null,
            pkg.hasGuide ? 'Presentation' : null,
            pkg.lessonCount ? `${pkg.lessonCount} lessons` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'No content yet'}
        </div>
      </div>

      {/* Developer diagnostics on the real screen, founder-level only: what the
          access rules are actually deciding from. Read-only — an admin could
          already reach this package through the ordinary routes; this puts its
          sharing and publication state on one screen. */}
      {canDebug && <PackageStatePanel theme={theme} packageId={packageId} />}

      {pkg.mine && !readOnly && (
        <>
          {/* Sharing. By username — the server resolves it, so a typo finds
              nobody rather than reaching the wrong person. */}
          <div style={{ ...card(theme), marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#fff' }}>{'Share with someone'}</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void share();
                }}
                placeholder="Their VTS username"
                style={inputStyle(theme)}
              />
              <button style={primaryBtn(theme, grad)} disabled={busy || !handle.trim()} onClick={() => void share()}>
                {'Share'}
              </button>
            </div>
            {error && <div style={{ fontSize: 12.5, color: '#ffb4ab', marginTop: 8 }}>{error}</div>}
            {notice && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>{notice}</div>}

            {shares.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {shares.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 12.5,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,.04)',
                    }}
                  >
                    <span>
                      <strong style={{ color: '#fff' }}>{s.personName}</strong>
                      <span style={{ color: FAINT }}>{` @${s.personUsername} · ${shareLabel(s.status)}`}</span>
                    </span>
                    <button
                      style={miniBtn(theme)}
                      title="Remove access"
                      onClick={async () => {
                        try {
                          const r = await api.revokeStudyPackageShare(packageId, s.id);
                          setShares(r.shares);
                          setPkg(r.package);
                        } catch {
                          /* best-effort */
                        }
                      }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* The library. Submitting is a request, never a publication. */}
          <div style={{ ...card(theme), marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#fff' }}>
              {'The VTS Study Library'}
            </h4>
            {pkg.visibility === 'public' ? (
              <>
                <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
                  {'Published. Its content is locked while it is in the library, so what people study stays what was reviewed.'}
                </p>
                {/* The creator's own way out. Stopping distribution of your own
                    work must not depend on an administrator being available, and
                    it is deliberately not the same act as editing it. */}
                <p style={{ margin: '10px 0 0', fontSize: 12.5, color: FAINT, lineHeight: 1.5 }}>
                  {'Withdrawing takes it out of the library straight away. Nothing is deleted — your content, everyone’s progress and any packages you shared by username all stay exactly as they are. People who already added it keep it. To put it back in the library it goes through review again.'}
                </p>
                <button
                  style={{ ...ghostBtn(theme), marginTop: 10 }}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const r = await api.withdrawStudyPackageFromLibrary(packageId);
                      setPkg(r.package);
                      setSubmissions(r.submissions);
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Couldn’t withdraw that.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {'Withdraw from VTS Study Library'}
                </button>
              </>
            ) : open ? (
              <>
                <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
                  {'Waiting to be reviewed by an administrator.'}
                </p>
                <button
                  style={{ ...ghostBtn(theme), marginTop: 10 }}
                  onClick={async () => {
                    try {
                      const r = await api.withdrawStudyPackage(packageId);
                      setPkg(r.package);
                      setSubmissions(r.submissions);
                    } catch {
                      /* best-effort */
                    }
                  }}
                >
                  {'Withdraw the request'}
                </button>
              </>
            ) : (
              <>
                {lastWithdrawn && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: MUTED,
                      background: 'rgba(255,255,255,.04)',
                      border: `1px solid ${theme.navBorder}`,
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    {`Withdrawn from the library on ${new Date(lastWithdrawn.withdrawnAt!).toLocaleDateString()}${
                      lastWithdrawn.withdrawnByOwner ? ' by you' : lastWithdrawn.withdrawnByName ? ` by ${lastWithdrawn.withdrawnByName}` : ''
                    }. Submitting again starts a new review.`}
                  </div>
                )}
                {lastDecision && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#ffd7a8',
                      background: 'rgba(255,159,69,.08)',
                      border: '1px solid rgba(255,159,69,.25)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>
                      {lastDecision.status === 'rejected' ? 'Not accepted.' : 'Changes were asked for.'}
                    </strong>
                    {lastDecision.adminNote ? ` ${lastDecision.adminNote}` : ''}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
                  {'Ask VTS to publish this package. An administrator reads it and decides — submitting does not publish it.'}
                </p>
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    marginTop: 10,
                    fontSize: 12.5,
                    color: '#dfe7fa',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={attested}
                    onChange={(e) => setAttested(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    {'I confirm:'}
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: FAINT, lineHeight: 1.6 }}>
                      {attestations.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </span>
                </label>
                <button
                  style={{ ...primaryBtn(theme, grad), marginTop: 10 }}
                  disabled={!attested || busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const r = await api.submitStudyPackage(packageId);
                      setPkg(r.package);
                      setSubmissions([r.submission, ...submissions]);
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Couldn’t submit that.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {'Submit for review'}
                </button>
              </>
            )}
          </div>

          <div style={{ ...card(theme), marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#fff' }}>
              {pkg.archived ? 'Archived' : 'Archive'}
            </h4>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
              {'Archiving hides the package and its content from your lists. Nothing is deleted — everyone’s progress, the categories and the sharing all stay exactly as they are, and restoring puts it straight back.'}
            </p>
            <button
              style={ghostBtn(theme)}
              onClick={async () => {
                try {
                  const r = pkg.archived
                    ? await api.unarchiveStudyPackage(packageId)
                    : await api.archiveStudyPackage(packageId);
                  setPkg(r.package);
                } catch {
                  /* best-effort */
                }
              }}
            >
              {pkg.archived ? 'Restore this package' : 'Archive this package'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Bits ----

function VisibilityChip({ pkg }: { pkg: StudyPackage }) {
  const label = pkg.archived
    ? 'Archived'
    : pkg.visibility === 'public'
      ? 'In the VTS Study Library'
      : pkg.visibility === 'submitted'
        ? 'Waiting for review'
        : pkg.visibility === 'shared'
          ? `Shared with ${pkg.sharedWith}`
          : 'Private';
  const color = pkg.archived
    ? FAINT
    : pkg.visibility === 'public'
      ? '#7de2b8'
      : pkg.visibility === 'submitted'
        ? '#ffd7a8'
        : MUTED;
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        color,
        border: `1px solid ${color}44`,
        background: `${color}14`,
        borderRadius: 999,
        padding: '4px 10px',
        whiteSpace: 'nowrap',
        alignSelf: 'flex-start',
      }}
    >
      {label}
    </span>
  );
}

function PackageRow({ pkg, theme, onOpen }: { pkg: StudyPackage; theme: Theme; onOpen: () => void }) {
  return (
    <button style={{ ...card(theme), textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={onOpen}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{pkg.name}</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
            {[
              pkg.subject,
              pkg.mine ? null : pkg.ownerName ? `by ${pkg.ownerName}` : null,
              pkg.hasDeck ? 'Study game' : null,
              pkg.hasFlashcards ? 'Flashcards' : null,
              pkg.hasGuide ? 'Presentation' : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Study package'}
          </div>
        </div>
        <VisibilityChip pkg={pkg} />
      </div>
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', color: FAINT, textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function TabBtn({
  theme,
  active,
  onClick,
  count,
  badge,
  children,
}: {
  theme: Theme;
  active: boolean;
  onClick: () => void;
  count: number;
  /** A count of things waiting on the reader, drawn as a dot. */
  badge?: number;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? theme.accent : theme.navBorder}`,
        background: active ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
        color: active ? '#fff' : '#cdbcff',
        fontSize: 13,
        fontWeight: 700,
        padding: '9px 14px',
        borderRadius: 999,
        cursor: 'pointer',
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
      }}
    >
      {children}
      <span style={{ color: FAINT, fontWeight: 600 }}>{count}</span>
      {!!badge && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: '#FF9F45',
            display: 'inline-block',
          }}
        />
      )}
    </button>
  );
}

function shareLabel(status: StudyShare['status']): string {
  return status === 'accepted' ? 'has it' : status === 'pending' ? 'invited' : 'declined';
}

function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '18px 18px',
  };
}

function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontSize: 13,
    fontWeight: 700,
    padding: '11px 18px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}

function ghostBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
    alignSelf: 'flex-start',
  };
}

function miniBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    width: 28,
    height: 28,
    borderRadius: 7,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  };
}

function inputStyle(theme: Theme): CSSProperties {
  return {
    flex: 1,
    minWidth: 180,
    background: 'rgba(255,255,255,.05)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 8,
    color: '#eef3ff',
    fontSize: 13,
    padding: '11px 12px',
    minHeight: 44,
  };
}

/**
 * What the sharing and publication rules are deciding from, for a developer.
 *
 * Read-only. It reports recipient ids rather than names on purpose: this is a
 * diagnostic about relationships, not a directory of who holds what.
 */
function PackageStatePanel({ theme, packageId }: { theme: Theme; packageId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<StudyPackageState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || state) return;
    let alive = true;
    api
      .studyPackageState(packageId)
      .then((r) => {
        if (alive) setState(r.state);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, state, packageId]);

  const mono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: MUTED };

  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid rgba(255,159,69,.35)',
        background: 'rgba(255,159,69,.06)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          color: '#FF9F45',
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} color="#FF9F45" />
        <span style={{ flex: 1 }}>{'Package state'}</span>
        <span style={{ fontWeight: 500, color: FAINT, fontSize: 11.5 }}>{'developer'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {failed && <div style={{ fontSize: 12, color: '#ffb4ab' }}>{'Could not read it.'}</div>}
          {!state && !failed && <div style={{ fontSize: 12, color: MUTED }}>{'Loading…'}</div>}
          {state && (
            <>
              <div style={mono}>{`id ${state.id} · owner ${state.ownerUserId}`}</div>
              <div style={mono}>
                {`visibility ${state.visibility} · format v${state.formatVersion}${state.archivedAt ? ' · archived' : ''}`}
              </div>
              <div style={mono}>
                {state.shares.length
                  ? state.shares.map((s) => `${s.recipientUserId}=${s.status}`).join('  ')
                  : 'no shares'}
              </div>
              <div style={mono}>
                {state.submissions.length
                  ? state.submissions.map((s) => `${s.status}@${s.attestationVersion}`).join('  ')
                  : 'no submissions'}
              </div>
              <div style={mono}>{`library adds: ${state.libraryAdds.length}`}</div>
              <div style={{ ...mono, color: '#7de2b8' }}>
                {`leaderboard audience: ${state.leaderboardAudience.length}`}
              </div>
              <div style={{ fontSize: 11, color: FAINT, borderTop: `1px solid ${theme.navBorder}`, paddingTop: 7 }}>
                {'Ids and states only — no study content.'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
