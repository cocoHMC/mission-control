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
  // Base URL for Mission Control web server (used for capability URLs, e.g. task file share links).
  MC_BASE_URL: z.string().optional(),
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
  MC_BASE_URL: process.env.MC_BASE_URL,
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

function normalizeBaseUrl(value: string) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

const mcBaseUrl = normalizeBaseUrl(
  env.MC_BASE_URL ||
    `http://127.0.0.1:${process.env.MC_WEB_PORT || process.env.PORT || '4015'}`
);

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

function taskFilePublicUrl(shareToken: string) {
  const token = String(shareToken || '').trim();
  if (!token) return '';
  if (!mcBaseUrl) return '';
  return `${mcBaseUrl}/api/task-files/public/${token}`;
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
  return toolsInvokeWithOpts(tool, args);
}

async function toolsInvokeWithOpts(tool: string, args: unknown, opts: { timeoutMs?: number; sessionKey?: string } = {}) {
  if (env.OPENCLAW_GATEWAY_DISABLED || !env.OPENCLAW_GATEWAY_TOKEN) {
    throw new Error('OPENCLAW_GATEWAY_DISABLED');
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? env.OPENCLAW_TOOLS_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(new URL('/tools/invoke', env.OPENCLAW_GATEWAY_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENCLAW_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ tool, args, ...(opts.sessionKey ? { sessionKey: opts.sessionKey } : {}) }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`tools/invoke ${tool} timed out after ${timeoutMs}ms`);
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

function invokeText(payload: any) {
  const content = payload?.result?.content;
  if (!Array.isArray(content)) return '';
  const text = content.find((c: any) => c?.type === 'text')?.text;
  return typeof text === 'string' ? text : '';
}

function invokeParsedJson(payload: any) {
  const text = invokeText(payload).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sessionKeyForAgent(agentId: string, taskId?: string | null) {
  // Keep Mission Control notifications out of the user's primary "main" chat/session.
  // This prevents notification storms from bloating context and burning tokens.
  const safeTask = taskId ? String(taskId).trim() : '';
  return safeTask ? `agent:${agentId}:mc:${safeTask}` : `agent:${agentId}:mc`;
}

type OpenClawDeliveryPolicy = {
  mute?: boolean;
  maxTokensPct?: number;
  maxTokensUsed?: number;
  maxSendsPerHour?: number;
};

function policyForTask(taskId?: string | null): OpenClawDeliveryPolicy | null {
  if (!taskId) return null;
  const task = taskCache.get(String(taskId).trim()) || null;
  if (!task) return null;
  let policy: any = task?.policy ?? null;
  if (typeof policy === 'string') {
    try {
      policy = JSON.parse(policy);
    } catch {
      policy = null;
    }
  }
  if (!policy || typeof policy !== 'object') return null;
  const oc = (policy as any).openclaw;
  if (!oc || typeof oc !== 'object') return null;
  const out: OpenClawDeliveryPolicy = {};
  if (typeof oc.mute === 'boolean') out.mute = oc.mute;
  if (typeof oc.maxTokensPct === 'number' && Number.isFinite(oc.maxTokensPct)) out.maxTokensPct = oc.maxTokensPct;
  if (typeof oc.maxTokensUsed === 'number' && Number.isFinite(oc.maxTokensUsed)) out.maxTokensUsed = oc.maxTokensUsed;
  if (typeof oc.maxSendsPerHour === 'number' && Number.isFinite(oc.maxSendsPerHour)) out.maxSendsPerHour = oc.maxSendsPerHour;
  return out;
}

const sendHistoryByTarget = new Map<string, number[]>();
const sessionBudgetCache = new Map<string, { at: number; tokensUsed: number | null; tokensMax: number | null; tokensPct: number | null }>();

async function sessionBudget(sessionKey: string) {
  const key = String(sessionKey || '').trim();
  if (!key) return { tokensUsed: null, tokensMax: null, tokensPct: null };

  const cached = sessionBudgetCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < 60_000) {
    return { tokensUsed: cached.tokensUsed, tokensMax: cached.tokensMax, tokensPct: cached.tokensPct };
  }

  // Deterministic tool: does not run an agent turn.
  const out = await toolsInvokeWithOpts('sessions_list', { limit: 500, messageLimit: 0 }, { timeoutMs: 8_000 });
  const parsed = invokeParsedJson(out);
  const sessions = Array.isArray((parsed as any)?.sessions) ? (parsed as any).sessions : [];
  const found = sessions.find((s: any) => typeof s?.key === 'string' && s.key === key) || null;
  const used = typeof found?.totalTokens === 'number' ? found.totalTokens : null;
  const max = typeof found?.contextTokens === 'number' ? found.contextTokens : null;
  const pct = used !== null && max !== null && max > 0 ? Math.round((used / max) * 100) : null;
  sessionBudgetCache.set(key, { at: now, tokensUsed: used, tokensMax: max, tokensPct: pct });
  return { tokensUsed: used, tokensMax: max, tokensPct: pct };
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

function normalizeModelTier(value: unknown) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (!v || v === 'auto' || v === 'default') return '';
  if (v === 'cheap') return 'cheap';
  if (v === 'balanced' || v === 'mid' || v === 'medium') return 'balanced';
  if (v === 'heavy' || v === 'high' || v === 'expensive') return 'heavy';
  if (v === 'vision') return 'vision';
  if (v === 'code') return 'code';
  return '';
}

function normalizeExplicitModel(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const firstLine = raw.split('\n')[0]?.trim() || '';
  const lower = firstLine.toLowerCase();
  if (!firstLine || lower === 'auto' || lower === 'default') return '';
  // Avoid directive injection via whitespace/newlines. OpenClaw model keys/aliases should not contain spaces.
  const safe = firstLine.replace(/\s+/g, ' ').trim();
  return safe;
}

function normalizeThinkingLevel(value: unknown) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (!v || v === 'auto' || v === 'default') return '';
  if (v === 'low') return 'low';
  if (v === 'medium' || v === 'mid') return 'medium';
  if (v === 'high') return 'high';
  if (v === 'xhigh' || v === 'extra_high' || v === 'extra-high' || v === 'extrahigh') return 'xhigh';
  return '';
}

function normalizeThinkingEffort(value: unknown) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (!v || v === 'auto' || v === 'default') return '';
  if (v === 'efficient' || v === 'low' || v === 'cheap') return 'low';
  if (v === 'balanced' || v === 'mid' || v === 'medium') return 'medium';
  if (v === 'heavy' || v === 'high' || v === 'expensive') return 'high';
  return '';
}

