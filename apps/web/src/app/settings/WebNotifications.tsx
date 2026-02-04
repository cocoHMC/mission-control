'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type VapidResponse = {
  publicKey?: string;
  enabled?: boolean;
};

type GenerateResponse = {
  ok?: boolean;
  alreadyConfigured?: boolean;
  restartRequired?: boolean;
  restartMode?: 'auto' | 'manual';
  error?: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function WebNotifications() {
  const desktopApp = typeof window !== 'undefined' && Boolean((window as any).MissionControlDesktop);
  const [supported, setSupported] = React.useState(false);
  const [permission, setPermission] = React.useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = React.useState(false);
  const [deviceLabel, setDeviceLabel] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [vapid, setVapid] = React.useState<VapidResponse | null>(null);
  const [configuringKeys, setConfiguringKeys] = React.useState(false);

  React.useEffect(() => {
    // Web Push is generally not supported inside Electron (no push service),
    // but it works great in installed PWAs on iOS/Android/desktop browsers.
    const ok =
      !desktopApp &&
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(ok);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, [desktopApp]);

  const refreshVapid = React.useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/vapid', { cache: 'no-store' });
      const json = (await res.json()) as VapidResponse;
      setVapid(json);
    } catch {
      setVapid(null);
    }
  }, []);

  const getRegistration = React.useCallback(async () => {
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }, []);

  const refreshSubscription = React.useCallback(async () => {
    if (!supported) return;
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    setSubscribed(Boolean(sub));
  }, [getRegistration, supported]);

  React.useEffect(() => {
    if (supported) {
      void refreshSubscription();
      void refreshVapid();
    }
  }, [refreshSubscription, refreshVapid, supported]);

  async function configurePushKeys() {
    setStatus(null);
    setConfiguringKeys(true);
    try {
      const res = await fetch('/api/notifications/vapid/generate', { method: 'POST', headers: { 'content-type': 'application/json' } });
      const json = (await res.json()) as GenerateResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to configure push keys');
      setStatus(
        json.restartMode === 'auto'
          ? 'Push keys configured. Restarting Mission Control now…'
          : 'Push keys configured. Restart Mission Control to enable web push.'
      );
      await refreshVapid();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message || 'Failed to configure push keys.');
    } finally {
      setConfiguringKeys(false);
    }
  }

  async function enableNotifications() {
    if (!supported) return;
    setStatus(null);
    setLoading(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') {
        setStatus('Notification permission was not granted.');
        return;
      }

      const vapidRes = await fetch('/api/notifications/vapid', { headers: { 'content-type': 'application/json' } });
      const vapid = (await vapidRes.json()) as VapidResponse;
      setVapid(vapid);
      if (!vapid.publicKey || !vapid.enabled) {
        setStatus('Push keys are not configured yet. Go to Settings → Notifications and click “Configure push keys”.');
        return;
      }

      const reg = await getRegistration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub, deviceLabel }),
      });

      setSubscribed(true);
      setStatus('Notifications enabled.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const m = message || 'Failed to enable notifications.';
      if (m.toLowerCase().includes('push service not available')) {
        setStatus('Web Push is not available in this environment. Use Desktop Notifications (while app is open) instead.');
      } else {
        setStatus(m);
      }
    } finally {
      setLoading(false);
    }
  }

  async function disableNotifications() {
    if (!supported) return;
    setStatus(null);
    setLoading(true);
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setStatus('Notifications disabled.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message || 'Failed to disable notifications.');
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST', headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw new Error(await res.text());
      setStatus('Test notification queued.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message || 'Test notification failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm text-muted">
      <div>Web Push notifications (works on installed PWAs: iOS, Android, desktop browsers).</div>
      {desktopApp ? (
        <div className="text-xs text-muted">
          Note: Web Push is not supported in the macOS desktop app. Use “Desktop notifications” above.
        </div>
      ) : null}
      {!supported ? <div className="text-xs text-red-600">This browser does not support web push.</div> : null}
      {supported && vapid && !vapid.enabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={configurePushKeys} disabled={configuringKeys || loading}>
            {configuringKeys ? 'Configuring…' : 'Configure push keys'}
          </Button>
          <div className="text-xs text-muted">Admin-only. Creates VAPID keys and restarts services if supported.</div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Input
          value={deviceLabel}
          onChange={(event) => setDeviceLabel(event.target.value)}
          placeholder="Device label (optional)"
          className="h-9 w-full max-w-xs"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={enableNotifications} disabled={!supported || loading || permission === 'denied'}>
          Enable notifications
        </Button>
        <Button size="sm" variant="secondary" onClick={disableNotifications} disabled={!supported || loading}>
          Disable
        </Button>
        <Button size="sm" variant="secondary" onClick={sendTest} disabled={!supported || loading || !subscribed}>
          Send test
        </Button>
      </div>
      <div className="text-xs text-muted">
        Status: {permission === 'denied' ? 'Denied by browser' : subscribed ? 'Enabled' : 'Disabled'}
      </div>
      {status ? <div className="text-xs text-foreground">{status}</div> : null}
    </div>
  );
}
