import { useEffect, useState } from 'react';
import {
  employeeApi,
  type AuditEntry,
  type EmployeeMe,
  type SessionView,
  type TrustedDeviceView,
} from '../api';
import { EMP, fmtDateTime, tint } from '../theme';
import { Button, Card, Empty, ErrorNote, Pill, ScreenHeader, label } from '../ui';
import { Icon } from '../../components/Icon';

// Your own security state: the browsers allowed to skip the emailed sign-in
// code, the sessions currently holding your account open, and the record of what
// has been done with it. Everything here is scoped to the signed-in person — a
// portal admin gets the whole audit log via the toggle, but never anyone else's
// sessions or devices.

// Plain-language names for the audit actions. Anything unmapped falls back to
// the raw key, so a new action type is never invisible.
const ACTION_LABELS: Record<string, string> = {
  'login.success': 'Signed in',
  'login.failed': 'Failed sign-in',
  'login.locked': 'Blocked — too many attempts',
  'login.denied': 'Sign-in refused',
  logout: 'Signed out',
  'session.revoked': 'Session revoked',
  'login.code_sent': 'Sign-in code emailed',
  'login.code_failed': 'Wrong sign-in code',
  'login.remembered_device': 'Signed in on a remembered device',
  'device.remembered': 'Device remembered',
  'device.forgotten': 'Device forgotten',
  'device.forgotten_all': 'All devices forgotten',
  'access.denied': 'Access refused',
  'access.blocked_ip': 'Blocked network',
  'access.csrf_rejected': 'Request rejected',
  'announcement.created': 'Announcement posted',
  'announcement.updated': 'Announcement edited',
  'announcement.deleted': 'Announcement deleted',
  'document.created': 'Document added',
  'document.updated': 'Document edited',
  'document.deleted': 'Document deleted',
  'people.granted': 'Employee access granted',
  'people.updated': 'Employee record updated',
  'people.revoked': 'Employee access revoked',
};

// Display-only column headings for the activity log, each independently editable.
const AUDIT_COLUMNS: [string, string][] = [
  ['emp.security.col_when', 'When'],
  ['emp.security.col_who', 'Who'],
  ['emp.security.col_what', 'What'],
  ['emp.security.col_detail', 'Detail'],
  ['emp.security.col_from', 'From'],
];

