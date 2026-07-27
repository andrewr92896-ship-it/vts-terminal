import { useEffect, useState, type ReactNode } from 'react';
import { employeeApi, type OverviewData } from '../api';
import { EMP, EMPLOYMENT_LABELS, fmtDate, fmtDateTime, tint } from '../theme';
import { T } from '../copy';
import { Banner, Card, Detail, DetailGrid, Empty, Pill, ScreenHeader, label } from '../ui';
import { Icon } from '../../components/Icon';
import { MyTasks } from './MyTasks';
import { Photos } from './Photos';

// The landing screen: who you are on the record, what the portal is holding, and
// the security posture of the session you are sitting in.

export function Overview({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');

  function load() {
    employeeApi
      .overview()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  if (error) {
    return <Empty icon="x-circle">{error}</Empty>;
  }
  if (!data) {
    return (
      <Empty icon="refresh-cw">
        <T id="emp.overview.loading">Loading…</T>
      </Empty>
    );
  }

  const { me, announcements, counts, security } = data;

  return (
    <div>
      <ScreenHeader
        icon="briefcase"
        title={<T id="emp.overview.title">Overview</T>}
        subtitle={
          <T id="emp.overview.subtitle">
            Your employment record and everything the internal portal is currently holding.
          </T>
        }
      />

      {!me.twoFactorEnrolled && (
        <div style={{ marginBottom: 18 }}>
          <Banner tone="warn">
            <T id="emp.overview.no2fa">
              This account has no authenticator enrolled. Set one up from the Security section.
            </T>
          </Banner>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
            <Avatar name={me.name} url={me.avatarUrl} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 650, color: EMP.text }}>{me.name}</div>
              <div style={{ fontSize: 12.5, color: EMP.muted }}>
                {me.title || <T id="emp.overview.no_title">No title on record</T>}
                {me.department ? ` · ${me.department}` : ''}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {me.isPortalAdmin && (
                <Pill tone="accent">
                  <Icon name="shield-check" size={10} />
                  <T id="emp.overview.admin_pill">Portal admin</T>
                </Pill>
              )}
              <Pill tone={me.twoFactorEnrolled ? 'good' : 'warn'}>
                {me.twoFactorEnrolled ? (
                  <T id="emp.overview.2fa_on">2FA on</T>
                ) : (
                  <T id="emp.overview.2fa_off">2FA off</T>
                )}
              </Pill>
            </div>
          </div>

          <DetailGrid>
            <Detail term={<T id="emp.overview.employee_no">Employee no.</T>}>
              {me.employeeNo || '—'}
            </Detail>
            <Detail term={<T id="emp.overview.type">Employment</T>}>
              {EMPLOYMENT_LABELS[me.employmentType] ?? me.employmentType}
            </Detail>
            <Detail term={<T id="emp.overview.started">Start date</T>}>{fmtDate(me.startedOn)}</Detail>
            <Detail term={<T id="emp.overview.manager">Reports to</T>}>{me.managerName || '—'}</Detail>
            <Detail term={<T id="emp.overview.work_email">Work email</T>}>{me.workEmail || '—'}</Detail>
            <Detail term={<T id="emp.overview.work_phone">Work phone</T>}>{me.workPhone || '—'}</Detail>
            <Detail term={<T id="emp.overview.location">Location</T>}>{me.location || '—'}</Detail>
            <Detail term={<T id="emp.overview.last_login">Previous sign-in</T>}>
              {fmtDateTime(me.lastLoginAt)}
            </Detail>
          </DetailGrid>
        </Card>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 16,
          }}
        >
          <StatCard
            icon="users"
            value={counts.people}
            caption={<T id="emp.overview.stat_people">People in the directory</T>}
            onClick={() => onNavigate('directory')}
          />
          <StatCard
            icon="file-text"
            value={counts.documents}
            caption={<T id="emp.overview.stat_docs">Internal documents</T>}
            onClick={() => onNavigate('documents')}
          />
          <StatCard
            icon="megaphone"
            value={announcements.length}
            caption={<T id="emp.overview.stat_news">Recent announcements</T>}
            onClick={() => onNavigate('announcements')}
          />
        </div>

        <Card>
          <div style={{ ...label, marginBottom: 12 }}>
            <T id="emp.overview.session_heading">This session</T>
          </div>
          <DetailGrid>
            <Detail term={<T id="emp.overview.session_len">Maximum length</T>}>
              {security.sessionHours}h
            </Detail>
            <Detail term={<T id="emp.overview.session_idle">Signs you out after</T>}>
              {security.idleMinutes} min idle
            </Detail>
            <Detail term={<T id="emp.overview.session_2fa">Second factor</T>}>
              {security.requires2fa ? (
                <T id="emp.overview.session_2fa_req">Required</T>
              ) : (
                <T id="emp.overview.session_2fa_opt">Optional</T>
              )}
            </Detail>
            <Detail term={<T id="emp.overview.session_ip">Signed in from</T>}>
              {me.lastLoginIp || '—'}
            </Detail>
          </DetailGrid>
        </Card>

        <Photos
          myStatus={me.workingStatus}
          // Optimistic locally, so the picker does not lag behind the click.
          onStatusChanged={(workingStatus) =>
            setData((prev) => (prev ? { ...prev, me: { ...prev.me, workingStatus } } : prev))
          }
          onPhotoChanged={load}
        />

        <MyTasks canAssign={me.isPortalAdmin} />

        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={label}>
              <T id="emp.overview.news_heading">Latest announcements</T>
            </div>
            <button
              onClick={() => onNavigate('announcements')}
              style={{
                background: 'none',
                border: 'none',
                color: EMP.accent,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: EMP.sans,
              }}
            >
              <T id="emp.overview.news_all">See all</T>
            </button>
          </div>
          {announcements.length === 0 ? (
            <Empty icon="megaphone">
              <T id="emp.overview.news_empty">Nothing posted yet.</T>
            </Empty>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {announcements.map((a) => (
                <div
                  key={a.id}
                  style={{
                    border: `1px solid ${EMP.line}`,
                    borderRadius: 10,
                    padding: '11px 13px',
                    background: EMP.panel2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: EMP.text }}>{a.title}</span>
                    {a.pinned && (
                      <Pill tone="accent">
                        <T id="emp.overview.pinned">Pinned</T>
                      </Pill>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: EMP.muted,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {a.body.length > 220 ? `${a.body.slice(0, 220)}…` : a.body}
                  </div>
                  <div style={{ fontSize: 11, color: EMP.faint, marginTop: 7, fontFamily: EMP.mono }}>
                    {a.authorName ? `${a.authorName} · ` : ''}
                    {fmtDateTime(a.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  caption,
  onClick,
}: {
  icon: string;
  value: number;
  caption: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        background: EMP.panel,
        border: `1px solid ${EMP.line}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        fontFamily: EMP.sans,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: tint(EMP.accent, 0.1),
          color: EMP.accent,
        }}
      >
        <Icon name={icon} size={17} />
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 21, fontWeight: 650, color: EMP.text, lineHeight: 1.1 }}>
          {value}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: EMP.muted, marginTop: 3 }}>{caption}</span>
      </span>
    </button>
  );
}

export function Avatar({ name, url, size = 42 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flex: 'none',
          border: `1px solid ${EMP.line2}`,
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: tint(EMP.accent, 0.13),
        color: EMP.accent,
        fontWeight: 650,
        fontSize: size * 0.4,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
