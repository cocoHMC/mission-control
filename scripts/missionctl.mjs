#!/usr/bin/env node
import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Always load Mission Control's root `.env` regardless of where the command is invoked from.
// OpenClaw often runs commands from the agent workspace (not this repo), so relying on
// dotenv's default cwd lookup breaks.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isPlaceholderSecret(value) {
  if (!value) return true;
  const s = String(value).trim().toLowerCase();
  return s === 'change-me' || s === 'changeme';
}

function guessDesktopEnvPath() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', '@mission-control', 'desktop', 'data', '.env');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, '@mission-control', 'desktop', 'data', '.env');
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(home, '.config');
  return join(xdg, '@mission-control', 'desktop', 'data', '.env');
}

const REPO_ENV = resolve(__dirname, '..', '.env');
const DESKTOP_ENV = guessDesktopEnvPath();
const DATA_DIR_ENV = process.env.MC_DATA_DIR ? resolve(process.env.MC_DATA_DIR, '.env') : '';
const ENV_OVERRIDE = (() => {
  const i = process.argv.indexOf('--env');
  return i >= 0 ? process.argv[i + 1] : '';
})();

function selectEnvPath() {
  if (ENV_OVERRIDE) {
    if (ENV_OVERRIDE === 'repo') return REPO_ENV;
    if (ENV_OVERRIDE === 'desktop') return DESKTOP_ENV;
    return resolve(ENV_OVERRIDE);
  }

  if (DATA_DIR_ENV && existsSync(DATA_DIR_ENV)) return DATA_DIR_ENV;

  // Prefer the repo env when it exists (local dev / source checkout). If it looks like
  // a fresh placeholder env and the desktop env exists, fall back to desktop automatically.
  // OpenClaw often invokes `missionctl` outside the repo cwd, so we can't rely on callers
  // to pass `--env repo` explicitly.
  if (existsSync(REPO_ENV)) {
    try {
      const parsed = dotenv.parse(readFileSync(REPO_ENV, 'utf8'));
      const pass = parsed.PB_SERVICE_PASSWORD;
      if (existsSync(DESKTOP_ENV) && isPlaceholderSecret(pass)) return DESKTOP_ENV;
    } catch {
      // ignore and fall back to repo env
    }
    return REPO_ENV;
  }

  if (existsSync(DESKTOP_ENV)) return DESKTOP_ENV;
  return REPO_ENV;
}

const ENV_PATH = selectEnvPath();
const FALLBACK_ENV_NAME =
  ENV_OVERRIDE
    ? ''
    : ENV_PATH === REPO_ENV && existsSync(DESKTOP_ENV)
      ? 'desktop'
      : ENV_PATH === DESKTOP_ENV && existsSync(REPO_ENV)
        ? 'repo'
        : '';
// Important: when switching env files (or when invoked by OpenClaw), the parent process can
// inherit conflicting env vars (e.g. PB_URL). We want the selected env file to be authoritative.
dotenv.config({ path: ENV_PATH, override: true });
if (process.env.MISSIONCTL_DEBUG) {
  // Debug helper (safe): never print secrets, only env resolution context.
  console.error('[missionctl] env', { envPath: ENV_PATH, fallback: FALLBACK_ENV_NAME, pbUrl: process.env.PB_URL || '' });
}

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

