import { useEffect, useMemo, useState } from 'react';
import { employeeApi, type DirectoryEntry } from '../api';
import { EMP, EMPLOYMENT_LABELS, fmtDate } from '../theme';
import { Card, Detail, DetailGrid, Empty, Input, Pill, ScreenHeader } from '../ui';
import { Avatar } from './Overview';
import { WORKING_COLORS, WORKING_LABELS } from './Photos';
import { Icon } from '../../components/Icon';

// The staff directory. Only people with an active employee record appear —
// suspended and offboarded records stay in the HR screen and drop out of here
// the moment their status changes.

export function Directory() {
  const [people, setPeople] = useState<DirectoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const searchPlaceholder = 'Search by name, title or department';

  useEffect(() => {
    employeeApi
      .directory()
      .then((r) => setPeople(r.people))
      .catch((e) => setError((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.title, p.department, p.location, p.workEmail]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [people, query]);

  const byDepartment = useMemo(() => {
    const groups = new Map<string, DirectoryEntry[]>();
    for (const p of filtered) {
      const key = p.department?.trim() || 'Unassigned';
      const list = groups.get(key);
      if (list) list.push(p);
      else groups.set(key, [p]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (error) return <Empty icon="x-circle">{error}</Empty>;
  if (!people) {
    return (
      <Empty icon="refresh-cw">
        {"Loading…"}
      </Empty>
    );
  }

  return (
    <div>
      <ScreenHeader
        icon="users"
        title={"Directory"}
        subtitle={
          "Everyone currently on the team, grouped by department. Contact details are internal — do not forward them outside the company."
        }
      />

      <div style={{ maxWidth: 400, marginBottom: 18 }}>
        <Input value={query} onChange={setQuery} placeholder={searchPlaceholder} />
      </div>

      {filtered.length === 0 ? (
        <Empty icon="search">
          {"No one matches that search."}
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 22 }}>
          {byDepartment.map(([department, members]) => (
            <div key={department}>
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: '1.3px',
                  textTransform: 'uppercase',
                  color: EMP.faint,
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                {department} · {members.length}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                  gap: 12,
                }}
              >
                {members.map((p) => (
                  <PersonCard key={p.userId} person={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({ person }: { person: DirectoryEntry }) {
  return (
    <Card pad={15}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 13 }}>
        <Avatar name={person.name} url={person.avatarUrl} size={38} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 650,
              color: EMP.text,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {person.name}
            </span>
            {person.isMe && (
              <Pill tone="accent">
                {"You"}
              </Pill>
            )}
          </div>
          <div style={{ fontSize: 12, color: EMP.muted, marginTop: 2 }}>{person.title || '—'}</div>
        </div>
      </div>

      <DetailGrid>
        <Detail term={"Email"}>
          {person.workEmail ? (
            <a href={`mailto:${person.workEmail}`} style={{ color: EMP.accent, textDecoration: 'none' }}>
              {person.workEmail}
            </a>
          ) : (
            '—'
          )}
        </Detail>
        <Detail term={"Phone"}>{person.workPhone || '—'}</Detail>
        <Detail term={"Employment"}>
          {EMPLOYMENT_LABELS[person.employmentType] ?? person.employmentType}
        </Detail>
        <Detail term={"Started"}>{fmtDate(person.startedOn)}</Detail>
        <Detail term={"Working"}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: WORKING_COLORS[person.workingStatus],
                flex: 'none',
              }}
            />
            {WORKING_LABELS[person.workingStatus]}
          </span>
        </Detail>
      </DetailGrid>

      {(person.managerName || person.location || person.isPortalAdmin) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 7,
            marginTop: 13,
            paddingTop: 12,
            borderTop: `1px solid ${EMP.line}`,
            fontSize: 11.5,
            color: EMP.faint,
            alignItems: 'center',
          }}
        >
          {person.managerName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="users" size={12} /> {person.managerName}
            </span>
          )}
          {person.location && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="building-2" size={12} /> {person.location}
            </span>
          )}
          {person.isPortalAdmin && (
            <Pill tone="accent">
              {"Portal admin"}
            </Pill>
          )}
        </div>
      )}
    </Card>
  );
}
