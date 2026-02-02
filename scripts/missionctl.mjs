#!/usr/bin/env node
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const EMAIL = process.env.PB_SERVICE_EMAIL;
const PASS = process.env.PB_SERVICE_PASSWORD;
const DEFAULT_AGENT = process.env.MC_AGENT_ID || process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco';
const OPENCLAW_CLI = process.env.OPENCLAW_CLI || 'openclaw';
const HEALTH_CMDS = (process.env.MC_NODE_HEALTH_CMDS || 'uname,uptime,df -h')
  .split(',')
  .map((cmd) => cmd.trim())
  .filter(Boolean);
const HEALTH_TEMPLATE = process.env.MC_NODE_HEALTH_CMD_TEMPLATE || '';

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
  const r = await pb('/api/collections/service_users/auth-with-password', {
    method: 'POST',
    body: { identity: EMAIL, password: PASS },
  });
  return r.token;
}

function usage() {
  console.log(`missionctl (v1)

Usage:
  missionctl my --agent <id>
  missionctl list [--status ...] [--assignee ...] [--label ...] [--json]
  missionctl create --title "..." [--desc "..."] [--priority p2] [--assignees lead,dev]
  missionctl claim <taskId> --agent <id>
  missionctl assign <taskId> --assignees coco,dev
  missionctl say <taskId> --agent <id> --text "..."
  missionctl status <taskId> --status <inbox|assigned|in_progress|review|done|blocked>
  missionctl block <taskId> --agent <id> --reason "..."
  missionctl doc <taskId> --title "..." --content "..." [--type deliverable]
  missionctl subscribe <taskId> --agent <id>
  missionctl notify <agentId> --text "..."
  missionctl node list
  missionctl node health <nodeId> --cmd "uname"
  missionctl agent seed --id <id> --name "Name" --role "Role"

Env:
  PB_URL, PB_SERVICE_EMAIL, PB_SERVICE_PASSWORD
  MC_AGENT_ID (default agent id, defaults to coco)
  OPENCLAW_CLI, MC_NODE_HEALTH_CMDS
`);
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function argList(flag) {
  const v = arg(flag);
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '-h' || cmd === '--help') return usage();

  const t = await token();

  if (cmd === 'my') {
    const agent = arg('--agent') || DEFAULT_AGENT;
    const q = new URLSearchParams({ page: '1', perPage: '200', filter: `assigneeIds ~ "${agent}" && status != "done"` });
    const tasks = await pb(`/api/collections/tasks/records?${q.toString()}`, { token: t });
    for (const it of tasks.items || []) {
      console.log(`${it.id}  [${it.status}]  ${it.title}`);
    }
    return;
  }

  if (cmd === 'list') {
    const status = arg('--status');
    const assignee = arg('--assignee');
    const label = arg('--label');
    const jsonFlag = process.argv.includes('--json');
    const filters = [];
    if (status) filters.push(`status = "${status}"`);
    if (assignee) filters.push(`assigneeIds ~ "${assignee}"`);
    if (label) filters.push(`labels ~ "${label}"`);
    const filter = filters.length ? filters.join(' && ') : '';
    const q = new URLSearchParams({ page: '1', perPage: '200' });
    if (filter) q.set('filter', filter);
    const tasks = await pb(`/api/collections/tasks/records?${q.toString()}`, { token: t });
    if (jsonFlag) {
      console.log(JSON.stringify(tasks.items || [], null, 2));
      return;
    }
    for (const it of tasks.items || []) {
      console.log(`${it.id}  [${it.status}]  ${it.title}`);
    }
    return;
  }

  if (cmd === 'create') {
    const title = arg('--title');
    if (!title) throw new Error('--title required');
    const desc = arg('--desc') || '';
    const priority = arg('--priority') || 'p2';
    const assignees = argList('--assignees');
    const created = await pb('/api/collections/tasks/records', {
      method: 'POST',
      token: t,
      body: {
        title,
        description: desc,
        priority,
        status: assignees.length ? 'assigned' : 'inbox',
        assigneeIds: assignees,
        escalationAgentId: DEFAULT_AGENT,
      },
    });
    console.log('created', created.id);
    return;
  }

  if (cmd === 'claim') {
    const taskId = process.argv[3];
    const agent = arg('--agent') || DEFAULT_AGENT;
    if (!taskId) throw new Error('taskId required');
    const leaseMin = Number(process.env.LEASE_MINUTES || 45);
    const now = new Date();
    const updated = await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: {
        status: 'in_progress',
        leaseOwnerAgentId: agent,
        lastProgressAt: now.toISOString(),
        leaseExpiresAt: new Date(now.getTime() + leaseMin * 60_000).toISOString(),
        attemptCount: 0,
      },
    });
    console.log('claimed', updated.id);
    return;
  }

  if (cmd === 'assign') {
    const taskId = process.argv[3];
    const assignees = argList('--assignees');
    if (!taskId) throw new Error('taskId required');
    if (!assignees.length) throw new Error('--assignees required');
    const updated = await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: { assigneeIds: assignees, status: 'assigned' },
    });
    console.log('assigned', updated.id);
    return;
  }

  if (cmd === 'say') {
    const taskId = process.argv[3];
    const agent = arg('--agent') || DEFAULT_AGENT;
    const text = arg('--text');
    if (!taskId) throw new Error('taskId required');
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

  if (cmd === 'block') {
    const taskId = process.argv[3];
    const agent = arg('--agent') || DEFAULT_AGENT;
    const reason = arg('--reason');
    if (!taskId) throw new Error('taskId required');
    if (!reason) throw new Error('--reason required');
    await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: { status: 'blocked', lastProgressAt: new Date().toISOString() },
    });
    const msg = await pb('/api/collections/messages/records', {
      method: 'POST',
      token: t,
      body: { taskId, fromAgentId: agent, content: `BLOCKED: ${reason}`, mentions: [] },
    });
    console.log('blocked', taskId, 'message', msg.id);
    return;
  }

  if (cmd === 'doc') {
    const taskId = process.argv[3];
    const title = arg('--title');
    const content = arg('--content');
    const type = arg('--type') || 'deliverable';
    if (!taskId) throw new Error('taskId required');
    if (!title) throw new Error('--title required');
    if (!content) throw new Error('--content required');
    const created = await pb('/api/collections/documents/records', {
      method: 'POST',
      token: t,
      body: { taskId, title, content, type },
    });
    console.log('doc', created.id);
    return;
  }

  if (cmd === 'subscribe') {
    const taskId = process.argv[3];
    const agent = arg('--agent') || DEFAULT_AGENT;
    if (!taskId) throw new Error('taskId required');
    const q = new URLSearchParams({ page: '1', perPage: '1', filter: `taskId = "${taskId}" && agentId = "${agent}"` });
    const existing = await pb(`/api/collections/task_subscriptions/records?${q.toString()}`, { token: t });
    if (existing?.items?.length) {
      console.log('already subscribed', existing.items[0].id);
      return;
    }
    const sub = await pb('/api/collections/task_subscriptions/records', {
      method: 'POST',
      token: t,
      body: { taskId, agentId: agent, reason: 'manual' },
    });
    console.log('subscribed', sub.id);
    return;
  }

  if (cmd === 'notify') {
    const agentId = process.argv[3];
    const text = arg('--text');
    if (!agentId) throw new Error('agentId required');
    if (!text) throw new Error('--text required');
    const note = await pb('/api/collections/notifications/records', {
      method: 'POST',
      token: t,
      body: { toAgentId: agentId, content: text, delivered: false },
    });
    console.log('notified', note.id);
    return;
  }

  if (cmd === 'node') {
    const sub = process.argv[3];
    if (sub === 'list') {
      const out = execFileSync(OPENCLAW_CLI, ['nodes', 'list', '--json'], { encoding: 'utf8' });
      console.log(out.trim());
      return;
    }
    if (sub === 'health') {
      const nodeId = process.argv[4];
      const cmdArg = arg('--cmd');
      if (!nodeId) throw new Error('nodeId required');
      if (!cmdArg) throw new Error('--cmd required');
      if (!HEALTH_CMDS.includes(cmdArg)) throw new Error(`cmd not allowed. Allowed: ${HEALTH_CMDS.join(', ')}`);
      if (HEALTH_TEMPLATE) {
        const command = HEALTH_TEMPLATE
          .replace(/\{cli\}/g, OPENCLAW_CLI)
          .replace(/\{node\}/g, nodeId)
          .replace(/\{cmd\}/g, cmdArg);
        const out = execFileSync(command, { encoding: 'utf8', shell: true });
        console.log(out.trim());
        return;
      }
      try {
        const out = execFileSync(OPENCLAW_CLI, ['nodes', 'exec', '--node', nodeId, '--cmd', cmdArg, '--json'], { encoding: 'utf8' });
        console.log(out.trim());
        return;
      } catch {
        const out = execFileSync(OPENCLAW_CLI, ['nodes', 'exec', '--id', nodeId, '--cmd', cmdArg, '--json'], { encoding: 'utf8' });
        console.log(out.trim());
        return;
      }
    }
  }

  if (cmd === 'agent' && process.argv[3] === 'seed') {
    const id = arg('--id');
    const name = arg('--name');
    const role = arg('--role') || 'Agent';
    if (!id) throw new Error('--id required');
    if (!name) throw new Error('--name required');
    const agent = await pb('/api/collections/agents/records', {
      method: 'POST',
      token: t,
      body: { openclawAgentId: id, displayName: name, role, status: 'idle', modelTier: 'mid' },
    });
    console.log('agent created', agent.id);
    const script = join(process.cwd(), 'scripts', 'agent_init.mjs');
    if (existsSync(script)) {
      execFileSync('node', [script, '--id', id, '--name', name, '--role', role], { stdio: 'inherit' });
    } else {
      console.log('agent_init.mjs not found; skip workspace creation.');
    }
    return;
  }

  usage();
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