function openclawInlineDirectivesFor(agentId: string, taskId?: string | null) {
  const safeTask = taskId ? String(taskId).trim() : '';
  if (!safeTask) return [] as string[];

  const task = taskCache.get(safeTask) || null;
  const agent = agentByOpenclawId.get(agentId) || null;

  const thinking = normalizeThinkingLevel(task?.aiThinking) || normalizeThinkingEffort(task?.aiEffort);
  const explicitModel = normalizeExplicitModel(task?.aiModel);
  const modelTier = normalizeModelTier(task?.aiModelTier) || normalizeModelTier(agent?.modelTier);

  const directives: string[] = [];
  if (explicitModel) directives.push(`/model ${explicitModel}`);
  else if (modelTier) directives.push(`/model ${modelTier}`);
  if (thinking) directives.push(`/t ${thinking}`);
  return directives;
}

async function sendToAgent(agentId: string, message: string, taskId?: string | null) {
  const resolved = normalizeAgentId(agentId);
  if (!resolved) throw new Error('UNKNOWN_AGENT');

  if (!allowSendOrTrip()) {
    throw new Error('MC_CIRCUIT_BREAKER_OPEN');
  }

  const sessionKey = sessionKeyForAgent(resolved, taskId);

  if (taskId) {
    const token = await ensureAuth();
    const policy = policyForTask(taskId);
    const policyKey = `${resolved}|${String(taskId).trim()}`;

    if (policy?.mute) {
      await createActivity(token, 'delivery_suppressed', `Suppressed OpenClaw send (muted by policy).`, String(taskId), resolved);
      return { sent: false, reason: 'muted' };
    }

    if (typeof policy?.maxSendsPerHour === 'number' && policy.maxSendsPerHour > 0) {
      const now = Date.now();
      const windowMs = 60 * 60_000;
      const list = sendHistoryByTarget.get(policyKey) || [];
      const kept = list.filter((ts) => now - ts < windowMs);
      if (kept.length >= policy.maxSendsPerHour) {
        sendHistoryByTarget.set(policyKey, kept);
        await createActivity(
          token,
          'delivery_suppressed',
          `Suppressed OpenClaw send (rate limit: ${policy.maxSendsPerHour}/hour).`,
          String(taskId),
          resolved
        );
        return { sent: false, reason: 'rate_limit' };
      }
      sendHistoryByTarget.set(policyKey, kept);
    }

    if (typeof policy?.maxTokensPct === 'number' || typeof policy?.maxTokensUsed === 'number') {
      try {
        const b = await sessionBudget(sessionKey);
        if (typeof policy.maxTokensPct === 'number' && b.tokensPct !== null && b.tokensPct >= policy.maxTokensPct) {
          await createActivity(
            token,
            'delivery_suppressed',
            `Suppressed OpenClaw send (session budget: ${b.tokensPct}% >= ${policy.maxTokensPct}%).`,
            String(taskId),
            resolved
          );
          return { sent: false, reason: 'budget_pct' };
        }
        if (typeof policy.maxTokensUsed === 'number' && b.tokensUsed !== null && b.tokensUsed >= policy.maxTokensUsed) {
          await createActivity(
            token,
            'delivery_suppressed',
            `Suppressed OpenClaw send (session budget: ${b.tokensUsed} >= ${policy.maxTokensUsed} tokens).`,
            String(taskId),
            resolved
          );
          return { sent: false, reason: 'budget_used' };
        }
      } catch (err: any) {
        console.warn('[worker] budget check failed (continuing with send)', err?.message || err);
      }
    }
  }

  const directives = openclawInlineDirectivesFor(resolved, taskId);
  const prefixed = directives.length ? `${directives.join('\n')}\n${message}` : message;
  // Do not fallback to the OpenClaw CLI here:
  // - It may not actually deliver (some versions just list sessions for `openclaw sessions ...`)
  // - It could bypass the gateway controls and create unexpected token spend
  // Use timeoutSeconds=0 so tools/invoke returns immediately ("accepted") instead of
  // waiting for the agent to finish a full turn. Waiting caused worker timeouts,
  // retries, and notification storms (token burn).
  await toolsInvoke('sessions_send', { sessionKey, message: prefixed, timeoutSeconds: 0 });
  if (taskId) {
    const key = `${resolved}|${String(taskId).trim()}`;
    const now = Date.now();
    const list = sendHistoryByTarget.get(key) || [];
    list.push(now);
    sendHistoryByTarget.set(key, list);
  }
  return { sent: true };
}

