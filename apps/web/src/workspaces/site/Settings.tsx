import { useCallback, useEffect, useRef, useState } from 'react';
import { C, GOLD_GRADIENT, tint } from '../../theme/tokens';
import { Panel, Screen } from './ui';
import { api, type SiteSettings } from './siteApi';

/**
 * Site Editor ▸ Settings.
 *
 * DOWN FOR MAINTENANCE takes vitalistradingsystems.com off the air and serves
 * a notice in its place. The three rules are the portfolio admin's, which are
 * the ones the private portal's own maintenance mode arrived at the hard way:
 *
 *  1. **The site FAILS OPEN.** It asks the portal whether maintenance is on; if
 *     the answer stops arriving, it shows the page. The portal being down must
 *     never be what takes the site down.
 *  2. **It deletes nothing.** Off puts the site back exactly as it was.
 *  3. **The notice answers 503, not 200**, so a crawler treats it as temporary.
 *
 * WHAT THIS SCREEN SAYS ABOUT THE LINK IS EVIDENCE, NOT A CLAIM. The site
 * stamps itself every time it asks, so "checked in a moment ago" reports
 * something that happened. The likeliest failure is a variable never set on
 * the marketing service, and nothing about that is visible from here — so it
 * is detected rather than assumed.
 *
 * THE CHECKBOX STAGES; APPLY COMMITS. One box and one button, the same shape as
 * Railway's staged changes and as Deploy in the editor.
 */

/** The site polls every 15s; past this it has stopped asking. */
const STALE_MS = 90_000;

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 90) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
}

export function Settings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [staged, setStaged] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSettings(await api.settings());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read the settings.');
    }
  }, []);
  useEffect(() => {
    void load();
    // The check-in reading is a fact about the last minute, so it is re-read
    // while the screen is open rather than shown once and left to age.
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  const [, tick] = useState(0);
  const read = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    read.current = Date.now();
  }, [settings]);

  async function apply(on: boolean) {
    if (!settings || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      setSettings(await api.setMaintenance(on));
      setStaged(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  const note = 'Controls that affect the live site at vitalistradingsystems.com.';
  if (loadError) {
    return (
      <Screen eyebrow="Site" title="Settings" note={note}>
        <Notice tone="bad" title="Could not read the settings.">
          {loadError}{' '}
          <button type="button" onClick={() => void load()} style={linkBtn}>
            Try again
          </button>
        </Notice>
      </Screen>
    );
  }
  if (!settings) {
    return (
      <Screen eyebrow="Site" title="Settings" note={note}>
        <p style={{ margin: 0, font: `400 14px/1.6 ${C.sans}`, color: C.faint }}>Loading…</p>
      </Screen>
    );
  }

  const maintenance = staged ?? settings.maintenance;
  const dirty = staged !== null && staged !== settings.maintenance;
  const since = settings.sincePoll === null ? null : settings.sincePoll + (Date.now() - read.current);
  const linked = since !== null && since < STALE_MS;

  return (
    <Screen eyebrow="Site" title="Settings" note={note}>
      <Panel>
        <label style={{ display: 'flex', gap: 14, alignItems: 'flex-start', cursor: saving ? 'progress' : 'pointer' }}>
          <input
            type="checkbox"
            checked={maintenance}
            disabled={saving}
            onChange={(e) => setStaged(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: C.gold, marginTop: 2, flex: 'none' }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', font: `600 15px/1.4 ${C.sans}`, color: C.text }}>Down for maintenance</span>
            <span style={{ display: 'block', font: `400 13.5px/1.65 ${C.sans}`, color: C.muted, marginTop: 6, maxWidth: '46rem' }}>
              Replaces the landing page with a short notice. Nothing is deleted — turning this off puts the site back
              exactly as it was. It reaches the site within about fifteen seconds.
            </span>
          </span>
        </label>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}`, display: 'grid', gap: 10 }}>
          {/* What is IN FORCE, never what is staged. */}
          <StatusLine
            on={settings.maintenance}
            label={saving ? 'Applying…' : settings.maintenance ? 'Site is showing the notice' : 'Site is live'}
          />
          <p style={{ margin: 0, font: `400 12.5px/1.6 ${C.sans}`, color: C.faint }}>
            {linked
              ? `The live site checked in ${ago(since!)}.`
              : since !== null
                ? `The live site last checked in ${ago(since)} — it should ask every 15 seconds.`
                : 'The live site has not checked in yet.'}
          </p>
        </div>
      </Panel>

      {saveError && (
        <Notice tone="bad" title="Save problem.">
          {saveError}
        </Notice>
      )}

      {!linked && (
        <Notice tone="warn" title="The live site is not asking for this setting.">
          The marketing site only honours maintenance if it is pointed here. On the Railway marketing service, set{' '}
          <code style={code}>SITE_CONTENT_ORIGIN</code> to <code style={code}>https://portal.vitalistradingsystems.com</code>{' '}
          and redeploy. Until it does, the switch is saved but the site stays up.
        </Notice>
      )}

      <h3 style={{ margin: '30px 0 12px', font: `500 11px/1.4 ${C.mono}`, letterSpacing: '.16em', textTransform: 'uppercase', color: C.faint }}>
        What visitors would see
      </h3>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', background: C.bg }}>
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.line}`, font: `500 11px/1.6 ${C.mono}`, color: C.faint, background: C.panel2 }}>
          vitalistradingsystems.com
        </div>
        <MaintenanceNotice />
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void apply(maintenance)}
          style={{
            padding: '12px 22px',
            borderRadius: 8,
            border: '1px solid transparent',
            background: dirty ? GOLD_GRADIENT : 'transparent',
            color: dirty ? C.goldText : C.faint,
            borderColor: dirty ? 'transparent' : C.line2,
            font: `${dirty ? 700 : 500} 14px/1 ${C.sans}`,
            cursor: saving || !dirty ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            fontFamily: C.sans,
          }}
        >
          {saving ? 'Applying…' : 'Apply'}
        </button>
        {dirty && (
          <span style={{ font: `500 12.5px/1.5 ${C.sans}`, color: C.gold }}>
            {maintenance ? 'Not applied yet — the site is still live.' : 'Not applied yet — the site is still showing the notice.'}
          </span>
        )}
      </div>
    </Screen>
  );
}

