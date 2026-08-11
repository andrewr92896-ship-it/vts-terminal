import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError, type WidgetTokenStatus } from '../api/client';
import { canAccessWorkspace, isWorkspaceReadOnly, tierOfFeature } from '../auth/access';
import { TierMark } from './TierMark';
import { ReviewMark } from './ReviewMark';
import { sectionLabel, inputStyle, hintStyle } from './NotificationSettings';
import { BrokerConnectionsPanel } from '../workspaces/trading/BrokerConnectionsPanel';
import { ownerHandle } from '../workspaces/trading/TradeCard';
import { getDisplayZone } from '../lib/timezone';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';

// The per-device / account-connection controls that are NOT alerts: the iPhone
// home-screen positions widget, and broker connections. Rendered inline in My
// Terminal ▸ Settings.
//
// Everything that buzzes you moved out to Advanced Trading ▸ Alert Settings
// (owner instruction, 2026-08) — phone notifications, Pushover and the
// per-trade toggles now live in components/NotificationSettings.tsx and are
// rendered there. This file keeps the two panels that answer a different
// question: what your phone SHOWS, and which brokers you are connected to.
export function NotificationsConnectionsPanel({ theme }: { theme: Theme }) {
  const { user } = useAuth();
  const accentGrad = accentGradient(theme);
  const isDemo = !!user?.isDemo;

  if (!user) return null;

  // Both panels here are the trading desk, so they need the Advanced Trading
  // opt-in. `features` is NOT optional even though the signature allows it:
  // canAccessWorkspace reads advancedTrading off it and returns false for
  // everyone when it is missing, which is exactly how this whole panel — push,
  // Pushover, the widget and broker connections — once went invisible for every
  // account at once. Always pass it.
  const canManageBrokers =
    canAccessWorkspace(user.roles, 'trading', user.access.features) &&
    !isWorkspaceReadOnly(user.roles, 'trading');

  if (!canManageBrokers) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* The positions widget. Never for the demo, which has no token to mint. */}
      {!isDemo && <HomeScreenWidgetSection accent={accentGrad} accentText={theme.accentText} />}

      <section>
        {!isDemo && <div style={{ height: 1, background: '#1d3560', marginBottom: 24 }} />}
        {/* Connecting a broker is paid — it takes a credential of the user's
            own, which is what puts it at the top tier. Reading the panel and
            disconnecting stay open regardless, so a lapsed member is never left
            with a key stranded in the database. */}
        <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Broker connections</span>
          <TierMark tier={tierOfFeature('brokerConnections', user?.access.membership)} size={12} />
          <ReviewMark id="brokerConnections" size={12} />
        </div>
        <BrokerConnectionsPanel />
      </section>
    </div>
  );
}

