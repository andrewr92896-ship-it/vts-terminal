import { useEffect, useRef, useState, type CSSProperties, type ClipboardEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { AlertRecord, AlertsData, StrategyStat, TradeAnalysis, TradeRecord, TradeResult } from '../../api/types';

// Trading navy/gold palette — matches the Live Wall / Trade Log.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

const ET = 'America/New_York';
function etTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: ET,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}
// Signed P&L with a leading +/- so wins and losses read at a glance.
function fmtSigned(n: number | null): string {
  if (n == null) return '—';
  const v = Number(Math.abs(n) >= 1000 ? n.toFixed(2) : n.toFixed(5));
  return (v > 0 ? '+' : '') + v.toLocaleString('en-US', { maximumFractionDigits: 5 });
}
function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const RESULT: Record<TradeResult, { label: string; color: string }> = {
  win: { label: 'WIN', color: GREEN },
  loss: { label: 'LOSS', color: RED },
  breakeven: { label: 'B/E', color: MUTED },
};

const VERDICT: Record<TradeAnalysis['verdict'], { label: string; color: string }> = {
  good: { label: 'Good', color: GREEN },
  acceptable: { label: 'Acceptable', color: GOLD },
  poor: { label: 'Poor', color: RED },
  unclear: { label: 'Unclear', color: MUTED },
};

