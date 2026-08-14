// The short chime the terminal plays when the "Update available" prompt appears.
//
// Deliberately its own preference rather than riding on the trade-alert sound
// (`sound/alertSound.tsx`): that one is a desk instrument with its own on/off
// and a choice of three sounds, and somebody who has silenced trade alerts has
// not asked to be told nothing about a new build. It is also mounted inside
// `Portal`, while the update prompt sits at the App root so it can show on the
// login page too — so this is a plain module rather than a context.
//
// Per DEVICE, like the alert sound: an update is a fact about this browser's
// installed build, and each device gets its own prompt.

const ENABLED_KEY = 'vts-update-chime-on';
const CHIME_FILE = '/sounds/notify.mp3';

export function isUpdateChimeOn(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(ENABLED_KEY);
  // Default ON — the prompt is easy to miss on a screen you are not looking at.
  return v == null ? true : v === '1';
}

export function setUpdateChimeOn(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    // Private mode can block storage; the choice still holds for this session.
  }
}

let audio: HTMLAudioElement | null = null;

// Play the chime once, regardless of the preference. Used by the settings
// toggle, which is a real user gesture and so also unlocks playback for the
// later, gesture-less play when an update actually arrives.
export function previewUpdateChime(): void {
  if (typeof Audio === 'undefined') return;
  if (!audio) audio = new Audio();
  audio.src = CHIME_FILE;
  audio.currentTime = 0;
  // Autoplay may be blocked until the page has been interacted with. Swallow
  // the rejection so a blocked play never throws.
  void audio.play().catch(() => {});
}

export function playUpdateChime(): void {
  if (!isUpdateChimeOn()) return;
  previewUpdateChime();
}
