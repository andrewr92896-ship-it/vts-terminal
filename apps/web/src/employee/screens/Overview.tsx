import { useEffect, useState, type ReactNode } from 'react';
import { employeeApi, type OverviewData } from '../api';
import { EMP, EMPLOYMENT_LABELS, fmtDate, fmtDateTime, tint } from '../theme';
import { Card, Detail, DetailGrid, Empty, Pill, ScreenHeader, label } from '../ui';
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
        {"Loading…"}
      </Empty>
    );
  }

  const { me, announcements, counts, security } = data;

  return (
    <div>
      <ScreenHeader
        icon="briefcase"
        title={"Overview"}
        subtitle={
          "Your employment record and everything the internal portal is currently holding."
        }
      />

      <div style={{ display: 'grid', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
            <Avatar name={me.name} url={me.avatarUrl} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 650, color: EMP.text }}>{me.name}</div>
              <div style={{ fontSize: 12.5, color: EMP.muted }}>
                {me.title || "No title on record"}
                {me.department ? ` · ${me.department}` : ''}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {me.isPortalAdmin && (
                <Pill tone="accent">
                  <Icon name="shield-check" size={10} />
                  {"Portal admin"}
                </Pill>
              )}
              <Pill tone="good">
                <Icon name="mail" size={10} />
                {"Email 2FA"}
              </Pill>
            </div>
          </div>

          <DetailGrid>
            <Detail term={"Employee no."}>
              {me.employeeNo || '—'}
            </Detail>
            <Detail term={"Employment"}>
              {EMPLOYMENT_LABELS[me.employmentType] ?? me.employmentType}
            </Detail>
            <Detail term={"Start date"}>{fmtDate(me.startedOn)}</Detail>
            <Detail term={"Reports to"}>{me.managerName || '—'}</Detail>
            <Detail term={"Work email"}>{me.workEmail || '—'}</Detail>
            <Detail term={"Work phone"}>{me.workPhone || '—'}</Detail>
            <Detail term={"Location"}>{me.location || '—'}</Detail>
            <Detail term={"Previous sign-in"}>
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
            caption={"People in the directory"}
            onClick={() => onNavigate('directory')}
          />
          <StatCard
            icon="file-text"
            value={counts.documents}
            caption={"Internal documents"}
            onClick={() => onNavigate('documents')}
          />
          <StatCard
            icon="megaphone"
            value={announcements.length}
            caption={"Recent announcements"}
            onClick={() => onNavigate('announcements')}
          />
        </div>

        <Card>
          <div style={{ ...label, marginBottom: 12 }}>
            {"This session"}
          </div>
          <DetailGrid>
            <Detail term={"Maximum length"}>
              {security.sessionHours}h
            </Detail>
            <Detail term={"Signs you out after"}>
              {security.idleMinutes} min idle
            </Detail>
            <Detail term={"Second factor"}>
              {security.requires2fa ? "Emailed code" : "Optional"}
            </Detail>
            <Detail term={"Remembered devices"}>
              {me.trustedDeviceCount === 0
                ? 'None — a code every time'
                : `${me.trustedDeviceCount} skipping the code`}
            </Detail>
            <Detail term={"Signed in from"}>
              {me.lastLoginIp || '—'}
            </Detail>
          </DetailGrid>
        </Card>

        <Photos
          myStatus={me.workingStatus}
          canManageAll={me.isDeveloper}
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
              {"Latest announcements"}
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
              {"See all"}
            </button>
          </div>
          {announcements.length === 0 ? (
            <Empty icon="megaphone">
              {"Nothing posted yet."}
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
                        {"Pinned"}
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
