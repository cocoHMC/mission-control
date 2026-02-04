'use client';

import * as React from 'react';
import { DesktopNotifications } from '@/app/settings/DesktopNotifications';
import { WebNotifications } from '@/app/settings/WebNotifications';

function isDesktopApp() {
  return typeof window !== 'undefined' && Boolean((window as any).MissionControlDesktop);
}

export function NotificationSettings() {
  const [desktop] = React.useState(isDesktopApp());

  // Render one set of controls to keep the UI simple:
  // - Desktop app: show Desktop notifications only (Electron has no Web Push service).
  // - Browser/PWA: show Web Push only.
  return <>{desktop ? <DesktopNotifications /> : <WebNotifications />}</>;
}
