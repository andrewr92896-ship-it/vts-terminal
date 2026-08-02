import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import type { AdminLogEntry, AdminLogState } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import { SectionHeader, panel, panelLabel } from './adminUi';

// Admin ▸ Administrator Log — what administrators have done, and what is waiting
// on one.
//
// Three states, three colours, and they mean three different things rather than
// forming a severity ladder:
//
//   • Needs attention (red)   — open. A bug report, a support request or an
//     early-access lead nobody has dealt with yet.
//   • Resolved (green)        — dealt with and closed.
//   • Record (gray)           — informational. A membership grant and its stated
//     reason: something happened, and it asks nothing of anybody.
//
// The open group is expanded on arrival and the other two are collapsed, because
// the only question this screen exists to answer at a glance is "is anything
// waiting on me".
//
// A ticket entry is a live projection of its own record (adminLog.ts), not a
// copy — so it is closed in the section it came from and turns green here on its
// own. That is why the resolve button only appears on stored entries.

const STATE_COLORS: Record<AdminLogState, string> = {
  open: C.red,
  resolved: C.green,
  info: C.faint,
};

// Where a projected entry is actually closed. Named so the reader is sent to the
// right place rather than told "somewhere else".
const SOURCE_SECTIONS: Record<string, string> = {
  bug: 'Bug Reports',
  support: 'Support',
  early_access: 'Early Access',
};

export function AdminLog({ theme }: { theme: Theme }) {
  const [entries, setEntries] = useState<AdminLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminLog();
      setEntries(r.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the log');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string) {
    setBusy(id);
    try {
      const r = await api.resolveAdminLogEntry(id);
      setEntries(r.entries);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not close that entry');
    } finally {
      setBusy(null);
    }
  }

  const open = (entries ?? []).filter((e) => e.state === 'open');
  const resolved = (entries ?? []).filter((e) => e.state === 'resolved');
  const info = (entries ?? []).filter((e) => e.state === 'info');

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 40px' }}>
      <SectionHeader
        title="Administrator Log"
        subtitle="Everything administrators do, and everything waiting on one."
      />

      {error && <div style={errorBox}>{error}</div>}
      {entries == null && !error && <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>}

      {entries != null && (
        <div style={{ display: 'grid', gap: 14 }}>
          <Group
            theme={theme}
            title="Needs attention"
            count={open.length}
            color={C.red}
            defaultOpen
            empty="Nothing is waiting."
          >
            {open.map((e) => (
              <Row key={e.id} entry={e} busy={busy === e.id} onResolve={() => void resolve(e.id)} />
            ))}
          </Group>

          <Group
            theme={theme}
            title="Resolved"
            count={resolved.length}
            color={C.green}
            empty="Nothing resolved yet."
          >
            {resolved.map((e) => (
              <Row key={e.id} entry={e} />
            ))}
          </Group>

          <Group
            theme={theme}
            title="Records"
            count={info.length}
            color={C.faint}
            empty="No administrator actions recorded yet."
          >
            {info.map((e) => (
              <Row key={e.id} entry={e} />
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({
  theme,
  title,
  count,
  color,
  defaultOpen,
  empty,
  children,
}: {
  theme: Theme;
  title: string;
  count: number;
  color: string;
  defaultOpen?: boolean;
  empty: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section style={panel(theme)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={15} color={C.faint} />
        <span style={{ ...panelLabel, marginBottom: 0 }}>{title}</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: C.mono,
            color,
            border: `1px solid ${color}55`,
            background: `${color}14`,
            borderRadius: 999,
            padding: '1px 8px',
          }}
        >
          {count}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
          {count === 0 ? <div style={{ fontSize: 12.5, color: C.faint }}>{empty}</div> : children}
        </div>
      )}
    </section>
  );
}

function Row({
  entry,
  busy,
  onResolve,
}: {
  entry: AdminLogEntry;
  busy?: boolean;
  onResolve?: () => void;
}) {
  const color = STATE_COLORS[entry.state];
  // Only a stored entry can be closed from here; a projected ticket is closed in
  // its own section, which is the only place that can resolve the real thing.
  const closable = entry.state === 'open' && !entry.source && !!onResolve;

  return (
    <div
      style={{
        display: 'flex',
        gap: 11,
        alignItems: 'flex-start',
        borderLeft: `2px solid ${color}`,
        background: 'rgba(0,0,0,.18)',
        borderRadius: '0 8px 8px 0',
        padding: '10px 12px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{entry.title}</div>
        {entry.detail && (
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, marginTop: 3 }}>
            {entry.detail}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.faint, marginTop: 5, fontFamily: C.mono }}>
          {new Date(entry.createdAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
          {entry.actorName ? ` · ${entry.actorName}` : ''}
          {entry.state === 'open' && entry.source
            ? ` · close it in ${SOURCE_SECTIONS[entry.source] ?? 'its own section'}`
            : ''}
          {entry.resolvedByName ? ` · closed by ${entry.resolvedByName}` : ''}
        </div>
      </div>

      {closable && (
        <button onClick={onResolve} disabled={busy} style={closeBtn}>
          {busy ? '…' : 'Close'}
        </button>
      )}
    </div>
  );
}

const closeBtn: CSSProperties = {
  flex: 'none',
  fontSize: 11.5,
  fontWeight: 600,
  color: '#dfe7fa',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${C.line2}`,
  padding: '6px 11px',
  borderRadius: 7,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const errorBox: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
};
