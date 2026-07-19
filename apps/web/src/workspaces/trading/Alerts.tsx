import { useEffect, useRef, useState, type CSSProperties, type ClipboardEvent, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePushNotifications } from '../../push/usePushNotifications';
import { EditableText } from '../../copy/SiteCopy';
import { ScreenTitle } from './ScreenTitle';
import type { AlertRecord, AlertsData, SessionAlertPrefs, TradeAnalysis } from '../../api/types';

// Trading navy/gold palette — matches the Live Wall / Trade Log.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
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

const VERDICT: Record<TradeAnalysis['verdict'], { label: string; color: string }> = {
  good: { label: 'Good', color: GREEN },
  acceptable: { label: 'Acceptable', color: GOLD },
  poor: { label: 'Poor', color: RED },
  unclear: { label: 'Unclear', color: MUTED },
};

export function Alerts({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [data, setData] = useState<AlertsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}><EditableText id="alerts.loading">Loading alerts…</EditableText></div>;

  const active = data.alerts.filter((a) => a.status !== 'dismissed');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <ScreenTitle id="alerts.title">Trading Alerts</ScreenTitle>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            <EditableText id="alerts.subtitle">TradingView alerts arrive by webhook. Paste a chart screenshot and VTS AI analyzes the trade.</EditableText>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!readOnly && <PhoneAlerts />}
          <button onClick={() => void load()} disabled={refreshing} style={{ ...goldBtn, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? <EditableText id="alerts.refreshing">Refreshing…</EditableText> : <EditableText id="alerts.refresh">Refresh</EditableText>}
          </button>
        </div>
      </div>

      {!data.aiConfigured && (
        <div style={warnBanner}>
          <EditableText id="alerts.ai_unconfigured">VTS AI isn’t configured yet — alerts still arrive, but screenshot analysis needs an API key set on the server.</EditableText>
        </div>
      )}

      {!readOnly && <SessionAlertSettings />}

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
              readOnly={readOnly}
              onChanged={setData}
              onViewTrade={() => onNavigate('desk')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The opt-in control for phone push. Each device enables it once; after that
// the desk's alerts and trade open/close events buzz the phone even when the
// app is closed. On iOS this only works once the portal is installed to the
// Home Screen (Share → Add to Home Screen), so we surface that hint.
function PhoneAlerts() {
  const { state, busy, error, enable, disable, sendTest } = usePushNotifications();
  const [open, setOpen] = useState(false);

  if (state === 'unsupported') return null;

  const on = state === 'on';
  const label =
    state === 'unconfigured'
      ? 'Alerts unavailable'
      : state === 'denied'
        ? '🔔 Blocked'
        : on
          ? '🔔 Phone alerts on'
          : '🔔 Phone alerts';

  const disabled = busy || state === 'unconfigured' || state === 'denied';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => (on ? setOpen((v) => !v) : void enable())}
        disabled={disabled}
        title={
          state === 'unconfigured'
            ? 'Push is not configured on the server yet'
            : state === 'denied'
              ? 'Notifications are blocked — enable them for this site in your browser/phone settings'
              : 'Get trade and alert notifications on this device'
        }
        style={{ ...ghostBtn, color: on ? GREEN : '#dfe7fa', borderColor: on ? GREEN : BORDER2, opacity: disabled ? 0.6 : 1 }}
      >
        {busy ? 'Working…' : label}
      </button>
      {on && open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, width: 230, background: '#0b1a3a', border: `1px solid ${BORDER2}`, borderRadius: 10, padding: 12, boxShadow: '0 18px 40px rgba(0,0,0,.5)' }}>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>
            <EditableText id="alerts.push_blurb">This device will buzz on new alerts and when trades open or close.</EditableText>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => void sendTest()} style={{ ...ghostBtn, flex: 1 }}><EditableText id="alerts.send_test">Send test</EditableText></button>
            <button onClick={() => { setOpen(false); void disable(); }} style={{ ...ghostBtn, flex: 1, color: '#ff9a9a' }}><EditableText id="alerts.turn_off">Turn off</EditableText></button>
          </div>
        </div>
      )}
      {error && <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, width: 230, fontSize: 11, color: '#ffb4ab' }}>{error}</div>}
    </div>
  );
}

