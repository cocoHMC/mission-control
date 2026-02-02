import 'dotenv/config';
import { z } from 'zod';
import PocketBase from 'pocketbase';
import { EventSource } from 'eventsource';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

(global as any).EventSource = EventSource;

const Env = z.object({
  PB_URL: z.string().url().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.string().email(),
  PB_SERVICE_PASSWORD: z.string().min(1),

  OPENCLAW_GATEWAY_URL: z.string().url().default('http://127.0.0.1:18789'),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
  OPENCLAW_GATEWAY_DISABLED: z.coerce.boolean().default(false),

  MC_LEAD_AGENT_ID: z.string().optional(),
  MC_LEAD_AGENT_NAME: z.string().optional(),
  MC_LEAD_AGENT: z.string().optional(),
  MC_NOTIFICATION_PREFIX: z.string().default('[Mission Control]'),
  MC_NOTIFICATION_TTL_MS: z.coerce.number().int().default(30_000),

  LEASE_MINUTES: z.coerce.number().int().positive().default(45),

  MC_STANDUP_HOUR: z.coerce.number().int().min(0).max(23).default(23),
  MC_STANDUP_MINUTE: z.coerce.number().int().min(0).max(59).default(30),

  MC_NODE_SNAPSHOT_MODE: z.enum(['off', 'cli']).default('off'),
  MC_NODE_SNAPSHOT_MINUTES: z.coerce.number().int().positive().default(10),
  MC_NODE_SNAPSHOT_CMD: z.string().optional(),
  OPENCLAW_CLI: z.string().optional(),
});

const env = Env.parse({
  PB_URL: process.env.PB_URL,
  PB_SERVICE_EMAIL: process.env.PB_SERVICE_EMAIL,
  PB_SERVICE_PASSWORD: process.env.PB_SERVICE_PASSWORD,
  OPENCLAW_GATEWAY_URL: process.env.OPENCLAW_GATEWAY_URL,
  OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN,
  OPENCLAW_GATEWAY_DISABLED: process.env.OPENCLAW_GATEWAY_DISABLED,
  MC_LEAD_AGENT_ID: process.env.MC_LEAD_AGENT_ID,
  MC_LEAD_AGENT_NAME: process.env.MC_LEAD_AGENT_NAME,
  MC_LEAD_AGENT: process.env.MC_LEAD_AGENT,
  MC_NOTIFICATION_PREFIX: process.env.MC_NOTIFICATION_PREFIX,
  MC_NOTIFICATION_TTL_MS: process.env.MC_NOTIFICATION_TTL_MS,
  LEASE_MINUTES: process.env.LEASE_MINUTES,
  MC_STANDUP_HOUR: process.env.MC_STANDUP_HOUR,
  MC_STANDUP_MINUTE: process.env.MC_STANDUP_MINUTE,
  MC_NODE_SNAPSHOT_MODE: process.env.MC_NODE_SNAPSHOT_MODE,
  MC_NODE_SNAPSHOT_MINUTES: process.env.MC_NODE_SNAPSHOT_MINUTES,
  MC_NODE_SNAPSHOT_CMD: process.env.MC_NODE_SNAPSHOT_CMD,
  OPENCLAW_CLI: process.env.OPENCLAW_CLI,
});

const pb = new PocketBase(env.PB_URL);

pb.autoCancellation(false);

const leadAgentId = env.MC_LEAD_AGENT_ID || env.MC_LEAD_AGENT || 'coco';

const taskCache = new Map<string, any>();
const agentByRecordId = new Map<string, any>();
const agentByOpenclawId = new Map<string, any>();
const recentNotifications = new Map<string, number>();
let lastStandupDate = '';

function nowIso() {
  return new Date().toISOString();
}

