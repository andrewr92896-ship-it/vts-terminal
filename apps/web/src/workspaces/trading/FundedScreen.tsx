import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { usePrivacy } from '../../privacy/privacy';
import { readClipboardImage } from '../../lib/clipboard';
import { FundedManager } from './Funded';
import type { FundedAccount } from '../../api/types';
import { ScreenshotExample } from './ScreenshotExample';

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

// Manual Trades — a self-managed book of accounts you keep by hand. Nothing here
// connects to an outside trading platform: you add an account, place your trades
// (typed in, or read off a screenshot), track open positions live on the Live
// Wall, and watch each account's balance and rolling trade P/L. Deliberately not
// framed around any prop / funded program — it's just your own trade journal.
export function FundedScreen() {
  const { privacy } = usePrivacy();
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [hideMoney, setHideMoney] = useState(false);
  const [importing, setImporting] = useState(false);

  // Capital is a self-entered figure (no brokerage-permission gate here) — mask
  // it off Privacy mode and the page Hide-$ toggle only.
  const showMoney = !privacy && !hideMoney;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{"Manual Trades"}</h2>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6, maxWidth: 640 }}>
            {"Your own book, kept by hand. Add an account, then add trades by typing them in or reading them off a screenshot. Nothing connects to an outside platform — you keep it current yourself."}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
          {!readOnly && (
            <button onClick={() => setImporting((v) => !v)} style={goldBtn}>{importing ? "Close" : "Import from screenshot"}</button>
          )}
        </div>
      </div>

      {!readOnly && importing && <FundedImportPanel onClose={() => setImporting(false)} />}

      {/* Shown to everyone with Trading access — read-only viewers (and the demo)
          see the book without the add/edit/delete controls. */}
      <FundedManager showMoney={showMoney} readOnly={readOnly} />
    </div>
  );
}

// ---- Paste/upload completed trades ----
// The trades are saved to a chosen account; VTS AI reads the trades (and the
// account balance, if shown) off the screenshot. Duplicates are skipped by time
// + profit. A handy way to place a batch of past trades without typing each one.
function FundedImportPanel({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<FundedAccount[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [newName, setNewName] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [example, setExample] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .funded()
      .then((d) => {
        if (!alive) return;
        setAccounts(d.accounts);
        if (d.accounts[0]) setAccountId(d.accounts[0].id);
      })
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  const creatingNew = accountId === '';

  async function ensureAccount(): Promise<string | null> {
    if (accountId) return accountId;
    const name = newName.trim();
    if (!name) {
      setError('Pick an account, or name a new one to create.');
      return null;
    }
    const d = await api.addFundedAccount({ platform: source.trim() || 'Manual', label: name });
    const created = d.accounts.find((a) => a.label === name) ?? d.accounts[d.accounts.length - 1];
    setAccounts(d.accounts);
    setAccountId(created?.id ?? '');
    return created?.id ?? null;
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
  }

  async function handleFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const id = await ensureAccount();
      if (!id) return;
      const dataUrl = await fileToDataUrl(file);
      const res = await api.importFundedTrades(id, { imageBase64: dataUrl, mediaType: file.type });
      setAccounts(res.funded.accounts);
      const parts = [`${res.added} added`];
      if (res.skipped) parts.push(`${res.skipped} duplicate${res.skipped === 1 ? '' : 's'} skipped`);
      if (res.ignored) parts.push(`${res.ignored} ignored`);
      if (res.balanceSet != null) parts.push('balance updated');
      setMsg(`${parts.join(' · ')} — added to the account below.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed');
      // Where the reader is switched off entirely — the public terminal, until
      // the AI provider migration — an error alone leaves somebody looking at a
      // feature they cannot see the shape of. Open the worked example instead of
      // ending on "switched off".
      if (e instanceof ApiError && e.status === 501) setExample(true);
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    const file = await readClipboardImage();
    if (file) void handleFile(file);
    else setError('No image found on the clipboard — copy a screenshot first, or use Upload.');
  }

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={panelLabel}>{"Place trades from a screenshot"}</div>
      <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
        {"Paste or upload a photo of your trade history. VTS AI reads the trades (and the account balance, if shown) off the image and logs them on the chosen account. Duplicates are skipped by time + profit."}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {accounts === null ? (
          <span style={{ fontSize: 12, color: MUTED }}>{"Loading accounts…"}</span>
        ) : (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...input, flex: '0 0 200px', width: 'auto' }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.platform} · {a.label}</option>
            ))}
            <option value="">＋ New account…</option>
          </select>
        )}
        {creatingNew && accounts !== null && (
          <>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Broker / label" style={{ ...input, flex: '0 0 130px', width: 'auto' }} />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New account name" style={{ ...input, flex: '1 1 160px', width: 'auto' }} />
          </>
        )}
        <button onClick={paste} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>{"Paste"}</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Reading…" : "Upload screenshot"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
        {/* Offered BEFORE the upload, deliberately. This panel asks somebody to
            hand over a picture of their account before it says what happens to
            it; the example answers that first, and it is also the whole of what
            the public terminal can show while AI is switched off there. */}
        <button onClick={() => setExample((v) => !v)} style={ghostBtn}>{example ? "Hide example" : "See an example"}</button>
        <button onClick={onClose} style={ghostBtn}>{"Done"}</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: GREEN, marginTop: 10 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginTop: 10 }}>{error}</div>}
      {example && <ScreenshotExample onClose={() => setExample(false)} />}
    </div>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