// Strategy Session notifications: buzz me when one of my sessions opens or
// closes, and/or a set number of minutes before it opens. Persists to the
// server, which fires them on the session's own schedule (needs phone alerts on
// for a device to actually buzz). Independent of the per-trade notification
// prefs in device settings.
function SessionAlertSettings() {
  const [prefs, setPrefs] = useState<SessionAlertPrefs | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.sessionAlertPrefs()
      .then((r) => { if (alive) setPrefs(r.prefs); })
      .catch(() => { if (alive) setPrefs({ notifyOpen: false, notifyClose: false, notifyPreOpen: false, preOpenLeadMin: 30 }); });
    return () => { alive = false; };
  }, []);

  async function persist(next: SessionAlertPrefs) {
    setPrefs(next);
    setStatus('saving');
    try {
      const r = await api.saveSessionAlertPrefs(next);
      setPrefs(r.prefs);
      setStatus('saved');
      window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch {
      setStatus('error');
    }
  }

  if (!prefs) return null;

  const anyOn = prefs.notifyOpen || prefs.notifyClose || prefs.notifyPreOpen;
  const lead = prefs.preOpenLeadMin;

  return (
    <div style={{ ...card, marginBottom: 14, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', color: TEXT, cursor: 'pointer', padding: '13px 16px', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>🔔 <EditableText id="alerts.session_title">Strategy session alerts</EditableText></span>
          {anyOn && <span style={{ ...badge, color: GREEN, border: `1px solid ${GREEN}` }}>ON</span>}
        </div>
        <span style={{ fontSize: 12, color: FAINT }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
            <EditableText id="alerts.session_blurb">Get notified when your Strategy Sessions open and close, and ahead of time before they start. Turn on phone alerts above so a device actually buzzes.</EditableText>
          </div>
          <ToggleRow
            label={<EditableText id="alerts.session_pre">Before a session opens</EditableText>}
            on={prefs.notifyPreOpen}
            onChange={(v) => persist({ ...prefs, notifyPreOpen: v })}
          />
          {prefs.notifyPreOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 12px', paddingLeft: 4, fontSize: 12, color: MUTED }}>
              <EditableText id="alerts.session_lead_pre">Notify me</EditableText>
              <input
                type="number"
                min={1}
                max={240}
                value={lead}
                onChange={(e) => setPrefs({ ...prefs, preOpenLeadMin: Math.max(1, Math.min(240, Number(e.target.value) || 0)) })}
                onBlur={() => persist({ ...prefs, preOpenLeadMin: Math.max(1, Math.min(240, lead || 30)) })}
                style={{ ...numInput }}
              />
              <EditableText id="alerts.session_lead_post">minutes before it opens</EditableText>
            </div>
          )}
          <ToggleRow
            label={<EditableText id="alerts.session_open">When a session opens</EditableText>}
            on={prefs.notifyOpen}
            onChange={(v) => persist({ ...prefs, notifyOpen: v })}
          />
          <ToggleRow
            label={<EditableText id="alerts.session_close">When a session closes</EditableText>}
            on={prefs.notifyClose}
            onChange={(v) => persist({ ...prefs, notifyClose: v })}
          />
          <div style={{ fontSize: 11, color: status === 'error' ? '#ffb4ab' : FAINT, marginTop: 6, minHeight: 14 }}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save — try again.' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, on, onChange }: { label: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 13, color: TEXT }}>{label}</span>
      <button
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          border: `1px solid ${on ? GREEN : BORDER2}`,
          background: on ? 'rgba(53,196,123,.25)' : INPUT_BG,
          position: 'relative',
          cursor: 'pointer',
          flex: '0 0 auto',
          transition: 'background .15s ease, border-color .15s ease',
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: on ? GREEN : FAINT, transition: 'left .15s ease' }} />
      </button>
    </div>
  );
}

