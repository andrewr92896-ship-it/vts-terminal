import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../../api/client';
import type { DevEnvironment } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { SectionHeader, panel, panelLabel } from './adminUi';

// Developer Terminal ▸ Deployment — which database this terminal is serving.
//
// Written after a deploy where the terminal came up healthy, signed the owner in
// and showed an empty desk, because the service was pointed at a different
// database than the one holding the history. Every screen was working correctly;
// none of them could say which database it was working correctly against, and
// finding out otherwise means the hosting dashboard or a CLI.
//
// It carries NO CONNECTION STRING. The server reports the shape of the target —
// which variable supplied it, the driver, the host or path — and never the value,
// because a libsql URL carries its auth token in the query string. That is enough
// to tell two databases apart, which is the question, and not enough to reach
// either.
//
// Founder-level and read-only, like the rest of this workspace.

const GREEN = '#4ade80';
const AMBER = '#FF9F45';
const RED = '#f87171';
const MUTED = '#8ea3cc';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 0',
  borderTop: '1px solid #1b2740',
  fontSize: 12.5,
};

function Note({ tone, children }: { tone: 'warn' | 'bad'; children: React.ReactNode }) {
  const color = tone === 'bad' ? RED : AMBER;
  return (
    <div
      style={{
        margin: '12px 0 0',
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${color}44`,
        background: `${color}12`,
        color: '#dce6ff',
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  );
}

export function AdminEnvironment({ theme }: { theme: Theme }) {
  const [data, setData] = useState<DevEnvironment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .devEnvironment()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not read the deployment.'));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <div style={{ ...panel(theme), color: RED, fontSize: 13 }}>{error}</div>;
  if (!data) return <div style={{ ...panel(theme), color: MUTED, fontSize: 13 }}>Reading this deployment…</div>;

  const trades = data.counts['closed and open trades'];
  const empty = trades === 0;
  const mismatch = data.allowlist.unknownIds.length > 0;
  const unreadable = data.credentials.filter((c) => c.problem);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader
        title="Deployment"
        subtitle="Which database this terminal is reading, who it admits, and whether the stored broker credentials still open."
      />

      <div style={panel(theme)}>
        <div style={panelLabel}>Database</div>
        <div style={{ ...row, borderTop: 'none' }}>
          <span style={{ color: MUTED }}>Set by</span>
          <span style={{ fontFamily: MONO, color: '#eef3ff' }}>{data.database.source}</span>
        </div>
        <div style={row}>
          <span style={{ color: MUTED }}>Driver</span>
          <span style={{ fontFamily: MONO, color: '#eef3ff' }}>{data.database.driver}</span>
        </div>
        <div style={row}>
          <span style={{ color: MUTED }}>Target</span>
          <span style={{ fontFamily: MONO, color: '#eef3ff', wordBreak: 'break-all', textAlign: 'right' }}>
            {data.database.target}
          </span>
        </div>
        {empty && (
          <Note tone="warn">
            This database holds no trades. If that is a surprise, this deployment is pointed at a
            different database than the one with the history — a variable, not lost data.
          </Note>
        )}
      </div>

      <div style={panel(theme)}>
        <div style={panelLabel}>What is in it</div>
        {Object.entries(data.counts).map(([label, n], i) => (
          <div key={label} style={{ ...row, borderTop: i === 0 ? 'none' : row.borderTop }}>
            <span style={{ color: MUTED }}>{label}</span>
            <span style={{ fontFamily: MONO, color: n === null ? MUTED : '#eef3ff' }}>
              {n === null ? 'no such table' : n.toLocaleString('en-US')}
            </span>
          </div>
        ))}
      </div>

      <div style={panel(theme)}>
        <div style={panelLabel}>Accounts and who is admitted</div>
        {data.accounts.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTED }}>None — this database has never been seeded.</div>
        ) : (
          data.accounts.map((a, i) => (
            <div key={a.id} style={{ ...row, borderTop: i === 0 ? 'none' : row.borderTop, alignItems: 'center' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontFamily: MONO, color: '#eef3ff', fontSize: 11.5, wordBreak: 'break-all' }}>{a.id}</span>
                <span style={{ color: MUTED, fontSize: 11 }}>
                  {a.username} · {a.rank}
                  {a.active ? '' : ' · inactive'}
                </span>
              </span>
              <span style={{ color: a.admitted ? GREEN : MUTED, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                {data.allowlist.configured ? (a.admitted ? 'admitted' : 'not admitted') : 'no allowlist set'}
              </span>
            </div>
          ))
        )}
        {mismatch && (
          <Note tone="bad">
            The allowlist admits {data.allowlist.unknownIds.length}{' '}
            {data.allowlist.unknownIds.length === 1 ? 'ID that is not an account' : 'IDs that are not accounts'} in this
            database. That is the signature of a service pointed at one database with an allowlist written from another
            — sign-in would refuse whoever is missing. Set PRIVATE_ACCESS_USER_IDS from the IDs above.
          </Note>
        )}
        {!data.allowlist.configured && (
          <Note tone="warn">
            PRIVATE_ACCESS_USER_IDS is not set on this deployment, so it is not restricting who may sign in.
          </Note>
        )}
      </div>

      <div style={panel(theme)}>
        <div style={panelLabel}>Broker credentials</div>
        {!data.credentialsTested ? (
          <div style={{ fontSize: 12.5, color: MUTED }}>No broker_connections table on this schema version.</div>
        ) : data.credentials.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTED }}>None stored.</div>
        ) : (
          data.credentials.map((c, i) => (
            <div key={`${c.broker}-${c.label}-${i}`} style={{ ...row, borderTop: i === 0 ? 'none' : row.borderTop }}>
              <span style={{ color: '#eef3ff' }}>
                {c.broker} · {c.label}
                {c.active ? '' : ' (paused)'}
              </span>
              <span style={{ color: c.problem ? RED : GREEN, fontSize: 11.5, textAlign: 'right' }}>
                {c.problem ?? 'opens'}
              </span>
            </div>
          ))
        )}
        {unreadable.length > 0 && (
          <Note tone="warn">
            A credential sealed under a different key opens again once this deployment is given that key — the data is
            fine. One whose row moved cannot be recovered by any key and has to be re-entered. Nothing else is affected:
            trades, studies and settings do not use this key.
          </Note>
        )}
      </div>
    </div>
  );
}
