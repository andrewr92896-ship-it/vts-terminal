import { useEffect, useState } from 'react';
import {
  employeeApi,
  type AuditEntry,
  type EmployeeMe,
  type SessionView,
} from '../api';
import { EMP, fmtDateTime, tint } from '../theme';
import {
  Banner,
  Button,
  Card,
  Detail,
  DetailGrid,
  Empty,
  ErrorNote,
  Field,
  Input,
  Pill,
  ScreenHeader,
  label,
} from '../ui';
import { Icon } from '../../components/Icon';

// Your own security state: the second factor, the sessions currently holding
// your account open, and the record of what has been done with it. Everything
// here is scoped to the signed-in person — a portal admin gets the whole audit
// log via the toggle, but never anyone else's sessions.

// Plain-language names for the audit actions. Anything unmapped falls back to
// the raw key, so a new action type is never invisible.
const ACTION_LABELS: Record<string, string> = {
  'login.success': 'Signed in',
  'login.failed': 'Failed sign-in',
  'login.locked': 'Blocked — too many attempts',
  'login.denied': 'Sign-in refused',
  'login.totp_failed': 'Wrong authenticator code',
  logout: 'Signed out',
  'session.revoked': 'Session revoked',
  '2fa.enrolled': 'Authenticator enrolled',
  '2fa.reset': 'Authenticator reset',
  '2fa.recovery_used': 'Recovery code used',
  '2fa.recovery_regenerated': 'Recovery codes regenerated',
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

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [recoveryError, setRecoveryError] = useState('');

  function loadSessions() {
    employeeApi
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError((e as Error).message));
  }

  useEffect(loadSessions, []);

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

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    setRecoveryError('');
    try {
      const r = await employeeApi.regenerateRecovery(code.trim());
      setRecovery(r.recoveryCodes);
      setCode('');
      onMeChanged({ ...me, recoveryCodesLeft: r.recoveryCodes.length });
    } catch (e) {
      setRecoveryError((e as Error).message);
    } finally {
      setBusy(false);
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
        {/* ---- Two-factor ---- */}
        <Card>
          <div style={{ ...label, marginBottom: 12 }}>
            {"Two-factor authentication"}
          </div>
          {me.twoFactorEnrolled ? (
            <>
              <DetailGrid>
                <Detail term={"Status"}>
                  <Pill tone="good">
                    <Icon name="check" size={10} />
                    {"Enrolled"}
                  </Pill>
                </Detail>
                <Detail term={"Recovery codes left"}>
                  {me.recoveryCodesLeft}
                </Detail>
              </DetailGrid>

              {me.recoveryCodesLeft <= 2 && (
                <div style={{ marginTop: 14 }}>
                  <Banner tone="warn">
                    {"You are nearly out of recovery codes. Generate a fresh set below."}
                  </Banner>
                </div>
              )}

              {recovery ? (
                <div style={{ marginTop: 16 }}>
                  <Banner tone="good">
                    {"New codes generated. The old ones no longer work. These are shown once."}
                  </Banner>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: 8,
                      fontFamily: EMP.mono,
                      fontSize: 13,
                      color: EMP.text,
                      background: EMP.bg,
                      border: `1px solid ${EMP.line2}`,
                      borderRadius: 10,
                      padding: 14,
                      margin: '12px 0',
                    }}
                  >
                    {recovery.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                  <Button
                    onClick={() => {
                      void navigator.clipboard?.writeText(recovery.join('\n'));
                    }}
                  >
                    <Icon name="copy" size={14} />
                    {"Copy codes"}
                  </Button>
                </div>
              ) : (
                <div style={{ marginTop: 16, maxWidth: 320, display: 'grid', gap: 11 }}>
                  <Field
                    label={"Generate new recovery codes"}
                    hint={
                      "Confirm with a live authenticator code. The current codes stop working."
                    }
                  >
                    <Input
                      value={code}
                      onChange={setCode}
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      style={{ fontFamily: EMP.mono, letterSpacing: '3px' }}
                    />
                  </Field>
                  <ErrorNote>{recoveryError}</ErrorNote>
                  <div>
                    <Button onClick={regenerate} disabled={busy || code.trim().length < 6}>
                      {busy ? (
                        "Working…"
                      ) : (
                        "Generate new codes"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Banner tone="warn">
              {"No authenticator is enrolled on this account. Sign out and back in to be walked through setup — or ask a portal administrator to reset it for you."}
            </Banner>
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
