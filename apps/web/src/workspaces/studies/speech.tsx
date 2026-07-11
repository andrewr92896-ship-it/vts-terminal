import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';

// Read-aloud support for the Study workspace, built on the browser's built-in
// Web Speech API (speechSynthesis) — no network, no API cost, works offline. A
// single shared preference (persisted) drives whether new questions/cards are
// read automatically; a speaker button reads the current item on demand.

const PREF_KEY = 'vts_studies_read_aloud';

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

export interface Speech {
  supported: boolean;
  on: boolean; // auto-read new items
  speaking: boolean;
  setEnabled: (v: boolean) => void;
  speak: (text: string) => void;
  cancel: () => void;
}

export function useSpeech(): Speech {
  const supported = speechSupported();
  const [on, setOn] = useState(loadPref);
  const [speaking, setSpeaking] = useState(false);
  // Keep the latest utterance so its handlers aren't garbage-collected mid-speech
  // (a known quirk in some browsers).
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

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
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1;
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

  // Stop any in-flight speech when the surface using the hook unmounts (e.g.
  // switching away from the quiz), so audio never bleeds across screens.
  useEffect(() => cancel, [cancel]);

  return { supported, on, speaking, setEnabled, speak, cancel };
}

// Build the spoken form of a multiple-choice question: the stem then each option
// read as "Option A, …".
export function questionSpeech(
  stem: string,
  options: { label: string; text: string }[],
): string {
  const opts = options.map((o) => `Option ${o.label}. ${o.text}.`).join(' ');
  return `${stem}. ${opts}`;
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