export function Alerts({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const { isPhone } = useResponsive();
  const [data, setData] = useState<AlertsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setData(await api.tradingAlerts());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Failed to load alerts');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading alerts…</div>;

  const active = data.alerts.filter((a) => a.status !== 'dismissed');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Alerts</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            TradingView alerts arrive by webhook and build a paper-trading dataset. Tag each one win/loss to track strategy metrics, or add past trades by hand.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setAdding((v) => !v)} style={ghostBtn}>
            {adding ? 'Close' : '+ Add trade'}
          </button>
          <button onClick={() => void load()} disabled={refreshing} style={{ ...goldBtn, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!data.aiConfigured && (
        <div style={warnBanner}>
          Claude isn’t configured yet — alerts still arrive, but screenshot analysis needs an API key set on the server.
        </div>
      )}

      {adding && <ManualAddForm onAdded={(d) => { setData(d); setAdding(false); }} onCancel={() => setAdding(false)} />}

      <StrategyMetrics strategies={data.strategies} />

      {active.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          No alerts yet. Point a TradingView alert’s webhook at
          <code style={{ color: GOLD, margin: '0 5px' }}>/api/webhooks/tradingview</code>
          with your shared secret, and they’ll appear here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 13 }}>
          {active.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              isPhone={isPhone}
              aiConfigured={data.aiConfigured}
              onChanged={setData}
              onViewTrade={() => onNavigate('log')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  isPhone,
  aiConfigured,
  onChanged,
  onViewTrade,
}: {
  alert: AlertRecord;
  isPhone: boolean;
  aiConfigured: boolean;
  onChanged: (d: AlertsData) => void;
  onViewTrade: () => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [editResult, setEditResult] = useState(false);
  const [trades, setTrades] = useState<TradeRecord[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const long = alert.side === 'long';
  const sideColor = alert.side ? (long ? GREEN : RED) : MUTED;
  const analyzed = alert.status === 'analyzed';
  const res = alert.result ? RESULT[alert.result] : null;
  // The card's left accent reflects the outcome once tagged, else the side.
  const accent = res ? res.color : sideColor;

  async function tag(result: TradeResult | null) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.setAlertResult(alert.id, { result }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update result');
    } finally {
      setBusy(false);
    }
  }

  function readImage(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setMediaType(file.type);
    };
    reader.readAsDataURL(file);
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
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

  async function analyze() {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.analyzeAlert(alert.id, { imageBase64: image, mediaType }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    try {
      onChanged(await api.dismissAlert(alert.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not dismiss');
    } finally {
      setBusy(false);
    }
  }

  async function openPicker() {
    setLinking(true);
    setError(null);
    try {
      const log = await api.tradeLog();
      setTrades(log.trades);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load trades');
    }
  }

  async function linkTrade(tradeId: string) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.linkAlert(alert.id, tradeId));
      setLinking(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not link trade');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      onChanged(await api.unlinkAlert(alert.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unlink');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', borderLeft: `3px solid ${accent}` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{alert.instrument ?? 'Alert'}</span>
          {alert.side && <span style={{ ...badge, color: sideColor, border: `1px solid ${sideColor}` }}>{long ? 'LONG' : 'SHORT'}</span>}
          {res && <span style={{ ...badge, color: res.color, border: `1px solid ${res.color}` }}>{res.label}</span>}
          {alert.source === 'manual' && <span style={{ ...badge, color: FAINT, border: `1px solid ${BORDER2}` }}>MANUAL</span>}
          <span style={{ ...badge, color: analyzed ? GREEN : GOLD, border: `1px solid ${analyzed ? GREEN : GOLD}` }}>
            {analyzed ? 'ANALYZED' : 'NEW'}
          </span>
        </div>
        <span style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace" }}>{etTime(alert.receivedAt)} ET</span>
      </div>

      {/* Alert meta */}
      <div style={{ display: 'flex', gap: 16, padding: '0 16px 10px', flexWrap: 'wrap', fontSize: 12, color: MUTED }}>
        {alert.price != null && <span>Entry <b style={{ color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtPrice(alert.price)}</b></span>}
        {alert.exitPrice != null && <span>Exit <b style={{ color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtPrice(alert.exitPrice)}</b></span>}
        {alert.pnl != null && <span>P&L <b style={{ color: alert.pnl > 0 ? GREEN : alert.pnl < 0 ? RED : TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtSigned(alert.pnl)}</b></span>}
        {alert.timeframe && <span style={metaChip}>{alert.timeframe}</span>}
        {alert.strategy && <span style={{ ...metaChip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{alert.strategy}</span>}
      </div>

      {/* Outcome — automatic when the alert carries an exit/result; the buttons
          are just a manual fallback for alerts that arrive without an exit. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, marginRight: 2 }}>Result</span>
        {res && !editResult ? (
          <>
            <span style={{ ...badge, color: '#0c2768', background: res.color, border: `1px solid ${res.color}` }}>{res.label}</span>
            <span style={{ fontSize: 9, letterSpacing: '0.4px', textTransform: 'uppercase', color: FAINT }}>auto</span>
            <button onClick={() => setEditResult(true)} style={{ ...tagBtn, color: FAINT, border: `1px solid ${BORDER2}`, marginLeft: 2 }}>change</button>
          </>
        ) : (
          <>
            {!res && <span style={{ fontSize: 10, color: FAINT, marginRight: 2 }}>auto-fills when your alert sends the exit — or set it:</span>}
            {(['win', 'loss', 'breakeven'] as const).map((r) => {
              const on = alert.result === r;
              const c = RESULT[r].color;
              return (
                <button
                  key={r}
                  onClick={() => { void tag(on ? null : r); setEditResult(false); }}
                  disabled={busy}
                  style={{ ...tagBtn, color: on ? '#0c2768' : c, background: on ? c : 'transparent', border: `1px solid ${c}`, opacity: busy ? 0.6 : 1 }}
                >
                  {RESULT[r].label}
                </button>
              );
            })}
            {alert.result && (
              <button onClick={() => { void tag(null); setEditResult(false); }} disabled={busy} style={{ ...tagBtn, color: FAINT, border: `1px solid ${BORDER2}` }}>Clear</button>
            )}
            {res && editResult && (
              <button onClick={() => setEditResult(false)} style={{ ...tagBtn, color: FAINT, border: `1px solid ${BORDER2}` }}>done</button>
            )}
          </>
        )}
      </div>

      {/* Hypothetical (this alert) vs. the actual trade it's tied to */}
      {alert.linkedTrade ? (
        <div style={{ margin: '0 16px 12px', border: `1px solid ${BORDER2}`, borderRadius: 8, background: PANEL, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>Actual trade</span>
            <span style={{ ...badge, color: GREEN, border: `1px solid ${GREEN}` }}>{alert.linkedTrade.status.toUpperCase()}</span>
            <button onClick={() => void onViewTrade()} style={{ ...ghostBtn, padding: '4px 9px', fontSize: 10.5 }}>Trade Log →</button>
            <button onClick={() => void unlink()} disabled={busy} style={{ ...ghostBtn, marginLeft: 'auto', padding: '4px 9px', fontSize: 10.5 }}>Unlink</button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Field label="Planned" value={alert.price == null ? '—' : fmtPrice(alert.price)} />
            <Field label="Fill" value={fmtPrice(alert.linkedTrade.entryPrice)} strong />
            <Field label="Slippage" value={fmtSigned(alert.linkedTrade.slippage)} />
            <Field label="Exit" value={alert.linkedTrade.exitPrice == null ? '—' : fmtPrice(alert.linkedTrade.exitPrice)} />
            <Field label="Real P&L" value={fmtMoney(alert.linkedTrade.realizedPl)} />
          </div>
          <div style={{ fontSize: 10, color: FAINT, marginTop: 7 }}>
            Paper {alert.pnl == null ? '—' : `${fmtSigned(alert.pnl)} pts`} · actual {fmtMoney(alert.linkedTrade.realizedPl)}
          </div>
        </div>
      ) : (
        alert.status !== 'dismissed' && (
          <div style={{ padding: '0 16px 12px' }}>
            {!linking ? (
              <button onClick={() => void openPicker()} disabled={busy} style={{ ...ghostBtn, padding: '6px 11px', fontSize: 11 }}>
                Link a real trade…
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  onChange={(e) => e.target.value && void linkTrade(e.target.value)}
                  disabled={busy || trades == null}
                  defaultValue=""
                  style={{ background: '#0d1f44', border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT, fontSize: 11.5, padding: '7px 9px', maxWidth: '100%' }}
                >
                  <option value="" disabled>
                    {trades == null ? 'Loading trades…' : trades.length ? 'Choose a trade…' : 'No trades logged yet'}
                  </option>
                  {trades?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.instrument} {t.side === 'long' ? 'L' : 'S'} @ {fmtPrice(t.entryPrice)} · {etTime(t.openedAt)}
                    </option>
                  ))}
                </select>
                <button onClick={() => setLinking(false)} style={{ ...ghostBtn, padding: '6px 11px', fontSize: 11 }}>Cancel</button>
              </div>
            )}
          </div>
        )
      )}
      {alert.message && (
        <div style={{ padding: '0 16px 10px', fontSize: 11.5, color: '#8fa3cc', fontStyle: 'italic' }}>“{alert.message}”</div>
      )}

      {error && <div style={{ ...warnBanner, margin: '0 16px 10px' }}>{error}</div>}

      {/* Analysis (when done) or the paste/analyze flow (when new) */}
      {analyzed && alert.analysis ? (
        <Analysis analysis={alert.analysis.parsed} raw={alert.analysis.raw} model={alert.analysis.model} hasTrade={!!alert.tradeId} onViewTrade={onViewTrade} />
      ) : (
        <div style={{ padding: '0 16px 14px' }}>
          <div
            tabIndex={0}
            onPaste={onPaste}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `1px dashed ${BORDER2}`,
              borderRadius: 10,
              background: PANEL,
              padding: image ? 8 : '22px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {image ? (
              <img src={image} alt="screenshot preview" style={{ maxWidth: '100%', maxHeight: isPhone ? 200 : 320, borderRadius: 6, display: 'block', margin: '0 auto' }} />
            ) : (
              <div style={{ fontSize: 12.5, color: MUTED }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📋</div>
                Paste a chart screenshot here (Ctrl/Cmd-V), or click to upload.
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => readImage(e.target.files?.[0])}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              onClick={analyze}
              disabled={busy || !image || !aiConfigured}
              title={!aiConfigured ? 'Claude API key not configured on the server' : undefined}
              style={{ ...goldBtn, opacity: busy || !image || !aiConfigured ? 0.55 : 1 }}
            >
              {busy ? 'Analyzing…' : 'Analyze with Opus 4.8'}
            </button>
            {image && (
              <button onClick={() => setImage(null)} style={ghostBtn}>Clear image</button>
            )}
            <button onClick={dismiss} disabled={busy} style={{ ...ghostBtn, marginLeft: 'auto' }}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Analysis({
  analysis,
  raw,
  model,
  hasTrade,
  onViewTrade,
}: {
  analysis: TradeAnalysis | null;
  raw: string;
  model: string;
  hasTrade: boolean;
  onViewTrade: () => void;
}) {
  const v = analysis ? VERDICT[analysis.verdict] : null;
  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, background: PANEL, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>Claude analysis</span>
        {v && <span style={{ ...badge, color: v.color, border: `1px solid ${v.color}` }}>{v.label}</span>}
        <span style={{ fontSize: 9.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace", marginLeft: 'auto' }}>{model}</span>
      </div>

      {analysis ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{analysis.summary}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
            <Field label="Planned" value={analysis.plannedEntry == null ? '—' : fmtPrice(analysis.plannedEntry)} />
            <Field label="Fill" value={analysis.actualFill == null ? '—' : fmtPrice(analysis.actualFill)} strong />
            <Field label="Exit" value={analysis.exit == null ? '—' : fmtPrice(analysis.exit)} />
          </div>
          <Row label="Slippage" text={analysis.slippage} />
          <Row label="Setup" text={analysis.setupQuality} />
          <Row label="Risk" text={analysis.risk} />
        </>
      ) : (
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: MUTED, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{raw}</p>
      )}

      {hasTrade && (
        <button onClick={onViewTrade} style={{ ...ghostBtn, marginTop: 8 }}>View in Trade Log →</button>
      )}
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
    </span>
  );
}

function Row({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div style={{ fontSize: 12, color: MUTED, marginBottom: 5, lineHeight: 1.5 }}>
      <span style={{ color: FAINT, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.5px', marginRight: 7 }}>{label}</span>
      {text}
    </div>
  );
}

// Per-strategy scoreboard that grows as outcomes are tagged.
function StrategyMetrics({ strategies }: { strategies: StrategyStat[] }) {
  if (strategies.length === 0) return null;
  const cols = ['Strategy', 'Trades', 'W', 'L', 'B/E', 'Win %', 'Net P&L', 'Avg', 'PF', 'Open'];
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 13 }}>
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Strategy metrics</span>
        <span style={{ fontSize: 11, color: FAINT }}>win rate, P&L and profit factor per strategy</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map((s) => (
              <tr key={s.strategy}>
                <td style={{ ...td, textAlign: 'left', color: GOLD, fontWeight: 600 }}>{s.strategy}</td>
                <td style={tdNum}>{s.trades}</td>
                <td style={{ ...tdNum, color: GREEN }}>{s.wins}</td>
                <td style={{ ...tdNum, color: RED }}>{s.losses}</td>
                <td style={tdNum}>{s.breakeven}</td>
                <td style={{ ...tdNum, color: s.winRate == null ? FAINT : s.winRate >= 50 ? GREEN : RED, fontWeight: 700 }}>
                  {s.winRate == null ? '—' : `${s.winRate}%`}
                </td>
                <td style={{ ...tdNum, color: s.totalPnl == null ? FAINT : s.totalPnl > 0 ? GREEN : s.totalPnl < 0 ? RED : TEXT }}>
                  {s.totalPnl == null ? '—' : fmtSigned(s.totalPnl)}
                </td>
                <td style={tdNum}>{s.avgPnl == null ? '—' : fmtSigned(s.avgPnl)}</td>
                <td style={tdNum}>{s.profitFactor == null ? '—' : s.profitFactor.toFixed(2)}</td>
                <td style={{ ...tdNum, color: FAINT }}>{s.open || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Backfill a past trade by hand so the metrics cover trades that never came
// through the webhook.
function ManualAddForm({ onAdded, onCancel }: { onAdded: (d: AlertsData) => void; onCancel: () => void }) {
  const [strategy, setStrategy] = useState('');
  const [instrument, setInstrument] = useState('');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [result, setResult] = useState<TradeResult | ''>('');
  const [pnl, setPnl] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  async function submit() {
    if (!strategy.trim() && !instrument.trim()) {
      setError('Add at least a strategy or an instrument.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const occurredAt = date ? new Date(`${date}T12:00:00`).getTime() : null;
      onAdded(
        await api.addManualAlert({
          strategy: strategy.trim() || null,
          instrument: instrument.trim() || null,
          side,
          entry: numOrNull(entry),
          exit: numOrNull(exit),
          result: result || null,
          pnl: numOrNull(pnl),
          occurredAt,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add trade');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, marginBottom: 13 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Add a past trade</div>
      <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
        Enter what you know. Leave the result blank and it’s inferred from entry vs. exit; leave P&L blank and it’s computed in price points.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy" style={{ ...input, flex: '1 1 160px' }} />
        <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument (e.g. BTCUSD)" style={{ ...input, flex: '1 1 150px' }} />
        <select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')} style={{ ...input, flex: '0 0 100px' }}>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" placeholder="Entry price" style={{ ...input, flex: '1 1 110px' }} />
        <input value={exit} onChange={(e) => setExit(e.target.value)} inputMode="decimal" placeholder="Exit price" style={{ ...input, flex: '1 1 110px' }} />
        <select value={result} onChange={(e) => setResult(e.target.value as TradeResult | '')} style={{ ...input, flex: '0 0 130px' }}>
          <option value="">Result: auto</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="breakeven">Break-even</option>
        </select>
        <input value={pnl} onChange={(e) => setPnl(e.target.value)} inputMode="decimal" placeholder="P&L (optional)" style={{ ...input, flex: '1 1 110px' }} />
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={{ ...input, flex: '0 0 150px' }} />
      </div>
      {error && <div style={{ ...warnBanner, margin: '10px 0 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={submit} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Adding…' : 'Add trade'}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '9px 15px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '9px 12px', borderRadius: 7, cursor: 'pointer' };
const badge: CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '0.6px', borderRadius: 4, padding: '2px 6px' };
const tagBtn: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '0.5px', borderRadius: 4, padding: '3px 9px', cursor: 'pointer', background: 'transparent' };
const th: CSSProperties = { fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, fontWeight: 600, padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '7px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, whiteSpace: 'nowrap' };
const tdNum: CSSProperties = { ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" };
const input: CSSProperties = { background: PANEL, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const metaChip: CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '3px 8px' };
const warnBanner: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', marginBottom: 14 };