// Build the ready-to-paste Scriptable script, with the caller's terminal origin,
// their freshly-generated read-only token, and the clock they read the terminal
// on baked in. The script itself uses only string concatenation (no template
// literals), so the three ${...} below are the only interpolations. The zone is
// stamped in at generation time the same way the token is — change it in
// Preferences and the widget needs re-copying to follow. It renders one teammate's open positions styled like
// the Live Wall TradeCard; each home-screen widget instance picks whose via its
// Scriptable "Parameter" (a teammate handle; blank = the whole team).
function buildScriptableScript(origin: string, token: string, zone: string): string {
  return `// VTS Terminal — Open Positions widget
// One widget = one person: long-press → "Edit Widget" → set Parameter to a
// teammate's handle (e.g. dale). Leave it blank for the whole team.
//   • Large  — up to 3 position cards (a single one shows full detail)
//   • Medium — a compact row for everyone (or the chosen person)
//   • Small  — just your own top position, clean (or the chosen person's)
const BASE = "${origin}";
const TZ = "${zone}";
const TOKEN = "${token}";
const PARAM = (args.widgetParameter||"").trim();

const C = {
  navy: new Color("#0a1a3c"), card: new Color("#112a56"), text: new Color("#eef3ff"),
  muted: new Color("#9fb0d6"), faint: new Color("#6f84b0"),
  green: new Color("#35c47b"), red: new Color("#ef5468"), gold: new Color("#ebcb74"),
};
function money(n){ const s = Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); return (n<0?"-$":"$")+s; }
function pips(n){ const s = Math.abs(n).toFixed(1); return (n>0?"+":n<0?"-":"")+s+" pip"+(Math.abs(n)===1?"":"s"); }
function price(n){ if(n===null||n===undefined) return "—"; if(Math.abs(n)>=1000) return n.toLocaleString("en-US",{maximumFractionDigits:2}); return String(Number(n.toFixed(5))); }
function since(ms){ if(!ms) return ""; let m = Math.max(0, Math.round((Date.now()-ms)/60000)); if(m<60) return m+"m ago"; const h=Math.floor(m/60); m=m%60; return m? h+"h "+m+"m ago" : h+"h ago"; }
// When the position opened, on the clock the site was set to when this script
// was copied — same stamp it shows beside "5h 18m ago" on every position.
function stamp(ms){ if(!ms) return ""; return new Date(ms).toLocaleString("en-US",{timeZone:TZ,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }

async function loadData(){
  let url = BASE + "/api/widget/positions";
  if(PARAM) url += "?owner=" + encodeURIComponent(PARAM);
  const req = new Request(url);
  req.headers = { "Authorization": "Bearer " + TOKEN };
  req.timeoutInterval = 15;
  return await req.loadJSON();
}
function pill(s, text, color){ const p=s.addStack(); p.cornerRadius=4; p.borderWidth=1; p.borderColor=color; p.setPadding(1,5,1,5); const t=p.addText(text); t.font=Font.boldSystemFont(9); t.textColor=color; }
function field(row, label, value, color){ const c=row.addStack(); c.layoutVertically(); const l=c.addText(label.toUpperCase()); l.font=Font.systemFont(7.5); l.textColor=C.faint; const v=c.addText(value); v.font=Font.regularMonospacedSystemFont(11); v.textColor=color||C.text; }

function renderCard(w, p, detailed){
  const long = p.side==="long";
  const sideColor = long?C.green:C.red;
  const card = w.addStack(); card.layoutVertically(); card.backgroundColor=C.card; card.cornerRadius=10; card.setPadding(9,11,9,11); card.spacing=5;
  const head = card.addStack(); head.centerAlignContent();
  const sym = head.addText(p.instrument); sym.font=Font.boldSystemFont(14); sym.textColor=Color.white();
  head.addSpacer(6); pill(head, long?"LONG":"SHORT", sideColor); head.addSpacer();
  const meta = card.addStack(); meta.centerAlignContent();
  const ow = meta.addText("@"+p.owner); ow.font=Font.mediumSystemFont(9.5); ow.textColor=new Color("#bcd0ff");
  meta.addSpacer(6); const bk = meta.addText(p.brokerName||p.broker); bk.font=Font.systemFont(9.5); bk.textColor=C.muted;
  if(detailed){
    const r1 = card.addStack(); r1.spacing=12; field(r1,"Planned",price(p.plannedEntry)); field(r1,"Fill",price(p.entryPrice));
    const r2 = card.addStack(); r2.spacing=12; field(r2,"TP",price(p.takeProfit),C.green); field(r2,"SL",price(p.stopLoss),C.red);
    if(p.mark!==null&&p.mark!==undefined) field(r2,"Mark",price(p.mark)); field(r2,"Size",String(p.units));
    if(p.forex){
      const fx = card.addStack(); fx.centerAlignContent(); pill(fx,"FOREX",C.gold);
      if(p.forex.moneyPerPip!==null&&p.forex.moneyPerPip!==undefined){ fx.addSpacer(6); const pp=fx.addText(money(p.forex.moneyPerPip)+" / pip"); pp.font=Font.regularMonospacedSystemFont(9.5); pp.textColor=C.muted; }
      if(p.forex.riskPips!==null&&p.forex.riskPips!==undefined){ const rk=card.addStack(); field(rk,"Risk → SL", pips(p.forex.riskPips)+(p.forex.riskMoney!=null?" · "+money(p.forex.riskMoney):""), C.red); }
    }
  }
  const foot = card.addStack(); foot.centerAlignContent();
  const plCol = foot.addStack(); plCol.layoutVertically();
  const pll = plCol.addText("OPEN P/L"); pll.font=Font.systemFont(7.5); pll.textColor=C.faint;
  const plRow = plCol.addStack(); plRow.centerAlignContent();
  if(p.unrealizedPl===null||p.unrealizedPl===undefined){ const t=plRow.addText("—"); t.font=Font.regularMonospacedSystemFont(13); t.textColor=C.muted; }
  else { const up=p.unrealizedPl>=0; const t=plRow.addText((up?"+":"")+money(p.unrealizedPl)); t.font=Font.boldSystemFont(14); t.textColor=up?C.green:C.red; }
  if(p.forex && p.forex.pipsOpen!==null && p.forex.pipsOpen!==undefined){ plRow.addSpacer(6); const pp=plRow.addText(pips(p.forex.pipsOpen)); pp.font=Font.regularMonospacedSystemFont(10.5); pp.textColor=p.forex.pipsOpen>=0?C.green:C.red; }
  foot.addSpacer();
  const when=foot.addStack(); when.layoutVertically(); when.spacing=1;
  const at=when.addText(stamp(p.openedAt)); at.font=Font.regularMonospacedSystemFont(9); at.textColor=C.muted; at.rightAlignText(); at.lineLimit=1;
  const ago=when.addText(since(p.openedAt)); ago.font=Font.regularMonospacedSystemFont(9); ago.textColor=C.faint; ago.rightAlignText(); ago.lineLimit=1;
}

// Compact single-line row — used by the MEDIUM widget to fit several people.
function renderRow(w, p){
  const long = p.side==="long"; const sideColor = long?C.green:C.red;
  const dotColor = sideColor;
  const row = w.addStack(); row.centerAlignContent(); row.setPadding(3,0,3,0);
  const dot = row.addStack(); dot.size = new Size(7,7); dot.cornerRadius = 4; dot.backgroundColor = dotColor;
  row.addSpacer(7);
  const sym = row.addText(p.instrument); sym.font=Font.boldSystemFont(12.5); sym.textColor=Color.white(); sym.lineLimit=1;
  row.addSpacer(5);
  const sd = row.addText(long?"LONG":"SHORT"); sd.font=Font.boldSystemFont(8.5); sd.textColor=sideColor;
  row.addSpacer(7);
  const ow = row.addText("@"+p.owner); ow.font=Font.systemFont(10); ow.textColor=C.muted; ow.lineLimit=1;
  row.addSpacer(7);
  const at = row.addText(stamp(p.openedAt)); at.font=Font.regularMonospacedSystemFont(9); at.textColor=C.faint; at.lineLimit=1;
  row.addSpacer();
  const plCol = row.addStack(); plCol.layoutVertically(); plCol.spacing=1;
  if(p.unrealizedPl===null||p.unrealizedPl===undefined){ const t=plCol.addText("—"); t.font=Font.regularMonospacedSystemFont(12); t.textColor=C.muted; t.rightAlignText(); }
  else { const up=p.unrealizedPl>=0; const t=plCol.addText((up?"+":"")+money(p.unrealizedPl)); t.font=Font.boldSystemFont(12.5); t.textColor=up?C.green:C.red; t.rightAlignText(); }
  if(p.forex && p.forex.pipsOpen!==null && p.forex.pipsOpen!==undefined){ const pp=plCol.addText(pips(p.forex.pipsOpen)); pp.font=Font.regularMonospacedSystemFont(8.5); pp.textColor=p.forex.pipsOpen>=0?C.green:C.red; pp.rightAlignText(); }
}

// Clean single-position layout — used by the SMALL widget (no cramped detail).
function renderSolo(w, p){
  const long = p.side==="long"; const sideColor = long?C.green:C.red;
  const head = w.addStack(); head.centerAlignContent();
  const sym = head.addText(p.instrument); sym.font=Font.boldSystemFont(16); sym.textColor=Color.white(); sym.minimumScaleFactor=0.7; sym.lineLimit=1;
  head.addSpacer(6); pill(head, long?"LONG":"SHORT", sideColor);
  w.addSpacer(4);
  if(p.unrealizedPl===null||p.unrealizedPl===undefined){ const t=w.addText("—"); t.font=Font.boldSystemFont(24); t.textColor=C.muted; }
  else { const up=p.unrealizedPl>=0; const t=w.addText((up?"+":"")+money(p.unrealizedPl)); t.font=Font.boldSystemFont(24); t.textColor=up?C.green:C.red; t.minimumScaleFactor=0.5; t.lineLimit=1; }
  if(p.forex && p.forex.pipsOpen!==null && p.forex.pipsOpen!==undefined){ const pp=w.addText(pips(p.forex.pipsOpen)); pp.font=Font.regularMonospacedSystemFont(12); pp.textColor=p.forex.pipsOpen>=0?C.green:C.red; }
  w.addSpacer();
  const foot = w.addText("@"+p.owner+" · "+(p.brokerName||p.broker)); foot.font=Font.systemFont(9.5); foot.textColor=C.faint; foot.lineLimit=1;
  const at = w.addText(stamp(p.openedAt)); at.font=Font.regularMonospacedSystemFont(9); at.textColor=C.muted; at.lineLimit=1;
  const ago = w.addText(since(p.openedAt)); ago.font=Font.regularMonospacedSystemFont(9); ago.textColor=C.faint;
}

const fam = config.widgetFamily || "large";
const w = new ListWidget(); w.backgroundColor=C.navy; w.spacing=7;
w.setPadding(fam==="small"?12:11, fam==="small"?13:11, fam==="small"?12:11, fam==="small"?13:11);
let data = null;
try { data = await loadData(); } catch(e) { data = null; }
if(!data || !data.positions){
  const t=w.addText("Couldn't load positions"); t.font=Font.mediumSystemFont(13); t.textColor=C.muted;
  const h=w.addText("Check your token / connection"); h.font=Font.systemFont(10); h.textColor=C.faint;
} else if(data.source==="unavailable"){
  // The broker is not being read. "No open positions" would be a claim about
  // the book, and the book was never read — on a Home Screen widget, with no
  // surrounding screen to qualify it, that reads as "you are flat".
  const t=w.addText("Broker not connected"); t.font=Font.mediumSystemFont(13); t.textColor=C.red;
  const h=w.addText("Positions can't be shown. Reconnect it in the terminal."); h.font=Font.systemFont(10); h.textColor=C.faint;
} else if(data.positions.length===0){
  const t=w.addText(PARAM?("No open positions for @"+PARAM):"No open positions"); t.font=Font.mediumSystemFont(13); t.textColor=C.muted;
} else if(fam==="small"){
  // Small = one clean position. With no parameter, focus on YOUR own trade;
  // with a parameter it's already that person's, so show their top position.
  let focus = data.positions;
  if(!PARAM){ const mine = data.positions.filter(function(p){ return p.isSelf; }); if(mine.length) focus = mine; }
  renderSolo(w, focus[0]);
} else if(fam==="medium"){
  // Medium = a compact row per position for everyone (or the chosen person).
  w.spacing = 5;
  const list = data.positions.slice(0, 4);
  for(let i=0;i<list.length;i++){ renderRow(w, list[i]); }
  if(data.positions.length>4){ const more=w.addText("+"+(data.positions.length-4)+" more"); more.font=Font.systemFont(9); more.textColor=C.faint; }
} else {
  // Large / extra-large = up to 3 full cards (detailed when it's a single one).
  const list = data.positions.slice(0, 3);
  for(let i=0;i<list.length;i++){ renderCard(w, list[i], list.length===1); }
  if(data.positions.length>3){ const more=w.addText("+"+(data.positions.length-3)+" more"); more.font=Font.systemFont(9.5); more.textColor=C.faint; }
}
// Ask iOS to refresh in ~5 minutes. iOS clamps this to its own widget budget
// (roughly 40–70 reloads/day), so it refreshes as close to every 5 min as it
// allows — more often while you're actively using the phone, less when idle.
w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
if(config.runsInApp){ await w.presentLarge(); }
Script.setWidget(w);
Script.complete();
`;
}

