import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { BrokerConnection, BrokerConnectionKind } from '../../api/types';

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const PAGE = '#081226';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

const BROKERS: { key: BrokerConnectionKind; label: string }[] = [
  { key: 'oanda', label: 'OANDA (forex)' },
  { key: 'kraken', label: 'Kraken (crypto)' },
];

function statusColor(s: BrokerConnection['lastStatus']): string {
  return s === 'ok' ? GREEN : s === 'error' ? RED : FAINT;
}

export function BrokerConnections({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { isPhone } = useResponsive();
  const [conns, setConns] = useState<BrokerConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [broker, setBroker] = useState<BrokerConnectionKind>('oanda');
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [env, setEnv] = useState<'practice' | 'live'>('practice');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api.tradingConnections().then((d) => alive && (setConns(d.connections), setLoaded(true))).catch(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  function resetForm() {
    setEditingId(null); setBroker('oanda'); setLabel('');
    setToken(''); setAccountId(''); setEnv('practice'); setApiKey(''); setApiSecret('');
  }

  function startEdit(c: BrokerConnection) {
    setEditingId(c.id); setBroker(c.broker); setLabel(c.label);
    setToken(''); setAccountId(''); setEnv('practice'); setApiKey(''); setApiSecret('');
  }

  // Assemble the credential fields the user filled in (blank → keep current on edit).
  function buildCreds(): Record<string, string> | null {
    if (broker === 'oanda') {
      const has = token || accountId;
      if (!has) return null;
      return { token: token.trim(), accountId: accountId.trim(), env };
    }
    const has = apiKey || apiSecret;
    if (!has) return null;
    return { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() };
  }

  async function apply(p: Promise<{ connections: BrokerConnection[] }>) {
    setBusy(true); setError(null);
    try {
      setConns((await p).connections);
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!label.trim()) { setError('A label is required'); return; }
    const creds = buildCreds();
    let okDone = false;
    if (editingId) {
      okDone = await apply(api.updateConnection(editingId, { label: label.trim(), ...(creds ? { creds } : {}) }));
    } else {
      if (!creds) { setError('Enter the API credentials'); return; }
      okDone = await apply(api.addConnection({ broker, label: label.trim(), creds }));
    }
    if (okDone) resetForm();
  }

  const isOanda = broker === 'oanda';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', top: isPhone ? 0 : '5vh', left: '50%', transform: 'translateX(-50%)',
        width: isPhone ? '100%' : 'min(620px, 94vw)', height: isPhone ? '100%' : 'auto', maxHeight: isPhone ? '100%' : '90vh',
        overflowY: 'auto', background: PAGE, border: isPhone ? 'none' : `1px solid ${BORDER2}`, borderRadius: isPhone ? 0 : 14,
        boxShadow: '0 24px 60px rgba(0,0,0,.55)', zIndex: 61, animation: 'popIn .25s ease', color: TEXT,
      }}>
        <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'linear-gradient(90deg,#0a1f4d,#0c2768)', borderBottom: `1px solid ${BORDER2}` }}>
          <strong style={{ fontSize: 15, color: '#fff' }}>Broker Connections</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#9fb0d6', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 14, lineHeight: 1.55 }}>
            Connect your own broker accounts. Keys are encrypted on the server and never shown again — your Live Wall and History stream from your active connections.
          </div>

          {error && <div style={banner}>{error}</div>}

          {/* Existing connections */}
          {!loaded ? (
            <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 14 }}>Loading…</div>
          ) : conns.length === 0 ? (
            <div style={{ ...panel, marginBottom: 14, color: MUTED, fontSize: 12.5 }}>No connections yet — add one below.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {conns.map((c) => (
                <div key={c.id} style={{ ...panel, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(c.lastStatus), flex: 'none' }} title={c.lastError ?? c.lastStatus} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                      {c.label} <span style={{ fontSize: 10, color: FAINT, fontWeight: 500 }}>· {c.broker}{c.active ? '' : ' · paused'}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>{c.summary ?? ''}{c.lastStatus === 'error' && c.lastError ? ` — ${c.lastError}` : ''}</div>
                  </div>
                  <button onClick={() => !busy && apply(api.updateConnection(c.id, { active: !c.active }))} style={ghostBtn}>{c.active ? 'Pause' : 'Resume'}</button>
                  <button onClick={() => startEdit(c)} style={ghostBtn}>Edit</button>
                  <button onClick={() => !busy && apply(api.removeConnection(c.id))} title="Remove" style={{ ...ghostBtn, color: '#ff9a9a', borderColor: 'transparent' }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Add / edit form */}
          <div style={{ ...panel }}>
            <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>
              {editingId ? 'Edit connection' : 'Add a connection'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={broker} onChange={(e) => setBroker(e.target.value as BrokerConnectionKind)} disabled={!!editingId} style={{ ...input, flex: '0 0 160px', opacity: editingId ? 0.6 : 1 }}>
                {BROKERS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Andrew's Trades)" style={{ ...input, flex: '1 1 200px' }} />
              {isOanda ? (
                <>
                  <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder={editingId ? 'API token (blank = keep)' : 'OANDA API token'} style={{ ...input, flex: '1 1 100%' }} />
                  <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Account ID (001-…-001)" style={{ ...input, flex: '1 1 200px' }} />
                  <select value={env} onChange={(e) => setEnv(e.target.value as 'practice' | 'live')} style={{ ...input, flex: '0 0 140px' }}>
                    <option value="practice">Practice</option>
                    <option value="live">Live</option>
                  </select>
                </>
              ) : (
                <>
                  <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={editingId ? 'API key (blank = keep)' : 'Kraken API key'} style={{ ...input, flex: '1 1 100%' }} />
                  <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} type="password" placeholder={editingId ? 'Private key (blank = keep)' : 'Kraken private key'} style={{ ...input, flex: '1 1 100%' }} />
                </>
              )}
            </div>
            {editingId && <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>Leave credential fields blank to keep the current keys.</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={submit} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>{editingId ? 'Save' : 'Add connection'}</button>
              {editingId && <button onClick={resetForm} style={ghostBtn}>Cancel</button>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '9px 15px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' };
const banner: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', marginBottom: 14 };
