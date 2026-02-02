import 'dotenv/config';

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD');
  process.exit(1);
}

async function pb(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(new URL(path, PB_URL), {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function token() {
  const r = await pb('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return r.token;
}

const AUTH_RULE = '@request.auth.id != ""';

async function main() {
  const t = await token();
  const list = await pb('/api/collections?page=1&perPage=200', { token: t });

  const targets = new Set([
    'agents',
    'nodes',
    'tasks',
    'messages',
    'documents',
    'activities',
    'notifications',
    'task_subscriptions',
  ]);

  for (const c of list.items) {
    if (!targets.has(c.name)) continue;

    await pb(`/api/collections/${c.id}`, {
      method: 'PATCH',
      token: t,
      body: {
        listRule: AUTH_RULE,
        viewRule: AUTH_RULE,
        createRule: AUTH_RULE,
        updateRule: AUTH_RULE,
        deleteRule: AUTH_RULE,
      },
    });

    console.log('[pb_set_rules] updated rules for', c.name);
  }
}

main().catch((e) => {
  console.error('[pb_set_rules] failed', e.message);
  process.exit(1);
});
