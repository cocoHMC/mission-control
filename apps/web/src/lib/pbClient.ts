import PocketBase from 'pocketbase';
import { mcApiUrl } from '@/lib/clientApi';

type UnsubscribeFunc = () => Promise<void>;

type PocketBaseLike = {
  collection(name: string): {
    subscribe(topic: string, callback: (data: any) => void): Promise<UnsubscribeFunc>;
    unsubscribe(topic?: string): Promise<void>;
  };
};

let client: PocketBaseLike | null = null;
let clientPromise: Promise<PocketBaseLike> | null = null;
let tokenPromise: Promise<{ token: string; url: string }> | null = null;
let ssePromise: Promise<EventSource> | null = null;
let sse: EventSource | null = null;

function isLoopbackHost(host: string) {
  const h = String(host || '').trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

export type PBRealtimeEvent<T> = {
  // PocketBase types `action` as `string` even though the server only emits
  // create/update/delete. Widen here so our subscribe callbacks are assignable.
  action: string;
  record: T;
};

async function fetchToken() {
  if (!tokenPromise) {
    tokenPromise = fetch(mcApiUrl('/api/pb-token'), { headers: { 'content-type': 'application/json' } })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`PB token request failed ${res.status}: ${text}`);
        }
        return res.json();
      })
      .finally(() => {
        tokenPromise = null;
      });
  }
  return tokenPromise;
}

class SsePBClient implements PocketBaseLike {
  private listenersByEvent = new Map<string, Set<(ev: MessageEvent) => void>>();

  constructor(private source: EventSource) {}

  collection(name: string) {
    const collection = String(name || '').trim();
    if (!collection) throw new Error('Missing collection name');

    return {
      subscribe: async (topic: string, callback: (data: any) => void) => {
        const t = String(topic || '').trim();
        if (!t) throw new Error('Missing topic.');
        if (!callback) throw new Error('Missing subscription callback.');

        const eventName = `${collection}/${t}`;
        const listener = (ev: MessageEvent) => {
          let parsed: any = {};
          try {
            parsed = JSON.parse(String((ev as any)?.data ?? ''));
          } catch {
            // ignore parse errors; keep shape consistent
          }
          callback(parsed);
        };

        let set = this.listenersByEvent.get(eventName);
        if (!set) {
          set = new Set();
          this.listenersByEvent.set(eventName, set);
        }
        set.add(listener);
        this.source.addEventListener(eventName, listener as any);

        return async () => {
          this.source.removeEventListener(eventName, listener as any);
          const current = this.listenersByEvent.get(eventName);
          if (current) {
            current.delete(listener);
            if (!current.size) this.listenersByEvent.delete(eventName);
          }
        };
      },
      unsubscribe: async (topic?: string) => {
        const t = typeof topic === 'string' ? topic.trim() : '';
        if (!t) {
          // Unsubscribe all for this collection (prefix match).
          const prefix = `${collection}/`;
          for (const [eventName, listeners] of Array.from(this.listenersByEvent.entries())) {
            if (!eventName.startsWith(prefix)) continue;
            for (const listener of listeners) this.source.removeEventListener(eventName, listener as any);
            this.listenersByEvent.delete(eventName);
          }
          return;
        }

        const eventName = `${collection}/${t}`;
        const listeners = this.listenersByEvent.get(eventName);
        if (!listeners) return;
        for (const listener of listeners) this.source.removeEventListener(eventName, listener as any);
        this.listenersByEvent.delete(eventName);
      },
    };
  }
}

async function connectRealtimeStream(): Promise<EventSource> {
  if (sse) return sse;
  if (ssePromise) return ssePromise;

  ssePromise = new Promise<EventSource>((resolve, reject) => {
    const url = mcApiUrl('/api/realtime');
    const source = new EventSource(url);

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        source.close();
      } catch {
        // ignore
      }
      reject(new Error('Realtime stream connection timed out.'));
    }, 8_000);

    const cleanup = () => {
      clearTimeout(timeout);
      try {
        source.removeEventListener('ready', onReady as any);
      } catch {
        // ignore
      }
      source.onerror = null;
    };

    const onReady = () => {
      if (settled) return;
      settled = true;
      cleanup();
      sse = source;
      resolve(source);
    };

    // Wait for the server to confirm the bridge is online.
    source.addEventListener('ready', onReady as any);

    // Don't reject on the first error: EventSource retries automatically.
    source.onerror = () => {
      // noop; timeout will reject if it never connects
    };
  }).finally(() => {
    ssePromise = null;
  });

  return ssePromise;
}

export async function getPocketBaseClient() {
  if (client) return client;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    // Remote clients (ex: iPhone PWA via Tailscale) cannot connect to a loopback-only PocketBase.
    // Instead, use the Mission Control Next server as a secure SSE bridge.
    if (typeof window !== 'undefined' && !isLoopbackHost(window.location.hostname)) {
      const source = await connectRealtimeStream();
      const proxy = new SsePBClient(source);
      client = proxy;
      return proxy;
    }

    // Local-only: connect directly to PocketBase realtime.
    const { token, url } = await fetchToken();
    const pb = new PocketBase(url);
    pb.autoCancellation(false);
    pb.authStore.save(token, null);
    client = pb;
    return pb;
  })().finally(() => {
    clientPromise = null;
  });

  return clientPromise;
}
