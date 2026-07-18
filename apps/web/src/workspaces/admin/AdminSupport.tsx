import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PasswordResetRequest } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { Badge, SectionHeader, ghostDangerBtn, dangerSolidBtn, ghostBtn, msgStyle, panel, panelLabel } from './adminUi';

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

// A pre-filled email so the admin can send the temporary password in one click.
// The temp password itself is set from Admin ▸ Users; this just opens the note.
function resetMailto(email: string): string {
  const subject = 'Your VTS Portal password has been reset';
  const body = [
    'Hi,',
    '',
    'We received your request to reset your VTS Portal password. Here is a temporary password — you will be asked to set a new one the next time you sign in:',
    '',
    'Temporary password: ',
    '',
    'Sign in at https://vitalistradingsystems.com with your email and this temporary password.',
    '',
    '— Vitalis Trading Systems',
  ].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function AdminSupport({ theme }: { theme: Theme }) {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminListPasswordResets()
      .then((r) => alive && setRequests(r.requests))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load requests'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests]);

  async function resolve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.adminResolvePasswordReset(id);
      setRequests((cur) =>
        cur.map((r) => (r.id === id ? { ...r, status: 'resolved', resolvedAt: Date.now() } : r)),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the request.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.adminDeletePasswordReset(id);
      setRequests((cur) => cur.filter((r) => r.id !== id));
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove the request.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}>Loading requests...</div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="User Support"
        subtitle="Password reset requests from the login screen’s “Forgot password?” form. To handle one: set a temporary password for the account under Users, email it to the person from your domain, then mark the request resolved."
      />

      <div style={{ ...panel(theme), marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={panelLabel}>Pending</span>
        <Badge color={pendingCount > 0 ? '#EBCB74' : theme.accent}>{pendingCount}</Badge>
        <span style={{ ...panelLabel, marginLeft: 6 }}>Total</span>
        <Badge color={theme.accent}>{requests.length}</Badge>
      </div>

      {error && (
        <div onClick={() => setError(null)} style={{ ...msgStyle(false), cursor: 'pointer', marginBottom: 12 }}>
          {error} (click to dismiss)
        </div>
      )}

      {requests.length === 0 ? (
        <div style={{ ...panel(theme), color: '#8ea3cc', fontSize: 13, textAlign: 'center', padding: '30px 16px' }}>
          No password reset requests yet. Submissions from the login screen’s “Forgot password?”
          form will show up here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((r) => {
            const resolved = r.status === 'resolved';
            return (
              <div key={r.id} style={{ ...panel(theme), opacity: resolved ? 0.7 : 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <a
                        href={`mailto:${r.email}`}
                        style={{ fontSize: 14, fontWeight: 600, color: '#eef3ff', textDecoration: 'none' }}
                      >
                        {r.email}
                      </a>
                      <Badge color={resolved ? '#7fe0c0' : '#EBCB74'}>{resolved ? 'RESOLVED' : 'PENDING'}</Badge>
                    </div>
                    {r.note && (
                      <div style={{ fontSize: 12, color: '#8ea3cc', marginTop: 8 }}>
                        <span style={{ color: '#6f84b2' }}>Note: </span>
                        <span style={{ color: '#cfe0ff' }}>{r.note}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: '#6f84b2', marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                      Requested {fmtDate(r.createdAt)}
                      {resolved && r.resolvedAt ? ` · Resolved ${fmtDate(r.resolvedAt)}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href={resetMailto(r.email)}
                      style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      title="Open a pre-filled email to send the temporary password"
                    >
                      Email temp password
                    </a>
                    {!resolved && (
                      <button onClick={() => resolve(r.id)} disabled={busyId === r.id} style={ghostBtn}>
                        {busyId === r.id ? 'Saving…' : 'Mark resolved'}
                      </button>
                    )}
                    {confirmId === r.id ? (
                      <>
                        <button onClick={() => remove(r.id)} disabled={busyId === r.id} style={dangerSolidBtn}>
                          {busyId === r.id ? 'Removing…' : 'Confirm'}
                        </button>
                        <button onClick={() => setConfirmId(null)} disabled={busyId === r.id} style={ghostBtn}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmId(r.id);
                          setError(null);
                        }}
                        disabled={busyId === r.id}
                        style={ghostDangerBtn}
                        title="Remove this request from the list"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
