type AuthMode = 'superuser' | 'service_user';
type AuthState = { token: string; at: number; mode: AuthMode };

let cached: AuthState | null = null;

export type PbHttpError = Error & {
  status?: number;
  json?: unknown;
  path?: string;
  method?: string;
  source?: 'pocketbase';
};

export function pbUrl() {
  return process.env.PB_URL || 'http://127.0.0.1:8090';
}

function resolveAuthMode(): { mode: AuthMode; identity: string; password: string; path: string } {
  // Server-side routes need broad read/write access; use PocketBase superuser when configured.
  const adminEmail = String(process.env.PB_ADMIN_EMAIL || '').trim();
  const adminPass = String(process.env.PB_ADMIN_PASSWORD || '').trim();
  if (adminEmail && adminPass) {
    return {
      mode: 'superuser',
      identity: adminEmail,
      password: adminPass,
      path: '/api/collections/_superusers/auth-with-password',
    };
  }

  const identity = String(process.env.PB_SERVICE_EMAIL || '').trim();
  const password = String(process.env.PB_SERVICE_PASSWORD || '').trim();
  if (!identity || !password) {
    const err: PbHttpError = new Error(
      'Missing PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD (preferred) or PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD.'
    );
    err.status = 500;
    err.source = 'pocketbase';
    throw err;
  }
  return {
    mode: 'service_user',
    identity,
    password,
    path: '/api/collections/service_users/auth-with-password',
  };
}

async function authToken(): Promise<string> {
  const now = Date.now();
  const cfg = resolveAuthMode();
  if (cached && cached.mode === cfg.mode && now - cached.at < 10 * 60_000) return cached.token; // 10m cache

  const res = await fetch(new URL(cfg.path, pbUrl()), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: cfg.identity, password: cfg.password }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    const err: PbHttpError = new Error(`PocketBase auth failed: ${res.status} ${JSON.stringify(json)}`);
    err.status = res.status;
    err.json = json;
    err.path = cfg.path;
    err.method = 'POST';
    err.source = 'pocketbase';
    throw err;
  }

  cached = { token: json.token, at: now, mode: cfg.mode };
  return json.token;
}

export async function pbServiceToken() {
  return authToken();
}

export async function pbFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  async function doFetch(token: string) {
    const res = await fetch(new URL(path, pbUrl()), {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
    const text = await res.text().catch(() => '');
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { res, json };
  }

  let token = await authToken();
  let { res, json } = await doFetch(token);

  // If the cached auth token expired early, retry once with a fresh login.
  if (res.status === 401) {
    cached = null;
    token = await authToken();
    ({ res, json } = await doFetch(token));
  }

  if (!res.ok) {
    const err: PbHttpError = new Error(
      `PocketBase ${init.method ?? 'GET'} ${path} failed: ${res.status} ${JSON.stringify(json)}`
    );
    err.status = res.status;
    err.json = json;
    err.path = path;
    err.method = init.method ?? 'GET';
    err.source = 'pocketbase';
    throw err;
  }
  return json as T;
}
