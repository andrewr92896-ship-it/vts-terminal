import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { BrokerConnection, BrokerConnectionKind, ManualPosition } from '../../api/types';

// The list + add/edit form for a user's broker connections. Shared by the Live
// Wall "Connections" modal and the Account Settings page so both stay in sync.
// All writes go through the same API, which enforces the trading-write role.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

// The API protocols the portal can actually stream from. The brokerage *name*
// is free text (the label), so a user can call a connection anything (their
// prop firm, etc.) while picking which API it speaks.
const BROKERS: { key: BrokerConnectionKind; label: string }[] = [
  { key: 'oanda', label: 'OANDA v20 (forex)' },
  { key: 'kraken', label: 'Kraken (crypto)' },
  { key: 'manual', label: 'Manual (enter trades by hand)' },
];

function statusColor(s: BrokerConnection['lastStatus']): string {
  return s === 'ok' ? GREEN : s === 'error' ? RED : FAINT;
}

export function BrokerConnectionsPanel({ onChanged }: { onChanged?: () => void }) {
  const [conns, setConns] = useState<BrokerConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which manual connection's positions editor is expanded.
  const [openPosConn, setOpenPosConn] = useState<string | null>(null);

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
    let alive = true;
    api
      .tradingConnections()
      .then((d) => alive && (setConns(d.connections), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  function resetForm() {
    setEditingId(null);
    setBroker('oanda');
    setLabel('');
    setToken('');
    setAccountId('');
    setEnv('practice');
    setApiKey('');
    setApiSecret('');
  }

  function startEdit(c: BrokerConnection) {
    setEditingId(c.id);
    setBroker(c.broker);
    setLabel(c.label);
    setToken('');
    setAccountId('');
    // Restore the saved environment so rotating the token does not silently
    // switch a live account back to practice.
    setEnv(c.env === 'live' ? 'live' : 'practice');
    setApiKey('');
    setApiSecret('');
  }

  // Assemble the credential fields the user filled in (blank → keep current on edit).
  function buildCreds(): Record<string, string> | null {
    // Manual connections have no credentials; an empty object is valid.
    if (broker === 'manual') return {};
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
    setBusy(true);
    setError(null);
    try {
      setConns((await p).connections);
      onChanged?.();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!label.trim()) {
      setError('A brokerage name is required');
      return;
    }
    const creds = buildCreds();
    let okDone = false;
    if (editingId) {
      okDone = await apply(
        api.updateConnection(editingId, { label: label.trim(), ...(creds ? { creds } : {}) }),
      );
    } else {
      if (!creds) {
        setError('Enter the API credentials');
        return;
      }
      okDone = await apply(api.addConnection({ broker, label: label.trim(), creds }));
    }
    if (okDone) resetForm();
  }

  const isOanda = broker === 'oanda';

  return (
    <div style={{ color: TEXT }}>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 14, lineHeight: 1.55 }}>
        Connect your own broker accounts. Pick the API your broker uses, then name the connection
        anything you like. Keys are encrypted on the server and never shown again. Your Live Wall and
        History stream from your active connections.
      </div>

      {error && <div style={banner}>{error}</div>}

      {!loaded ? (
        <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 14 }}>Loading…</div>
      ) : conns.length === 0 ? (
        <div style={{ ...panel, marginBottom: 14, color: MUTED, fontSize: 12.5 }}>
          No connections yet. Add one below.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {conns.map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(c.lastStatus), flex: 'none' }}
                  title={c.lastError ?? c.lastStatus}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                    {c.label}{' '}
                    <span style={{ fontSize: 10, color: FAINT, fontWeight: 500 }}>
                      · {c.broker}
                      {c.active ? '' : ' · paused'}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {c.summary ?? ''}
                    {c.lastStatus === 'error' && c.lastError ? ` · ${c.lastError}` : ''}
                  </div>
                </div>
                {c.broker === 'manual' && (
                  <button onClick={() => setOpenPosConn(openPosConn === c.id ? null : c.id)} style={ghostBtn}>
                    {openPosConn === c.id ? 'Hide' : 'Positions'}
                  </button>
                )}
                <button onClick={() => !busy && apply(api.updateConnection(c.id, { active: !c.active }))} style={ghostBtn}>
                  {c.active ? 'Pause' : 'Resume'}
                </button>
                <button onClick={() => startEdit(c)} style={ghostBtn}>
                  Edit
                </button>
                <button
                  onClick={() => !busy && apply(api.removeConnection(c.id))}
                  title="Remove"
                  aria-label={`Remove ${c.label}`}
                  style={{ ...ghostBtn, color: '#ff9a9a', borderColor: 'transparent' }}
                >
                  ×
                </button>
              </div>
              {c.broker === 'manual' && openPosConn === c.id && (
                <ManualPositions connectionId={c.id} onChanged={() => onChanged?.()} />
              )}
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
          <select
            value={broker}
            onChange={(e) => setBroker(e.target.value as BrokerConnectionKind)}
            disabled={!!editingId}
            style={{ ...input, flex: '0 0 170px', opacity: editingId ? 0.6 : 1 }}
          >
            {BROKERS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Brokerage name (e.g. FundedNext)"
            style={{ ...input, flex: '1 1 200px' }}
          />
          {broker === 'manual' ? (
            <div style={{ flex: '1 1 100%', fontSize: 11.5, color: FAINT, lineHeight: 1.5 }}>
              No API needed. After you add this, use the Positions button on it to enter your open
              trades by hand. They show on the Live Wall with full pip and risk math.
            </div>
          ) : isOanda ? (
            <>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                placeholder={editingId ? 'API token (blank = keep)' : 'OANDA API token'}
                style={{ ...input, flex: '1 1 100%' }}
              />
              <input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Account ID (001-…-001)"
                style={{ ...input, flex: '1 1 200px' }}
              />
              <select value={env} onChange={(e) => setEnv(e.target.value as 'practice' | 'live')} style={{ ...input, flex: '0 0 140px' }}>
                <option value="practice">Practice</option>
                <option value="live">Live</option>
              </select>
            </>
          ) : (
            <>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={editingId ? 'API key (blank = keep)' : 'Kraken API key'}
                style={{ ...input, flex: '1 1 100%' }}
              />
              <input
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                type="password"
                placeholder={editingId ? 'Private key (blank = keep)' : 'Kraken private key'}
                style={{ ...input, flex: '1 1 100%' }}
              />
            </>
          )}
        </div>
        {editingId && (
          <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>
            Leave credential fields blank to keep the current keys.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={submit} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
            {editingId ? 'Save' : 'Add connection'}
          </button>
          {editingId && (
            <button onClick={resetForm} style={ghostBtn}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The positions editor for one manual connection: add, edit, and remove the
// open trades that show on the Live Wall. Prices keep their decimals; size is
// in units. currentPrice drives the live mark and the pip math.
function ManualPositions({ connectionId, onChanged }: { connectionId: string; onChanged?: () => void }) {
  const [positions, setPositions] = useState<ManualPosition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [instrument, setInstrument] = useState('');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [units, setUnits] = useState('');
  const [entry, setEntry] = useState('');
  const [mark, setMark] = useState('');
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .connectionPositions(connectionId)
      .then((d) => alive && (setPositions(d.positions), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [connectionId]);

  // Parse a numeric input; blank becomes null so optional fields clear cleanly.
  function num(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function resetForm() {
    setEditId(null);
    setInstrument('');
    setSide('long');
    setUnits('');
    setEntry('');
    setMark('');
    setTp('');
    setSl('');
  }

  function startEdit(p: ManualPosition) {
    setEditId(p.id);
    setInstrument(p.instrument);
    setSide(p.side);
    setUnits(String(p.units));
    setEntry(String(p.entryPrice));
    setMark(p.currentPrice != null ? String(p.currentPrice) : '');
    setTp(p.takeProfit != null ? String(p.takeProfit) : '');
    setSl(p.stopLoss != null ? String(p.stopLoss) : '');
  }

  async function save() {
    const inst = instrument.trim();
    const u = num(units);
    const e = num(entry);
    if (!inst || u == null || e == null) {
      setErr('Instrument, size, and entry price are required');
      return;
    }
    const body = {
      instrument: inst,
      side,
      units: u,
      entryPrice: e,
      currentPrice: num(mark),
      takeProfit: num(tp),
      stopLoss: num(sl),
    };
    setBusy(true);
    setErr(null);
    try {
      const r = editId ? await api.updatePosition(editId, body) : await api.addPosition(connectionId, body);
      setPositions(r.positions);
      onChanged?.();
      resetForm();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not save position');
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    setErr(null);
    try {
      setPositions((await api.removePosition(id)).positions);
      onChanged?.();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not remove position');
    }
  }

  return (
    <div style={{ ...panel, marginLeft: 18 }}>
      {err && <div style={banner}>{err}</div>}

      {!loaded ? (
        <div style={{ color: MUTED, fontSize: 12 }}>Loading positions…</div>
      ) : positions.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>No positions yet. Add one below.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {positions.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: TEXT }}>{p.instrument}</span>
              <span style={{ color: p.side === 'long' ? GREEN : RED, fontWeight: 700 }}>{p.side === 'long' ? 'LONG' : 'SHORT'}</span>
              <span style={{ color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>
                {p.units} @ {p.entryPrice}
                {p.currentPrice != null ? ` → ${p.currentPrice}` : ''}
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => startEdit(p)} style={ghostBtn}>Edit</button>
                <button onClick={() => del(p.id)} style={{ ...ghostBtn, color: '#ff9a9a', borderColor: 'transparent' }} aria-label={`Remove ${p.instrument}`}>×</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
        {editId ? 'Edit position' : 'Add a position'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument (EUR/USD)" style={{ ...input, flex: '1 1 130px' }} />
        <select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')} style={{ ...input, flex: '0 0 100px' }}>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <input value={units} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" placeholder="Size (units)" style={{ ...input, flex: '1 1 100px' }} />
        <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" placeholder="Entry" style={{ ...input, flex: '1 1 90px' }} />
        <input value={mark} onChange={(e) => setMark(e.target.value)} inputMode="decimal" placeholder="Current price" style={{ ...input, flex: '1 1 90px' }} />
        <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="Take profit" style={{ ...input, flex: '1 1 90px' }} />
        <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="Stop loss" style={{ ...input, flex: '1 1 90px' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={save} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
          {editId ? 'Save position' : 'Add position'}
        </button>
        {editId && (
          <button onClick={resetForm} style={ghostBtn}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '9px 15px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' };
const banner: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', marginBottom: 14 };