function AlertCard({
  alert,
  isPhone,
  aiConfigured,
  readOnly,
  onChanged,
  onViewTrade,
}: {
  alert: AlertRecord;
  isPhone: boolean;
  aiConfigured: boolean;
  readOnly: boolean;
  onChanged: (d: AlertsData) => void;
  onViewTrade: () => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const long = alert.side === 'long';
  const sideColor = alert.side ? (long ? GREEN : RED) : MUTED;
  const analyzed = alert.status === 'analyzed';

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

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', borderLeft: `3px solid ${sideColor}` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{alert.instrument ?? 'Alert'}</span>
          {alert.side && <span style={{ ...badge, color: sideColor, border: `1px solid ${sideColor}` }}>{long ? 'LONG' : 'SHORT'}</span>}
          <span style={{ ...badge, color: analyzed ? GREEN : GOLD, border: `1px solid ${analyzed ? GREEN : GOLD}` }}>
            {analyzed ? 'ANALYZED' : 'NEW'}
          </span>
        </div>
        <span style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace" }}>{etTime(alert.receivedAt)} ET</span>
      </div>

      {/* Alert meta */}
      <div style={{ display: 'flex', gap: 16, padding: '0 16px 10px', flexWrap: 'wrap', fontSize: 12, color: MUTED }}>
        {alert.price != null && <span>Alert price <b style={{ color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtPrice(alert.price)}</b></span>}
        {alert.timeframe && <span style={metaChip}>{alert.timeframe}</span>}
        {alert.strategy && <span style={{ ...metaChip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{alert.strategy}</span>}
      </div>
      {alert.message && (
        <div style={{ padding: '0 16px 10px', fontSize: 11.5, color: '#8fa3cc', fontStyle: 'italic' }}>“{alert.message}”</div>
      )}

      {error && <div style={{ ...warnBanner, margin: '0 16px 10px' }}>{error}</div>}

      {/* Analysis (when done) or the paste/analyze flow (when new). The demo and
          view-only roles can read analyzed alerts but cannot run the analyzer. */}
      {analyzed && alert.analysis ? (
        <Analysis analysis={alert.analysis.parsed} raw={alert.analysis.raw} model={alert.analysis.model} hasTrade={!!alert.tradeId} onViewTrade={onViewTrade} />
      ) : readOnly ? (
        <div style={{ padding: '0 16px 14px', fontSize: 12, color: FAINT }}><EditableText id="alerts.awaiting">Awaiting screenshot analysis.</EditableText></div>
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
                <EditableText id="alerts.paste_hint">Paste a chart screenshot here (Ctrl/Cmd-V), or click to upload.</EditableText>
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
              title={!aiConfigured ? 'VTS AI API key not configured on the server' : undefined}
              style={{ ...goldBtn, opacity: busy || !image || !aiConfigured ? 0.55 : 1 }}
            >
              {busy ? <EditableText id="alerts.analyzing">Analyzing…</EditableText> : <EditableText id="alerts.analyze">Analyze with VTS AI</EditableText>}
            </button>
            {image && (
              <button onClick={() => setImage(null)} style={ghostBtn}><EditableText id="alerts.clear_image">Clear image</EditableText></button>
            )}
            <button onClick={dismiss} disabled={busy} style={{ ...ghostBtn, marginLeft: 'auto' }}><EditableText id="alerts.dismiss">Dismiss</EditableText></button>
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
        <span style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>VTS AI analysis</span>
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
        <button onClick={onViewTrade} style={{ ...ghostBtn, marginTop: 8 }}><EditableText id="alerts.view_trade">View in Trade Log →</EditableText></button>
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

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '9px 15px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '9px 12px', borderRadius: 7, cursor: 'pointer' };
const badge: CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '0.6px', borderRadius: 4, padding: '2px 6px' };
const numInput: CSSProperties = { width: 64, background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT, fontSize: 12.5, padding: '5px 8px', outline: 'none', textAlign: 'center' };
const metaChip: CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '3px 8px' };
const warnBanner: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', marginBottom: 14 };
