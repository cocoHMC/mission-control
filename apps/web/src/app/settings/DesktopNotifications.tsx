'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STORAGE_KEY = 'mc_desktop_notifications_enabled';

function isDesktopApp() {
  return typeof window !== 'undefined' && Boolean((window as any).MissionControlDesktop);
}

export function DesktopNotifications() {
  const [supported, setSupported] = React.useState(false);
  const [permission, setPermission] = React.useState<NotificationPermission>('default');
  const [enabled, setEnabled] = React.useState(false);
  const [deviceLabel, setDeviceLabel] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const ok = typeof window !== 'undefined' && 'Notification' in window;
    setSupported(ok);
    if (typeof window !== 'undefined' && 'Notification' in window) setPermission(Notification.permission);
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setEnabled(false);
    }
  }, []);

  async function enable() {
    if (!supported) return;
    setStatus(null);
    setLoading(true);
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== 'granted') {
        setStatus('Notification permission was not granted.');
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // ignore
      }
      setEnabled(true);
      setStatus('Desktop notifications enabled (while Mission Control is open).');
    } catch (err: any) {
      setStatus(err?.message || 'Failed to enable notifications.');
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setStatus(null);
    setLoading(true);
    try {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setEnabled(false);
      setStatus('Desktop notifications disabled.');
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setStatus(null);
    setLoading(true);
    try {
      if (!supported) throw new Error('Notifications not supported in this environment.');
      if (permission !== 'granted') throw new Error('Notification permission not granted.');
      const title = 'Mission Control';
      const body = `Test notification${deviceLabel ? ` (${deviceLabel})` : ''}`;
      const n = new Notification(title, { body });
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignore
        }
      };
      setStatus('Test notification sent.');
    } catch (err: any) {
      setStatus(err?.message || 'Test failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm text-muted">
      <div>
        Desktop notifications (native OS notifications) while Mission Control is open.
        {isDesktopApp() ? ' (Recommended for the macOS app.)' : ' (Works in an open browser tab too.)'}
      </div>
      {!supported ? <div className="text-xs text-red-600">Notifications are not supported in this environment.</div> : null}
      <div className="flex flex-wrap gap-2">
        <Input
          value={deviceLabel}
          onChange={(event) => setDeviceLabel(event.target.value)}
          placeholder="Device label (optional)"
          className="h-9 w-full max-w-xs"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={enable} disabled={!supported || loading || permission === 'denied'}>
          Enable
        </Button>
        <Button size="sm" variant="secondary" onClick={disable} disabled={loading}>
          Disable
        </Button>
        <Button size="sm" variant="secondary" onClick={sendTest} disabled={!supported || loading || !enabled}>
          Send test
        </Button>
      </div>
      <div className="text-xs text-muted">
        Status: {permission === 'denied' ? 'Denied by OS/browser' : enabled ? 'Enabled' : 'Disabled'}
      </div>
      {status ? <div className="text-xs text-foreground">{status}</div> : null}
    </div>
  );
}

