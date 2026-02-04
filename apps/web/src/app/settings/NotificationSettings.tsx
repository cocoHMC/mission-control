import { DesktopNotifications } from '@/app/settings/DesktopNotifications';
import { WebNotifications } from '@/app/settings/WebNotifications';
import { headers } from 'next/headers';

export async function NotificationSettings() {
  const h = await headers();
  const ua = h.get('user-agent') || '';
  const isDesktop = /electron/i.test(ua) || h.get('x-mc-desktop') === '1';

  // Render one set of controls to keep the UI simple:
  // - Desktop app: show Desktop notifications only (Electron has no Web Push service).
  // - Browser/PWA: show Web Push only.
  return <>{isDesktop ? <DesktopNotifications /> : <WebNotifications />}</>;
}
