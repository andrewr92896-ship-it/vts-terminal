import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';

// Read-aloud support for the Study workspace, built on the browser's built-in
// Web Speech API (speechSynthesis) — no network, no API cost, works offline. A
// single shared preference (persisted) drives whether new questions/cards are
// read automatically; a speaker button reads the current item on demand.

const PREF_KEY = 'vts_studies_read_aloud';
const RATE_KEY = 'vts_studies_read_rate';

export const MIN_RATE = 0.5;
export const MAX_RATE = 2;
export const RATE_STEP = 0.25;

function clampRate(r: number): number {
  const stepped = Math.round(r / RATE_STEP) * RATE_STEP;
  return Math.max(MIN_RATE, Math.min(MAX_RATE, stepped));
}

export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

function loadPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function savePref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    /* ignore storage failures */
  }
}

function loadRate(): number {
  try {
    const n = parseFloat(localStorage.getItem(RATE_KEY) ?? '');
    return Number.isFinite(n) ? clampRate(n) : 1;
  } catch {
    return 1;
  }
}

function saveRate(r: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(r));
  } catch {
    /* ignore storage failures */
  }
}

export interface Speech {
  supported: boolean;
  on: boolean; // auto-read new items
  speaking: boolean;
  rate: number; // playback speed, 0.5–2×
  setEnabled: (v: boolean) => void;
  setRate: (r: number) => void;
  speak: (text: string) => void;
  cancel: () => void;
}

export function useSpeech(): Speech {
  const supported = speechSupported();
  const [on, setOn] = useState(loadPref);
  const [rate, setRateState] = useState(loadRate);
  const [speaking, setSpeaking] = useState(false);
  // Keep the latest utterance so its handlers aren't garbage-collected mid-speech
  // (a known quirk in some browsers), and the latest rate so `speak` can read it
  // without being re-created (which would retrigger auto-read effects).
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  const cancel = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      try {
        window.speechSynthesis.cancel(); // interrupt anything in flight, then restart
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rateRef.current;
        u.pitch = 1;
        u.lang = 'en-US';
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        utterRef.current = u;
        setSpeaking(true);
        window.speechSynthesis.speak(u);
      } catch {
        setSpeaking(false);
      }
    },
    [supported],
  );

  const setEnabled = useCallback(
    (v: boolean) => {
      setOn(v);
      savePref(v);
      if (!v) cancel();
    },
    [cancel],
  );

  const setRate = useCallback((r: number) => {
    const c = clampRate(r);
    setRateState(c);
    saveRate(c);
  }, []);

  // Stop any in-flight speech when the surface using the hook unmounts (e.g.
  // switching away from the quiz), so audio never bleeds across screens.
  useEffect(() => cancel, [cancel]);

  return { supported, on, speaking, rate, setEnabled, setRate, speak, cancel };
}

// Spoken form of the answer choices alone: "Option A, …. Option B, …."
export function optionsSpeech(options: { label: string; text: string }[]): string {
  return options.map((o) => `Option ${o.label}. ${o.text}.`).join(' ');
}

// Spoken form of the whole question: the stem then every choice.
export function questionSpeech(
  stem: string,
  options: { label: string; text: string }[],
): string {
  return `${stem}. ${optionsSpeech(options)}`;
}

const muted = '#a99ff0';

// The auto-read on/off pill. Hidden entirely when the browser has no speech
// support so no dead control is shown.
export function ReadAloudToggle({ speech, theme }: { speech: Speech; theme: Theme }) {
  if (!speech.supported) return null;
  const on = speech.on;
  return (
    <button
      onClick={() => speech.setEnabled(!on)}
      aria-pressed={on}
      title={on ? 'Read aloud is on — new questions are spoken' : 'Read questions aloud automatically'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11.5,
        fontWeight: 600,
        padding: '7px 12px',
        borderRadius: 999,
        cursor: 'pointer',
        border: `1px solid ${on ? theme.accent : theme.navBorder}`,
        background: on ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
        color: on ? '#fff' : muted,
      }}
    >
      <span aria-hidden style={{ fontSize: 13 }}>{on ? '🔊' : '🔈'}</span>
      Read aloud {on ? 'on' : 'off'}
    </button>
  );
}

