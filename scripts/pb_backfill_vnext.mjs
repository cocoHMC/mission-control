#!/usr/bin/env node
import 'dotenv/config';

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const EMAIL = process.env.PB_SERVICE_EMAIL;
const PASS = process.env.PB_SERVICE_PASSWORD;

if (!EMAIL || !PASS) {
  console.error('Missing PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD');
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
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  return json;
}

async function token() {
  const auth = await pb('/api/collections/service_users/auth-with-password', {
    method: 'POST',
    body: { identity: EMAIL, password: PASS },
  });
  return auth.token;
}

async function listAll(t, collection, filter = '') {
  const out = [];
  let page = 1;
  while (true) {
    const q = new URLSearchParams({ page: String(page), perPage: '200' });
    if (filter) q.set('filter', filter);
    const data = await pb(`/api/collections/${collection}/records?${q.toString()}`, { token: t });
    out.push(...(data.items || []));
    if (!data.items || data.items.length < 200) break;
    page += 1;
  }
  return out;
}

async function patchOne(t, collection, id, body) {
  return pb(`/api/collections/${collection}/records/${id}`, { method: 'PATCH', token: t, body });
}

async function main() {
  const t = await token();
  const now = new Date();
  const nowIso = now.toISOString();
  const baseOrder = Date.now();

  console.log('[pb_backfill_vnext] PB_URL', PB_URL);

  const tasks = await listAll(t, 'tasks');
  console.log('[pb_backfill_vnext] tasks', tasks.length);

  // Backfill tasks in a stable-ish order (status then title).
  const byStatus = new Map();
  for (const task of tasks) {
    const key = String(task.status || 'inbox');
    const list = byStatus.get(key) || [];
    list.push(task);
    byStatus.set(key, list);
  }

  let orderCounter = 0;
  for (const [status, list] of byStatus) {
    list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    for (const task of list) {
      const patch = {};
      if (!task.createdAt) patch.createdAt = nowIso;
      if (!task.updatedAt) patch.updatedAt = nowIso;
      if (task.archived == null) patch.archived = false;
      if (task.requiresReview == null) patch.requiresReview = false;
      if (!task.subtasksTotal && task.subtasksTotal !== 0) patch.subtasksTotal = 0;
      if (!task.subtasksDone && task.subtasksDone !== 0) patch.subtasksDone = 0;
      if (!task.order || Number(task.order) === 0) {
        orderCounter += 1;
        patch.order = baseOrder + orderCounter * 1000;
      }
      if (String(task.status) === 'done' && !task.completedAt) patch.completedAt = nowIso;

      if (Object.keys(patch).length) {
        await patchOne(t, 'tasks', task.id, patch);
      }
    }
  }

  const messages = await listAll(t, 'messages');
  console.log('[pb_backfill_vnext] messages', messages.length);
  for (const msg of messages) {
    const patch = {};
    if (!msg.createdAt) patch.createdAt = nowIso;
    if (!msg.updatedAt) patch.updatedAt = nowIso;
    if (Object.keys(patch).length) await patchOne(t, 'messages', msg.id, patch);
  }

  const documents = await listAll(t, 'documents');
  console.log('[pb_backfill_vnext] documents', documents.length);
  for (const doc of documents) {
    const patch = {};
    if (!doc.createdAt) patch.createdAt = nowIso;
    if (!doc.updatedAt) patch.updatedAt = nowIso;
    if (Object.keys(patch).length) await patchOne(t, 'documents', doc.id, patch);
  }

  const activities = await listAll(t, 'activities');
  console.log('[pb_backfill_vnext] activities', activities.length);
  for (const act of activities) {
    if (!act.createdAt) await patchOne(t, 'activities', act.id, { createdAt: nowIso });
  }

  console.log('[pb_backfill_vnext] done');
}

main().catch((err) => {
  console.error('[pb_backfill_vnext] failed', err.message || err);
  process.exit(1);
});

