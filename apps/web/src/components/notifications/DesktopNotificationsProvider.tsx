'use client';

import * as React from 'react';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';

const STORAGE_KEY = 'mc_desktop_notifications_enabled';

function shouldRun() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function DesktopNotificationsProvider() {
  React.useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const seen = new Set<string>();

    async function start() {
      if (!shouldRun()) return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const pb = await getPocketBaseClient();
      unsub = await pb.collection('activities').subscribe('*', (e: PBRealtimeEvent<any>) => {
        if (cancelled) return;
        if (e.action !== 'create') return;

        const record = e.record || {};
        const id = String(record.id || '');
        if (!id) return;
        if (seen.has(id)) return;
        seen.add(id);
        // Prevent unbounded growth if the app stays open for a long time.
        if (seen.size > 250) {
          const first = seen.values().next().value;
          if (first) seen.delete(first);
        }

        const summary = String(record.summary || '').trim();
        if (!summary) return;

        const taskId = String(record.taskId || '').trim();
        const url = taskId ? `/tasks/${taskId}` : '/tasks';

        try {
          const n = new Notification('Mission Control', { body: summary });
          n.onclick = () => {
            try {
              window.focus();
              window.location.assign(url);
            } catch {
              // ignore
            }
          };
        } catch {
          // ignore if notifications fail
        }
      });
    }

    void start().catch(() => {});

    return () => {
      cancelled = true;
      try {
        unsub?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return null;
}

