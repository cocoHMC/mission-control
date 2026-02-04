const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing PB_ADMIN_* env vars. Skipping settings update.');
  process.exit(0);
}

async function pbFetch(path, { method = 'GET', token, body } = {}) {
  const url = new URL(path, PB_URL);
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const err = new Error(`PocketBase ${method} ${path} -> ${res.status}`);
    err.detail = json;
    throw err;
  }
  return json;
}

async function adminToken() {
  const auth = await pbFetch('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return auth.token;
}

function needsPatch(current, desired) {
  return Object.entries(desired).some(([k, v]) => current?.[k] !== v);
}

async function main() {
  const token = await adminToken();

  const settings = await pbFetch('/api/settings', { token: `Bearer ${token}` });
  const current = settings?.logs || {};

  // Prevent runaway disk usage: request/info logs can grow extremely fast under a polling worker.
  // Keep retention short and only record warnings+ errors.
  const desired = {
    maxDays: 2,
    minLevel: 4,
    logIP: false,
    logAuthId: false,
  };

  if (!needsPatch(current, desired)) {
    console.log('[pb_set_settings] logs already configured');
    return;
  }

  await pbFetch('/api/settings', {
    method: 'PATCH',
    token: `Bearer ${token}`,
    body: {
      logs: {
        ...current,
        ...desired,
      },
    },
  });
  console.log('[pb_set_settings] updated logs settings', desired);
}

main().catch((err) => {
  console.error('[pb_set_settings] failed', err.message);
  console.error(err.detail || err);
  process.exit(1);
});