function minutesFromNow(mins: number) {
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function notificationKey(agentId: string, taskId: string | undefined, kind: string) {
  return `${agentId}|${taskId ?? ''}|${kind}`;
}

function shouldNotify(key: string) {
  const now = Date.now();
  for (const [k, ts] of recentNotifications) {
    if (now - ts > env.MC_NOTIFICATION_TTL_MS) recentNotifications.delete(k);
  }
  if (recentNotifications.has(key)) return false;
  recentNotifications.set(key, now);
  return true;
}

async function authServiceUser() {
  const auth = await pb.collection('service_users').authWithPassword(env.PB_SERVICE_EMAIL, env.PB_SERVICE_PASSWORD);
  return auth.token;
}

async function pbFetch(path: string, opts: { method?: string; token?: string; body?: any } = {}) {
  const token = opts.token ?? pb.authStore.token;
  const res = await fetch(new URL(path, env.PB_URL), {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`PocketBase ${opts.method ?? 'GET'} ${path} ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json;
}

async function ensureAuth() {
  if (pb.authStore.isValid) return pb.authStore.token;
  return authServiceUser();
}

async function toolsInvoke(tool: string, args: unknown) {
  if (env.OPENCLAW_GATEWAY_DISABLED || !env.OPENCLAW_GATEWAY_TOKEN) {
    throw new Error('OPENCLAW_GATEWAY_DISABLED');
  }

  const res = await fetch(new URL('/tools/invoke', env.OPENCLAW_GATEWAY_URL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENCLAW_GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({ tool, args }),
  });

  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(`tools/invoke ${tool} ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }

  return json;
}

function sessionKeyForAgent(agentId: string) {
  return `agent:${agentId}:main`;
}

function normalizeAgentId(agentId?: string | null) {
  if (!agentId) return null;
  const byOpenclaw = agentByOpenclawId.get(agentId);
  if (byOpenclaw) return byOpenclaw.openclawAgentId || byOpenclaw.id || agentId;
  const byRecord = agentByRecordId.get(agentId);
  if (byRecord) return byRecord.openclawAgentId || byRecord.id || agentId;
  return agentId;
}

function normalizeAgentIds(agentIds?: string[] | null) {
  if (!agentIds) return [] as string[];
  const normalized = new Set<string>();
  for (const id of agentIds) {
    const resolved = normalizeAgentId(id);
    if (resolved) normalized.add(resolved);
  }
  return Array.from(normalized);
}

async function sendToAgent(agentId: string, message: string) {
  const resolved = normalizeAgentId(agentId);
  if (!resolved) throw new Error('UNKNOWN_AGENT');
  const sessionKey = sessionKeyForAgent(resolved);
  await toolsInvoke('sessions_send', { sessionKey, message });
}

async function createActivity(token: string, type: string, summary: string, taskId?: string, actorAgentId?: string) {
  const actor = normalizeAgentId(actorAgentId) ?? '';
  await pbFetch('/api/collections/activities/records', {
    method: 'POST',
    token,
    body: { type, summary, taskId: taskId ?? '', actorAgentId: actor ?? '' },
  });
}

async function ensureTaskSubscription(token: string, taskId: string, agentId: string, reason: string) {
  if (!taskId || !agentId) return null;
  const normalized = normalizeAgentId(agentId);
  if (!normalized) return null;
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `taskId = "${taskId}" && agentId = "${normalized}"`,
  });
  const existing = await pbFetch(`/api/collections/task_subscriptions/records?${q.toString()}`, { token });
  if (existing?.items?.length) return existing.items[0];

  try {
    return await pbFetch('/api/collections/task_subscriptions/records', {
      method: 'POST',
      token,
      body: { taskId, agentId: normalized, reason },
    });
  } catch {
    return null;
  }
}

async function createNotification(token: string, toAgentId: string, content: string, taskId?: string, kind = 'generic') {
  const normalized = normalizeAgentId(toAgentId);
  if (!normalized) return null;
  const key = notificationKey(normalized, taskId, kind);
  if (!shouldNotify(key)) return null;

  return pbFetch('/api/collections/notifications/records', {
    method: 'POST',
    token,
    body: { toAgentId: normalized, taskId: taskId ?? '', content, delivered: false },
  });
}

