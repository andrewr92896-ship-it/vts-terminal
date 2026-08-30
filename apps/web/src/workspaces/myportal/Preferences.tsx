import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { SectionHeader, inputStyle, panel, panelLabel } from '../admin/adminUi';
import { getTradeLayout, setTradeLayout, type Layout } from '../trading/preferences';
import { ApiError } from '../../api/client';
import { HAS_LEADERBOARDS } from '../../auth/access';
import { useAuth } from '../../auth/AuthContext';
import {
  AUTO,
  usableZoneGroups,
  deviceZone,
  getZonePref,
  zoneFmt,
  zoneOffsetLabel,
} from '../../lib/timezone';

// My Terminal ▸ Preferences. Per-user, per-device view choices that persist
// locally (no server round-trip): the Trade Log's deck-vs-tape layout, moved off
// the Trade Log header so the toolbar stays lean, and the clock the terminal
// shows times on.
export function Preferences({ theme }: { theme: Theme }) {
  const [layout, setLayout] = useState<Layout>(() => getTradeLayout());

  function choose(v: Layout) {
    setLayout(v);
    setTradeLayout(v);
  }

  const opts: { key: Layout; label: string; desc: string }[] = [
    { key: 'deck', label: 'Deck', desc: 'Roomy cards — one tile per trade with the full breakdown.' },
    { key: 'tape', label: 'Tape', desc: 'Dense rows — more trades on screen at once.' },
  ];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 40px' }}>
      <SectionHeader
        title="Preferences"
        subtitle="Your personal view choices."
      />

      <TimeZoneCard theme={theme} />

      {HAS_LEADERBOARDS && <LeaderboardCard theme={theme} />}

      <section style={{ ...panel(theme), marginTop: 16 }}>
        <div style={panelLabel}>
          {"Trade Log layout"}
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          {"How the Trade Log lays out your trades. Saved on this device."}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {opts.map((o) => {
            const active = layout === o.key;
            return (
              <button
                key={o.key}
                onClick={() => choose(o.key)}
                style={{
                  ...optCard,
                  borderColor: active ? C.gold : C.line2,
                  background: active ? 'rgba(235,203,116,.1)' : 'rgba(255,255,255,.03)',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700, color: active ? C.gold : C.text }}>{o.label}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{o.desc}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Whether this account appears on the public study leaderboards.
//
// Stored on the ACCOUNT, so it follows the person between devices — and because
// what it governs is what strangers can see, which is not a per-device question.
// Opting out never hides your own row from you: it is about being findable, not
// about losing your standing.
function LeaderboardCard({ theme }: { theme: Theme }) {
  const { user, updateProfile } = useAuth();
  const hidden = !!user?.hideFromLeaderboards;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = !!user?.isDemo;

  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ hideFromLeaderboards: !hidden });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ ...panel(theme), marginTop: 16 }}>
      <div style={panelLabel}>{"Public leaderboards"}</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
        {"The terminal's built-in study games rank every player on one board. Your display name and score are visible to anyone playing the same game."}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: hidden ? '#8298c4' : '#8fe3c0' }}>
          {hidden ? 'Hidden from other players' : 'Shown on the board'}
        </span>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={saving || readOnly}
          style={{
            background: 'transparent',
            border: `1px solid ${theme.navBorder}`,
            borderRadius: 8,
            color: '#cfe0ff',
            fontSize: 12,
            padding: '7px 13px',
            cursor: readOnly ? 'not-allowed' : 'pointer',
            opacity: saving || readOnly ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : hidden ? 'Show me on the board' : 'Hide me from the board'}
        </button>
      </div>
      {hidden && (
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 9, lineHeight: 1.5 }}>
          {"You still see your own rank — this only affects what other players see."}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginTop: 9 }}>{error}</div>}
    </section>
  );
}

// The clock every "when did this happen" reading in the terminal is shown on —
// the top-bar clock, a position's opened/closed stamps, an alert's arrival, a
// headline's time, the chart axis. Market hours, session windows and the Fed
// schedule stay Eastern whatever is picked here, since those are facts about the
// market rather than about the reader; the card says so, because nothing on the
// control could.
//
// Unlike the layout choice below, this one is stored on the ACCOUNT — it follows
// the person to every device they sign in on. So it is the only control on this
// screen that can fail, and the only one that has to say so.
function TimeZoneCard({ theme }: { theme: Theme }) {
  const { user, updateProfile } = useAuth();
  // The account's value is the source of truth; this mirrors it so the select
  // moves the instant it is used, and snaps back if the save is refused.
  const [pref, setPref] = useState<string>(() => getZonePref());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountZone = user?.displayTimezone;
  useEffect(() => {
    if (accountZone) setPref(accountZone);
  }, [accountZone]);

  // Re-render every second so the sample below the picker ticks like a clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const readOnly = !!user?.isDemo;

  async function choose(v: string) {
    const previous = pref;
    setPref(v);
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ displayTimezone: v });
    } catch (e) {
      setPref(previous);
      setError(e instanceof ApiError ? e.message : 'Could not save your time zone');
    } finally {
      setSaving(false);
    }
  }

  // Built once. Every option carries its current offset, which costs a format
  // per zone — and this card re-renders every second to tick the sample below.
  // A zone's offset only moves at a DST boundary, never while somebody sits on
  // this screen.
  const groups = useMemo(
    () =>
      usableZoneGroups().map((g) => ({
        label: g.label,
        zones: g.zones.map((z) => ({ zone: z.zone, label: `${z.label} (${zoneOffsetLabel(z.zone)})` })),
      })),
    [],
  );

  // The sample follows the SELECTION, not what is saved, so the clock moves the
  // moment a zone is picked rather than after the round-trip. A refused save
  // puts `pref` back, and the sample with it.
  const zone = pref === AUTO ? deviceZone() : pref;
  const sample = zoneFmt(
    { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' },
    zone,
  ).format(now);

  return (
    <section style={panel(theme)}>
      <div style={panelLabel}>
        {"Time zone"}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
        {"Times across the terminal are shown on this clock, saved to your account so it follows you between devices. Market hours, strategy sessions and the Fed schedule stay on Eastern Time wherever you are — those are the market's hours, not yours."}
      </div>

      <select
        value={pref}
        disabled={readOnly || saving}
        onChange={(e) => void choose(e.target.value)}
        style={{ ...inputStyle, marginTop: 12, opacity: readOnly || saving ? 0.6 : 1 }}
      >
        <option value={AUTO}>{`Automatic — follow this device (${deviceZone()})`}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.zones.map((z) => (
              <option key={z.zone} value={z.zone}>
                {z.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div
        style={{
          marginTop: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 13,
          color: C.gold,
          letterSpacing: '0.4px',
        }}
      >
        {sample}
      </div>

      {error && <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 8 }}>{error}</div>}
    </section>
  );
}

const optCard: CSSProperties = {
  flex: '1 1 200px',
  textAlign: 'left',
  border: `1px solid ${C.line2}`,
  borderRadius: 10,
  padding: '12px 14px',
  cursor: 'pointer',
};
