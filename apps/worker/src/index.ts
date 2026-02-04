import { z } from 'zod';
import PocketBase from 'pocketbase';
import { EventSource } from 'eventsource';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import webpush from 'web-push';

const execAsync = promisify(exec);

(global as any).EventSource = EventSource;

function parseEnvBool(value: unknown, defaultValue: boolean) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (!s) return defaultValue;
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
}

const EnvBool = z
  .preprocess((v) => parseEnvBool(v, false), z.boolean())
  .optional()
  .default(false);

const Env = z.object({
  PB_URL: z.string().url().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.string().email(),
  PB_SERVICE_PASSWORD: z.string().min(1),

  OPENCLAW_GATEWAY_URL: z.string().url().default('http://127.0.0.1:18789'),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
  OPENCLAW_GATEWAY_DISABLED: EnvBool,
  OPENCLAW_TOOLS_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  WEB_PUSH_ENABLED: EnvBool,
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().optional(),
  MC_PUSH_TTL_MS: z.coerce.number().int().positive().default(30_000),

  MC_LEAD_AGENT_ID: z.string().optional(),
  MC_LEAD_AGENT_NAME: z.string().optional(),
  MC_LEAD_AGENT: z.string().optional(),
  MC_NOTIFICATION_PREFIX: z.string().default('[Mission Control]'),
  MC_NOTIFICATION_TTL_MS: z.coerce.number().int().default(30_000),
  MC_DELIVER_DEBOUNCE_MS: z.coerce.number().int().positive().default(750),
  MC_DELIVER_INTERVAL_MS: z.coerce.number().int().positive().default(20_000),
  MC_CIRCUIT_MAX_SENDS_PER_MINUTE: z.coerce.number().int().positive().default(12),
  MC_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().default(900_000),

  LEASE_MINUTES: z.coerce.number().int().positive().default(45),

  MC_STANDUP_HOUR: z.coerce.number().int().min(0).max(23).default(23),
  MC_STANDUP_MINUTE: z.coerce.number().int().min(0).max(59).default(30),

  MC_NODE_SNAPSHOT_MODE: z.enum(['off', 'cli']).default('cli'),
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
  OPENCLAW_TOOLS_TIMEOUT_MS: process.env.OPENCLAW_TOOLS_TIMEOUT_MS,

  WEB_PUSH_ENABLED: process.env.WEB_PUSH_ENABLED,
  WEB_PUSH_PUBLIC_KEY: process.env.WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY: process.env.WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT: process.env.WEB_PUSH_SUBJECT,
  MC_PUSH_TTL_MS: process.env.MC_PUSH_TTL_MS,
  MC_LEAD_AGENT_ID: process.env.MC_LEAD_AGENT_ID,
  MC_LEAD_AGENT_NAME: process.env.MC_LEAD_AGENT_NAME,
  MC_LEAD_AGENT: process.env.MC_LEAD_AGENT,
  MC_NOTIFICATION_PREFIX: process.env.MC_NOTIFICATION_PREFIX,
  MC_NOTIFICATION_TTL_MS: process.env.MC_NOTIFICATION_TTL_MS,
  MC_DELIVER_DEBOUNCE_MS: process.env.MC_DELIVER_DEBOUNCE_MS,
  MC_DELIVER_INTERVAL_MS: process.env.MC_DELIVER_INTERVAL_MS,
  MC_CIRCUIT_MAX_SENDS_PER_MINUTE: process.env.MC_CIRCUIT_MAX_SENDS_PER_MINUTE,
  MC_CIRCUIT_COOLDOWN_MS: process.env.MC_CIRCUIT_COOLDOWN_MS,
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
const recentPush = new Map<string, number>();
let delivering = false;
let deliverTimer: ReturnType<typeof setTimeout> | null = null;
let circuitUntilMs = 0;
const sendTimestamps: number[] = [];
const sentNotificationIds = new Map<string, number>();
let lastStandupDate = '';

const webPushEnabled = Boolean(
  env.WEB_PUSH_ENABLED && env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY
);
if (webPushEnabled) {
  webpush.setVapidDetails(env.WEB_PUSH_SUBJECT || 'mailto:admin@local', env.WEB_PUSH_PUBLIC_KEY!, env.WEB_PUSH_PRIVATE_KEY!);
}

function nowIso() {
  return new Date().toISOString();
}

function pbDateForFilter(date: Date) {
  // PocketBase stores date fields like "YYYY-MM-DD HH:MM:SS.sssZ" (space separator),
  // while JS Date#toISOString uses "T". If we compare mismatched formats in PB filters
  // we can accidentally treat future leases as already expired (token-melting spam).
  return date.toISOString().replace('T', ' ');
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

function shouldPush(key: string) {
  const now = Date.now();
  for (const [k, ts] of recentPush) {
    if (now - ts > env.MC_PUSH_TTL_MS) recentPush.delete(k);
  }
  if (recentPush.has(key)) return false;
  recentPush.set(key, now);
  return true;
}

function isCircuitOpen() {
  return Date.now() < circuitUntilMs;
}

function allowSendOrTrip() {
  const now = Date.now();
  if (now < circuitUntilMs) return false;

  while (sendTimestamps.length && now - sendTimestamps[0] > 60_000) sendTimestamps.shift();

  if (sendTimestamps.length >= env.MC_CIRCUIT_MAX_SENDS_PER_MINUTE) {
    circuitUntilMs = now + env.MC_CIRCUIT_COOLDOWN_MS;
    console.error('[worker] CIRCUIT BREAKER tripped: too many OpenClaw sends in 60s', {
      countLastMinute: sendTimestamps.length,
      max: env.MC_CIRCUIT_MAX_SENDS_PER_MINUTE,
      cooldownMs: env.MC_CIRCUIT_COOLDOWN_MS,
    });
    return false;
  }

  sendTimestamps.push(now);
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OPENCLAW_TOOLS_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(new URL('/tools/invoke', env.OPENCLAW_GATEWAY_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENCLAW_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ tool, args }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`tools/invoke ${tool} timed out after ${env.OPENCLAW_TOOLS_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

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

function sessionKeyForAgent(agentId: string, taskId?: string | null) {
  // Keep Mission Control notifications out of the user's primary "main" chat/session.
  // This prevents notification storms from bloating context and burning tokens.
  const safeTask = taskId ? String(taskId).trim() : '';
  return safeTask ? `agent:${agentId}:mc:${safeTask}` : `agent:${agentId}:mc`;
}

function normalizeAgentId(agentId?: string | null) {
  if (!agentId) return null;
  const byOpenclaw = agentByOpenclawId.get(agentId);
  if (byOpenclaw) return byOpenclaw.openclawAgentId || byOpenclaw.id || agentId;
  const byRecord = agentByRecordId.get(agentId);
  if (byRecord) return byRecord.openclawAgentId || byRecord.id || agentId;
  // Hard guardrail: never create notifications for unknown agent IDs.
  // Otherwise, typos (or email addresses like name@example.com) can spawn
  // unintended OpenClaw agents and burn tokens.
  return null;
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

async function sendToAgent(agentId: string, message: string, taskId?: string | null) {
  const resolved = normalizeAgentId(agentId);
  if (!resolved) throw new Error('UNKNOWN_AGENT');

  if (!allowSendOrTrip()) {
    throw new Error('MC_CIRCUIT_BREAKER_OPEN');
  }

  const sessionKey = sessionKeyForAgent(resolved, taskId);
  // Do not fallback to the OpenClaw CLI here:
  // - It may not actually deliver (some versions just list sessions for `openclaw sessions ...`)
  // - It could bypass the gateway controls and create unexpected token spend
  // Use timeoutSeconds=0 so tools/invoke returns immediately ("accepted") instead of
  // waiting for the agent to finish a full turn. Waiting caused worker timeouts,
  // retries, and notification storms (token burn).
  await toolsInvoke('sessions_send', { sessionKey, message, timeoutSeconds: 0 });
}

async function createActivity(token: string, type: string, summary: string, taskId?: string, actorAgentId?: string) {
  const actor = normalizeAgentId(actorAgentId) ?? '';
  await pbFetch('/api/collections/activities/records', {
    method: 'POST',
    token,
    body: { type, summary, taskId: taskId ?? '', actorAgentId: actor ?? '', createdAt: nowIso() },
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

async function listPushSubscriptions(token: string) {
  if (!webPushEnabled) return [] as any[];
  const q = new URLSearchParams({ page: '1', perPage: '200', filter: 'enabled = true' });
  const data = await pbFetch(`/api/collections/push_subscriptions/records?${q.toString()}`, { token });
  return data.items ?? [];
}

async function sendWebPush(token: string, payload: { title: string; body: string; url?: string }, dedupeKey: string) {
  if (!webPushEnabled) return;
  if (!shouldPush(dedupeKey)) return;

  const subs = await listPushSubscriptions(token);
  if (!subs.length) return;

  const body = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body
      );
      await pbFetch(`/api/collections/push_subscriptions/records/${sub.id}`, {
        method: 'PATCH',
        token,
        body: { lastSeenAt: nowIso(), enabled: true },
      });
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.status;
      if (statusCode === 404 || statusCode === 410) {
        await pbFetch(`/api/collections/push_subscriptions/records/${sub.id}`, {
          method: 'PATCH',
          token,
          body: { enabled: false, lastSeenAt: nowIso() },
        });
      }
      console.error('[worker] web push failed', statusCode || err?.message || err);
    }
  }
}

function scheduleDeliver(token: string) {
  if (deliverTimer) return;
  deliverTimer = setTimeout(() => {
    deliverTimer = null;
    void deliverPendingNotifications(token);
  }, env.MC_DELIVER_DEBOUNCE_MS);
}

async function deliverPendingNotifications(token: string) {
  if (delivering) return;
  delivering = true;

  try {
    if (isCircuitOpen()) return;

    // Prevent re-sending the same notification when PocketBase is flaky and the
    // "mark delivered" patch fails (this was causing token-melting spam loops).
    const sentTtlMs = 6 * 60 * 60_000;
    const now = Date.now();
    for (const [id, ts] of sentNotificationIds) {
      if (now - ts > sentTtlMs) sentNotificationIds.delete(id);
    }

    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      filter: 'delivered = false',
    });
    const batch = await pbFetch(`/api/collections/notifications/records?${q.toString()}`, { token });

    const byTarget = new Map<string, { agentId: string; taskId: string; notes: any[] }>();
    for (const n of (batch.items ?? []) as any[]) {
      if (sentNotificationIds.has(n.id)) continue;
      const agentId = normalizeAgentId(n.toAgentId as string);
      if (!agentId) continue;
      const taskId = String(n.taskId || '').trim();
      const key = `${agentId}|${taskId}`;
      const existing = byTarget.get(key);
      if (existing) {
        existing.notes.push(n);
      } else {
        byTarget.set(key, { agentId, taskId, notes: [n] });
      }
    }

    for (const { agentId, taskId, notes } of byTarget.values()) {
      if (!notes.length) continue;

      // Batch into a single message per (agent, task) to reduce token churn and
      // keep context isolated per task.
      const lines: string[] = [];
      for (const n of notes.slice(0, 10)) {
        const content = String(n.content || '').trim();
        lines.push(`- ${content}`);
      }
      if (notes.length > 10) lines.push(`- … +${notes.length - 10} more`);
      const header = taskId ? `${env.MC_NOTIFICATION_PREFIX} ${notes.length} update(s) (task ${taskId})` : `${env.MC_NOTIFICATION_PREFIX} ${notes.length} update(s)`;
      const msg = `${header}\n${lines.join('\n')}`;

      try {
        await sendToAgent(agentId, msg, taskId || null);
      } catch (err: any) {
        if (err?.message === 'OPENCLAW_GATEWAY_DISABLED') {
          console.log('[worker] OpenClaw delivery disabled, holding notifications');
          return;
        }
        if (err?.message === 'MC_CIRCUIT_BREAKER_OPEN') {
          // Circuit breaker trips inside sendToAgent.
          return;
        }
        console.error('[worker] deliver failed', agentId, err?.message || err);
        continue;
      }

      // Mark delivered after successful send. If the PATCH fails, keep an in-memory
      // "sent" cache to avoid repeatedly spamming the same notification.
      for (const n of notes) {
        sentNotificationIds.set(n.id, Date.now());
        try {
          await pbFetch(`/api/collections/notifications/records/${n.id}`, {
            method: 'PATCH',
            token,
            body: { delivered: true, deliveredAt: nowIso() },
          });
        } catch (err: any) {
          console.error('[worker] failed to mark delivered', n.id, err?.message || err);
        }
      }
    }
  } catch (err: any) {
    console.error('[worker] deliver fatal', err?.message || err);
  } finally {
    delivering = false;
  }
}

function extractMentions(content: string) {
  const mentions = new Set<string>();
  // Avoid false positives for email addresses like "name@example.com".
  // We only treat @mentions as such when they are at the start of the string
  // or preceded by a non-word character.
  const regex = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_-]{1,64})/g;
  let match = regex.exec(content);
  while (match) {
    mentions.add(match[2]);
    match = regex.exec(content);
  }
  return Array.from(mentions);
}

async function handleTaskEvent(token: string, record: any, action: string) {
  const prev = taskCache.get(record.id);
  taskCache.set(record.id, record);

  if (action === 'create') {
    await createActivity(token, 'task_created', `Created task "${record.title}"`, record.id);
    await sendWebPush(
      token,
      { title: 'New task', body: record.title, url: `/tasks/${record.id}` },
      `task:create:${record.id}`
    );
  }

  if (prev && prev.status !== record.status) {
    await createActivity(token, 'status_change', `Task moved to ${record.status}`, record.id, record.leaseOwnerAgentId || '');
    await sendWebPush(
      token,
      { title: 'Task updated', body: `${record.title} → ${record.status}`, url: `/tasks/${record.id}` },
      `task:status:${record.id}:${record.status}`
    );
  }

  // Auto-done policy: tasks only stay in review when explicitly required.
  if (record.status === 'review' && !record.requiresReview) {
    const now = nowIso();
    await pbFetch(`/api/collections/tasks/records/${record.id}`, {
      method: 'PATCH',
      token,
      body: { status: 'done', completedAt: now, lastProgressAt: now, updatedAt: now },
    });
    await createActivity(token, 'auto_done', `Auto-completed "${record.title}" (review not required)`, record.id, record.leaseOwnerAgentId || '');
    return;
  }

  // Ensure completedAt is stamped when a task reaches done.
  if (record.status === 'done' && !record.completedAt) {
    const now = nowIso();
    await pbFetch(`/api/collections/tasks/records/${record.id}`, {
      method: 'PATCH',
      token,
      body: { completedAt: now, lastProgressAt: now, updatedAt: now },
    });
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
        updatedAt: nowIso(),
      },
    });
  }

  if (record.status === 'review' || record.status === 'done') {
    await pbFetch(`/api/collections/tasks/records/${record.id}`, {
      method: 'PATCH',
      token,
      body: { leaseExpiresAt: '', attemptCount: 0, updatedAt: nowIso() },
    });
  }

  const prevAssignees = new Set<string>(normalizeAgentIds(prev?.assigneeIds ?? []));
  const nextAssignees = new Set<string>(normalizeAgentIds(record.assigneeIds ?? []));

  for (const agentId of nextAssignees) {
    if (!prevAssignees.has(agentId)) {
      await ensureTaskSubscription(token, record.id, agentId, 'assigned');
      let desc = String(record.description || '').trim();
      if (!desc) {
        // PocketBase realtime payloads can occasionally omit large fields depending on transport/version.
        // Fetch the record once so the assignee always receives enough context to act without opening the UI.
        try {
          const fetched = await pbFetch(`/api/collections/tasks/records/${record.id}`, { token });
          desc = String(fetched?.description || '').trim();
        } catch {
          // ignore description fetch errors (we'll fall back to title-only notification)
        }
      }
      const snippetLimit = 220;
      const snippet = desc ? (desc.length > snippetLimit ? `${desc.slice(0, snippetLimit - 1)}…` : desc) : '';
      const content = snippet ? `Assigned: ${record.title} — ${snippet}` : `Assigned: ${record.title}`;
      await createNotification(token, agentId, content, record.id, 'assigned');
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
    body: { lastProgressAt: nowIso(), leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), updatedAt: nowIso() },
  });

  await createActivity(token, 'message_sent', `Message posted on task`, taskId, fromAgentId);

  const preview = typeof content === 'string' && content.length > 140 ? `${content.slice(0, 137)}...` : content;
  await sendWebPush(
    token,
    { title: 'New task comment', body: preview || 'New update', url: `/tasks/${taskId}` },
    `task:message:${record.id}`
  );

  if (fromAgentId) await ensureTaskSubscription(token, taskId, fromAgentId, 'commented');

  // Cost guardrail: only wake agents on explicit @mentions.
  // Thread subscriptions + "updates for everyone" quickly turn into token burn.
  const recipientIds = new Set<string>();
  if (mentions.includes('all')) {
    // @all is treated as "notify lead only" to prevent fan-out storms.
    recipientIds.add(leadAgentId);
  }
  for (const mention of mentions) {
    if (mention === 'all') continue;
    const resolved = normalizeAgentId(mention);
    if (resolved) recipientIds.add(resolved);
  }

  if (fromAgentId) recipientIds.delete(fromAgentId);

  if (recipientIds.size) {
    let title = taskId;
    try {
      const cached = taskCache.get(taskId);
      title = cached?.title ? String(cached.title) : title;
      if (title === taskId) {
        const fetched = await pbFetch(`/api/collections/tasks/records/${taskId}`, { token });
        if (fetched?.title) title = String(fetched.title);
      }
    } catch {
      // ignore title lookup errors
    }

    for (const agentId of recipientIds) {
      await ensureTaskSubscription(token, taskId, agentId, 'mentioned');
      await createNotification(token, agentId, `Mentioned on: ${title}`, taskId, 'mentioned');
    }
  }
}

async function handleDocumentEvent(token: string, record: any, action: string) {
  const taskId = record.taskId as string;
  await pbFetch(`/api/collections/tasks/records/${taskId}`, {
    method: 'PATCH',
    token,
    body: { lastProgressAt: nowIso(), leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), updatedAt: nowIso() },
  });

  const type = action === 'create' ? 'document_created' : 'document_updated';
  await createActivity(token, type, `Document ${action}d: ${record.title}`, taskId, record.authorAgentId || '');
}

async function handleSubtaskEvent(token: string, record: any, action: string) {
  const taskId = String(record.taskId || '').trim();
  if (!taskId) return;

  let total = 0;
  let done = 0;
  try {
    const q = new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = "${taskId}"` });
    const list = await pbFetch(`/api/collections/subtasks/records?${q.toString()}`, { token });
    const items = (list.items ?? []) as any[];
    total = items.length;
    done = items.reduce((acc, s) => acc + (s?.done ? 1 : 0), 0);
  } catch (err: any) {
    console.error('[worker] subtask aggregate query failed', err?.message || err);
    return;
  }

  const now = nowIso();
  const cachedTask = taskCache.get(taskId);
  const patch: any = { subtasksTotal: total, subtasksDone: done, updatedAt: now };
  if (cachedTask?.status === 'in_progress') {
    patch.lastProgressAt = now;
    patch.leaseExpiresAt = minutesFromNow(env.LEASE_MINUTES);
  }

  try {
    await pbFetch(`/api/collections/tasks/records/${taskId}`, { method: 'PATCH', token, body: patch });
  } catch (err: any) {
    console.error('[worker] subtask aggregate patch failed', err?.message || err);
  }

  const title = String(record.title || '').trim() || 'subtask';
  let summary = '';
  if (action === 'create') summary = `Subtask added: ${title}`;
  else if (action === 'delete') summary = `Subtask deleted: ${title}`;
  else if (record.done) summary = `Subtask completed: ${title}`;
  else summary = `Subtask updated: ${title}`;

  await createActivity(token, 'subtask_updated', summary, taskId);
}

async function enforceLeases(token: string) {
  const now = new Date();
  const q = new URLSearchParams({
    page: '1',
    perPage: '50',
    filter: `status = "in_progress" && leaseExpiresAt != "" && leaseExpiresAt < "${pbDateForFilter(now)}"`,
  });
  const due = await pbFetch(`/api/collections/tasks/records?${q.toString()}`, { token });

  for (const t of (due.items ?? []) as any[]) {
    const owner = normalizeAgentId(t.leaseOwnerAgentId || t.assigneeIds?.[0]);
    if (!owner) continue;

    const attempt = (t.attemptCount ?? 0) + 1;
    const max = t.maxAutoNudges ?? 3;
    const escalation = normalizeAgentId(t.escalationAgentId) ?? leadAgentId;

    // If we've already escalated once (attemptCount was bumped past max), don't keep spamming.
    // This was causing runaway escalation loops when a task got stuck with a huge attemptCount.
    if ((t.attemptCount ?? 0) >= max + 1) {
      await pbFetch(`/api/collections/tasks/records/${t.id}`, {
        method: 'PATCH',
        token,
        body: { leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), updatedAt: nowIso() },
      });
      continue;
    }

    if (attempt <= max) {
      await createNotification(token, owner, `NUDGE: post progress or mark blocked for "${t.title}" (${attempt}/${max})`, t.id, 'nudge');
      await pbFetch(`/api/collections/tasks/records/${t.id}`, {
        method: 'PATCH',
        token,
        body: { attemptCount: attempt, leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), updatedAt: nowIso() },
      });
      await createActivity(token, 'lease_nudge', `Nudged ${owner} for "${t.title}"`, t.id, owner);
    } else {
      let excerpt = '';
      let lastProgressAt = t.lastProgressAt || '';
      try {
        const msgQ = new URLSearchParams({
          page: '1',
          perPage: '1',
          sort: '-createdAt',
          filter: `taskId = "${t.id}"`,
        });
        const msgs = await pbFetch(`/api/collections/messages/records?${msgQ.toString()}`, { token });
        const last = msgs?.items?.[0];
        if (last?.content) {
          excerpt = String(last.content).slice(0, 240);
        }
      } catch {
        // ignore message lookup errors
      }
      const detail = [
        `ESCALATION: "${t.title}" stalled.`,
        `Owner=${owner}.`,
        lastProgressAt ? `Last progress: ${lastProgressAt}.` : '',
        excerpt ? `Last message: "${excerpt}"` : '',
      ]
        .filter(Boolean)
        .join(' ');

      await createNotification(token, escalation, detail, t.id, 'escalation');
      await createActivity(token, 'lease_escalated', `Escalated "${t.title}" to ${escalation}`, t.id, escalation);
      await pbFetch(`/api/collections/tasks/records/${t.id}`, {
        method: 'PATCH',
        token,
        // attemptCount is set to max+1 on first escalation; further runs won't re-escalate.
        body: { leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), attemptCount: attempt, updatedAt: nowIso() },
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

  const completed = await pbFetch(`/api/collections/tasks/records?page=1&perPage=200&filter=${encodeURIComponent(`status = "done" && lastProgressAt >= "${pbDateForFilter(start)}"`)}`, { token });
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

  const nowStamp = nowIso();
  await pbFetch('/api/collections/documents/records', {
    method: 'POST',
    token,
    body: { title: `Daily Standup ${dateKey}`, content: lines, type: 'deliverable', createdAt: nowStamp, updatedAt: nowStamp },
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
  if (env.OPENCLAW_GATEWAY_DISABLED) return;
  if (env.MC_NODE_SNAPSHOT_MODE === 'off') return;

  // `nodes status` returns the connected/paired nodes list (what the dashboard shows).
  const cmd = env.MC_NODE_SNAPSHOT_CMD || `${env.OPENCLAW_CLI || 'openclaw'} nodes status --json`;
  try {
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    // Packaged desktop apps often have a minimal PATH, so include common locations.
    if (process.platform === 'darwin') {
      childEnv.PATH = [childEnv.PATH || '', '/usr/local/bin', '/opt/homebrew/bin'].filter(Boolean).join(':');
    }
    const { stdout } = await execAsync(cmd, { env: childEnv, timeout: 15_000, maxBuffer: 5 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.nodes) ? parsed.nodes : Array.isArray(parsed?.paired) ? parsed.paired : [];
    if (!Array.isArray(list)) return;

    for (const node of list) {
      const nodeId = (node as any).nodeId || (node as any).id || (node as any).name;
      if (!nodeId) continue;

      const q = new URLSearchParams({ page: '1', perPage: '1', filter: `nodeId = "${nodeId}"` });
      const existing = await pbFetch(`/api/collections/nodes/records?${q.toString()}`, { token });

      const payload = {
        nodeId,
        displayName: (node as any).displayName || (node as any).name || nodeId,
        paired: (node as any).paired ?? true,
        lastSeenAt: (node as any).lastSeenAt || nowIso(),
        os: (node as any).os || (node as any).platform || 'unknown',
        arch: (node as any).arch || (node as any).architecture || 'unknown',
        // Store the full node status snapshot for debugging and UI upgrades.
        capabilities:
          (node as any).capabilities || {
            remoteIp: (node as any).remoteIp,
            version: (node as any).version,
            caps: (node as any).caps,
            commands: (node as any).commands,
            connected: (node as any).connected,
            connectedAtMs: (node as any).connectedAtMs,
            pathEnv: (node as any).pathEnv,
          },
        execPolicy: (node as any).execPolicy || 'deny',
        allowlistSummary: (node as any).allowlistSummary || '',
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
    await pb.collection('subtasks').subscribe('*', async (e) => handleSubtaskEvent(token, e.record, e.action));
    await pb.collection('notifications').subscribe('*', async () => scheduleDeliver(token));
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

  // Deliver notifications with a debounce to avoid event storms / overlapping runs.
  // A slow interval acts as a safety net in case realtime misses an event.
  setInterval(() => scheduleDeliver(pbToken), env.MC_DELIVER_INTERVAL_MS);
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