async function deliverPendingNotifications(token: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '50',
    filter: 'delivered = false',
  });
  const batch = await pbFetch(`/api/collections/notifications/records?${q.toString()}`, { token });

  for (const n of (batch.items ?? []) as any[]) {
    const agentId = normalizeAgentId(n.toAgentId as string) ?? (n.toAgentId as string);
    const taskId = (n.taskId as string) || '';
    const content = n.content as string;

    try {
      await sendToAgent(agentId, `${env.MC_NOTIFICATION_PREFIX} ${content}${taskId ? ` (task ${taskId})` : ''}`);
      await pbFetch(`/api/collections/notifications/records/${n.id}`, {
        method: 'PATCH',
        token,
        body: { delivered: true, deliveredAt: nowIso() },
      });
    } catch (err: any) {
      if (err?.message === 'OPENCLAW_GATEWAY_DISABLED') {
        console.log('[worker] tools/invoke disabled, holding notifications');
        return;
      }
      console.error('[worker] deliver failed', n.id, err?.message || err);
    }
  }
}

function extractMentions(content: string) {
  const mentions = new Set<string>();
  const regex = /@([a-zA-Z0-9_-]+)/g;
  let match = regex.exec(content);
  while (match) {
    mentions.add(match[1]);
    match = regex.exec(content);
  }
  return Array.from(mentions);
}

async function handleTaskEvent(token: string, record: any, action: string) {
  const prev = taskCache.get(record.id);
  taskCache.set(record.id, record);

  if (action === 'create') {
    await createActivity(token, 'task_created', `Created task "${record.title}"`, record.id);
  }

  if (prev && prev.status !== record.status) {
    await createActivity(token, 'status_change', `Task moved to ${record.status}`, record.id, record.leaseOwnerAgentId || '');
  }

  if (record.status === 'in_progress' && !record.leaseOwnerAgentId) {
    const assignees = normalizeAgentIds(record.assigneeIds ?? []);
    const owner = assignees[0] || normalizeAgentId(record.leaseOwnerAgentId) || leadAgentId;
    await pbFetch(`/api/collections/tasks/records/${record.id}`, {
      method: 'PATCH',
      token,
      body: {
        leaseOwnerAgentId: owner,
        leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES),
        lastProgressAt: nowIso(),
      },
    });
  }

  if (record.status === 'review' || record.status === 'done') {
    await pbFetch(`/api/collections/tasks/records/${record.id}`, {
      method: 'PATCH',
      token,
      body: { leaseExpiresAt: '', attemptCount: 0 },
    });
  }

  const prevAssignees = new Set<string>(normalizeAgentIds(prev?.assigneeIds ?? []));
  const nextAssignees = new Set<string>(normalizeAgentIds(record.assigneeIds ?? []));

  for (const agentId of nextAssignees) {
    if (!prevAssignees.has(agentId)) {
      await ensureTaskSubscription(token, record.id, agentId, 'assigned');
      await createNotification(token, agentId, `Assigned: ${record.title}`, record.id, 'assigned');
    }
  }
}

