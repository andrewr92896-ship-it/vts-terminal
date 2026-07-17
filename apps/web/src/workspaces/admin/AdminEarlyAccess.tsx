import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { EarlyAccessRequest } from '../../api/types';
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

function fullName(r: EarlyAccessRequest): string {
  return [r.firstName, r.lastName].filter(Boolean).join(' ');
}

export function AdminEarlyAccess({ theme }: { theme: Theme }) {
  const [requests, setRequests] = useState<EarlyAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminListEarlyAccess()
      .then((r) => alive && setRequests(r.requests))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load requests'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.adminDeleteEarlyAccess(id);
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
        title="Early Access Requests"
        subtitle="People who asked to join from the login screen. Each entry shows what they provided; reach out by email, then clear the request once handled."
      />

      <div style={{ ...panel(theme), marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={panelLabel}>Total</span>
        <Badge color={theme.accent}>{requests.length}</Badge>
      </div>

      {error && (
        <div onClick={() => setError(null)} style={{ ...msgStyle(false), cursor: 'pointer', marginBottom: 12 }}>
          {error} (click to dismiss)
        </div>
      )}

      {requests.length === 0 ? (
        <div style={{ ...panel(theme), color: '#8ea3cc', fontSize: 13, textAlign: 'center', padding: '30px 16px' }}>
          No early-access requests yet. Submissions from the login screen’s “Request Early Access”
          form will show up here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((r) => (
            <div key={r.id} style={panel(theme)}>
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
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#eef3ff' }}>{fullName(r)}</div>
                  <div style={{ marginTop: 3 }}>
                    <a
                      href={`mailto:${r.email}`}
                      style={{ fontSize: 12.5, color: '#7c9ce0', fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      {r.email}
                    </a>
                  </div>
                  <div style={{ fontSize: 12, color: '#8ea3cc', marginTop: 8 }}>
                    <span style={{ color: '#6f84b2' }}>Heard about us via: </span>
                    <span style={{ color: '#cfe0ff' }}>{r.source}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6f84b2', marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {fmtDate(r.createdAt)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`mailto:${r.email}`} style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    Email
                  </a>
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
          ))}
        </div>
      )}
    </div>
  );
}
