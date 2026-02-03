import PocketBase from 'pocketbase';

let client: PocketBase | null = null;
let tokenPromise: Promise<{ token: string; url: string }> | null = null;

export type PBRealtimeEvent<T> = {
  // PocketBase types `action` as `string` even though the server only emits
  // create/update/delete. Widen here so our subscribe callbacks are assignable.
  action: string;
  record: T;
};

async function fetchToken() {
  if (!tokenPromise) {
    tokenPromise = fetch('/api/pb-token', { headers: { 'content-type': 'application/json' } })
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

export async function getPocketBaseClient() {
  if (client) return client;
  const { token, url } = await fetchToken();
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  pb.authStore.save(token, null);
  client = pb;
  return pb;
}