async function handleMessageEvent(token: string, record: any) {
  const taskId = record.taskId as string;
  const content = record.content ?? '';
  const fromAgentId = normalizeAgentId(record.fromAgentId || '') || '';
  const mentions = record.mentions?.length ? record.mentions : extractMentions(content);

  await pbFetch(`/api/collections/tasks/records/${taskId}`, {
    method: 'PATCH',
    token,
    body: { lastProgressAt: nowIso(), leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES) },
  });

  await createActivity(token, 'message_sent', `Message posted on task`, taskId, fromAgentId);

  if (fromAgentId) await ensureTaskSubscription(token, taskId, fromAgentId, 'commented');

  const recipientIds = new Set<string>();

  if (mentions.includes('all')) {
    for (const id of agentByOpenclawId.keys()) recipientIds.add(id);
  }
  for (const mention of mentions) {
    if (mention !== 'all') {
      const resolved = normalizeAgentId(mention);
      if (resolved) recipientIds.add(resolved);
    }
  }

  const q = new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = "${taskId}"` });
  const subs = await pbFetch(`/api/collections/task_subscriptions/records?${q.toString()}`, { token });
  for (const sub of subs.items ?? []) {
    const resolved = normalizeAgentId(sub.agentId);
    if (resolved) recipientIds.add(resolved);
  }

  if (fromAgentId) recipientIds.delete(fromAgentId);

  for (const agentId of recipientIds) {
    await ensureTaskSubscription(token, taskId, agentId, mentions.includes(agentId) ? 'mentioned' : 'manual');
    await createNotification(token, agentId, `Update on task ${taskId}`, taskId, 'message');
  }
}

async function handleDocumentEvent(token: string, record: any, action: string) {
  const taskId = record.taskId as string;
  await pbFetch(`/api/collections/tasks/records/${taskId}`, {
    method: 'PATCH',
    token,
    body: { lastProgressAt: nowIso(), leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES) },
  });

  const type = action === 'create' ? 'document_created' : 'document_updated';
  await createActivity(token, type, `Document ${action}d: ${record.title}`, taskId, record.authorAgentId || '');
}

async function enforceLeases(token: string) {
  const now = new Date();
  const q = new URLSearchParams({
    page: '1',
    perPage: '50',
    filter: `status = "in_progress" && leaseExpiresAt != "" && leaseExpiresAt < "${now.toISOString()}"`,
  });
  const due = await pbFetch(`/api/collections/tasks/records?${q.toString()}`, { token });

  for (const t of (due.items ?? []) as any[]) {
    const owner = normalizeAgentId(t.leaseOwnerAgentId || t.assigneeIds?.[0]);
    if (!owner) continue;

    const attempt = (t.attemptCount ?? 0) + 1;
    const max = t.maxAutoNudges ?? 3;
    const escalation = normalizeAgentId(t.escalationAgentId) ?? leadAgentId;

    if (attempt <= max) {
      await createNotification(token, owner, `NUDGE: post progress or mark blocked for "${t.title}" (${attempt}/${max})`, t.id, 'nudge');
      await pbFetch(`/api/collections/tasks/records/${t.id}`, {
        method: 'PATCH',
        token,
        body: { attemptCount: attempt, leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES) },
      });
      await createActivity(token, 'lease_nudge', `Nudged ${owner} for "${t.title}"`, t.id, owner);
    } else {
      await createNotification(token, escalation, `ESCALATION: "${t.title}" stalled. Owner=${owner}.`, t.id, 'escalation');
      await createActivity(token, 'lease_escalated', `Escalated "${t.title}" to ${escalation}`, t.id, escalation);
      await pbFetch(`/api/collections/tasks/records/${t.id}`, {
        method: 'PATCH',
        token,
        body: { leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), attemptCount: attempt },
      });
    }
  }
}

async function refreshAgents(token: string) {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const agents = await pbFetch(`/api/collections/agents/records?${q.toString()}`, { token });
  agentByRecordId.clear();
  agentByOpenclawId.clear();
  for (const agent of agents.items ?? []) {
    agentByRecordId.set(agent.id, agent);
    const key = agent.openclawAgentId || agent.id;
    agentByOpenclawId.set(key, agent);
  }
}

async function refreshTasks(token: string) {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const tasks = await pbFetch(`/api/collections/tasks/records?${q.toString()}`, { token });
  taskCache.clear();
  for (const task of tasks.items ?? []) taskCache.set(task.id, task);
}

async function maybeStandup(token: string) {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  if (dateKey === lastStandupDate) return;
  if (now.getHours() < env.MC_STANDUP_HOUR || (now.getHours() === env.MC_STANDUP_HOUR && now.getMinutes() < env.MC_STANDUP_MINUTE)) return;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const completed = await pbFetch(`/api/collections/tasks/records?page=1&perPage=200&filter=${encodeURIComponent(`status = "done" && lastProgressAt >= "${start.toISOString()}"`)}`, { token });
  const inProgress = await pbFetch('/api/collections/tasks/records?page=1&perPage=200&filter=status%20=%20"in_progress"', { token });
  const review = await pbFetch('/api/collections/tasks/records?page=1&perPage=200&filter=status%20=%20"review"', { token });
  const blocked = await pbFetch('/api/collections/tasks/records?page=1&perPage=200&filter=status%20=%20"blocked"', { token });

  const lines = [
    `DAILY STANDUP - ${dateKey}`,
    '',
    'COMPLETED TODAY',
    ...((completed.items ?? []).map((t: any) => `- ${t.title}`)),
    '',
    'IN PROGRESS',
    ...((inProgress.items ?? []).map((t: any) => `- ${t.title}`)),
    '',
    'NEEDS REVIEW',
    ...((review.items ?? []).map((t: any) => `- ${t.title}`)),
    '',
    'BLOCKED',
    ...((blocked.items ?? []).map((t: any) => `- ${t.title}`)),
  ].join('\n');

  await pbFetch('/api/collections/documents/records', {
    method: 'POST',
    token,
    body: { title: `Daily Standup ${dateKey}`, content: lines, type: 'deliverable' },
  });
  await createActivity(token, 'standup', `Daily standup generated for ${dateKey}`);

  try {
    await sendToAgent(leadAgentId, lines);
  } catch (err: any) {
    console.error('[worker] standup delivery failed', err?.message || err);
  }

  lastStandupDate = dateKey;
}

async function snapshotNodes(token: string) {
  if (env.MC_NODE_SNAPSHOT_MODE === 'off') return;

  const cmd = env.MC_NODE_SNAPSHOT_CMD || `${env.OPENCLAW_CLI || 'openclaw'} nodes list --json`;
  try {
    const { stdout } = await execAsync(cmd);
    const list = JSON.parse(stdout);
    if (!Array.isArray(list)) return;

    for (const node of list) {
      const nodeId = node.id || node.nodeId || node.name;
      if (!nodeId) continue;

      const q = new URLSearchParams({ page: '1', perPage: '1', filter: `nodeId = "${nodeId}"` });
      const existing = await pbFetch(`/api/collections/nodes/records?${q.toString()}`, { token });

      const payload = {
        nodeId,
        displayName: node.displayName || node.name || nodeId,
        paired: node.paired ?? true,
        lastSeenAt: node.lastSeenAt || nowIso(),
        os: node.os || node.platform || 'unknown',
        arch: node.arch || node.architecture || 'unknown',
        capabilities: node.capabilities || {},
        execPolicy: node.execPolicy || 'deny',
        allowlistSummary: node.allowlistSummary || '',
      };

      if (existing?.items?.length) {
        await pbFetch(`/api/collections/nodes/records/${existing.items[0].id}`, { method: 'PATCH', token, body: payload });
      } else {
        await pbFetch('/api/collections/nodes/records', { method: 'POST', token, body: payload });
      }
    }
  } catch (err: any) {
    console.error('[worker] node snapshot failed', err?.message || err);
  }
}

async function subscribeWithRetry(token: string) {
  const subscribe = async () => {
    await pb.collection('tasks').subscribe('*', async (e) => handleTaskEvent(token, e.record, e.action));
    await pb.collection('messages').subscribe('*', async (e) => {
      if (e.action === 'create') await handleMessageEvent(token, e.record);
    });
    await pb.collection('documents').subscribe('*', async (e) => {
      if (e.action === 'create' || e.action === 'update') {
        await handleDocumentEvent(token, e.record, e.action);
      }
    });
    await pb.collection('notifications').subscribe('*', async () => deliverPendingNotifications(token));
  };

  while (true) {
    try {
      await subscribe();
      break;
    } catch (err: any) {
      console.error('[worker] realtime subscribe failed, retrying in 5s', err?.message || err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  console.log('[worker] starting');
  console.log('[worker] PB_URL', env.PB_URL);
  console.log('[worker] OPENCLAW_GATEWAY_URL', env.OPENCLAW_GATEWAY_URL);

  const pbToken = await authServiceUser();
  console.log('[worker] pocketbase authed as service user');

  await refreshAgents(pbToken);
  await refreshTasks(pbToken);
  await subscribeWithRetry(pbToken);

  setInterval(() => void deliverPendingNotifications(pbToken), 1500);
  setInterval(() => void enforceLeases(pbToken), 10_000);
  setInterval(() => void refreshAgents(pbToken), 60_000 * 5);
  setInterval(() => void maybeStandup(pbToken), 60_000);
  setInterval(() => void snapshotNodes(pbToken), 60_000 * env.MC_NODE_SNAPSHOT_MINUTES);

  // keep alive
  // eslint-disable-next-line no-constant-condition
  while (true) await new Promise((r) => setTimeout(r, 60_000));
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
