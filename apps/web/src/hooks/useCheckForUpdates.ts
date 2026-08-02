import { useCallback, useState } from 'react';

// A one-click "check for updates" for the PWA. The terminal is a service-worker
// PWA in prompt mode, so a new deploy normally surfaces on its own (see
// UpdatePrompt). This lets a user force the check now: it asks the browser for a
// fresh build and, if one is found (or already waiting), applies it and reloads
// straight into the new version — no separate "update now" or "force" step.

export type UpdateState = 'idle' | 'checking' | 'applying' | 'uptodate' | 'error';

export function useCheckForUpdates() {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const [state, setState] = useState<UpdateState>('idle');

  // Activate the waiting worker and reload once it controls the page.
  const apply = useCallback((reg: ServiceWorkerRegistration) => {
    setState('applying');
    const waiting = reg.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Fallback if controllerchange never fires.
    setTimeout(reload, 3000);
  }, []);

  const run = useCallback(async () => {
    if (state === 'checking' || state === 'applying') return;
    // No service worker at all: a plain reload already fetches the freshest shell.
    if (!swSupported) {
      setState('applying');
      window.location.reload();
      return;
    }
    setState('checking');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setState('applying');
        window.location.reload();
        return;
      }
      if (reg.waiting) return apply(reg);
      await reg.update();
      if (reg.waiting) return apply(reg);
      const installing = reg.installing;
      if (!installing) {
        setState('uptodate');
        setTimeout(() => setState('idle'), 3500);
        return;
      }
      // A new worker is installing — wait for it to settle (with a timeout so the
      // button never spins forever on a flaky network).
      await new Promise<void>((resolve) => {
        const done = () => {
          installing.removeEventListener('statechange', onChange);
          resolve();
        };
        const onChange = () => {
          if (installing.state === 'installed' || installing.state === 'activated') done();
        };
        installing.addEventListener('statechange', onChange);
        setTimeout(done, 10_000);
      });
      if (reg.waiting) return apply(reg);
      setState('uptodate');
      setTimeout(() => setState('idle'), 3500);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3500);
    }
  }, [state, swSupported, apply]);

  return { state, run };
}