/**
 * The notice, as the site draws it — so Settings shows what a visitor would
 * see rather than describing it. The marketing server holds its own copy
 * (apps/marketing/server.mjs); the two are kept in step by hand.
 */
function MaintenanceNotice() {
  return (
    <div
      style={{
        minHeight: 320,
        background: 'radial-gradient(1200px 600px at 70% -10%,#0f1d3d 0%,#050B18 60%)',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <p style={{ margin: 0, font: `600 .8rem/1.4 ${C.mono}`, letterSpacing: '.22em', textTransform: 'uppercase', color: C.text }}>
          Vitalis
          <span style={{ display: 'block', fontSize: '.62rem', letterSpacing: '.34em', color: C.gold, marginTop: 4 }}>Trading Systems</span>
        </p>
        <h1 style={{ margin: '22px 0 12px', font: `700 clamp(1.6rem,4vw,2.2rem)/1.15 ${C.sans}`, letterSpacing: '-.02em', color: C.text }}>
          Down for maintenance
        </h1>
        <p style={{ margin: 0, font: `400 1rem/1.7 ${C.sans}`, color: C.muted }}>
          The site is being updated and will be back shortly. Thanks for your patience.
        </p>
        <p style={{ margin: '22px 0 0', font: `400 .85rem/1.6 ${C.sans}`, color: C.faint }}>
          The terminal itself is separate and unaffected:{' '}
          <span style={{ color: C.gold }}>app.vitalistradingsystems.com</span>
        </p>
      </div>
    </div>
  );
}

const code: React.CSSProperties = {
  font: `500 12px/1.5 ${C.mono}`,
  color: C.text,
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${C.line}`,
  borderRadius: 5,
  padding: '1px 5px',
  wordBreak: 'break-all',
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: C.gold,
  font: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline',
};

function StatusLine({ on, label }: { on: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: on ? C.gold : '#4f7f5f', flex: 'none' }} />
      <span style={{ font: `500 11px/1.4 ${C.mono}`, letterSpacing: '.14em', textTransform: 'uppercase', color: on ? C.gold : C.muted }}>
        {label}
      </span>
    </div>
  );
}

function Notice({ tone, title, children }: { tone: 'warn' | 'bad'; title: string; children: React.ReactNode }) {
  const accent = tone === 'bad' ? '#d99aa8' : C.gold;
  return (
    <div
      style={{
        marginTop: 16,
        padding: '16px 18px',
        borderRadius: 12,
        border: `1px solid ${tint(accent, 0.32)}`,
        background: tint(accent, 0.07),
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ color: accent, flex: 'none', marginTop: 1 }} aria-hidden="true">
        ⚠
      </span>
      <p style={{ margin: 0, font: `400 13.5px/1.75 ${C.sans}`, color: C.muted, maxWidth: '46rem' }}>
        <strong style={{ color: C.text, fontWeight: 600 }}>{title}</strong> {children}
      </p>
    </div>
  );
}
