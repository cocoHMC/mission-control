#!/usr/bin/env node
import 'dotenv/config';

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const EMAIL = process.env.PB_SERVICE_EMAIL;
const PASS = process.env.PB_SERVICE_PASSWORD;

if (!EMAIL || !PASS) {
  console.error('Missing PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD');
  process.exit(1);
}

async function pb(path, { method='GET', token, body } = {}) {
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
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${typeof json==='string'?json:JSON.stringify(json)}`);
  return json;
}

async function token() {
  const r = await pb('/api/collections/service_users/auth-with-password', {
    method: 'POST',
    body: { identity: EMAIL, password: PASS },
  });
  return r.token;
}

function usage() {
  console.log(`missionctl (v0)

Usage:
  missionctl my --agent <id>
  missionctl claim <taskId> --agent <id>
  missionctl say <taskId> --agent <id> --text "..."
  missionctl status <taskId> --status <inbox|assigned|in_progress|review|done|blocked>

Env:
  PB_URL, PB_SERVICE_EMAIL, PB_SERVICE_PASSWORD
`);
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i+1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '-h' || cmd === '--help') return usage();

  const t = await token();

  if (cmd === 'my') {
    const agent = arg('--agent');
    if (!agent) throw new Error('--agent required');
    const q = new URLSearchParams({ page:'1', perPage:'200', filter: `assigneeIds ~ "${agent}" && status != "done"` });
    const tasks = await pb(`/api/collections/tasks/records?${q.toString()}`, { token: t });
    for (const it of tasks.items || []) {
      console.log(`${it.id}  [${it.status}]  ${it.title}`);
    }
    return;
  }

  if (cmd === 'claim') {
    const taskId = process.argv[3];
    const agent = arg('--agent');
    if (!taskId) throw new Error('taskId required');
    if (!agent) throw new Error('--agent required');
    const leaseMin = Number(process.env.LEASE_MINUTES || 45);
    const now = new Date();
    const updated = await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: {
        status: 'in_progress',
        leaseOwnerAgentId: agent,
        lastProgressAt: now.toISOString(),
        leaseExpiresAt: new Date(now.getTime() + leaseMin*60_000).toISOString(),
        attemptCount: 0,
      }
    });
    console.log('claimed', updated.id);
    return;
  }

  if (cmd === 'say') {
    const taskId = process.argv[3];
    const agent = arg('--agent');
    const text = arg('--text');
    if (!taskId) throw new Error('taskId required');
    if (!agent) throw new Error('--agent required');
    if (!text) throw new Error('--text required');
    const created = await pb('/api/collections/messages/records', {
      method: 'POST',
      token: t,
      body: { taskId, fromAgentId: agent, content: text, mentions: [] },
    });
    console.log('message', created.id);
    return;
  }

  if (cmd === 'status') {
    const taskId = process.argv[3];
    const status = arg('--status');
    if (!taskId) throw new Error('taskId required');
    if (!status) throw new Error('--status required');
    const updated = await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: { status, lastProgressAt: new Date().toISOString() },
    });
    console.log('updated', updated.id, updated.status);
    return;
  }

  usage();
}

main().catch((e)=>{
  console.error(String(e.message||e));
  process.exit(1);
});
