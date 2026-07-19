import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Theme } from '../../theme/themes';
import { EditableText } from '../../copy/SiteCopy';
import { deckLifetimeAccuracy, deckSessionAccuracy, type DeckGameState } from './studyEngine';
import {
  clampPass,
  clampWindow,
  SESSION_WINDOW_MAX,
  SESSION_WINDOW_MIN,
  type StudyPrefs,
} from './studyPrefs';

// The lifetime + session progress bars for a study game, plus the inline editor
// for the (per-user) session window and passing thresholds. Shared by the game
// HUD (TeamStudyGame) and the read-only summary (DeckProgress) so both read the
// same. Lifetime = correct/attempted over the whole run (what the leaderboard
// ranks by); session = the correct rate over your last N answers, N being the
// learner's own setting.

const GREEN = '#35c47b';
const RED = '#ef5468';
const muted = '#a99ff0';

// One labelled progress bar. `pct` null = not enough answers yet. When `passing`
// is set the fill turns green/red by pass/fail and a marker is drawn at the pass
// line; otherwise it uses the workspace accent.
function ScoreBar({
  theme,
  label,
  labelId,
  suffix,
  pct,
  detail,
  passing,
}: {
  theme: Theme;
  label: string;
  labelId: string;
  suffix?: string; // live, non-editable label tail (e.g. " · last 50")
  pct: number | null;
  detail?: string; // live, non-editable (e.g. "34/50 correct")
  passing: number | null;
}) {
  const has = pct != null;
  const passed = has && passing != null && (pct as number) >= passing;
  const fill = has ? Math.max(0, Math.min(100, pct as number)) : 0;
  const barColor = passing == null ? theme.accent : passed ? GREEN : RED;
  const pctColor = !has ? muted : passing == null ? '#fff' : passed ? GREEN : RED;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e7e0ff' }}>
          <EditableText id={labelId} text={label} />
          {suffix && <span style={{ color: muted, fontWeight: 500 }}>{suffix}</span>}
          {passing != null && (
            <span style={{ fontSize: 10.5, color: muted, fontWeight: 500 }}>
              {' · '}
              <EditableText id="studyprogress.pass_label" text="pass" /> {passing}%
            </span>
          )}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, fontWeight: 700, color: pctColor }}>
          {has ? `${(pct as number).toFixed(1)}%` : '—'}
          {passed ? ' ✓' : ''}
        </span>
      </div>
      <div style={{ position: 'relative', height: 10 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,.06)',
            border: `1px solid ${theme.navBorder}`,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div style={{ height: '100%', width: `${fill}%`, background: barColor, transition: 'width .35s ease' }} />
        </div>
        {passing != null && (
          <div
            title={`Passing ${passing}%`}
            style={{
              position: 'absolute',
              top: -2,
              bottom: -2,
              left: `${Math.max(0, Math.min(100, passing))}%`,
              width: 2,
              marginLeft: -1,
              background: '#fff',
              borderRadius: 2,
              boxShadow: '0 0 0 1px rgba(0,0,0,.45)',
            }}
          />
        )}
      </div>
      {detail && <div style={{ fontSize: 10.5, color: muted, marginTop: 4 }}>{detail}</div>}
    </div>
  );
}

export function StudyProgressBars({
  theme,
  game,
  prefs,
  onPrefsChange,
}: {
  theme: Theme;
  game: DeckGameState;
  prefs: StudyPrefs;
  onPrefsChange: (p: StudyPrefs) => void;
}) {
  const [editing, setEditing] = useState(false);

  const lifetime = deckLifetimeAccuracy(game);
  const session = deckSessionAccuracy(game, prefs.sessionWindow);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent }}>
          <EditableText id="studyprogress.heading" text="Progress" />
        </span>
        <button
          onClick={() => setEditing((e) => !e)}
          style={{
            border: `1px solid ${theme.navBorder}`,
            background: editing ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)',
            color: '#cdbcff',
            fontSize: 11,
            fontWeight: 600,
            padding: '5px 11px',
            borderRadius: 999,
            cursor: 'pointer',
            minHeight: 30,
          }}
        >
          {editing ? (
            <EditableText id="studyprogress.done" text="Done" />
          ) : (
            <EditableText id="studyprogress.adjust" text="⚙ Adjust" />
          )}
        </button>
      </div>

      <ScoreBar
        theme={theme}
        label="Lifetime"
        labelId="studyprogress.lifetime"
        pct={lifetime}
        detail={game.totalAttempted > 0 ? `${game.totalCorrect}/${game.totalAttempted} correct all-time` : undefined}
        passing={prefs.lifetimePass}
      />

      <ScoreBar
        theme={theme}
        label="Session"
        labelId="studyprogress.session"
        suffix={` · last ${session.window}`}
        pct={session.pct}
        detail={session.attempted > 0 ? `${session.correct}/${session.attempted} correct in window` : undefined}
        passing={prefs.sessionPass}
      />

      {editing && <PrefsEditor theme={theme} prefs={prefs} onPrefsChange={onPrefsChange} />}
    </div>
  );
}

function PrefsEditor({
  theme,
  prefs,
  onPrefsChange,
}: {
  theme: Theme;
  prefs: StudyPrefs;
  onPrefsChange: (p: StudyPrefs) => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${theme.navBorder}`,
        background: 'rgba(255,255,255,.03)',
        borderRadius: 10,
        padding: '12px 13px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Field label="Session window (last N answers)" labelId="studyprogress.window_label">
        <input
          type="number"
          min={SESSION_WINDOW_MIN}
          max={SESSION_WINDOW_MAX}
          value={prefs.sessionWindow}
          onChange={(e) => onPrefsChange({ ...prefs, sessionWindow: clampWindow(Number(e.target.value)) })}
          style={numInput(theme)}
        />
      </Field>

      <Field label="Lifetime passing %" labelId="studyprogress.lifetime_pass_label">
        <PassInput theme={theme} value={prefs.lifetimePass} onChange={(v) => onPrefsChange({ ...prefs, lifetimePass: v })} />
      </Field>

      <Field label="Session passing %" labelId="studyprogress.session_pass_label">
        <PassInput theme={theme} value={prefs.sessionPass} onChange={(v) => onPrefsChange({ ...prefs, sessionPass: v })} />
      </Field>

      <div style={{ fontSize: 10.5, color: muted, lineHeight: 1.5 }}>
        <EditableText
          id="studyprogress.hint"
          text="Personal to you and saved on this device. Leave a passing % blank to hide its pass line. Leaderboards always rank by lifetime %."
        />
      </div>
    </div>
  );
}

// A passing-% input that accepts a blank value (meaning "no pass line").
function PassInput({ theme, value, onChange }: { theme: Theme; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      min={1}
      max={100}
      placeholder="off"
      value={value ?? ''}
      onChange={(e) => onChange(clampPass(e.target.value))}
      style={numInput(theme)}
    />
  );
}

function Field({
  label,
  labelId,
  children,
}: {
  label: string;
  labelId: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 12, color: '#e7e0ff' }}>
        <EditableText id={labelId} text={label} />
      </span>
      {children}
    </label>
  );
}

function numInput(theme: Theme): CSSProperties {
  return {
    width: 78,
    background: 'rgba(0,0,0,.25)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 9px',
    textAlign: 'center',
    fontFamily: "'IBM Plex Mono', monospace",
  };
}
