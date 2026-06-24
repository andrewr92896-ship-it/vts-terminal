import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// The three trade-alert sounds a user can pick from. Files live in public/sounds
// and are served at the site root. Keep the keys stable: they are persisted.
export interface AlertSoundOption {
  key: string;
  label: string;
  file: string;
}

export const ALERT_SOUNDS: AlertSoundOption[] = [
  { key: 'notify', label: 'Chime', file: '/sounds/notify.mp3' },
  { key: 'alarm', label: 'Alarm', file: '/sounds/alarm.mp3' },
  { key: 'digital', label: 'Digital alarm', file: '/sounds/digital.mp3' },
];

const DEFAULT_KEY = ALERT_SOUNDS[0].key;
const ENABLED_KEY = 'vts-alert-sound-on';
const CHOICE_KEY = 'vts-alert-sound-choice';

function readEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(ENABLED_KEY);
  // Default ON, matching the old top-bar default, so existing users are unchanged.
  return v == null ? true : v === '1';
}

function readChoice(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_KEY;
  const v = localStorage.getItem(CHOICE_KEY);
  return v && ALERT_SOUNDS.some((s) => s.key === v) ? v : DEFAULT_KEY;
}

interface AlertSoundContextValue {
  enabled: boolean;
  soundKey: string;
  setEnabled: (on: boolean) => void;
  setSoundKey: (key: string) => void;
  // Play the user's chosen sound, but only when alerts are enabled. Used by the
  // alert watcher when a new TradingView alert arrives.
  play: () => void;
  // Play a specific sound once, regardless of the enabled toggle. Used by the
  // picker's preview buttons (and a real user gesture, which also unlocks audio
  // playback for later programmatic plays).
  preview: (key: string) => void;
}

const AlertSoundContext = createContext<AlertSoundContextValue | null>(null);

export function AlertSoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(readEnabled);
  const [soundKey, setSoundKeyState] = useState<string>(readChoice);
  // One reused audio element. Priming it from a user gesture (toggle or preview)
  // lets the browser play it later when an alert fires without a direct gesture.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playFile = useCallback((file: string) => {
    if (typeof Audio === 'undefined') return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      audioRef.current = a;
    }
    a.src = file;
    a.currentTime = 0;
    // Autoplay may be blocked until the user has interacted with the page; the
    // preview buttons and the toggle are gestures that unlock it. Swallow the
    // rejection so a blocked play never throws into React.
    void a.play().catch(() => {});
  }, []);

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      try {
        localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
      } catch {
        // Private mode can block storage; the toggle still works for this session.
      }
    },
    [],
  );

  const setSoundKey = useCallback((key: string) => {
    setSoundKeyState(key);
    try {
      localStorage.setItem(CHOICE_KEY, key);
    } catch {
      // Ignore storage failures; the choice still applies for this session.
    }
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    const sound = ALERT_SOUNDS.find((s) => s.key === soundKey) ?? ALERT_SOUNDS[0];
    playFile(sound.file);
  }, [enabled, soundKey, playFile]);

  const preview = useCallback(
    (key: string) => {
      const sound = ALERT_SOUNDS.find((s) => s.key === key) ?? ALERT_SOUNDS[0];
      playFile(sound.file);
    },
    [playFile],
  );

  const value = useMemo<AlertSoundContextValue>(
    () => ({ enabled, soundKey, setEnabled, setSoundKey, play, preview }),
    [enabled, soundKey, setEnabled, setSoundKey, play, preview],
  );

  return <AlertSoundContext.Provider value={value}>{children}</AlertSoundContext.Provider>;
}

export function useAlertSound(): AlertSoundContextValue {
  const ctx = useContext(AlertSoundContext);
  if (!ctx) throw new Error('useAlertSound must be used within an AlertSoundProvider');
  return ctx;
}
