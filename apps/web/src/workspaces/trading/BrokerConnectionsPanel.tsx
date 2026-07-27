import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type {
  BrokerConnection,
  BrokerConnectionKind,
  ManualPosition,
  OwnedBrokerConnection,
} from '../../api/types';

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

// The "count trades since" cutoff maps to UTC midnight of the chosen day, so it
// means the same instant regardless of the viewer's timezone. Blank clears it.
function dateToStartMs(v: string): number | null {
  if (!v) return null;
  const ms = Date.parse(v + 'T00:00:00.000Z');
  return Number.isNaN(ms) ? null : ms;
}
function startMsToDate(ms: number | null): string {
  return ms == null ? '' : new Date(ms).toISOString().slice(0, 10);
}
function fmtStartLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function BrokerConnectionsPanel({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth();
  const isAdmin = !!user?.roles.includes('admin');
  // The public demo is look-only: hide every connection mutation control.
  const readOnly = !!user?.isDemo;
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

  // Set/clear a connection's "count trades since" cutoff inline. Optimistic so
  // the date field reflects the pick instantly; reverts only if the save fails.
  async function setCutoff(c: BrokerConnection, ms: number | null) {
    const prev = conns;
    setConns((cs) => cs.map((x) => (x.id === c.id ? { ...x, historyStartAt: ms } : x)));
    setError(null);
    try {
      const r = await api.updateConnection(c.id, { historyStartAt: ms });
      setConns(r.connections);
      onChanged?.();
    } catch (e) {
      setConns(prev);
      setError(e instanceof ApiError ? e.message : 'Could not update the cutoff');
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
        <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 14 }}>{"Loading…"}</div>
      ) : conns.length === 0 ? (
        <div style={{ ...panel, marginBottom: 14, color: MUTED, fontSize: 12.5 }}>
          {readOnly ? 'No broker connections to show.' : 'No connections yet. Add one below.'}
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
                {!readOnly && (
                  <>
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
                  </>
                )}
              </div>
              {c.broker !== 'manual' && (
                <CutoffRow c={c} readOnly={readOnly} onSet={(ms) => setCutoff(c, ms)} />
              )}
              {c.broker === 'manual' && openPosConn === c.id && (
                <ManualPositions connectionId={c.id} onChanged={() => onChanged?.()} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / edit form */}
      {!readOnly && (
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
      )}

      {isAdmin && <TeamConnections onChanged={() => onChanged?.()} />}
    </div>
  );
}

// Admin-only roster of every teammate's connection. Lets an admin tidy labels
// desk-wide — e.g. rename a teammate's default "Oanda" to "Dale's Trades" — and
// pause/resume any connection. Credentials are never touched here.
function TeamConnections({ onChanged }: { onChanged?: () => void }) {
  const [conns, setConns] = useState<OwnedBrokerConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .allConnections()
      .then((d) => alive && (setConns(d.connections), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function apply(p: Promise<{ connections: OwnedBrokerConnection[] }>) {
    setBusy(true);
    setErr(null);
    try {
      setConns((await p).connections);
      onChanged?.();
      return true;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLabel(id: string) {
    const l = label.trim();
    if (!l) {
      setErr('A name is required');
      return;
    }
    if (await apply(api.adminUpdateConnection(id, { label: l }))) {
      setEditId(null);
      setLabel('');
    }
  }

  if (loaded && conns.length === 0) return null;

  return (
    <div style={{ ...panel, marginTop: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>
        Team connections (admin)
      </div>
      <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 10, lineHeight: 1.5 }}>
        Every trader's connections across the desk. Rename them so the Live Wall reads cleanly (e.g. “Dale's Trades”).
        You can rename and pause, but never see or change a teammate's keys.
      </div>

      {err && <div style={banner}>{err}</div>}

      {!loaded ? (
        <div style={{ color: MUTED, fontSize: 12 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {conns.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(c.lastStatus), flex: 'none' }} />
              {editId === c.id ? (
                <>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveLabel(c.id)}
                    style={{ ...input, flex: '1 1 160px', padding: '6px 9px' }}
                  />
                  <button onClick={() => saveLabel(c.id)} disabled={busy} style={{ ...goldBtn, padding: '6px 12px' }}>
                    Save
                  </button>
                  <button onClick={() => (setEditId(null), setLabel(''))} style={ghostBtn}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 600, color: TEXT }}>{c.label}</span>
                  <span style={{ fontSize: 10, color: FAINT }}>
                    · {c.broker}
                    {c.active ? '' : ' · paused'}
                  </span>
                  <span style={{ fontSize: 10.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>@{c.owner}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: FAINT }} title="Only trades opened on or after this date count in the desk stats. Blank = count everything.">
                      {"since"}
                    </span>
                    <input
                      type="date"
                      value={startMsToDate(c.historyStartAt)}
                      onChange={(e) => !busy && apply(api.adminUpdateConnection(c.id, { historyStartAt: dateToStartMs(e.target.value) }))}
                      title="Count trades since (blank = all)"
                      style={{ ...input, flex: '0 0 140px', padding: '5px 8px', fontSize: 11 }}
                    />
                    <button onClick={() => (setEditId(c.id), setLabel(c.label), setErr(null))} style={ghostBtn}>
                      Rename
                    </button>
                    <button onClick={() => !busy && apply(api.adminUpdateConnection(c.id, { active: !c.active }))} style={ghostBtn}>
                      {c.active ? 'Pause' : 'Resume'}
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
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

  // Screenshot → position: paste/upload an order ticket and VTS AI reads it.
  const [shotImage, setShotImage] = useState<string | null>(null);
  const [shotMedia, setShotMedia] = useState('image/png');
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  function readImage(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setShotImage(reader.result as string);
      setShotMedia(file.type);
    };
    reader.readAsDataURL(file);
  }

  function onPasteShot(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        readImage(it.getAsFile());
        e.preventDefault();
        return;
      }
    }
  }

  async function readScreenshot() {
    if (!shotImage) return;
    setReading(true);
    setErr(null);
    setReadNote(null);
    try {
      const r = await api.analyzePosition(connectionId, { imageBase64: shotImage, mediaType: shotMedia });
      setPositions(r.positions);
      onChanged?.();
      const p = r.parsed;
      setReadNote(
        `Added ${p.instrument ?? 'position'} ${p.side === 'short' ? 'SHORT' : 'LONG'}${
          p.entryPrice != null ? ` @ ${p.entryPrice}` : ''
        }. Check the details below and edit if needed.`,
      );
      setShotImage(null);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not read the screenshot');
    } finally {
      setReading(false);
    }
  }

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
        <div style={{ color: MUTED, fontSize: 12 }}>{"Loading positions…"}</div>
      ) : positions.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>{"No positions yet. Add one below."}</div>
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

      {/* Screenshot → position. For funded accounts with no API: paste the
          filled order ticket and VTS AI reads it into a position. */}
      {!editId && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
            Add from a screenshot
          </div>
          {readNote && (
            <div style={{ ...banner, color: '#bfe9cf', background: 'rgba(53,196,123,.1)', borderColor: 'rgba(53,196,123,.4)' }}>
              {readNote}
            </div>
          )}
          <div
            tabIndex={0}
            onPaste={onPasteShot}
            onClick={() => shotRef.current?.click()}
            style={{
              border: `1px dashed ${BORDER2}`,
              borderRadius: 9,
              background: INPUT_BG,
              padding: shotImage ? 8 : '16px 14px',
              textAlign: 'center',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {shotImage ? (
              <img src={shotImage} alt="screenshot preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, display: 'block', margin: '0 auto' }} />
            ) : (
              <div style={{ fontSize: 12, color: MUTED }}>
                Paste an order/positions screenshot (Ctrl/Cmd-V), or click to upload.
              </div>
            )}
          </div>
          <input ref={shotRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => readImage(e.target.files?.[0])} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={readScreenshot} disabled={reading || !shotImage} style={{ ...goldBtn, opacity: reading || !shotImage ? 0.55 : 1 }}>
              {reading ? 'Reading…' : 'Read screenshot'}
            </button>
            {shotImage && (
              <button onClick={() => setShotImage(null)} style={ghostBtn}>
                Clear
              </button>
            )}
          </div>
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

// The always-visible "count trades since" control on a non-manual connection —
// pick the date your real trading on that account began and everything earlier
// drops out of your Trade Log / History (and never re-imports). This is the
// discoverable home for the cutoff; no need to open the edit form.
function CutoffRow({
  c,
  readOnly,
  onSet,
}: {
  c: BrokerConnection;
  readOnly: boolean;
  onSet: (ms: number | null) => void;
}) {
  return (
    <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, flex: '0 0 auto' }}>
        {"Count trades since"}
      </span>
      {readOnly ? (
        <span style={{ fontSize: 11.5, color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>
          {c.historyStartAt != null ? fmtStartLabel(c.historyStartAt) : 'all trades'}
        </span>
      ) : (
        <>
          <input
            type="date"
            value={startMsToDate(c.historyStartAt)}
            onChange={(e) => onSet(dateToStartMs(e.target.value))}
            style={{ ...input, flex: '0 0 165px', padding: '7px 10px' }}
          />
          {c.historyStartAt != null && (
            <button onClick={() => onSet(null)} style={ghostBtn}>
              {"Clear"}
            </button>
          )}
        </>
      )}
      <span style={{ fontSize: 10.5, color: FAINT, flex: '1 1 100%', lineHeight: 1.45 }}>
        {"Only trades opened on or after this date count in the Trade Log and History — earlier trades are left out and never re-imported. Blank counts everything."}
      </span>
    </div>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '9px 15px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' };
const banner: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', marginBottom: 14 };