async function createActivity(token: string, type: string, summary: string, taskId?: string, actorAgentId?: string) {
  const actor = normalizeAgentId(actorAgentId) ?? '';
  try {
    await pbFetch('/api/collections/activities/records', {
      method: 'POST',
      token,
      body: { type, summary, taskId: taskId ?? '', actorAgentId: actor ?? '', createdAt: nowIso() },
    });
  } catch (err: any) {
    // Worker should never crash on activity logging failures (schema drift, transient PB issues, etc.).
    console.error('[worker] createActivity failed', { type, taskId: taskId ?? '', err: err?.message || err });
  }
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

function pbFilterString(value: string) {
  // PocketBase filter strings use double quotes; escape defensively.
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function hasAnyNotificationForTask(token: string, agentId: string, taskId: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `toAgentId = "${pbFilterString(agentId)}" && taskId = "${pbFilterString(taskId)}"`,
  });
  const existing = await pbFetch(`/api/collections/notifications/records?${q.toString()}`, { token });
  return Boolean(existing?.items?.length);
}

async function listTaskFiles(token: string, taskId: string) {
  if (!taskId) return [] as any[];
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '20',
      sort: '-updatedAt',
      filter: `taskId = "${pbFilterString(taskId)}"`,
    });
    const list = await pbFetch(`/api/collections/task_files/records?${q.toString()}`, { token });
    return list?.items ?? [];
  } catch {
    return [] as any[];
  }
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
        const out = await sendToAgent(agentId, msg, taskId || null);
        if (out && typeof out === 'object' && out.sent === false) {
          // Policy suppressed; treat as delivered so we don't spin.
          console.log('[worker] delivery suppressed by policy', { agentId, taskId, reason: (out as any).reason || '' });
        }
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

