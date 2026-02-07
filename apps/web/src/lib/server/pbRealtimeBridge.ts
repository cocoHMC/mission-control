import 'server-only';

import PocketBase from 'pocketbase';
import { EventSource } from 'eventsource';

import { pbUrl } from '@/lib/pbServer';

type RealtimePayload = {
  action?: string;
  record?: any;
};

export type RealtimeBridgeEvent = {
  event: string;
  data: { action: string; record: any };
};

type Listener = (evt: RealtimeBridgeEvent) => void;

const COLLECTIONS = ['tasks', 'messages', 'documents', 'subtasks', 'activities', 'agents'] as const;

class PBRealtimeBridge {
  private listeners = new Set<Listener>();
  private started = false;
  private starting: Promise<void> | null = null;
  private lastStartAttemptAt = 0;
  private lastStartError: Error | null = null;
  private unsubs: Array<() => Promise<void>> = [];

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcast(event: string, data: { action: string; record: any }) {
    const evt: RealtimeBridgeEvent = { event, data };
    for (const listener of this.listeners) {
      try {
        listener(evt);
      } catch {
        // Listener errors shouldn't take down the bridge.
      }
    }
  }

  private handleCollectionEvent(collection: string, payload: RealtimePayload) {
    const action = String(payload?.action || '');
    const record = payload?.record ?? null;

    // Match PocketBase event names so the client-side proxy can use addEventListener().
    this.broadcast(`${collection}/*`, { action, record });
    const recordId = record && typeof record === 'object' ? String(record.id || '') : '';
    if (recordId) this.broadcast(`${collection}/${recordId}`, { action, record });
  }

  async ensureStarted() {
    if (this.started) return;
    if (this.starting) return this.starting;

    // Avoid thrashing if PocketBase is down; the browser EventSource will retry anyway.
    const now = Date.now();
    if (this.lastStartError && now - this.lastStartAttemptAt < 10_000) {
      throw this.lastStartError;
    }

    this.lastStartAttemptAt = now;
    this.starting = this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start() {
    try {
      const g = globalThis as any;
      if (!g.EventSource) g.EventSource = EventSource;

      const url = pbUrl();
      const identity = process.env.PB_SERVICE_EMAIL;
      const password = process.env.PB_SERVICE_PASSWORD;
      if (!identity || !password) {
        throw new Error('Missing PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD (required for realtime bridge).');
      }

      const pb = new PocketBase(url);
      pb.autoCancellation(false);
      await pb.collection('service_users').authWithPassword(identity, password);

      // Ensure we don't duplicate subscriptions across fast refreshes.
      for (const unsub of this.unsubs) {
        try {
          await unsub();
        } catch {
          // ignore
        }
      }
      this.unsubs = [];

      for (const col of COLLECTIONS) {
        const unsub = await pb.collection(col).subscribe('*', (e: RealtimePayload) => this.handleCollectionEvent(col, e));
        this.unsubs.push(unsub);
      }

      this.started = true;
      this.lastStartError = null;
    } catch (err) {
      this.started = false;
      this.lastStartError = err instanceof Error ? err : new Error(String(err));
      throw this.lastStartError;
    }
  }
}

declare global {
  var __mcPBRealtimeBridge: PBRealtimeBridge | undefined;
}

export function getPBRealtimeBridge(): PBRealtimeBridge {
  if (!globalThis.__mcPBRealtimeBridge) globalThis.__mcPBRealtimeBridge = new PBRealtimeBridge();
  return globalThis.__mcPBRealtimeBridge;
}