if (isPlaceholderSecret(PASS)) {
  // Helpful guardrail: if this is still "change-me", users commonly ran Mission Control
  // via the desktop app (which stores its env elsewhere) and are accidentally reading the repo .env.
  // We keep this as an error to avoid confusing PocketBase auth failures.
  console.error(`PB_SERVICE_PASSWORD is placeholder ("change-me").\nLoaded env: ${ENV_PATH}\nIf you're using the desktop app, run: missionctl --env desktop ...`);
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

function escapeFilterValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function resolveAgentRecordId(agentLike, t) {
  const raw = String(agentLike || '').trim();
  if (!raw) return '';
  // Try to resolve OpenClaw agent ids to PocketBase record ids.
  // This lets agents use `--agent main` consistently even though tasks store relation ids.
  const filter = `openclawAgentId = "${escapeFilterValue(raw)}" || id = "${escapeFilterValue(raw)}"`;
  const q = new URLSearchParams({ page: '1', perPage: '1', filter });
  try {
    const res = await pb(`/api/collections/agents/records?${q.toString()}`, { token: t });
    const found = (res.items || [])[0];
    return found?.id || raw;
  } catch {
    return raw;
  }
}

async function resolveAgentRecordIds(agentLikes, t) {
  const out = [];
  const seen = new Set();
  for (const a of agentLikes || []) {
    const id = await resolveAgentRecordId(a, t);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function usage() {
  console.log(`missionctl (v1)

Usage:
  missionctl my --agent <id>
  missionctl list [--status ...] [--assignee ...] [--label ...] [--json]
  missionctl get <taskId> [--json]
  missionctl create --title "..." [--desc "..."] [--context "..." | --context-file <path|->] [--priority p2] [--assignees lead,dev] [--startAt ISO] [--dueAt ISO] [--requiresReview true|false]
  missionctl claim <taskId> --agent <id>
  missionctl assign <taskId> --assignees coco,dev
  missionctl say <taskId> --agent <id> (--text "..." | --text-file <path|->)
  missionctl status <taskId> --status <inbox|assigned|in_progress|review|done|blocked>
  missionctl task set <taskId> [--startAt ISO] [--dueAt ISO] [--requiresReview true|false] [--context "..." | --context-file <path|->]
  missionctl block <taskId> --agent <id> --reason "..."
  missionctl doc <taskId> --title "..." (--content "..." | --content-file <path|->) [--type deliverable]
  missionctl subtasks list <taskId> [--json]
  missionctl subtasks add <taskId> --title "..."
  missionctl subtasks toggle <subtaskId> [--done true|false]
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

function commandInfo() {
  // Support placing global flags (like `--env desktop`) before the command:
  //   missionctl --env desktop list
  //   missionctl list --env desktop
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    if (a === '--env') {
      i += 1; // skip env value
      continue;
    }
    if (a.startsWith('-')) continue;
    return { cmd: a, cmdIndex: i + 2 }; // absolute index in process.argv
  }
  return { cmd: '', cmdIndex: -1 };
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

function argBool(flag) {
  const v = arg(flag);
  if (v == null) return undefined;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(v).toLowerCase());
}

async function main() {
  const { cmd, cmdIndex } = commandInfo();
  if (!cmd || cmd === '-h' || cmd === '--help') return usage();

  const t = await token();

  if (cmd === 'my') {
    const agent = arg('--agent') || DEFAULT_AGENT;
    const agentRecordId = await resolveAgentRecordId(agent, t);
    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      filter: `assigneeIds ~ "${escapeFilterValue(agentRecordId)}" && status != "done"`,
    });
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
    if (assignee) {
      const assigneeRecordId = await resolveAgentRecordId(assignee, t);
      filters.push(`assigneeIds ~ "${escapeFilterValue(assigneeRecordId)}"`);
    }
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

  if (cmd === 'get') {
    const taskId = process.argv[cmdIndex + 1];
    const jsonFlag = process.argv.includes('--json');
    if (!taskId) throw new Error('taskId required');
    const task = await pb(`/api/collections/tasks/records/${taskId}`, { token: t });
    if (jsonFlag) {
      console.log(JSON.stringify(task, null, 2));
      return;
    }
    console.log(`${task.id}  [${task.status}]  ${task.title}`);
    const desc = String(task.description || '').trim();
    if (desc) console.log(`\n${desc}\n`);
    const ctx = String(task.context || '').trim();
    if (ctx) console.log(`\n---\n\nDeep context:\n\n${ctx}\n`);
    if (task.dueAt) console.log(`Due: ${task.dueAt}`);
    if (task.startAt) console.log(`Start: ${task.startAt}`);
    return;
  }

  if (cmd === 'create') {
    const title = arg('--title');
    if (!title) throw new Error('--title required');
    const desc = arg('--desc') || '';
    let context = arg('--context') || '';
    const contextFile = arg('--context-file');
    if (!context && contextFile) {
      if (contextFile === '-') {
        context = readFileSync(0, 'utf8');
      } else {
        context = readFileSync(resolve(contextFile), 'utf8');
      }
    }
    const priority = arg('--priority') || 'p2';
    const assigneesRaw = argList('--assignees');
    const assignees = await resolveAgentRecordIds(assigneesRaw, t);
    const startAt = arg('--startAt') || '';
    const dueAt = arg('--dueAt') || '';
    const requiresReview = argBool('--requiresReview') ?? false;
    const now = new Date().toISOString();
    const created = await pb('/api/collections/tasks/records', {
      method: 'POST',
      token: t,
      body: {
        title,
        description: desc,
        context: context || '',
        priority,
        status: assignees.length ? 'assigned' : 'inbox',
        assigneeIds: assignees,
        escalationAgentId: DEFAULT_AGENT,
        attemptCount: 0,
        maxAutoNudges: 3,
        archived: false,
        createdAt: now,
        updatedAt: now,
        startAt,
        dueAt,
        completedAt: '',
        requiresReview,
        order: Date.now(),
        subtasksTotal: 0,
        subtasksDone: 0,
      },
    });
    console.log('created', created.id);
    return;
  }

  if (cmd === 'claim') {
    const taskId = process.argv[cmdIndex + 1];
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
        maxAutoNudges: 3,
        updatedAt: now.toISOString(),
      },
    });
    console.log('claimed', updated.id);
    return;
  }

  if (cmd === 'assign') {
    const taskId = process.argv[cmdIndex + 1];
    const assigneesRaw = argList('--assignees');
    if (!taskId) throw new Error('taskId required');
    if (!assigneesRaw.length) throw new Error('--assignees required');
    const assignees = await resolveAgentRecordIds(assigneesRaw, t);
    const updated = await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: { assigneeIds: assignees, status: 'assigned', updatedAt: new Date().toISOString() },
    });
    console.log('assigned', updated.id);
    return;
  }

  if (cmd === 'say') {
    const taskId = process.argv[cmdIndex + 1];
    const agent = arg('--agent') || DEFAULT_AGENT;
    let text = arg('--text');
    const textFile = arg('--text-file');
    if (!taskId) throw new Error('taskId required');
    if (!text && textFile) {
      if (textFile === '-') {
        text = readFileSync(0, 'utf8');
      } else {
        text = readFileSync(resolve(textFile), 'utf8');
      }
    }
    if (!text) throw new Error('--text or --text-file required');
    const now = new Date().toISOString();
    const created = await pb('/api/collections/messages/records', {
      method: 'POST',
      token: t,
      body: { taskId, fromAgentId: agent, content: text, mentions: [], createdAt: now, updatedAt: now },
    });
    console.log('message', created.id);
    return;
  }

  if (cmd === 'status') {
    const taskId = process.argv[cmdIndex + 1];
    const status = arg('--status');
    if (!taskId) throw new Error('taskId required');
    if (!status) throw new Error('--status required');
    const now = new Date().toISOString();
    const updated = await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: {
        status,
        lastProgressAt: now,
        completedAt: status === 'done' ? now : undefined,
        updatedAt: now,
      },
    });
    console.log('updated', updated.id, updated.status);
    return;
  }

  if (cmd === 'task' && process.argv[cmdIndex + 1] === 'set') {
    const taskId = process.argv[cmdIndex + 2];
    if (!taskId) throw new Error('taskId required');
    const startAt = arg('--startAt');
    const dueAt = arg('--dueAt');
    const requiresReview = argBool('--requiresReview');
    let context = arg('--context');
    const contextFile = arg('--context-file');
    if (!context && contextFile) {
      if (contextFile === '-') {
        context = readFileSync(0, 'utf8');
      } else {
        context = readFileSync(resolve(contextFile), 'utf8');
      }
    }
    if (startAt == null && dueAt == null && requiresReview == null && context == null) {
      throw new Error('Nothing to set. Use --startAt, --dueAt, --requiresReview, or --context/--context-file');
    }
    const now = new Date().toISOString();
    const updated = await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: {
        ...(startAt != null ? { startAt } : {}),
        ...(dueAt != null ? { dueAt } : {}),
        ...(requiresReview != null ? { requiresReview } : {}),
        ...(context != null ? { context } : {}),
        updatedAt: now,
      },
    });
    console.log('task updated', updated.id);
    return;
  }

  if (cmd === 'block') {
    const taskId = process.argv[cmdIndex + 1];
    const agent = arg('--agent') || DEFAULT_AGENT;
    const reason = arg('--reason');
    if (!taskId) throw new Error('taskId required');
    if (!reason) throw new Error('--reason required');
    await pb(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token: t,
      body: { status: 'blocked', lastProgressAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
    const now = new Date().toISOString();
    const msg = await pb('/api/collections/messages/records', {
      method: 'POST',
      token: t,
      body: { taskId, fromAgentId: agent, content: `BLOCKED: ${reason}`, mentions: [], createdAt: now, updatedAt: now },
    });
    console.log('blocked', taskId, 'message', msg.id);
    return;
  }

  if (cmd === 'doc') {
    const taskId = process.argv[cmdIndex + 1];
    const title = arg('--title');
    let content = arg('--content');
    const contentFile = arg('--content-file');
    const type = arg('--type') || 'deliverable';
    if (!taskId) throw new Error('taskId required');
    if (!title) throw new Error('--title required');
    if (!content && contentFile) {
      if (contentFile === '-') {
        content = readFileSync(0, 'utf8');
      } else {
        content = readFileSync(resolve(contentFile), 'utf8');
      }
    }
    if (!content) throw new Error('--content or --content-file required');
    const now = new Date().toISOString();
    const created = await pb('/api/collections/documents/records', {
      method: 'POST',
      token: t,
      body: { taskId, title, content, type, createdAt: now, updatedAt: now },
    });
    console.log('doc', created.id);
    return;
  }

  if (cmd === 'subtasks') {
    const sub = process.argv[cmdIndex + 1];

    if (sub === 'list') {
      const taskId = process.argv[cmdIndex + 2];
      const jsonFlag = process.argv.includes('--json');
      if (!taskId) throw new Error('taskId required');
      const q = new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = "${taskId}"` });
      const list = await pb(`/api/collections/subtasks/records?${q.toString()}`, { token: t });
      const items = (list.items || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (jsonFlag) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      for (const s of items) {
        console.log(`${s.id}  [${s.done ? 'x' : ' '}]  ${s.title}`);
      }
      return;
    }

    if (sub === 'add') {
      const taskId = process.argv[cmdIndex + 2];
      const title = arg('--title');
      if (!taskId) throw new Error('taskId required');
      if (!title) throw new Error('--title required');
      const now = new Date().toISOString();
      const created = await pb('/api/collections/subtasks/records', {
        method: 'POST',
        token: t,
        body: {
          taskId,
          title,
          done: false,
          order: Date.now(),
          assigneeIds: [],
          dueAt: '',
          createdAt: now,
          updatedAt: now,
        },
      });
      console.log('subtask created', created.id);
      return;
    }

    if (sub === 'toggle') {
      const subtaskId = process.argv[cmdIndex + 2];
      if (!subtaskId) throw new Error('subtaskId required');
      const doneFlag = argBool('--done');
      let done = doneFlag;
      if (done == null) {
        const existing = await pb(`/api/collections/subtasks/records/${subtaskId}`, { token: t });
        done = !existing?.done;
      }
      const now = new Date().toISOString();
      const updated = await pb(`/api/collections/subtasks/records/${subtaskId}`, {
        method: 'PATCH',
        token: t,
        body: { done, updatedAt: now },
      });
      console.log('subtask updated', updated.id, updated.done ? 'done' : 'not_done');
      return;
    }
  }

  if (cmd === 'subscribe') {
    const taskId = process.argv[cmdIndex + 1];
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
    const agentId = process.argv[cmdIndex + 1];
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
    const sub = process.argv[cmdIndex + 1];
    if (sub === 'list') {
      const out = execFileSync(OPENCLAW_CLI, ['nodes', 'list', '--json'], { encoding: 'utf8' });
      console.log(out.trim());
      return;
    }
    if (sub === 'health') {
      const nodeId = process.argv[cmdIndex + 2];
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

  if (cmd === 'agent' && process.argv[cmdIndex + 1] === 'seed') {
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
  const msg = String(e?.message || e);
  // Dev ergonomics: in setups where both a repo env and a desktop env exist (and both PB instances may be running),
  // it's easy for agents to point at the wrong PocketBase and hit 404s. If no explicit env override was provided,
  // try the other env once before failing.
  if (!process.env.MISSIONCTL_NO_FALLBACK && FALLBACK_ENV_NAME && msg.includes('-> 404')) {
    try {
      execFileSync(process.execPath, [process.argv[1], ...process.argv.slice(2), '--env', FALLBACK_ENV_NAME], {
        stdio: 'inherit',
        env: { ...process.env, MISSIONCTL_NO_FALLBACK: '1' },
      });
      process.exit(0);
    } catch {
      // fall through to the original error
    }
  }
  console.error(msg);
  process.exit(1);
});