function buildAssignedNotificationContent(record: any, description: string, context: string) {
  const title = String(record.title || '').trim() || String(record.id || '').trim() || 'task';
  const snippetLimit = 220;
  const ctxLimit = 280;
  const snippet = description ? (description.length > snippetLimit ? `${description.slice(0, snippetLimit - 1)}…` : description) : '';
  const ctxSnippet = context ? (context.length > ctxLimit ? `${context.slice(0, ctxLimit - 1)}…` : context) : '';
  const parts = [snippet, ctxSnippet ? `Context: ${ctxSnippet}` : ''].filter(Boolean);
  return parts.length ? `Assigned: ${title} — ${parts.join(' ')}` : `Assigned: ${title}`;
}

function truncateText(value: string, max = 3600) {
  const s = String(value || '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function messagePayloadText(payload: any) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (typeof payload.content === 'string' && payload.content.trim()) return payload.content.trim();
  const content = (payload as any).content;
  if (!Array.isArray(content)) return '';
  const parts = content
    .map((part: any) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean);
  return parts.join('\n').trim();
}

function sessionKeyForTask(agentId: string, taskId: string) {
  const safeAgent = String(agentId || '').trim();
  const safeTask = String(taskId || '').trim();
  if (!safeAgent || !safeTask) return '';
  return `agent:${safeAgent}:mc:${safeTask}`;
}

async function fetchLatestAgentTurnSummary(agentId: string, taskId: string) {
  const sessionKey = sessionKeyForTask(agentId, taskId);
  if (!sessionKey) return { sessionKey: '', summary: '' };

  let out: any = null;
  try {
    out = await toolsInvoke('sessions_history', { sessionKey, limit: 80, includeTools: false });
  } catch {
    return { sessionKey, summary: '' };
  }

  const parsed = out?.parsedText ?? out;
  const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
  if (!messages.length) return { sessionKey, summary: '' };

  // Prefer the last assistant/agent message; fall back to last non-user.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    const role = typeof m?.role === 'string' ? m.role : '';
    if (role === 'user') continue;
    if (role && !['assistant', 'agent', 'tool'].includes(role)) continue;
    const text = messagePayloadText(m);
    if (text) return { sessionKey, summary: truncateText(text) };
  }

  return { sessionKey, summary: '' };
}