// A small speaker button that reads the given text on demand (and stops if
// already speaking). Rendered only when speech is supported.
export function SpeakerButton({
  speech,
  text,
  theme,
  title = 'Read this aloud',
}: {
  speech: Speech;
  text: string;
  theme: Theme;
  title?: string;
}) {
  if (!speech.supported) return null;
  const style: CSSProperties = {
    border: `1px solid ${speech.speaking ? theme.accent : theme.navBorder}`,
    background: speech.speaking ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)',
    color: speech.speaking ? '#fff' : muted,
    fontSize: 15,
    lineHeight: 1,
    borderRadius: 8,
    cursor: 'pointer',
    padding: '6px 10px',
    minHeight: 34,
  };
  return (
    <button
      onClick={() => (speech.speaking ? speech.cancel() : speech.speak(text))}
      title={speech.speaking ? 'Stop' : title}
      aria-label={speech.speaking ? 'Stop reading' : title}
      style={style}
    >
      {speech.speaking ? '⏹' : '🔊'}
    </button>
  );
}

// Playback-speed stepper (0.5×–2×), shared and persisted with the read-aloud
// preference.
export function SpeechRateControl({ speech, theme }: { speech: Speech; theme: Theme }) {
  if (!speech.supported) return null;
  const stepStyle = (disabled: boolean): CSSProperties => ({
    border: `1px solid ${theme.navBorder}`,
    background: disabled ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.05)',
    color: disabled ? '#6a5fa0' : '#cdbcff',
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1,
    width: 26,
    height: 26,
    borderRadius: 7,
    cursor: disabled ? 'default' : 'pointer',
    padding: 0,
  });
  const slower = speech.rate <= MIN_RATE;
  const faster = speech.rate >= MAX_RATE;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: muted }}>Speed</span>
      <button onClick={() => speech.setRate(speech.rate - RATE_STEP)} disabled={slower} aria-label="Slower" title="Slower" style={stepStyle(slower)}>
        −
      </button>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: '#fff', minWidth: 34, textAlign: 'center' }}>
        {speech.rate}×
      </span>
      <button onClick={() => speech.setRate(speech.rate + RATE_STEP)} disabled={faster} aria-label="Faster" title="Faster" style={stepStyle(faster)}>
        +
      </button>
    </span>
  );
}

// The three read buttons for a multiple-choice question — the whole thing, just
// the question, or just the choices — plus a stop button while speaking. Each
// read button interrupts anything already playing and starts its selection over.
export function QuestionSpeechControls({
  speech,
  theme,
  stem,
  options,
}: {
  speech: Speech;
  theme: Theme;
  stem: string;
  options: { label: string; text: string }[];
}) {
  if (!speech.supported) return null;
  const pill: CSSProperties = {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 11.5,
    fontWeight: 600,
    padding: '6px 11px',
    borderRadius: 999,
    cursor: 'pointer',
    minHeight: 32,
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <button onClick={() => speech.speak(questionSpeech(stem, options))} style={pill} title="Read the question and all answer choices">
        🔊 Question + choices
      </button>
      <button onClick={() => speech.speak(stem)} style={pill} title="Read just the question">
        Question only
      </button>
      <button onClick={() => speech.speak(optionsSpeech(options))} style={pill} title="Read just the answer choices">
        Choices only
      </button>
      {speech.speaking && (
        <button
          onClick={speech.cancel}
          aria-label="Stop reading"
          title="Stop"
          style={{ ...pill, border: `1px solid ${theme.accent}`, background: 'rgba(255,255,255,.1)', color: '#fff' }}
        >
          ⏹ Stop
        </button>
      )}
    </div>
  );
}
