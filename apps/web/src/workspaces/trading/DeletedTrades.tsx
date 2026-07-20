import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { usePrivacy } from '../../privacy/privacy';
import type { DeletedTradeRecord } from '../../api/types';
import { EditableText } from '../../copy/SiteCopy';
import { ScreenTitle } from './ScreenTitle';

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const BORDER = '#16294f';
const MONO = "'IBM Plex Mono', monospace";

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const ET = 'America/New_York';
function etDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { timeZone: ET, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}

// Trading ▸ Deleted Trades. Soft-deleted rows (from the Trade Log or History)
// that are kept out of the stats but can be restored — undo for a mistaken
// delete. Team-scoped; a trader restores their own (admins can restore any).
export function DeletedTrades() {
  const { user } = useAuth();
  const { privacy } = usePrivacy();
  const isAdmin = !!user?.roles.includes('admin');
  const [trades, setTrades] = useState<DeletedTradeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .deletedTrades()
      .then((d) => alive && setTrades(d.trades))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Failed to load deleted trades'));
    return () => {
      alive = false;
    };
  }, []);

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      const d = await api.restoreDeletedTrade(id);
      setTrades(d.trades);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not restore the trade');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <ScreenTitle id="deleted.title">Deleted Trades</ScreenTitle>
      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6, marginBottom: 16, lineHeight: 1.5 }}>
        <EditableText id="deleted.subtitle">
          Trades you removed from the Trade Log or History. They don’t count toward your stats (win rate,
          profit factor, P/L), but nothing is gone for good — restore any you deleted by mistake.
        </EditableText>
      </div>

      {error && <div style={banner}>{error}</div>}

      {trades == null ? (
        <div style={{ color: MUTED, fontSize: 13, padding: 20 }}><EditableText id="deleted.loading">Loading…</EditableText></div>
      ) : trades.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          <EditableText id="deleted.empty">Nothing deleted. Anything you remove from the Trade Log or History shows up here, ready to restore.</EditableText>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {trades.map((t) => {
            const long = t.side === 'long';
            const plUp = (t.realizedPl ?? 0) >= 0;
            const canRestore = t.isMine || isAdmin;
            return (
              <div key={t.id} style={row}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.instrument}</span>
                    <span style={{ ...badge, color: long ? GREEN : RED, border: `1px solid ${long ? GREEN : RED}` }}>{long ? 'LONG' : 'SHORT'}</span>
                    {t.status === 'open' && <span style={{ ...badge, color: GOLD, border: `1px solid ${GOLD}` }}>OPEN</span>}
                    {t.broker && <span style={{ ...badge, color: '#7fa8ff', border: '1px solid #3a5a9a' }}>{t.broker.toUpperCase()}</span>}
                    <span style={{ fontSize: 10.5, color: FAINT, fontFamily: MONO }}>@{t.owner}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>
                    {t.units} @ {fmtPrice(t.entryPrice)}
                    {t.exitPrice != null ? ` → ${fmtPrice(t.exitPrice)}` : ''} ·{' '}
                    <EditableText id="deleted.removed_at">removed</EditableText> {etDateTime(t.deletedAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {t.realizedPl != null && (
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: plUp ? GREEN : RED }}>
                      {privacy ? '•••' : `${plUp ? '+' : ''}${usd(t.realizedPl)}`}
                    </span>
                  )}
                  {canRestore && (
                    <button onClick={() => restore(t.id)} disabled={busy === t.id} style={{ ...restoreBtn, opacity: busy === t.id ? 0.6 : 1 }}>
                      {busy === t.id ? <EditableText id="deleted.restoring">Restoring…</EditableText> : <EditableText id="deleted.restore">Restore</EditableText>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '11px 14px',
  borderBottom: `1px solid ${BORDER}`,
  flexWrap: 'wrap',
};
const badge: CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '0.6px', borderRadius: 4, padding: '2px 6px' };
const restoreBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: '#0c2768',
  background: `linear-gradient(180deg,${GOLD},#C9A24B)`,
  border: 'none',
  padding: '7px 13px',
  borderRadius: 7,
  cursor: 'pointer',
};
const banner: CSSProperties = {
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
  marginBottom: 14,
};