// Home-screen widget setup: generate a read-only token, copy the ready-made
// Scriptable script (token + this terminal's URL baked in), and see which handle
// to type per widget. The token authenticates the phone widget's read-only
// positions feed and nothing else; revoking it kills the widget instantly.
function HomeScreenWidgetSection({ accent, accentText }: { accent: string; accentText: string }) {
  const [status, setStatus] = useState<WidgetTokenStatus | null>(null);
  const [token, setToken] = useState<string | null>(null); // shown once, right after generating
  const [people, setPeople] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'token' | 'script' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.widgetTokenStatus().then((s) => alive && setStatus(s)).catch(() => alive && setStatus({ exists: false, createdAt: null, lastUsedAt: null }));
    // Best-effort: list handles of teammates who currently have open positions,
    // so the user knows what to type as each widget's parameter.
    api.liveWall().then((w) => {
      if (!alive) return;
      setPeople(Array.from(new Set(w.trades.map((t) => ownerHandle(t.owner)))).sort());
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const script = token ? buildScriptableScript(window.location.origin, token, getDisplayZone()) : '';

  async function copy(what: 'token' | 'script', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
    } catch {
      setError('Couldn’t copy — select and copy manually.');
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateWidgetToken();
      setToken(res.token);
      setStatus({ exists: true, createdAt: Date.now(), lastUsedAt: null });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t generate a token — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await api.revokeWidgetToken();
      setToken(null);
      setStatus({ exists: false, createdAt: null, lastUsedAt: null });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t revoke — try again.');
    } finally {
      setBusy(false);
    }
  }

  const primaryBtn: React.CSSProperties = {
    border: 'none', background: accent, color: accentText, fontWeight: 600, fontSize: 13,
    padding: '10px 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, minHeight: 40,
  };
  const ghost: React.CSSProperties = {
    background: 'rgba(255,255,255,.05)', border: '1px solid #1d3560', color: '#dfe7fa', fontWeight: 600,
    fontSize: 12.5, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', minHeight: 40,
  };

  return (
    <section>
      <div style={sectionLabel}>
        {"Home-screen widget (iPhone)"}
      </div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        {"Put your group’s open positions on your iPhone Home Screen with the free Scriptable app. One widget per person — each shows that person’s positions."}
      </p>

      {!token ? (
        <button onClick={() => void generate()} disabled={busy} style={primaryBtn}>
          {status?.exists ? (
            "Regenerate token &amp; script"
          ) : (
            "Generate widget token"
          )}
        </button>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#f0c674', marginBottom: 8, fontWeight: 600 }}>
            {"Copy your token and script now — you won’t see them again."}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={() => void copy('token', token)} style={ghost}>
              {copied === 'token' ? 'Copied ✓' : "Copy token"}
            </button>
            <button onClick={() => void copy('script', script)} style={{ ...primaryBtn, minHeight: 0 }}>
              {copied === 'script' ? 'Copied ✓' : "Copy Scriptable script"}
            </button>
          </div>
          <textarea
            readOnly
            value={script}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            style={{ ...inputStyle, height: 120, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', whiteSpace: 'pre' }}
          />
        </>
      )}

      {status?.exists && (
        <button onClick={() => void revoke()} disabled={busy} style={{ ...ghost, color: '#ff9a9a', marginTop: 10 }}>
          {"Revoke token"}
        </button>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>
          {"Set it up"}
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#9fb0d6', lineHeight: 1.7 }}>
          <li>{"Install the free Scriptable app from the App Store."}</li>
          <li>{"In Scriptable, tap ＋, paste the script above, and name it “VTS Positions”."}</li>
          <li>{"Long-press your Home Screen → ＋ → Scriptable → pick a size (Large = full cards, Medium = compact list, Small = your top trade) → Add."}</li>
          <li>{"Long-press the new widget → Edit Widget → choose the “VTS Positions” script."}</li>
          <li>{"Set its Parameter to a handle from the list below. Repeat for one widget per person."}</li>
        </ol>
      </div>

      <p style={{ ...hintStyle, marginTop: 12 }}>
        {"The Parameter is the handle shown after “@” on the Live Wall. Leave it blank to show your whole group on one widget."}
      </p>

      {people.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: '#7488b5', marginBottom: 6 }}>
            {"Handles with open positions right now:"}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {people.map((h) => (
              <span key={h} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#bcd0ff', background: 'rgba(120,150,220,.12)', border: '1px solid #1c3a7a', borderRadius: 5, padding: '3px 8px' }}>
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      <p style={{ ...hintStyle, marginTop: 12, marginBottom: 0, fontStyle: 'italic' }}>
        {"Informational only — not investment advice. Positions may be delayed (iOS refreshes widgets roughly every 15 minutes). Your token is read-only and can’t place trades."}
      </p>

      {error && <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 8 }}>{error}</div>}
    </section>
  );
}
