import 'dotenv/config';

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;
const SERVICE_EMAIL = process.env.PB_SERVICE_EMAIL;
const SERVICE_PASSWORD = process.env.PB_SERVICE_PASSWORD;
const LEAD_AGENT_ID = process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco';
const LEAD_AGENT_NAME = process.env.MC_LEAD_AGENT_NAME || 'Lead';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !SERVICE_EMAIL || !SERVICE_PASSWORD) {
  console.error('Missing PB_* env vars. Check .env');
  process.exit(1);
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

function schemaToFields(schema) {
  // PocketBase v0.36 expects `fields` rather than `schema`.
  // We'll accept our older `schema` format and map it forward.
  return (schema || []).map((f) => {
    const { type, name, required, options } = f;
    const base = {
      name,
      type,
      required: !!required,
      presentable: false,
      hidden: false,
      system: false,
    };
    if (type === 'select') {
      return { ...base, maxSelect: options?.maxSelect ?? 1, values: options?.values ?? [] };
    }
    if (type === 'relation') {
      return {
        ...base,
        collectionId: options?.collectionId,
        maxSelect: options?.maxSelect ?? 1,
        cascadeDelete: false,
      };
    }
    if (type === 'number') {
      return { ...base, min: null, max: null, onlyInt: false };
    }
    if (type === 'json') {
      return { ...base, maxSize: 2000000 };
    }
    if (type === 'editor') {
      return { ...base, maxSize: 500000 };
    }
    if (type === 'text') {
      return { ...base, min: null, max: null, pattern: '' };
    }
    if (type === 'bool') {
      return { ...base };
    }
    if (type === 'date') {
      return { ...base, min: '', max: '' };
    }
    return base;
  });
}

async function ensureCollection(token, def) {
  const existing = await pbFetch('/api/collections?page=1&perPage=200', { token: token ? `Bearer ${token}` : undefined });
  const found = existing?.items?.find((c) => c.name === def.name);
  if (found) {
    const desiredFields = def.fields ?? schemaToFields(def.schema);
    const desiredByName = new Map((desiredFields || []).map((f) => [f.name, f]));
    const existingNames = new Set((found.fields || []).map((f) => f.name));
    const missingFields = (desiredFields || []).filter((f) => f?.name && !existingNames.has(f.name));

    const nextFields = (found.fields || []).map((field) => {
      const desired = desiredByName.get(field.name);
      if (!desired) return field;
      // Currently we only reconcile `required` because it's the primary behavior-changing knob we rely on.
      if (typeof desired.required === 'boolean' && field.required !== desired.required) {
        return { ...field, required: desired.required };
      }
      return field;
    });

    const desiredIndexes = def.indexes ?? [];
    const existingIndexes = new Set(found.indexes || []);
    const missingIndexes = desiredIndexes.filter((idx) => !existingIndexes.has(idx));

    const fieldsChanged =
      missingFields.length ||
      nextFields.length !== (found.fields || []).length ||
      nextFields.some((f, i) => (found.fields || [])[i]?.required !== f.required);

    if (fieldsChanged || missingIndexes.length) {
      const patched = await pbFetch(`/api/collections/${found.id}`, {
        method: 'PATCH',
        token: `Bearer ${token}`,
        body: {
          ...(fieldsChanged ? { fields: [...nextFields, ...missingFields] } : {}),
          ...(missingIndexes.length ? { indexes: [...(found.indexes || []), ...missingIndexes] } : {}),
        },
      });
      console.log('[pb_bootstrap] patched collection', def.name, {
        addedFields: missingFields.map((f) => f.name),
        addedIndexes: missingIndexes.length,
      });
      return patched;
    }

    return found;
  }

  const body = {
    ...def,
    fields: def.fields ?? schemaToFields(def.schema),
  };
  delete body.schema;

  return pbFetch('/api/collections', {
    method: 'POST',
    token: `Bearer ${token}`,
    body,
  });
}

async function ensureServiceUser(token) {
  // Create a simple auth collection "service_users" if it doesn't exist.
  await ensureCollection(token, {
    name: 'service_users',
    type: 'auth',
    system: false,
    schema: [],
    options: {
      allowEmailAuth: true,
      allowOAuth2Auth: false,
      allowUsernameAuth: false,
      exceptEmailDomains: null,
      onlyEmailDomains: null,
      manageRule: null,
      deleteRule: null,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
    },
  });

  // Try to create service user (idempotency via list).
  const users = await pbFetch(`/api/collections/service_users/records?perPage=200&filter=${encodeURIComponent(`email="${SERVICE_EMAIL}"`)}`,
    { token: `Bearer ${token}` }
  );
  if (users?.items?.length) return users.items[0];

  return pbFetch('/api/collections/service_users/records', {
    method: 'POST',
    token: `Bearer ${token}`,
    body: { email: SERVICE_EMAIL, password: SERVICE_PASSWORD, passwordConfirm: SERVICE_PASSWORD },
  });
}

function rel(name) {
  return { type: 'relation', name, required: false, options: { collectionId: name, maxSelect: 1 } };
}

async function ensureAgent(token, agent) {
  const q = encodeURIComponent(`openclawAgentId="${agent.openclawAgentId}"`);
  const existing = await pbFetch(`/api/collections/agents/records?perPage=1&filter=${q}`, {
    token: `Bearer ${token}`,
  });
  if (existing?.items?.length) return existing.items[0];

  return pbFetch('/api/collections/agents/records', {
    method: 'POST',
    token: `Bearer ${token}`,
    body: agent,
  });
}

async function main() {
  console.log('[pb_bootstrap] PB_URL', PB_URL);
  const token = await adminToken();
  console.log('[pb_bootstrap] admin authed');

  // Core collections (minimal schema first; we can evolve later)
  const collections = [
    {
      name: 'agents',
      type: 'base',
      schema: [
        { type: 'text', name: 'displayName' },
        { type: 'text', name: 'role' },
        { type: 'text', name: 'openclawAgentId' },
        { type: 'select', name: 'status', options: { maxSelect: 1, values: ['idle', 'active', 'blocked', 'offline'] } },
        { type: 'text', name: 'currentTaskId' },
        { type: 'date', name: 'lastSeenAt' },
        { type: 'date', name: 'lastWorklogAt' },
        { type: 'select', name: 'modelTier', options: { maxSelect: 1, values: ['cheap', 'mid', 'expensive'] } },
        { type: 'text', name: 'defaultNodeId' },
      ],
    },
    {
      name: 'nodes',
      type: 'base',
      schema: [
        { type: 'text', name: 'nodeId' },
        { type: 'text', name: 'displayName' },
        { type: 'bool', name: 'paired' },
        { type: 'date', name: 'lastSeenAt' },
        { type: 'text', name: 'os' },
        { type: 'text', name: 'arch' },
        { type: 'json', name: 'capabilities' },
        { type: 'select', name: 'execPolicy', options: { maxSelect: 1, values: ['deny', 'ask', 'allowlist', 'full'] } },
        { type: 'text', name: 'allowlistSummary' },
      ],
    },
    {
      name: 'tasks',
      type: 'base',
      schema: [
        { type: 'text', name: 'title', required: true },
        { type: 'editor', name: 'description' },
        { type: 'select', name: 'status', required: true, options: { maxSelect: 1, values: ['inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'] } },
        { type: 'select', name: 'priority', options: { maxSelect: 1, values: ['p0', 'p1', 'p2', 'p3'] } },
        { type: 'json', name: 'assigneeIds' },
        { type: 'text', name: 'requiredNodeId' },
        { type: 'json', name: 'labels' },
        { type: 'text', name: 'leaseOwnerAgentId' },
        { type: 'date', name: 'leaseExpiresAt' },
        { type: 'number', name: 'attemptCount' },
        { type: 'date', name: 'lastProgressAt' },
        { type: 'number', name: 'maxAutoNudges' },
        { type: 'text', name: 'escalationAgentId' },
        { type: 'bool', name: 'archived' },
        { type: 'date', name: 'createdAt', required: true },
        { type: 'date', name: 'updatedAt', required: true },
        { type: 'date', name: 'startAt' },
        { type: 'date', name: 'dueAt' },
        { type: 'date', name: 'completedAt' },
        // PocketBase validates required bool/number fields as "must be truthy",
        // which breaks defaults like `false` and `0`. We enforce these in app logic instead.
        { type: 'bool', name: 'requiresReview' },
        { type: 'number', name: 'order' },
        { type: 'number', name: 'subtasksTotal' },
        { type: 'number', name: 'subtasksDone' },
      ],
    },
    {
      name: 'subtasks',
      type: 'base',
      schema: [
        { type: 'text', name: 'taskId', required: true },
        { type: 'text', name: 'title', required: true },
        { type: 'bool', name: 'done' },
        { type: 'number', name: 'order' },
        { type: 'json', name: 'assigneeIds' },
        { type: 'date', name: 'dueAt' },
        { type: 'date', name: 'createdAt', required: true },
        { type: 'date', name: 'updatedAt', required: true },
      ],
    },
    {
      name: 'messages',
      type: 'base',
      schema: [
        { type: 'text', name: 'taskId', required: true },
        { type: 'text', name: 'fromAgentId' },
        { type: 'editor', name: 'content', required: true },
        { type: 'json', name: 'mentions' },
        { type: 'date', name: 'createdAt', required: true },
        { type: 'date', name: 'updatedAt', required: true },
      ],
    },
    {
      name: 'documents',
      type: 'base',
      schema: [
        { type: 'text', name: 'taskId' },
        { type: 'text', name: 'title', required: true },
        { type: 'editor', name: 'content' },
        { type: 'select', name: 'type', options: { maxSelect: 1, values: ['deliverable', 'research', 'protocol', 'runbook'] } },
        { type: 'text', name: 'exportPath' },
        { type: 'date', name: 'createdAt', required: true },
        { type: 'date', name: 'updatedAt', required: true },
      ],
    },
    {
      name: 'activities',
      type: 'base',
      schema: [
        { type: 'text', name: 'type', required: true },
        { type: 'text', name: 'actorAgentId' },
        { type: 'text', name: 'taskId' },
        { type: 'text', name: 'summary' },
        { type: 'date', name: 'createdAt', required: true },
      ],
    },
    {
      name: 'notifications',
      type: 'base',
      schema: [
        { type: 'text', name: 'toAgentId', required: true },
        { type: 'text', name: 'taskId' },
        { type: 'text', name: 'content', required: true },
        { type: 'bool', name: 'delivered' },
        { type: 'date', name: 'deliveredAt' },
      ],
    },
    {
      name: 'task_subscriptions',
      type: 'base',
      schema: [
        { type: 'text', name: 'taskId', required: true },
        { type: 'text', name: 'agentId', required: true },
        { type: 'select', name: 'reason', options: { maxSelect: 1, values: ['assigned', 'commented', 'mentioned', 'manual'] } },
      ],
    },
    {
      name: 'push_subscriptions',
      type: 'base',
      schema: [
        { type: 'text', name: 'endpoint', required: true },
        { type: 'text', name: 'p256dh', required: true },
        { type: 'text', name: 'auth', required: true },
        { type: 'text', name: 'deviceLabel' },
        { type: 'text', name: 'userAgent' },
        { type: 'bool', name: 'enabled' },
        { type: 'date', name: 'lastSeenAt' },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_endpoint_push_subscriptions` ON `push_subscriptions` (`endpoint`)'],
    },
  ];

  for (const def of collections) {
    await ensureCollection(token, {
      ...def,
      system: false,
      options: def.options || {},
      indexes: def.indexes || [],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    console.log('[pb_bootstrap] ensured collection', def.name);
  }

  await ensureServiceUser(token);
  console.log('[pb_bootstrap] ensured service user', SERVICE_EMAIL);
  await ensureAgent(token, {
    displayName: LEAD_AGENT_NAME,
    role: 'Primary Gateway (Lead)',
    openclawAgentId: LEAD_AGENT_ID,
    status: 'idle',
    modelTier: 'mid',
  });
  console.log('[pb_bootstrap] ensured lead agent', LEAD_AGENT_ID);

  console.log('[pb_bootstrap] done');
}

main().catch((err) => {
  console.error('[pb_bootstrap] failed', err.message);
  console.error(err.detail || err);
  process.exit(1);
});
