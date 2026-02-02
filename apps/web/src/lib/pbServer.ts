type AuthState = { token: string; at: number };

let cached: AuthState | null = null;

export function pbUrl() {
  return process.env.PB_URL || 'http://127.0.0.1:8090';
}

async function authToken(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.at < 10 * 60_000) return cached.token; // 10m cache

  const identity = process.env.PB_SERVICE_EMAIL;
  const password = process.env.PB_SERVICE_PASSWORD;
  if (!identity || !password) {
    throw new Error('Missing PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD in apps/web/.env.local');
  }

  const res = await fetch(new URL('/api/collections/service_users/auth-with-password', pbUrl()), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity, password }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PocketBase auth failed: ${res.status} ${JSON.stringify(json)}`);

  cached = { token: json.token, at: now };
  return json.token;
}

export async function pbFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await authToken();
  const res = await fetch(new URL(path, pbUrl()), {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`PocketBase ${init.method ?? 'GET'} ${path} failed: ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}