export function Security({ me, onMeChanged }: { me: EmployeeMe; onMeChanged: (me: EmployeeMe) => void }) {
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [error, setError] = useState('');

  const [devices, setDevices] = useState<TrustedDeviceView[] | null>(null);
  const [rememberDays, setRememberDays] = useState(30);

  function loadSessions() {
    employeeApi
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError((e as Error).message));
  }

  useEffect(loadSessions, []);

  function loadDevices() {
    employeeApi
      .trustedDevices()
      .then((r) => {
        setDevices(r.devices);
        setRememberDays(r.rememberDays);
        onMeChanged({ ...me, trustedDeviceCount: r.devices.length });
      })
      .catch((e) => setError((e as Error).message));
  }

  useEffect(loadDevices, []);

  useEffect(() => {
    setEntries(null);
    employeeApi
      .audit(scope)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError((e as Error).message));
  }, [scope]);

  async function revoke(s: SessionView) {
    const isCurrent = s.current;
    if (isCurrent && !window.confirm('Revoke this session? You will be signed out.')) return;
    try {
      await employeeApi.revokeSession(s.id);
      if (isCurrent) {
        window.location.reload();
        return;
      }
      loadSessions();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function forget(d: TrustedDeviceView) {
    if (
      d.current &&
      !window.confirm('Forget this device? Your next sign-in here will ask for an emailed code.')
    )
      return;
    try {
      await employeeApi.forgetDevice(d.id);
      loadDevices();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <ScreenHeader
        icon="shield-check"
        title={"Security"}
        subtitle={
          "Your second factor, the devices currently signed in as you, and the record of activity on your account."
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {/* ---- Remembered devices ---- */}
        <Card>
          <div style={{ ...label, marginBottom: 12 }}>
            {"Remembered devices"}
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: EMP.muted, lineHeight: 1.65 }}>
            {`Signing in emails a six-digit code to your work address. A device you chose to remember skips that code for ${rememberDays} days — your password is still required every time. Forget any you no longer use.`}
          </p>

          {!devices ? (
            <Empty icon="refresh-cw">
              {"Loading…"}
            </Empty>
          ) : devices.length === 0 ? (
            <Empty icon="shield">
              {"No remembered devices — every sign-in asks for a code."}
            </Empty>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {devices.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    border: `1px solid ${d.current ? tint(EMP.accent, 0.35) : EMP.line}`,
                    background: d.current ? tint(EMP.accent, 0.05) : EMP.panel2,
                    borderRadius: 10,
                    padding: '11px 13px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: EMP.text }}>
                      <Icon name="shield-check" size={13} />
                      <span style={{ fontFamily: EMP.mono }}>{d.ip || 'unknown address'}</span>
                      {d.current && (
                        <Pill tone="accent">
                          {"This device"}
                        </Pill>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: EMP.faint,
                        marginTop: 5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {d.userAgent || 'unknown browser'}
                    </div>
                    <div style={{ fontSize: 11, color: EMP.faint, marginTop: 3, fontFamily: EMP.mono }}>
                      last used {fmtDateTime(d.lastUsedAt)} · forgets itself {fmtDateTime(d.expiresAt)}
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => forget(d)}>
                    <Icon name="x-circle" size={13} />
                    {"Forget"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ---- Sessions ---- */}
        <Card>
          <div style={{ ...label, marginBottom: 12 }}>
            {"Active sessions"}
          </div>
          {!sessions ? (
            <Empty icon="refresh-cw">
              {"Loading…"}
            </Empty>
          ) : sessions.length === 0 ? (
            <Empty icon="shield">
              {"No active sessions."}
            </Empty>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    border: `1px solid ${s.current ? tint(EMP.accent, 0.35) : EMP.line}`,
                    background: s.current ? tint(EMP.accent, 0.05) : EMP.panel2,
                    borderRadius: 10,
                    padding: '11px 13px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12.5,
                        color: EMP.text,
                      }}
                    >
                      <Icon name="key" size={13} />
                      <span style={{ fontFamily: EMP.mono }}>{s.ip || 'unknown address'}</span>
                      {s.current && (
                        <Pill tone="accent">
                          {"This device"}
                        </Pill>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: EMP.faint,
                        marginTop: 5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.userAgent || 'unknown browser'}
                    </div>
                    <div style={{ fontSize: 11, color: EMP.faint, marginTop: 3, fontFamily: EMP.mono }}>
                      last seen {fmtDateTime(s.lastSeenAt)} · expires {fmtDateTime(s.expiresAt)}
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => revoke(s)}>
                    <Icon name="log-out" size={13} />
                    {"Revoke"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ---- Audit trail ---- */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={label}>
              {"Activity log"}
            </div>
            {me.isPortalAdmin && (
              <div style={{ display: 'flex', gap: 6 }}>
                <Button
                  onClick={() => setScope('mine')}
                  style={scope === 'mine' ? { borderColor: EMP.accent, color: EMP.accent } : undefined}
                >
                  {"Mine"}
                </Button>
                <Button
                  onClick={() => setScope('all')}
                  style={scope === 'all' ? { borderColor: EMP.accent, color: EMP.accent } : undefined}
                >
                  {"Everyone"}
                </Button>
              </div>
            )}
          </div>

          {!entries ? (
            <Empty icon="refresh-cw">
              {"Loading…"}
            </Empty>
          ) : entries.length === 0 ? (
            <Empty icon="file-clock">
              {"Nothing recorded yet."}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {AUDIT_COLUMNS.map(([id, h]) => (
                      <th
                        key={id}
                        style={{
                          ...label,
                          textAlign: 'left',
                          padding: '0 12px 9px 0',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} style={{ borderTop: `1px solid ${EMP.line}` }}>
                      <td
                        style={{
                          padding: '9px 12px 9px 0',
                          color: EMP.faint,
                          fontFamily: EMP.mono,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fmtDateTime(e.at)}
                      </td>
                      <td style={{ padding: '9px 12px 9px 0', color: EMP.muted, whiteSpace: 'nowrap' }}>
                        {e.actor || '—'}
                      </td>
                      <td style={{ padding: '9px 12px 9px 0', color: e.ok ? EMP.text : EMP.red }}>
                        {/* The action names are our wording, so they are editable
                            too; an unmapped action falls back to its raw key. */}
                        {ACTION_LABELS[e.action] ?? e.action}
                      </td>
                      <td style={{ padding: '9px 12px 9px 0', color: EMP.faint }}>
                        {e.detail || e.target || '—'}
                      </td>
                      <td
                        style={{
                          padding: '9px 0',
                          color: EMP.faint,
                          fontFamily: EMP.mono,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.ip || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
