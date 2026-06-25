import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// Manages this device's Web Push subscription for trade/alert notifications.
// The flow: ask the server for the VAPID public key, request notification
// permission, subscribe through the service worker, and register the
// subscription with the server. Everything is per-device.

// VAPID keys are URL-safe base64; the PushManager wants the raw bytes.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// off       — supported + configured, not subscribed on this device
// on        — subscribed on this device
// denied    — the user blocked notifications in the browser/OS
// unconfigured — the server has no VAPID keys set
// unsupported  — this browser can't do Web Push (or isn't an installed PWA)
export type PushState = 'unsupported' | 'unconfigured' | 'off' | 'on' | 'denied';

const SUPPORTED =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function usePushNotifications() {
  const [state, setState] = useState<PushState>(SUPPORTED ? 'off' : 'unsupported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!SUPPORTED) {
      setState('unsupported');
      return;
    }
    try {
      const s = await api.pushStatus();
      if (!s.configured) {
        setState('unconfigured');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub && s.subscribed ? 'on' : 'off');
    } catch {
      // No trading access or a transient error — keep quiet, leave the toggle off.
      setState('off');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!SUPPORTED) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.pushStatus();
      if (!s.configured || !s.publicKey) {
        setState('unconfigured');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(s.publicKey),
        });
      }
      await api.pushSubscribe(sub.toJSON() as PushSubscriptionJSON);
      setState('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable notifications');
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn off notifications');
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setError(null);
    try {
      await api.pushTest();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a test');
    }
  }, []);

  return { state, busy, error, enable, disable, sendTest };
}
