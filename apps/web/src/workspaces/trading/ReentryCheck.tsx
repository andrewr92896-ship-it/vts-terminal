import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { zoneFmt } from '../../lib/timezone';
import { fmtMoney, fmtPrice } from './tradeFormat';
import { fmtSize } from './pips';
import type { ReentryCheck as Check, ReentryLeg, ReentryReport } from '../../api/types';

// Re-entry check — what getting back into a funded trade you just closed would
// cost right now.
//
// A trader who has to come off a funded position for the 5pm ET rollover has one
// decision left: is it worth getting back on. This is that arithmetic, itemized
// the way it is actually paid:
//
//   Drift       the market moving away from your exit while you were flat
//   Spread      what crossing back costs
//   Commission  the firm's round-turn charge on the new position
//
// They do not double-count. Drift is measured against the SAME SIDE the trade
// exited at, so drift + spread is exactly the distance from the exit fill to the
// re-entry fill — the server computes it once and this only draws it.
//
// Sign convention throughout: POSITIVE IS WORSE. A negative drift means price
// came back to you while you were out, which makes re-entry cheaper than the
// exit and is exactly as useful to know.
//
// **The total is refused rather than approximated.** With no commission rate on
// the account there is no total — the drift and spread are still shown as the
// real figures they are, and the missing part says so. A total quietly leaving
// commission out reads complete while understating what re-entry costs, which is
// the one error this panel exists to prevent.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const BORDER = '#16294f';

const REFRESH_MS = 30_000;

function closedLabel(ms: number): string {
  return zoneFmt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
}

// A cost reads red when it is against you and green when it is in your favour.
// Zero is neither, so it stays neutral rather than being drawn as a small win.
export function costColor(n: number): string {
  if (n > 0) return RED;
  if (n < 0) return GREEN;
  return TEXT;
}

function signedMoney(n: number, ccy: string): string {
  return (n > 0 ? '+' : '') + fmtMoney(n, ccy);
}

// A leg in the unit the instrument is read in — pips on a currency pair, points
// on anything else — with the money beside it when the account's currency can
// state it.
export function legLabel(leg: ReentryLeg, unit: 'pips' | 'points', ccy: string): string {
  const steps = `${leg.units > 0 ? '+' : ''}${leg.units.toFixed(1)} ${unit === 'pips' ? 'pips' : 'pts'}`;
  return leg.money == null ? steps : `${signedMoney(leg.money, ccy)} · ${steps}`;
}

export function ReentryPanel({ showMoney }: { showMoney: boolean }) {
  const [report, setReport] = useState<ReentryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.fundedReentry();
      setReport(r);
      setFailed(false);
    } catch {
      // Keep whatever was last read rather than blanking the panel — a failed
      // refresh is not the same as nothing to re-enter.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Nothing closed recently is the ordinary state and needs no panel at all —
  // this is a decision aid that only exists while there is a decision.
  if (loading || !report || report.checks.length === 0) return null;

  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Re-entry check</h3>
        <span style={{ fontSize: 11.5, color: FAINT }}>
          {report.priceSource === 'broker'
            ? 'Priced from your OANDA account'
            : report.priceSource === 'install'
              ? 'Priced from the terminal’s own feed'
              : 'No live price source'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {report.checks.map((c) => (
          <CheckCard key={c.tradeId} c={c} showMoney={showMoney} />
        ))}
      </div>

      {failed && (
        <div style={{ fontSize: 11.5, color: FAINT, marginTop: 8 }}>
          Last read — the refresh did not come back.
        </div>
      )}
    </section>
  );
}

function CheckCard({ c, showMoney }: { c: Check; showMoney: boolean }) {
  const long = c.side === 'long';
  const priced = c.drift != null && c.spread != null && c.reentryPrice != null;

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.instrument}</span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: '0.6px',
            padding: '2px 6px',
            borderRadius: 4,
            color: long ? GREEN : RED,
            border: `1px solid ${long ? GREEN : RED}`,
          }}
        >
          {long ? 'LONG' : 'SHORT'}
        </span>
        <span style={{ fontSize: 11.5, color: MUTED }}>{fmtSize(c.instrument, c.size)}</span>
        <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 'auto' }}>
          {c.platform} · {c.accountLabel}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: priced ? 12 : 0 }}>
        <Figure label="Closed at" value={fmtPrice(c.exitPrice)} note={closedLabel(c.closedAt)} />
        {priced ? (
          <Figure
            label={long ? 'Re-enter at (ask)' : 'Re-enter at (bid)'}
            value={fmtPrice(c.reentryPrice)}
            note={c.bid != null && c.ask != null ? `${fmtPrice(c.bid)} / ${fmtPrice(c.ask)}` : undefined}
          />
        ) : (
          // A price that could not be read is said out loud. Drawing the cost
          // rows as zeros would report an unmeasured figure as a measured one.
          <Figure label="Now" value="—" note="Not priced right now" />
        )}
      </div>

      {priced && c.drift && c.spread && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <CostRow
            label="Drift since your exit"
            value={legLabel(c.drift, c.unit, c.currency)}
            color={costColor(c.drift.price)}
            showMoney={showMoney}
            hasMoney={c.drift.money != null}
          />
          <CostRow
            label="Spread to cross back"
            value={legLabel(c.spread, c.unit, c.currency)}
            color={c.spread.price > 0 ? RED : TEXT}
            showMoney={showMoney}
            hasMoney={c.spread.money != null}
          />
          <CostRow
            label="Commission to re-enter"
            value={c.commission == null ? '—' : signedMoney(c.commission, c.currency)}
            note={c.commissionNote}
            color={c.commission == null ? FAINT : RED}
            showMoney={showMoney}
            hasMoney={c.commission != null}
          />
          <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 4, paddingTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: GOLD }}>Cost to get back on</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: c.total == null ? FAINT : costColor(c.total) }}>
              {c.total == null ? '—' : showMoney ? signedMoney(c.total, c.currency) : '••••'}
            </span>
          </div>
          {c.total == null && (
            <div style={{ fontSize: 11, color: FAINT }}>
              {c.commission == null
                ? 'No total while commission is unstated — the drift and spread above are real.'
                : 'No total — this instrument is not quoted in the account’s currency.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: TEXT }}>{value}</div>
      {note && <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function CostRow({
  label,
  value,
  note,
  color,
  showMoney,
  hasMoney,
}: {
  label: string;
  value: string;
  note?: string | null;
  color: string;
  showMoney: boolean;
  hasMoney: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: MUTED }}>{label}</span>
        {note && <div style={{ fontSize: 10.5, color: FAINT }}>{note}</div>}
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color, whiteSpace: 'nowrap' }}>
        {/* Hide-$ covers this row exactly as it covers every other money figure
            — including when the money and the pips share one string. */}
        {!showMoney && hasMoney ? '••••' : value}
      </span>
    </div>
  );
}