async function hasRecentSnapshotMessage(token: string, taskId: string, status: string, agentId: string) {
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '3',
      sort: '-createdAt',
      filter: `taskId = "${pbFilterString(taskId)}"`,
    });
    const list = await pbFetch(`/api/collections/messages/records?${q.toString()}`, { token });
    const items = (list?.items ?? []) as any[];
    for (const m of items) {
      const content = String(m?.content || '');
      const from = String(m?.fromAgentId || '');
      if (from !== agentId) continue;
      if (content.startsWith('[Task Snapshot]') && content.includes(`Status: ${status}`)) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function maybePostStatusSnapshotComment(token: string, prev: any, record: any) {
  if (!prev || prev.status === record.status) return;
  const status = String(record.status || '').trim();
  if (!['blocked', 'review', 'done'].includes(status)) return;

  const owner =
    normalizeAgentId(record.leaseOwnerAgentId || '') ||
    normalizeAgentId(Array.isArray(record.assigneeIds) ? record.assigneeIds[0] : '') ||
    normalizeAgentId(prev?.leaseOwnerAgentId || '') ||
    '';
  if (!owner) return;

  if (await hasRecentSnapshotMessage(token, String(record.id || ''), status, owner)) return;

  const now = nowIso();
  const { sessionKey, summary } = await fetchLatestAgentTurnSummary(owner, String(record.id || ''));
  const lines: string[] = [
    '[Task Snapshot]',
    `Task: ${String(record.title || record.id || '').trim() || record.id}`,
    `Status: ${status}`,
    `When: ${now}`,
    `Agent: ${owner}`,
  ];
  if (sessionKey) lines.push(`Session: ${sessionKey}`);
  lines.push('');
  lines.push('Agent report:');
  lines.push(summary ? truncateText(summary, 3600) : '(No recent agent summary found. Open the session chat for details.)');

  try {
    await pbFetch('/api/collections/messages/records', {
      method: 'POST',
      token,
      body: {
        taskId: record.id,
        fromAgentId: owner,
        content: lines.join('\n'),
        mentions: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err: any) {
    console.error('[worker] snapshot comment failed', record.id, err?.message || err);
  }
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
    // Option A: mirror a compact "how/why" snapshot into the task thread as an agent comment
    // so humans don't have to open the OpenClaw session chat for the end state.
    await maybePostStatusSnapshotComment(token, prev, record);
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
      let ctx = String(record.context || '').trim();
      if (!desc) {
        // PocketBase realtime payloads can occasionally omit large fields depending on transport/version.
        // Fetch the record once so the assignee always receives enough context to act without opening the UI.
        try {
          const fetched = await pbFetch(`/api/collections/tasks/records/${record.id}`, { token });
          desc = String(fetched?.description || '').trim();
          ctx = String(fetched?.context || '').trim();
        } catch {
          // ignore description fetch errors (we'll fall back to title-only notification)
        }
      }
      const snippetLimit = 220;
      const ctxLimit = 280;
      const snippet = desc ? (desc.length > snippetLimit ? `${desc.slice(0, snippetLimit - 1)}…` : desc) : '';
      const ctxSnippet = ctx ? (ctx.length > ctxLimit ? `${ctx.slice(0, ctxLimit - 1)}…` : ctx) : '';
      const parts = [snippet, ctxSnippet ? `Context: ${ctxSnippet}` : ''].filter(Boolean);
      let content = parts.length ? `Assigned: ${record.title} — ${parts.join(' ')}` : `Assigned: ${record.title}`;
      try {
        const attachments = await listTaskFiles(token, record.id);
        const links = attachments
          .map((f: any) => taskFilePublicUrl(String(f?.shareToken || '')))
          .filter(Boolean)
          .slice(0, 3);
        if (links.length) content += ` Files: ${links.join(' ')}`;
      } catch {
        // ignore attachment lookup errors (task assignment should still deliver)
      }
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
  const taskId = String(record.taskId || '').trim();
  // Some documents are global deliverables (no taskId). Don't crash the worker by trying
  // to patch a task with an empty id.
  if (!taskId) return;
  await pbFetch(`/api/collections/tasks/records/${taskId}`, {
    method: 'PATCH',
    token,
    body: { lastProgressAt: nowIso(), leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), updatedAt: nowIso() },
  });

  const type = action === 'create' ? 'document_created' : 'document_updated';
  await createActivity(token, type, `Document ${action}d: ${record.title}`, taskId, record.authorAgentId || '');
}

async function handleTaskFileEvent(token: string, record: any, action: string) {
  const taskId = String(record.taskId || '').trim();
  if (!taskId) return;

  await pbFetch(`/api/collections/tasks/records/${taskId}`, {
    method: 'PATCH',
    token,
    body: { lastProgressAt: nowIso(), leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), updatedAt: nowIso() },
  });

  const title = String(record.title || '').trim() || 'file';
  const type = action === 'create' ? 'file_added' : action === 'update' ? 'file_updated' : 'file_changed';
  await createActivity(token, type, `File ${action}d: ${title}`, taskId);
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

async function backfillAssignedTaskNotifications(token: string) {
  // If the worker was down (crash/restart), we may have missed task assignment events.
  // Backfill ensures assignees still receive at least one "Assigned:" notification.
  const perPage = 200;
  let page = 1;
  let created = 0;

  while (true) {
    let data: any;
    try {
      const q = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
        // Only tasks that haven't seen any activity yet.
        filter: 'status = "assigned" && lastProgressAt = ""',
      });
      data = await pbFetch(`/api/collections/tasks/records?${q.toString()}`, { token });
    } catch (err: any) {
      console.error('[worker] backfill query failed', err?.message || err);
      return;
    }

    const items = (data?.items ?? []) as any[];
    if (!items.length) break;

    for (const record of items) {
      const taskId = String(record.id || '').trim();
      if (!taskId) continue;

      const assignees = normalizeAgentIds(record.assigneeIds ?? []);
      if (!assignees.length) continue;

      for (const agentId of assignees) {
        const normalized = normalizeAgentId(agentId);
        if (!normalized) continue;

        let exists = false;
        try {
          exists = await hasAnyNotificationForTask(token, normalized, taskId);
        } catch (err: any) {
          console.error('[worker] backfill notification query failed', { agentId: normalized, taskId }, err?.message || err);
          continue;
        }
        if (exists) continue;

        await ensureTaskSubscription(token, taskId, normalized, 'assigned');

        let desc = String(record.description || '').trim();
        let ctx = String(record.context || '').trim();
        if (!desc) {
          try {
            const fetched = await pbFetch(`/api/collections/tasks/records/${taskId}`, { token });
            desc = String(fetched?.description || '').trim();
            ctx = String(fetched?.context || '').trim();
          } catch {
            // ignore fetch errors; we'll fall back to title-only notification
          }
        }

        let content = buildAssignedNotificationContent(record, desc, ctx);
        try {
          const attachments = await listTaskFiles(token, taskId);
          const links = attachments
            .map((f: any) => taskFilePublicUrl(String(f?.shareToken || '')))
            .filter(Boolean)
            .slice(0, 3);
          if (links.length) content += ` Files: ${links.join(' ')}`;
        } catch {
          // ignore attachment lookup errors
        }
        await createNotification(token, normalized, content, taskId, 'assigned');
        created++;
      }
    }

    if (items.length < perPage) break;
    page++;
    if (page > 25) break; // safety net
  }

  if (created) {
    console.log('[worker] backfill created assignment notifications', created);
    scheduleDeliver(token);
  }
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
    try {
      await pb.collection('task_files').subscribe('*', async (e) => {
        await handleTaskFileEvent(token, e.record, e.action);
      });
    } catch {
      // Optional collection (may not exist on older schemas).
    }
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

  // Recover assignments that happened while the worker was down.
  await backfillAssignedTaskNotifications(pbToken);

  // Deliver notifications with a debounce to avoid event storms / overlapping runs.
  // A slow interval acts as a safety net in case realtime misses an event.
  setInterval(() => scheduleDeliver(pbToken), env.MC_DELIVER_INTERVAL_MS);
  setInterval(() => void enforceLeases(pbToken), 10_000);
  setInterval(() => void refreshAgents(pbToken), 60_000 * 5);
  setInterval(() => void backfillAssignedTaskNotifications(pbToken), 60_000 * 5);
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
