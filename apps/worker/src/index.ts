import { z } from 'zod';
import PocketBase from 'pocketbase';
import { EventSource } from 'eventsource';
import { exec } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import webpush from 'web-push';
import { nextRecurrenceAt, normalizeTaskRecurrence, type TaskRecurrence } from './taskRecurrence';

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
  MC_NOTIFICATION_FALLBACK_CMD: z.string().optional(),
  MC_NOTIFICATION_FALLBACK_ON_TOOL_BLOCK: EnvBool.default(true),
  MC_TOOL_BLOCK_COOLDOWN_MS: z.coerce.number().int().positive().default(60_000),
  MC_USAGE_COLLECT_ENABLED: EnvBool.default(true),
  MC_USAGE_COLLECT_MINUTES: z.coerce.number().int().positive().default(5),
  MC_USAGE_MODEL_PRICES_JSON: z.string().optional(),
  MC_PROJECT_BUDGET_CHECK_MINUTES: z.coerce.number().int().positive().default(15),
  MC_PROJECT_BUDGET_ALERT_COOLDOWN_MS: z.coerce.number().int().positive().default(6 * 60 * 60_000),
  MC_BUDGET_PAUSE_AUTOMATIONS: EnvBool.default(true),

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
  MC_DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(4),
  MC_DELIVERY_FAILURE_TTL_MS: z.coerce.number().int().positive().default(24 * 60 * 60_000),
  MC_CIRCUIT_MAX_SENDS_PER_MINUTE: z.coerce.number().int().positive().default(12),
  MC_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().default(900_000),
  MC_ESCALATION_PRESENCE_ENABLED: EnvBool,
  MC_ESCALATION_ACTIVE_MINUTES: z.coerce.number().int().positive().default(45),
  MC_ACTIVE_AGENT_CACHE_MS: z.coerce.number().int().positive().default(60_000),

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
  MC_NOTIFICATION_FALLBACK_CMD: process.env.MC_NOTIFICATION_FALLBACK_CMD,
  MC_NOTIFICATION_FALLBACK_ON_TOOL_BLOCK: process.env.MC_NOTIFICATION_FALLBACK_ON_TOOL_BLOCK,
  MC_TOOL_BLOCK_COOLDOWN_MS: process.env.MC_TOOL_BLOCK_COOLDOWN_MS,
  MC_USAGE_COLLECT_ENABLED: process.env.MC_USAGE_COLLECT_ENABLED,
  MC_USAGE_COLLECT_MINUTES: process.env.MC_USAGE_COLLECT_MINUTES,
  MC_USAGE_MODEL_PRICES_JSON: process.env.MC_USAGE_MODEL_PRICES_JSON,
  MC_PROJECT_BUDGET_CHECK_MINUTES: process.env.MC_PROJECT_BUDGET_CHECK_MINUTES,
  MC_PROJECT_BUDGET_ALERT_COOLDOWN_MS: process.env.MC_PROJECT_BUDGET_ALERT_COOLDOWN_MS,
  MC_BUDGET_PAUSE_AUTOMATIONS: process.env.MC_BUDGET_PAUSE_AUTOMATIONS,

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
  MC_DELIVERY_MAX_ATTEMPTS: process.env.MC_DELIVERY_MAX_ATTEMPTS,
  MC_DELIVERY_FAILURE_TTL_MS: process.env.MC_DELIVERY_FAILURE_TTL_MS,
  MC_CIRCUIT_MAX_SENDS_PER_MINUTE: process.env.MC_CIRCUIT_MAX_SENDS_PER_MINUTE,
  MC_CIRCUIT_COOLDOWN_MS: process.env.MC_CIRCUIT_COOLDOWN_MS,
  MC_ESCALATION_PRESENCE_ENABLED: process.env.MC_ESCALATION_PRESENCE_ENABLED,
  MC_ESCALATION_ACTIVE_MINUTES: process.env.MC_ESCALATION_ACTIVE_MINUTES,
  MC_ACTIVE_AGENT_CACHE_MS: process.env.MC_ACTIVE_AGENT_CACHE_MS,
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
const projectCache = new Map<string, any>();
const agentByRecordId = new Map<string, any>();
const agentByOpenclawId = new Map<string, any>();
const recurringSpawnLocks = new Set<string>();
const recentNotifications = new Map<string, number>();
const recentPush = new Map<string, number>();
let delivering = false;
let deliverTimer: ReturnType<typeof setTimeout> | null = null;
let circuitUntilMs = 0;
let openclawToolBlockedUntilMs = 0;
const sendTimestamps: number[] = [];
const sentNotificationIds = new Map<string, number>();
const deliveryFailureByNotification = new Map<string, { count: number; lastAt: number; lastError: string }>();
const dlqHandledNotifications = new Map<string, number>();
const activeAgentsCache = new Set<string>();
const automationPolicyNoticeByKey = new Map<string, number>();
let activeAgentsCacheExpiresAt = 0;
let lastStandupDate = '';
const usageSnapshotBySession = new Map<
  string,
  { inputTokens: number; outputTokens: number; tokensUsed: number; tokensMax: number; tokensPct: number; at: number }
>();
const budgetAlertByProjectKey = new Map<string, number>();
let usageCollectionDisabledUntilMs = 0;
let resolvedGatewayUrlCache: { url: string; expiresAt: number } | null = null;

type ModelPrice = { inputPer1k: number; outputPer1k: number };

function parseModelPriceMap(raw: string) {
  const map = new Map<string, ModelPrice>();
  const text = String(raw || '').trim();
  if (!text) return map;
  try {
    const parsed = JSON.parse(text);
    const entries = parsed && typeof parsed === 'object' ? Object.entries(parsed as Record<string, any>) : [];
    for (const [model, row] of entries) {
      const key = String(model || '').trim();
      if (!key) continue;
      const inputPer1k = Number(row?.inputPer1k ?? row?.inPer1k ?? row?.input ?? row?.in ?? 0);
      const outputPer1k = Number(row?.outputPer1k ?? row?.outPer1k ?? row?.output ?? row?.out ?? 0);
      if (!Number.isFinite(inputPer1k) || !Number.isFinite(outputPer1k)) continue;
      map.set(key, { inputPer1k, outputPer1k });
    }
  } catch {
    // ignore malformed JSON
  }
  return map;
}

const usageModelPriceMap = parseModelPriceMap(env.MC_USAGE_MODEL_PRICES_JSON || '');

const webPushEnabled = Boolean(
  env.WEB_PUSH_ENABLED && env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY
);
if (webPushEnabled) {
  webpush.setVapidDetails(env.WEB_PUSH_SUBJECT || 'mailto:admin@local', env.WEB_PUSH_PUBLIC_KEY!, env.WEB_PUSH_PRIVATE_KEY!);
}

function nowIso() {
  return new Date().toISOString();
}

function requestId(prefix = 'mc-worker') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function commandIdForNotificationBatch(agentId: string, taskId: string, noteIds: string[]) {
  const seed = `${agentId}|${taskId}|${noteIds.slice().sort().join(',')}`;
  const digest = createHash('sha1').update(seed).digest('hex').slice(0, 16);
  const taskPart = taskId ? taskId.slice(0, 12) : 'global';
  return `mcw-${taskPart}-${digest}`;
}

function truncateForLog(value: string, max = 220) {
  const s = String(value || '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function pruneMapByTtl<T extends { lastAt?: number }>(map: Map<string, T>, ttlMs: number) {
  const now = Date.now();
  for (const [k, v] of map) {
    const at = typeof v?.lastAt === 'number' ? v.lastAt : 0;
    if (!at || now - at > ttlMs) map.delete(k);
  }
}

function pruneTimestampMapByTtl(map: Map<string, number>, ttlMs: number) {
  const now = Date.now();
  for (const [k, at] of map) {
    if (!at || now - at > ttlMs) map.delete(k);
  }
}

function registerDeliveryFailure(notificationId: string, reason: string) {
  pruneMapByTtl(deliveryFailureByNotification, env.MC_DELIVERY_FAILURE_TTL_MS);
  const now = Date.now();
  const prev = deliveryFailureByNotification.get(notificationId);
  const next = {
    count: (prev?.count ?? 0) + 1,
    lastAt: now,
    lastError: truncateForLog(reason, 320),
  };
  deliveryFailureByNotification.set(notificationId, next);
  return next;
}

function clearDeliveryFailure(notificationId: string) {
  deliveryFailureByNotification.delete(notificationId);
  dlqHandledNotifications.delete(notificationId);
}

function markDlqHandled(notificationId: string) {
  pruneTimestampMapByTtl(dlqHandledNotifications, env.MC_DELIVERY_FAILURE_TTL_MS);
  dlqHandledNotifications.set(notificationId, Date.now());
}

function isDlqHandled(notificationId: string) {
  const at = dlqHandledNotifications.get(notificationId);
  if (!at) return false;
  if (Date.now() - at > env.MC_DELIVERY_FAILURE_TTL_MS) {
    dlqHandledNotifications.delete(notificationId);
    return false;
  }
  return true;
}

function parseToolInvokeTextJson(payload: any) {
  const text = payload?.result?.content?.find((c: any) => c?.type === 'text')?.text;
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sessionKeyAgentId(sessionKey: string) {
  const raw = String(sessionKey || '').trim();
  if (!raw.startsWith('agent:')) return '';
  const parts = raw.split(':');
  return parts[1] ? parts[1].trim() : '';
}

function sessionKeyTaskId(sessionKey: string) {
  const raw = String(sessionKey || '').trim();
  if (!raw.startsWith('agent:')) return '';
  const idx = raw.indexOf(':mc:');
  if (idx === -1) return '';
  return raw.slice(idx + 4).trim();
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, digits = 6) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const key = String(model || '').trim();
  if (!key) return null;
  const row = usageModelPriceMap.get(key);
  if (!row) return null;
  const inCost = (safeNumber(inputTokens) / 1000) * safeNumber(row.inputPer1k);
  const outCost = (safeNumber(outputTokens) / 1000) * safeNumber(row.outputPer1k);
  const total = inCost + outCost;
  if (!Number.isFinite(total)) return null;
  return round(total, 8);
}

async function refreshActiveAgentsFromOpenClaw() {
  if (!env.MC_ESCALATION_PRESENCE_ENABLED) return;
  if (env.OPENCLAW_GATEWAY_DISABLED || !env.OPENCLAW_GATEWAY_TOKEN) return;
  const now = Date.now();
  if (now < activeAgentsCacheExpiresAt) return;
  try {
    const out = await toolsInvoke('sessions_list', {
      limit: 200,
      messageLimit: 0,
      activeMinutes: env.MC_ESCALATION_ACTIVE_MINUTES,
    });
    const parsed = parseToolInvokeTextJson(out);
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    activeAgentsCache.clear();
    for (const s of sessions) {
      const agent = sessionKeyAgentId(String(s?.key || ''));
      const normalized = normalizeAgentId(agent);
      if (normalized) activeAgentsCache.add(normalized);
    }
    activeAgentsCacheExpiresAt = now + env.MC_ACTIVE_AGENT_CACHE_MS;
  } catch {
    // Best-effort presence probe.
    activeAgentsCacheExpiresAt = now + Math.min(15_000, env.MC_ACTIVE_AGENT_CACHE_MS);
  }
}

async function chooseEscalationAgent(candidates: string[], fallback: string) {
  const unique = Array.from(new Set(candidates.map((c) => String(c || '').trim()).filter(Boolean)));
  if (!unique.length) return fallback;
  if (!env.MC_ESCALATION_PRESENCE_ENABLED) return unique[0] || fallback;
  await refreshActiveAgentsFromOpenClaw();
  for (const id of unique) {
    if (activeAgentsCache.has(id)) return id;
  }
  return unique[0] || fallback;
}

async function moveNotificationToDlq(token: string, n: any, reason: string, attempt: number) {
  const id = String(n?.id || '').trim();
  if (!id || isDlqHandled(id)) return;
  markDlqHandled(id);

  const taskId = String(n?.taskId || '').trim();
  const to = normalizeAgentId(String(n?.toAgentId || '')) || String(n?.toAgentId || '').trim();
  const summary = `Notification DLQ for ${to || 'agent'} (${attempt}/${env.MC_DELIVERY_MAX_ATTEMPTS})`;
  const detail = `Delivery dropped after ${attempt} attempts. Reason: ${truncateForLog(reason, 240)}`;
  try {
    await pbFetch(`/api/collections/notifications/records/${id}`, {
      method: 'PATCH',
      token,
      body: { delivered: true, deliveredAt: nowIso() },
    });
  } catch (err: any) {
    console.error('[worker] delivery dlq patch failed', id, err?.message || err);
  }

  await createActivity(token, 'delivery_dlq', `${summary} — ${detail}`, taskId);
  clearDeliveryFailure(id);
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
  const now = Date.now();
  return now < circuitUntilMs || now < openclawToolBlockedUntilMs;
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

async function pbFetch(path: string, opts: { method?: string; token?: string; body?: any; _attempt?: number } = {}) {
  // Always prefer the current authStore token (auto-refreshed when needed).
  // Passing around a startup token leads to stale-auth failures over long runs.
  let token = pb.authStore.token;
  if (!pb.authStore.isValid || !token) {
    try {
      token = await authServiceUser();
    } catch {
      token = opts.token ?? '';
    }
  }
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
    const msg = typeof json === 'object' && json ? String((json as any).message || '') : '';
    const maybeAuthFailure = res.status === 401 || res.status === 403 || (res.status === 400 && msg === 'Failed to create record.');
    if ((opts._attempt ?? 0) < 1 && maybeAuthFailure) {
      try {
        // PocketBase can return generic 400s for auth failures on record creates.
        // Re-auth once and retry before surfacing an error.
        await authServiceUser();
        return pbFetch(path, { ...opts, token: undefined, _attempt: (opts._attempt ?? 0) + 1 });
      } catch {
        // fall through to original error
      }
    }
    throw new Error(`PocketBase ${opts.method ?? 'GET'} ${path} ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json;
}

async function ensureAuth() {
  if (pb.authStore.isValid) return pb.authStore.token;
  return authServiceUser();
}

type ToolsInvokeOpts = { timeoutMs?: number; sessionKey?: string; commandId?: string };

class ToolsInvokeHttpError extends Error {
  status: number;
  tool: string;
  requestId: string;
  blockedByPolicy: boolean;
  payload: any;

  constructor(input: { message: string; status: number; tool: string; requestId: string; blockedByPolicy: boolean; payload: any }) {
    super(input.message);
    this.name = 'ToolsInvokeHttpError';
    this.status = input.status;
    this.tool = input.tool;
    this.requestId = input.requestId;
    this.blockedByPolicy = input.blockedByPolicy;
    this.payload = input.payload;
  }
}

function toolErrorMessage(payload: any) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    if (typeof payload?.error?.message === 'string') return payload.error.message;
    if (typeof payload?.message === 'string') return payload.message;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function looksLikeBlockedTool(status: number, tool: string, payload: any) {
  const msg = toolErrorMessage(payload).toLowerCase();
  if (
    status === 404 &&
    ['sessions_send', 'sessions_spawn'].includes(tool) &&
    (msg.includes('tool') || msg.includes('not available') || msg.includes('blocked') || msg.includes('deny'))
  ) {
    return true;
  }
  if (status === 403 && ['sessions_send', 'sessions_spawn'].includes(tool)) return true;
  if (!msg) return false;
  return (
    msg.includes('hard-deny') ||
    msg.includes('hard deny') ||
    msg.includes('blocked') ||
    msg.includes('deny') ||
    msg.includes('not allowed') ||
    msg.includes('disabled by policy')
  );
}

function normalizeGatewayUrl(value: string) {
  try {
    return new URL(String(value || '').trim()).toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim().replace(/\/$/, '');
  }
}

function pushUniqueGatewayUrl(target: string[], value?: string | null) {
  const normalized = normalizeGatewayUrl(String(value || ''));
  if (!normalized) return;
  if (target.includes(normalized)) return;
  target.push(normalized);
}

async function gatewayCandidates() {
  const out: string[] = [];
  if (resolvedGatewayUrlCache && Date.now() < resolvedGatewayUrlCache.expiresAt) {
    pushUniqueGatewayUrl(out, resolvedGatewayUrlCache.url);
  }

  pushUniqueGatewayUrl(out, env.OPENCLAW_GATEWAY_URL);

  try {
    const preferred = new URL(env.OPENCLAW_GATEWAY_URL);
    if (preferred.port) {
      pushUniqueGatewayUrl(out, `http://127.0.0.1:${preferred.port}`);
      pushUniqueGatewayUrl(out, `http://localhost:${preferred.port}`);
    }
  } catch {
    // ignore
  }

  try {
    const cliBin = String(env.OPENCLAW_CLI || 'openclaw').trim() || 'openclaw';
    const { stdout } = await execAsync(`${cliBin} gateway status --json --no-probe --timeout 3000`, {
      timeout: 6_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const parsed = JSON.parse(String(stdout || '{}'));
    const host = String(parsed?.gateway?.bindHost || '').trim();
    const port = Number(parsed?.gateway?.port || 0);
    if (host && Number.isFinite(port) && port > 0) {
      pushUniqueGatewayUrl(out, `http://${host}:${port}`);
      pushUniqueGatewayUrl(out, `http://127.0.0.1:${port}`);
      pushUniqueGatewayUrl(out, `http://localhost:${port}`);
    }
  } catch {
    // ignore
  }

  if (!out.length) pushUniqueGatewayUrl(out, 'http://127.0.0.1:18789');
  return out;
}

async function toolsInvoke(tool: string, args: unknown, opts: ToolsInvokeOpts = {}) {
  if (env.OPENCLAW_GATEWAY_DISABLED || !env.OPENCLAW_GATEWAY_TOKEN) {
    throw new Error('OPENCLAW_GATEWAY_DISABLED');
  }

  const reqId = requestId();
  const timeoutMs = opts.timeoutMs ?? env.OPENCLAW_TOOLS_TIMEOUT_MS;
  const candidates = await gatewayCandidates();
  let lastNetworkErr = '';

  for (const base of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(new URL('/tools/invoke', base), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.OPENCLAW_GATEWAY_TOKEN}`,
          'x-mission-control': '1',
          'x-mission-control-source': 'worker',
          'x-openclaw-request-id': reqId,
        },
        body: JSON.stringify({
          tool,
          args,
          ...(opts.sessionKey ? { sessionKey: opts.sessionKey } : {}),
          ...(opts.commandId ? { commandId: opts.commandId } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        lastNetworkErr = `tools/invoke ${tool} timed out after ${timeoutMs}ms @ ${base} [requestId=${reqId}]`;
        continue;
      }
      lastNetworkErr = `${String(err?.message || err)} @ ${base}`;
      continue;
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
      const blocked = looksLikeBlockedTool(res.status, tool, json);
      const msg = toolErrorMessage(json);
      const help = blocked
        ? 'Tool blocked by OpenClaw gateway policy. Allow it via gateway.tools.allow or configure MC_NOTIFICATION_FALLBACK_CMD.'
        : '';
      throw new ToolsInvokeHttpError({
        message: `tools/invoke ${tool} ${res.status}${msg ? `: ${msg}` : ''}${help ? ` (${help})` : ''} [requestId=${reqId}]`,
        status: res.status,
        tool,
        requestId: reqId,
        blockedByPolicy: blocked,
        payload: json,
      });
    }

    resolvedGatewayUrlCache = { url: base, expiresAt: Date.now() + 60_000 };
    return json;
  }

  throw new Error(lastNetworkErr || `tools/invoke ${tool} failed (no reachable gateway candidates) [requestId=${reqId}]`);
}

async function toolsInvokeWithOpts(tool: string, args: unknown, opts: ToolsInvokeOpts = {}) {
  return toolsInvoke(tool, args, opts);
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

function interpolateFallbackCommand(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

async function sendToAgentViaFallbackCommand(input: {
  sessionKey: string;
  message: string;
  commandId?: string;
}) {
  const template = String(env.MC_NOTIFICATION_FALLBACK_CMD || '').trim();
  if (!template) return false;

  const message = String(input.message || '');
  const vars = {
    SESSION_KEY: input.sessionKey,
    MESSAGE: message,
    MESSAGE_B64: Buffer.from(message, 'utf8').toString('base64'),
    COMMAND_ID: String(input.commandId || ''),
  };
  const cmd = interpolateFallbackCommand(template, vars);
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  childEnv.MC_SESSION_KEY = input.sessionKey;
  childEnv.MC_MESSAGE = message;
  childEnv.MC_MESSAGE_B64 = vars.MESSAGE_B64;
  childEnv.MC_COMMAND_ID = vars.COMMAND_ID;

  await execAsync(cmd, { env: childEnv, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 });
  return true;
}

async function sendToAgent(agentId: string, message: string, taskId?: string | null, commandId?: string) {
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
  try {
    await toolsInvoke('sessions_send', { sessionKey, message: prefixed, timeoutSeconds: 0 }, commandId ? { commandId } : {});
  } catch (err: any) {
    const blocked = err instanceof ToolsInvokeHttpError && err.blockedByPolicy;
    if (!blocked || !env.MC_NOTIFICATION_FALLBACK_ON_TOOL_BLOCK) throw err;

    let usedFallback = false;
    try {
      usedFallback = await sendToAgentViaFallbackCommand({ sessionKey, message: prefixed, commandId });
    } catch (fallbackErr: any) {
      throw new Error(
        `OPENCLAW_TOOL_BLOCKED:sessions_send fallback failed (${String(fallbackErr?.message || fallbackErr)})`
      );
    }
    if (!usedFallback) {
      throw new Error(
        `OPENCLAW_TOOL_BLOCKED:sessions_send ${err?.message || ''} (set gateway.tools.allow=[\"sessions_send\"] or configure MC_NOTIFICATION_FALLBACK_CMD)`
      );
    }
    if (taskId) {
      const token = await ensureAuth();
      await createActivity(
        token,
        'delivery_fallback',
        `OpenClaw gateway blocked sessions_send; delivered via fallback command.`,
        String(taskId),
        resolved
      );
    }
  }
  openclawToolBlockedUntilMs = 0;
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

function parseDateValue(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function nextRecurrenceAfter(base: Date, recurrence: TaskRecurrence, floor: Date) {
  let next = nextRecurrenceAt(base, recurrence);
  let guard = 0;
  while (next.getTime() <= floor.getTime() && guard < 1024) {
    next = nextRecurrenceAt(next, recurrence);
    guard += 1;
  }
  if (next.getTime() <= floor.getTime()) {
    // Safety fallback: ensure we always return a future timestamp.
    next = nextRecurrenceAt(floor, recurrence);
  }
  return next;
}

function nextRecurringDates(task: any, recurrence: TaskRecurrence) {
  const now = new Date();
  const sourceStart = parseDateValue(task?.startAt);
  const sourceDue = parseDateValue(task?.dueAt);
  const anchor = parseDateValue(task?.completedAt) || parseDateValue(task?.updatedAt) || now;

  let nextStart: Date | null = null;
  let nextDue: Date | null = null;

  if (sourceStart) nextStart = nextRecurrenceAfter(sourceStart, recurrence, anchor);
  if (sourceDue) nextDue = nextRecurrenceAfter(sourceDue, recurrence, anchor);

  if (!nextStart && !nextDue) {
    nextDue = nextRecurrenceAt(anchor, recurrence);
  }

  if (nextStart && nextDue && nextDue.getTime() <= nextStart.getTime()) {
    const sourceDuration = sourceStart && sourceDue ? sourceDue.getTime() - sourceStart.getTime() : 0;
    const safeDuration = sourceDuration > 60_000 ? sourceDuration : 60_000;
    nextDue = new Date(nextStart.getTime() + safeDuration);
  }

  return {
    startAt: nextStart ? nextStart.toISOString() : '',
    dueAt: nextDue ? nextDue.toISOString() : '',
  };
}

async function findExistingRecurringSpawn(token: string, fromTaskId: string) {
  const normalizedTaskId = String(fromTaskId || '').trim();
  if (!normalizedTaskId) return '';

  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '1',
      sort: '-createdAt',
      filter: `recurrenceFromTaskId = "${pbFilterString(normalizedTaskId)}"`,
    });
    const list = await pbFetch(`/api/collections/tasks/records?${q.toString()}`, { token });
    return String(list?.items?.[0]?.id || '').trim();
  } catch {
    return '';
  }
}

async function maybeSpawnRecurringTask(token: string, prev: any, record: any) {
  if (!prev) return;
  if (String(prev?.status || '').trim() === 'done') return;
  if (String(record?.status || '').trim() !== 'done') return;

  const taskId = String(record?.id || '').trim();
  if (!taskId) return;
  if (recurringSpawnLocks.has(taskId)) return;

  const fallback = parseDateValue(record?.dueAt) || parseDateValue(record?.startAt) || parseDateValue(record?.createdAt) || new Date();
  const recurrence = normalizeTaskRecurrence(record?.recurrence, fallback);
  if (!recurrence) return;

  recurringSpawnLocks.add(taskId);
  try {
    const fresh = await pbFetch(`/api/collections/tasks/records/${taskId}`, { token });
    const freshFallback = parseDateValue(fresh?.dueAt) || parseDateValue(fresh?.startAt) || parseDateValue(fresh?.createdAt) || new Date();
    const normalized = normalizeTaskRecurrence(fresh?.recurrence, freshFallback);
    if (!normalized) return;

    const seriesId = String(fresh?.recurrenceSeriesId || '').trim() || taskId;
    const existingSpawnId = String(fresh?.recurrenceSpawnedTaskId || '').trim();
    if (existingSpawnId) return;

    const discoveredSpawnId = await findExistingRecurringSpawn(token, taskId);
    if (discoveredSpawnId) {
      await pbFetch(`/api/collections/tasks/records/${taskId}`, {
        method: 'PATCH',
        token,
        body: {
          recurrenceSeriesId: seriesId,
          recurrenceSpawnedTaskId: discoveredSpawnId,
          updatedAt: nowIso(),
        },
      }).catch(() => {});

      const cached = taskCache.get(taskId);
      if (cached && typeof cached === 'object') {
        taskCache.set(taskId, {
          ...cached,
          recurrenceSeriesId: seriesId,
          recurrenceSpawnedTaskId: discoveredSpawnId,
        });
      }
      return;
    }

    const taskProjectId = String(fresh?.projectId || '').trim();
    const projectBlockReason = getProjectAutomationBlockReason(taskProjectId);
    if (projectBlockReason) {
      const summary = `Skipped recurring spawn for "${String(fresh?.title || taskId)}" because ${projectBlockReason}.`;
      const noticeKey = `recurrence:${taskId}:${taskProjectId}:${projectBlockReason}`;
      if (shouldEmitAutomationPolicyNotice(noticeKey, 30 * 60_000)) {
        await createActivity(token, 'task_recurrence_skipped', summary, taskId);
        await createNotification(token, leadAgentId, summary, taskId, 'incident', {
          title: 'Recurring task skipped',
          url: `/tasks/${taskId}`,
        });
      }
      return;
    }

    const nextDates = nextRecurringDates(fresh, normalized);
    const nowStamp = nowIso();
    const rawAssigneeIds = Array.isArray(fresh?.assigneeIds)
      ? fresh.assigneeIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : [];
    const normalizedAssigneeIds = normalizeAgentIds(rawAssigneeIds);
    const assigneeIds = normalizedAssigneeIds.length ? normalizedAssigneeIds : rawAssigneeIds;
    const nextStatus = assigneeIds.length ? 'assigned' : 'inbox';

    const nextTitle = String(fresh?.title || '').trim() || 'Recurring task';
    const nextPriority = String(fresh?.priority || '').trim().toLowerCase();
    const nextEscalation = normalizeAgentId(String(fresh?.escalationAgentId || '').trim()) || leadAgentId;
    const nextMaxAutoNudges = Number.isFinite(Number(fresh?.maxAutoNudges)) ? Number(fresh.maxAutoNudges) : 3;

    const created = await pbFetch('/api/collections/tasks/records', {
      method: 'POST',
      token,
      body: {
        projectId: String(fresh?.projectId || '').trim(),
        title: nextTitle,
        description: String(fresh?.description || ''),
        context: String(fresh?.context || ''),
        vaultItem: String(fresh?.vaultItem || ''),
        status: nextStatus,
        priority: ['p0', 'p1', 'p2', 'p3'].includes(nextPriority) ? nextPriority : 'p2',
        aiEffort: String(fresh?.aiEffort || '').trim() || 'auto',
        aiThinking: String(fresh?.aiThinking || '').trim() || 'auto',
        aiModelTier: String(fresh?.aiModelTier || '').trim() || 'auto',
        aiModel: String(fresh?.aiModel || '').trim(),
        assigneeIds,
        requiredNodeId: String(fresh?.requiredNodeId || '').trim(),
        labels: normalizeStringArray(fresh?.labels),
        leaseOwnerAgentId: '',
        leaseExpiresAt: '',
        attemptCount: 0,
        lastProgressAt: '',
        maxAutoNudges: nextMaxAutoNudges,
        escalationAgentId: nextEscalation,
        archived: false,
        createdAt: nowStamp,
        updatedAt: nowStamp,
        startAt: nextDates.startAt,
        dueAt: nextDates.dueAt,
        completedAt: '',
        recurrence: normalized,
        recurrenceSeriesId: seriesId,
        recurrenceFromTaskId: taskId,
        recurrenceSpawnedTaskId: '',
        requiresReview: Boolean(fresh?.requiresReview),
        policy: fresh?.policy ?? null,
        reviewChecklist: fresh?.reviewChecklist ?? null,
        order: Date.now(),
        subtasksTotal: 0,
        subtasksDone: 0,
      },
    });

    const spawnedTaskId = String((created as any)?.id || '').trim();
    if (!spawnedTaskId) return;

    await pbFetch(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token,
      body: {
        recurrenceSeriesId: seriesId,
        recurrenceSpawnedTaskId: spawnedTaskId,
        updatedAt: nowIso(),
      },
    }).catch(() => {});

    const cached = taskCache.get(taskId);
    if (cached && typeof cached === 'object') {
      taskCache.set(taskId, {
        ...cached,
        recurrenceSeriesId: seriesId,
        recurrenceSpawnedTaskId: spawnedTaskId,
      });
    }

    await createActivity(
      token,
      'task_recurred',
      `Generated next recurring task "${String((created as any)?.title || spawnedTaskId)}".`,
      taskId
    );
  } catch (err: any) {
    console.error('[worker] recurring task spawn failed', taskId, err?.message || err);
  } finally {
    recurringSpawnLocks.delete(taskId);
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

async function createNotification(
  token: string,
  toAgentId: string,
  content: string,
  taskId?: string,
  kind = 'generic',
  meta?: { title?: string; url?: string }
) {
  const normalized = normalizeAgentId(toAgentId);
  if (!normalized) return null;
  const key = notificationKey(normalized, taskId, kind);
  if (!shouldNotify(key)) return null;

  try {
    const title = String(meta?.title || '').trim() || String(content || '').trim().slice(0, 140);
    const url = String(meta?.url || '').trim() || (taskId ? `/tasks/${taskId}` : '/inbox');
    return await pbFetch('/api/collections/notifications/records', {
      method: 'POST',
      token,
      body: {
        toAgentId: normalized,
        taskId: taskId ?? '',
        content,
        kind,
        title,
        url,
        delivered: false,
        readAt: '',
      },
    });
  } catch (err: any) {
    const fallbackMsg = String(err?.message || '');
    const maybeSchemaDrift =
      fallbackMsg.includes('Failed to create record') ||
      fallbackMsg.includes('validation_not_match') ||
      fallbackMsg.includes('Unknown field');
    if (maybeSchemaDrift) {
      try {
        return await pbFetch('/api/collections/notifications/records', {
          method: 'POST',
          token,
          body: { toAgentId: normalized, taskId: taskId ?? '', content, delivered: false },
        });
      } catch {
        // fall through to log
      }
    }
    // Notification write failures should never crash the worker loop.
    console.error('[worker] createNotification failed', {
      toAgentId: normalized,
      taskId: taskId ?? '',
      kind,
      err: err?.message || err,
    });
    return null;
  }
}

async function notifyReviewRequested(token: string, record: any) {
  const taskId = String(record?.id || '').trim();
  if (!taskId) return;
  const title = String(record?.title || taskId).trim() || taskId;
  const recipients = new Set<string>([leadAgentId]);
  for (const assigneeId of normalizeAgentIds(record?.assigneeIds ?? [])) recipients.add(assigneeId);

  for (const toAgentId of recipients) {
    await ensureTaskSubscription(token, taskId, toAgentId, 'review_requested');
    await createNotification(
      token,
      toAgentId,
      `Review requested: ${title}`,
      taskId,
      'review_requested',
      { title: `Review requested: ${title}`, url: `/tasks/${taskId}` }
    );
  }
}

async function notifyWorkflowFailure(
  token: string,
  detail: { workflowName: string; reason: string; taskId?: string; runId?: string }
) {
  const workflowName = String(detail.workflowName || '').trim() || 'workflow';
  const reason = String(detail.reason || '').trim() || 'unknown error';
  const taskId = String(detail.taskId || '').trim();
  const runId = String(detail.runId || '').trim();
  const recipients = new Set<string>([leadAgentId]);
  if (taskId) {
    const task = taskCache.get(taskId);
    for (const assigneeId of normalizeAgentIds(task?.assigneeIds ?? [])) recipients.add(assigneeId);
  }
  const url = runId ? `/workflows?run=${encodeURIComponent(runId)}` : taskId ? `/tasks/${taskId}` : '/workflows';
  const title = `Workflow failed: ${workflowName}`;
  const content = `Workflow failed (${workflowName}): ${reason}`;

  for (const toAgentId of recipients) {
    await createNotification(token, toAgentId, content, taskId || '', 'workflow_failed', { title, url });
  }
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
      const noteIds = notes.map((n) => String(n?.id || '')).filter(Boolean);
      const commandId = commandIdForNotificationBatch(agentId, taskId, noteIds);

      try {
        const out = await sendToAgent(agentId, msg, taskId || null, commandId);
        if (out && typeof out === 'object' && (out as any).sent === false) {
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
        const blockedByPolicy =
          (err instanceof ToolsInvokeHttpError && err.blockedByPolicy) ||
          String(err?.message || '').startsWith('OPENCLAW_TOOL_BLOCKED:');
        if (blockedByPolicy) {
          openclawToolBlockedUntilMs = Date.now() + env.MC_TOOL_BLOCK_COOLDOWN_MS;
          if (taskId) {
            await createActivity(
              token,
              'delivery_blocked',
              `OpenClaw blocked sessions_send via gateway policy. Update gateway.tools.allow or configure MC_NOTIFICATION_FALLBACK_CMD.`,
              taskId,
              agentId
            );
          }
          console.error('[worker] delivery blocked by gateway policy', { agentId, taskId, error: String(err?.message || err) });
          return;
        }
        const reason = String(err?.message || err);
        for (const n of notes) {
          const id = String(n?.id || '').trim();
          if (!id) continue;
          const failure = registerDeliveryFailure(id, reason);
          if (failure.count >= env.MC_DELIVERY_MAX_ATTEMPTS) {
            await moveNotificationToDlq(token, n, reason, failure.count);
          }
        }
        console.error('[worker] deliver failed', agentId, reason);
        continue;
      }

      // Mark delivered after successful send. If the PATCH fails, keep an in-memory
      // "sent" cache to avoid repeatedly spamming the same notification.
      for (const n of notes) {
        sentNotificationIds.set(n.id, Date.now());
        clearDeliveryFailure(String(n.id || '').trim());
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

function extractToolInvokeMessages(payload: any) {
  if (!payload || typeof payload !== 'object') return [] as any[];
  if (Array.isArray(payload.messages)) return payload.messages;

  const detailsMessages = payload?.result?.details?.messages;
  if (Array.isArray(detailsMessages)) return detailsMessages;

  const content = payload?.result?.content;
  if (!Array.isArray(content)) return [] as any[];
  const text = content.find((c: any) => c?.type === 'text')?.text;
  if (typeof text !== 'string' || !text.trim()) return [] as any[];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.messages) ? parsed.messages : [];
  } catch {
    return [] as any[];
  }
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

  const messages = extractToolInvokeMessages(out);
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
    await maybeFireWorkflowCreateTriggers(token, record);
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
    await maybeFireWorkflowTriggers(token, prev, record);
    if (record.status === 'review') {
      await createActivity(token, 'review_requested', `Review requested for "${record.title}"`, record.id, record.leaseOwnerAgentId || '');
      await notifyReviewRequested(token, record);
    }
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

  await maybeSpawnRecurringTask(token, prev, record);

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
    const preferredEscalation = normalizeAgentId(t.escalationAgentId) ?? leadAgentId;
    const escalationCandidates = [
      preferredEscalation,
      ...normalizeAgentIds(Array.isArray(t.assigneeIds) ? t.assigneeIds : []),
      owner,
      leadAgentId,
    ];
    const escalation = await chooseEscalationAgent(escalationCandidates, preferredEscalation);

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

async function refreshProjects(token: string) {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' });
  const projects = await pbFetch(`/api/collections/projects/records?${q.toString()}`, { token });
  projectCache.clear();
  for (const project of projects.items ?? []) {
    const id = String(project?.id || '').trim();
    if (!id) continue;
    projectCache.set(id, project);
  }
}

function normalizeProjectMode(value: unknown): 'manual' | 'supervised' | 'autopilot' {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'manual' || mode === 'autopilot' || mode === 'supervised') return mode;
  return 'supervised';
}

function normalizeProjectStatus(project: any): 'active' | 'paused' | 'archived' {
  const status = String(project?.status || '').trim().toLowerCase();
  if (status === 'paused' || status === 'archived' || status === 'active') return status;
  if (project?.archived === true) return 'archived';
  return 'active';
}

function getProjectAutomationBlockReason(projectId: string) {
  const id = String(projectId || '').trim();
  if (!id) return '';
  const project = projectCache.get(id);
  if (!project) return '';
  const name = String(project?.name || id).trim() || id;
  const status = normalizeProjectStatus(project);
  if (status === 'archived') return `project "${name}" is archived`;
  if (status === 'paused') return `project "${name}" is paused`;
  const mode = normalizeProjectMode(project?.mode);
  if (mode === 'manual') return `project "${name}" is in manual mode`;
  return '';
}

function shouldEmitAutomationPolicyNotice(key: string, cooldownMs = 20 * 60_000) {
  const now = Date.now();
  for (const [k, at] of automationPolicyNoticeByKey) {
    if (!at || now - at > cooldownMs * 4) automationPolicyNoticeByKey.delete(k);
  }
  const last = automationPolicyNoticeByKey.get(key) || 0;
  if (last && now - last < cooldownMs) return false;
  automationPolicyNoticeByKey.set(key, now);
  return true;
}

async function writeUsageEvent(token: string, payload: Record<string, unknown>) {
  if (Date.now() < usageCollectionDisabledUntilMs) return false;
  try {
    await pbFetch('/api/collections/usage_events/records', {
      method: 'POST',
      token,
      body: payload,
    });
    return true;
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('/usage_events/') || msg.includes('usage_events') || msg.includes('404')) {
      usageCollectionDisabledUntilMs = Date.now() + 15 * 60_000;
    }
    console.error('[worker] usage event write failed', msg);
    return false;
  }
}

async function collectUsageSnapshot(token: string) {
  if (!env.MC_USAGE_COLLECT_ENABLED) return;
  if (env.OPENCLAW_GATEWAY_DISABLED || !env.OPENCLAW_GATEWAY_TOKEN) return;
  if (Date.now() < usageCollectionDisabledUntilMs) return;

  let out: any;
  try {
    out = await toolsInvokeWithOpts('sessions_list', { limit: 500, messageLimit: 0 }, { timeoutMs: 10_000 });
  } catch (err: any) {
    console.error('[worker] usage snapshot sessions_list failed', err?.message || err);
    return;
  }

  const parsed = invokeParsedJson(out);
  const sessions = Array.isArray((parsed as any)?.sessions) ? (parsed as any).sessions : [];
  if (!sessions.length) return;

  const now = Date.now();
  const ts = nowIso();
  let written = 0;

  for (const s of sessions) {
    const sessionKey = String(s?.key || '').trim();
    if (!sessionKey) continue;

    const inputTokens = safeNumber(s?.inputTokens);
    const outputTokens = safeNumber(s?.outputTokens);
    const tokensUsed = safeNumber(s?.totalTokens);
    const tokensMax = safeNumber(s?.contextTokens);
    const tokensPct = tokensUsed > 0 && tokensMax > 0 ? Math.round((tokensUsed / tokensMax) * 100) : 0;

    const prev = usageSnapshotBySession.get(sessionKey);
    if (
      prev &&
      prev.inputTokens === inputTokens &&
      prev.outputTokens === outputTokens &&
      prev.tokensUsed === tokensUsed &&
      prev.tokensMax === tokensMax &&
      prev.tokensPct === tokensPct
    ) {
      continue;
    }

    usageSnapshotBySession.set(sessionKey, { inputTokens, outputTokens, tokensUsed, tokensMax, tokensPct, at: now });

    const rawAgent = sessionKeyAgentId(sessionKey);
    const agentId = normalizeAgentId(rawAgent) || rawAgent || '';
    const taskId = sessionKeyTaskId(sessionKey);
    const projectId = taskId ? String(taskCache.get(taskId)?.projectId || '').trim() : '';
    const model = String(s?.model || '').trim();
    const estimatedCostUsd = estimateCostUsd(model, inputTokens, outputTokens);

    const ok = await writeUsageEvent(token, {
      ts,
      source: 'sessions_list_snapshot',
      sessionKey,
      agentId,
      taskId,
      projectId,
      model,
      inputTokens,
      outputTokens,
      tokensUsed,
      tokensMax,
      tokensPct,
      ...(estimatedCostUsd !== null ? { estimatedCostUsd } : {}),
      createdAt: ts,
      updatedAt: ts,
    });
    if (ok) written += 1;
  }

  const staleMs = 24 * 60 * 60_000;
  for (const [k, v] of usageSnapshotBySession) {
    if (now - v.at > staleMs) usageSnapshotBySession.delete(k);
  }

  if (written) {
    console.log('[worker] usage snapshot captured', written, 'event(s)');
  }
}

async function sumProjectCostSince(token: string, projectId: string, since: Date) {
  if (!projectId) return 0;
  if (Date.now() < usageCollectionDisabledUntilMs) return 0;
  const perPage = 500;
  let page = 1;
  let total = 0;

  while (page <= 40) {
    const q = new URLSearchParams({
      page: String(page),
      perPage: String(perPage),
      filter: `projectId = "${pbFilterString(projectId)}" && ts >= "${pbDateForFilter(since)}"`,
    });
    let data: any;
    try {
      data = await pbFetch(`/api/collections/usage_events/records?${q.toString()}`, { token });
    } catch {
      return total;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const row of items) total += safeNumber(row?.estimatedCostUsd);
    if (items.length < perPage) break;
    page += 1;
  }
  return round(total, 8);
}

function shouldSendBudgetAlert(key: string) {
  const now = Date.now();
  for (const [k, at] of budgetAlertByProjectKey) {
    if (now - at > env.MC_PROJECT_BUDGET_ALERT_COOLDOWN_MS) budgetAlertByProjectKey.delete(k);
  }
  const last = budgetAlertByProjectKey.get(key) || 0;
  if (now - last < env.MC_PROJECT_BUDGET_ALERT_COOLDOWN_MS) return false;
  budgetAlertByProjectKey.set(key, now);
  return true;
}

async function pauseProjectSchedulesForBudget(token: string, projectId: string) {
  if (!projectId) return 0;
  let paused = 0;
  const perPage = 200;
  let page = 1;

  while (page <= 20) {
    let data: any;
    try {
      const q = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
        filter: 'enabled = true && taskId != ""',
      });
      data = await pbFetch(`/api/collections/workflow_schedules/records?${q.toString()}`, { token });
    } catch {
      return paused;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    for (const schedule of items) {
      const scheduleId = String(schedule?.id || '').trim();
      const taskId = String(schedule?.taskId || '').trim();
      if (!scheduleId || !taskId) continue;
      const taskProjectId = String(taskCache.get(taskId)?.projectId || '').trim();
      if (!taskProjectId || taskProjectId !== projectId) continue;

      try {
        await pbFetch(`/api/collections/workflow_schedules/records/${scheduleId}`, {
          method: 'PATCH',
          token,
          body: {
            enabled: false,
            running: false,
            runningRunId: '',
            runningStartedAt: '',
            updatedAt: nowIso(),
          },
        });
        paused += 1;
      } catch {
        // ignore per-schedule patch errors; keep trying others
      }
    }

    if (items.length < perPage) break;
    page += 1;
  }

  return paused;
}

async function checkProjectBudgets(token: string) {
  if (!env.MC_USAGE_COLLECT_ENABLED) return;
  if (Date.now() < usageCollectionDisabledUntilMs) return;

  let projects: any[] = [];
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      filter: 'archived = false',
    });
    const data = await pbFetch(`/api/collections/projects/records?${q.toString()}`, { token });
    projects = Array.isArray(data?.items) ? data.items : [];
  } catch {
    return;
  }
  if (!projects.length) return;

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  for (const project of projects) {
    const projectId = String(project?.id || '').trim();
    if (!projectId) continue;
    const projectName = String(project?.name || projectId);
    const warnPctRaw = safeNumber(project?.budgetWarnPct);
    const warnPct = warnPctRaw > 0 ? warnPctRaw : 90;

    const dailyBudget = safeNumber(project?.dailyBudgetUsd);
    const monthlyBudget = safeNumber(project?.monthlyBudgetUsd);
    const dailySpent = dailyBudget > 0 ? await sumProjectCostSince(token, projectId, dayStart) : 0;
    const monthlySpent = monthlyBudget > 0 ? await sumProjectCostSince(token, projectId, monthStart) : 0;

    if (dailyBudget > 0) {
      const threshold = dailyBudget * (warnPct / 100);
      const key = `${projectId}:daily`;
      if (dailySpent >= threshold && shouldSendBudgetAlert(key)) {
        const msg = `Budget alert (${projectName}): daily spend ${round(dailySpent, 4)} / ${round(dailyBudget, 4)} USD (${Math.round((dailySpent / dailyBudget) * 100)}%).`;
        await createActivity(token, 'budget_exceeded', msg);
        await createNotification(token, leadAgentId, msg, '', 'budget_exceeded', {
          title: `Budget alert: ${projectName}`,
          url: `/usage?project=${projectId}`,
        });
      } else if (dailySpent < threshold * 0.8) {
        budgetAlertByProjectKey.delete(key);
      }
    }

    if (monthlyBudget > 0) {
      const threshold = monthlyBudget * (warnPct / 100);
      const key = `${projectId}:month`;
      if (monthlySpent >= threshold && shouldSendBudgetAlert(key)) {
        const msg = `Budget alert (${projectName}): monthly spend ${round(monthlySpent, 4)} / ${round(monthlyBudget, 4)} USD (${Math.round((monthlySpent / monthlyBudget) * 100)}%).`;
        await createActivity(token, 'budget_exceeded', msg);
        await createNotification(token, leadAgentId, msg, '', 'budget_exceeded', {
          title: `Budget alert: ${projectName}`,
          url: `/usage?project=${projectId}`,
        });
      } else if (monthlySpent < threshold * 0.8) {
        budgetAlertByProjectKey.delete(key);
      }
    }

    if (env.MC_BUDGET_PAUSE_AUTOMATIONS) {
      const hardExceeded =
        (dailyBudget > 0 && dailySpent >= dailyBudget) || (monthlyBudget > 0 && monthlySpent >= monthlyBudget);
      const pauseKey = `${projectId}:pause`;
      if (hardExceeded && shouldSendBudgetAlert(pauseKey)) {
        const paused = await pauseProjectSchedulesForBudget(token, projectId);
        if (paused > 0) {
          const msg = `Budget hard-limit reached (${projectName}). Paused ${paused} workflow schedule(s) tied to this project.`;
          await createActivity(token, 'workflow_schedule_disabled', msg);
          await createNotification(token, leadAgentId, msg, '', 'budget_exceeded', {
            title: `Automation paused: ${projectName}`,
            url: `/usage?project=${projectId}`,
          });
        }
      } else if (!hardExceeded) {
        budgetAlertByProjectKey.delete(pauseKey);
      }
    }
  }
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

function projectStatusFromCounts(done: number, inProgress: number, review: number, blocked: number) {
  if (blocked > 0) return 'at_risk';
  if (done === 0 && inProgress === 0 && review === 0) return 'off_track';
  return 'on_track';
}

function listTaskTitles(tasks: any[], max = 3) {
  return tasks
    .map((task) => String(task?.title || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

async function upsertAutoProjectStatusUpdates(token: string, dayStart: Date, dateKey: string) {
  let projects: any[] = [];
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      sort: 'name',
      filter: 'archived = false',
    });
    const data = await pbFetch(`/api/collections/projects/records?${q.toString()}`, { token });
    projects = Array.isArray(data?.items) ? data.items : [];
  } catch (err: any) {
    console.error('[worker] status update project query failed', err?.message || err);
    return;
  }

  for (const project of projects) {
    const projectId = String(project?.id || '').trim();
    if (!projectId) continue;
    const projectName = String(project?.name || projectId).trim() || projectId;
    const tasks = Array.from(taskCache.values()).filter(
      (task) => String(task?.projectId || '').trim() === projectId && task?.archived !== true
    );
    const done = tasks.filter((task) => String(task?.status || '').trim() === 'done');
    const inProgress = tasks.filter((task) => String(task?.status || '').trim() === 'in_progress');
    const review = tasks.filter((task) => String(task?.status || '').trim() === 'review');
    const blocked = tasks.filter((task) => String(task?.status || '').trim() === 'blocked');
    const status = projectStatusFromCounts(done.length, inProgress.length, review.length, blocked.length);

    const summary = `Auto status ${dateKey}: ${done.length} done, ${inProgress.length} in progress, ${review.length} in review, ${blocked.length} blocked.`;
    const highlights = listTaskTitles(done).join(' | ');
    const risks = listTaskTitles(blocked).join(' | ');
    const nextSteps = listTaskTitles([...inProgress, ...review]).join(' | ');

    const filter = `projectId = "${pbFilterString(projectId)}" && autoGenerated = true && createdAt >= "${pbFilterString(pbDateForFilter(dayStart))}"`;
    try {
      const existingQ = new URLSearchParams({
        page: '1',
        perPage: '1',
        sort: '-createdAt',
        filter,
      });
      const existing = await pbFetch(`/api/collections/project_status_updates/records?${existingQ.toString()}`, { token });
      const row = Array.isArray(existing?.items) && existing.items.length ? existing.items[0] : null;
      const payload = {
        projectId,
        status,
        summary,
        highlights,
        risks,
        nextSteps,
        autoGenerated: true,
        updatedAt: nowIso(),
      };

      if (row?.id) {
        await pbFetch(`/api/collections/project_status_updates/records/${row.id}`, {
          method: 'PATCH',
          token,
          body: payload,
        });
      } else {
        await pbFetch('/api/collections/project_status_updates/records', {
          method: 'POST',
          token,
          body: {
            ...payload,
            createdAt: nowIso(),
          },
        });
        await createActivity(token, 'project_status_update', `Auto status update created for ${projectName}.`);
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes('project_status_updates') || msg.includes('/project_status_updates/')) return;
      console.error('[worker] status update upsert failed', { projectId, err: msg });
    }
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

  await upsertAutoProjectStatusUpdates(token, start, dateKey);

  try {
    await sendToAgent(leadAgentId, lines);
  } catch (err: any) {
    console.error('[worker] standup delivery failed', err?.message || err);
  }

  lastStandupDate = dateKey;
}

function toPositiveNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function listDueWorkflowSchedules(token: string) {
  const now = new Date();
  const nowPb = pbDateForFilter(now);
  const q = new URLSearchParams({
    page: '1',
    perPage: '50',
    sort: 'nextRunAt',
    filter: `enabled = true && running = false && (nextRunAt = "" || nextRunAt <= "${pbFilterString(nowPb)}")`,
  });
  const list = await pbFetch(`/api/collections/workflow_schedules/records?${q.toString()}`, { token });
  return (list?.items ?? []) as any[];
}

async function executeWorkflowSchedule(token: string, schedule: any) {
  const scheduleId = String(schedule?.id || '').trim();
  const workflowId = String(schedule?.workflowId || '').trim();
  if (!scheduleId || !workflowId) return;

  const intervalMinutes = toPositiveNumber(schedule?.intervalMinutes);
  if (!intervalMinutes) {
    await pbFetch(`/api/collections/workflow_schedules/records/${scheduleId}`, {
      method: 'PATCH',
      token,
      body: { enabled: false, updatedAt: nowIso() },
    }).catch(() => {});
    await createActivity(token, 'workflow_schedule_disabled', `Disabled schedule ${scheduleId} (invalid interval).`);
    return;
  }

  let workflow: any;
  try {
    workflow = await pbFetch(`/api/collections/workflows/records/${workflowId}`, { token });
  } catch (err: any) {
    await pbFetch(`/api/collections/workflow_schedules/records/${scheduleId}`, {
      method: 'PATCH',
      token,
      body: { enabled: false, updatedAt: nowIso() },
    }).catch(() => {});
    await createActivity(token, 'workflow_schedule_disabled', `Disabled schedule ${scheduleId} (missing workflow).`);
    return;
  }

  const kind = String(workflow?.kind || '').trim() || 'manual';
  const pipeline = String(workflow?.pipeline || '').trim();
  const taskId = String(schedule?.taskId || '').trim();
  const sessionKey = String(schedule?.sessionKey || '').trim();
  const vars = schedule?.vars ?? null;

  const now = new Date();
  const nowIsoStamp = now.toISOString();
  const nextRunAt = new Date(Date.now() + intervalMinutes * 60_000).toISOString();
  const taskProjectId = taskId ? String(taskCache.get(taskId)?.projectId || '').trim() : '';
  const projectBlockReason = getProjectAutomationBlockReason(taskProjectId);
  if (projectBlockReason) {
    await pbFetch(`/api/collections/workflow_schedules/records/${scheduleId}`, {
      method: 'PATCH',
      token,
      body: {
        running: false,
        runningRunId: '',
        runningStartedAt: '',
        lastRunAt: nowIsoStamp,
        nextRunAt,
        updatedAt: nowIsoStamp,
      },
    }).catch(() => {});
    const workflowName = String(workflow?.name || workflowId).trim() || workflowId;
    const summary = `Skipped schedule ${scheduleId} (${workflowName}) because ${projectBlockReason}.`;
    const noticeKey = `schedule:${scheduleId}:${taskProjectId}:${projectBlockReason}`;
    if (shouldEmitAutomationPolicyNotice(noticeKey)) {
      await createActivity(token, 'workflow_schedule_skipped', summary, taskId || '', '');
      await createNotification(token, leadAgentId, summary, taskId || '', 'incident', {
        title: `Automation skipped: ${workflowName}`,
        url: taskId ? `/tasks/${taskId}` : '/projects',
      });
    }
    return;
  }

  const runBase: any = {
    workflowId,
    taskId: taskId || '',
    sessionKey: sessionKey || '',
    vars,
    status: kind === 'lobster' ? 'running' : 'failed',
    startedAt: kind === 'lobster' ? nowIsoStamp : '',
    finishedAt: kind === 'lobster' ? '' : nowIsoStamp,
    createdAt: nowIsoStamp,
    updatedAt: nowIsoStamp,
    log: kind === 'lobster' ? '' : `Scheduled execution not supported for workflow kind "${kind}".`,
  };

  const createdRun = await pbFetch('/api/collections/workflow_runs/records', { method: 'POST', token, body: runBase });
  const runId = String((createdRun as any)?.id || '').trim();
  const commandId = runId ? `mcwfr-${runId}` : '';
  if (commandId) {
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { commandId, updatedAt: nowIso() },
    }).catch(() => {});
  }

  await pbFetch(`/api/collections/workflow_schedules/records/${scheduleId}`, {
    method: 'PATCH',
    token,
    body: {
      running: kind === 'lobster',
      runningRunId: kind === 'lobster' ? runId : '',
      runningStartedAt: kind === 'lobster' ? nowIsoStamp : '',
      lastRunAt: nowIsoStamp,
      nextRunAt,
      updatedAt: nowIsoStamp,
    },
  }).catch(() => {});

  await createActivity(
    token,
    'workflow_schedule_fired',
    `Workflow schedule fired (${String(workflow?.name || workflowId).trim() || workflowId}).`,
    taskId || '',
    ''
  );

  if (kind !== 'lobster') {
    const reason = `unsupported kind "${kind}"`;
    await createActivity(token, 'workflow_run_failed', `Workflow run failed (${reason}).`, taskId || '', '');
    await notifyWorkflowFailure(token, {
      workflowName: String(workflow?.name || workflowId).trim() || workflowId,
      reason,
      taskId: taskId || '',
      runId,
    });
    return;
  }

  if (!pipeline) {
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { status: 'failed', log: 'Missing pipeline on workflow.', finishedAt: nowIso(), updatedAt: nowIso() },
    }).catch(() => {});
    await pbFetch(`/api/collections/workflow_schedules/records/${scheduleId}`, {
      method: 'PATCH',
      token,
      body: { running: false, runningRunId: '', runningStartedAt: '', updatedAt: nowIso() },
    }).catch(() => {});
    await createActivity(token, 'workflow_run_failed', `Workflow run failed (missing pipeline).`, taskId || '', '');
    await notifyWorkflowFailure(token, {
      workflowName: String(workflow?.name || workflowId).trim() || workflowId,
      reason: 'missing pipeline',
      taskId: taskId || '',
      runId,
    });
    return;
  }

  try {
    const timeoutMs = 10 * 60_000;
    const args: Record<string, unknown> = { pipeline };
    if (vars) args.vars = vars;
    if (taskId) args.taskId = taskId;
    if (runId) args.runId = runId;

    const out = await toolsInvokeWithOpts(
      'lobster',
      args,
      sessionKey ? { timeoutMs, sessionKey, commandId } : { timeoutMs, commandId }
    );
    const result = invokeParsedJson(out) ?? invokeText(out) ?? out;
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { status: 'succeeded', result, finishedAt: nowIso(), updatedAt: nowIso() },
    });
    await createActivity(token, 'workflow_run_succeeded', `Workflow run succeeded (${String(workflow?.name || workflowId).trim() || workflowId}).`, taskId || '', '');
  } catch (err: any) {
    const msg = err?.message || String(err);
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { status: 'failed', log: msg, finishedAt: nowIso(), updatedAt: nowIso() },
    }).catch(() => {});
    await createActivity(token, 'workflow_run_failed', `Workflow run failed (${String(workflow?.name || workflowId).trim() || workflowId}): ${msg}`, taskId || '', '');
    await notifyWorkflowFailure(token, {
      workflowName: String(workflow?.name || workflowId).trim() || workflowId,
      reason: msg,
      taskId: taskId || '',
      runId,
    });
  } finally {
    await pbFetch(`/api/collections/workflow_schedules/records/${scheduleId}`, {
      method: 'PATCH',
      token,
      body: { running: false, runningRunId: '', runningStartedAt: '', updatedAt: nowIso() },
    }).catch(() => {});
  }
}

let scheduleTicking = false;
async function runWorkflowSchedules(token: string) {
  if (scheduleTicking) return;
  scheduleTicking = true;
  try {
    // Recovery: clear schedules that were left "running" due to worker crash.
    // Anything older than 30 minutes is treated as stale.
    try {
      const cutoff = new Date(Date.now() - 30 * 60_000);
      const q = new URLSearchParams({
        page: '1',
        perPage: '50',
        sort: 'runningStartedAt',
        filter: `running = true && runningStartedAt != "" && runningStartedAt <= "${pbFilterString(pbDateForFilter(cutoff))}"`,
      });
      const stale = await pbFetch(`/api/collections/workflow_schedules/records?${q.toString()}`, { token });
      for (const s of (stale?.items ?? []) as any[]) {
        await pbFetch(`/api/collections/workflow_schedules/records/${s.id}`, {
          method: 'PATCH',
          token,
          body: { running: false, runningRunId: '', runningStartedAt: '', updatedAt: nowIso() },
        }).catch(() => {});
        await createActivity(token, 'workflow_schedule_recovered', `Recovered stale schedule ${s.id} (cleared running lock).`);
      }
    } catch {
      // ignore recovery errors
    }

    const due = await listDueWorkflowSchedules(token);
    for (const s of due) {
      // Fire sequentially to keep OpenClaw load predictable.
      // Schedules are interval-based, and we update nextRunAt immediately.
      await executeWorkflowSchedule(token, s);
    }
  } catch (err: any) {
    console.error('[worker] schedules tick failed', err?.message || err);
  } finally {
    scheduleTicking = false;
  }
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function normalizePriority(value: unknown) {
  const p = String(value ?? '').trim().toLowerCase();
  if (['p0', 'p1', 'p2', 'p3'].includes(p)) return p;
  return '';
}

function labelsMatchAny(taskLabels: string[], labelsAny: string[]) {
  if (!labelsAny.length) return true;
  const set = new Set(taskLabels.map((l) => l.toLowerCase()));
  for (const l of labelsAny) {
    if (set.has(String(l).toLowerCase())) return true;
  }
  return false;
}

const triggersByStatusTo = new Map<string, any[]>();
const triggersOnTaskCreate: any[] = [];
const triggersOnTaskDueSoon: any[] = [];
const recentTriggerFires = new Map<string, number>();
const dueSoonTriggerFires = new Map<string, number>();

function triggerMatchesTask(trigger: any, record: any) {
  const taskLabels = normalizeStringArray(record?.labels);
  const labelsAny = normalizeStringArray(trigger?.labelsAny);
  if (!labelsMatchAny(taskLabels, labelsAny)) return false;

  const projectId = String(trigger?.projectId || '').trim();
  if (projectId && String(record?.projectId || '').trim() !== projectId) return false;

  const priority = normalizePriority(trigger?.priority);
  if (priority && normalizePriority(record?.priority) !== priority) return false;

  const assigneeId = normalizeAgentId(String(trigger?.assigneeId || '').trim()) || String(trigger?.assigneeId || '').trim();
  if (assigneeId) {
    const assignees = normalizeAgentIds(record?.assigneeIds ?? []);
    if (!assignees.includes(assigneeId)) return false;
  }

  return true;
}

async function applyWorkflowTriggerActions(token: string, trigger: any, record: any) {
  const taskId = String(record?.id || '').trim();
  if (!taskId) return;
  const actions = trigger?.actions && typeof trigger.actions === 'object' ? (trigger.actions as Record<string, unknown>) : null;
  if (!actions) return;

  const patch: Record<string, unknown> = {};
  const setStatus = String(actions.setStatus || '').trim();
  if (['inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'].includes(setStatus) && setStatus !== String(record?.status || '').trim()) {
    patch.status = setStatus;
  }

  const assignAgentId = normalizeAgentId(String(actions.assignAgentId || '').trim()) || String(actions.assignAgentId || '').trim();
  if (assignAgentId) {
    patch.assigneeIds = [assignAgentId];
    if (!patch.status && String(record?.status || '').trim() === 'inbox') patch.status = 'assigned';
  }

  const labelsAdd = normalizeStringArray(actions.addLabelsAny || actions.addLabels || []);
  if (labelsAdd.length) {
    const set = new Set<string>(normalizeStringArray(record?.labels));
    for (const label of labelsAdd) set.add(label);
    patch.labels = Array.from(set);
  }

  if (actions.requestReview === true) {
    patch.requiresReview = true;
    if (!patch.status && String(record?.status || '').trim() !== 'review') patch.status = 'review';
  }

  if (Object.keys(patch).length) {
    patch.updatedAt = nowIso();
    await pbFetch(`/api/collections/tasks/records/${taskId}`, {
      method: 'PATCH',
      token,
      body: patch,
    }).catch(() => {});
  }

  const postMessage = String(actions.postMessage || '').trim();
  if (postMessage) {
    await pbFetch('/api/collections/messages/records', {
      method: 'POST',
      token,
      body: {
        taskId,
        fromAgentId: '',
        content: postMessage,
        mentions: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    }).catch(() => {});
  }

  const createSubtasks = normalizeStringArray(actions.createSubtasks || []);
  for (const title of createSubtasks.slice(0, 10)) {
    await pbFetch('/api/collections/subtasks/records', {
      method: 'POST',
      token,
      body: {
        taskId,
        title,
        done: false,
        order: Date.now(),
        assigneeIds: [],
        dueAt: '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    }).catch(() => {});
  }

  if (actions.notifyLead === true) {
    const msg = String(actions.notifyLeadMessage || '').trim() || `Rule action executed for "${String(record?.title || taskId)}".`;
    await createNotification(token, leadAgentId, msg, taskId, 'generic', {
      title: 'Rule action',
      url: `/tasks/${taskId}`,
    });
  }
}

async function refreshWorkflowTriggers(token: string) {
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      filter: `enabled = true`,
    });
    const list = await pbFetch(`/api/collections/workflow_triggers/records?${q.toString()}`, { token });
    triggersByStatusTo.clear();
    triggersOnTaskCreate.length = 0;
    triggersOnTaskDueSoon.length = 0;
    for (const t of (list?.items ?? []) as any[]) {
      const event = String(t?.event || 'task_status_to').trim();
      if (event === 'task_created') {
        triggersOnTaskCreate.push(t);
        continue;
      }
      if (event === 'task_due_soon') {
        triggersOnTaskDueSoon.push(t);
        continue;
      }
      const statusTo = String(t?.statusTo || '').trim();
      if (!statusTo) continue;
      const arr = triggersByStatusTo.get(statusTo) || [];
      arr.push(t);
      triggersByStatusTo.set(statusTo, arr);
    }
  } catch (err: any) {
    console.error('[worker] refreshWorkflowTriggers failed', err?.message || err);
  }
}

let triggerRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let triggerRefreshRunning = false;
let triggerRefreshRequested = false;

function scheduleWorkflowTriggerRefresh(token: string) {
  triggerRefreshRequested = true;
  if (triggerRefreshTimer) return;
  triggerRefreshTimer = setTimeout(async () => {
    triggerRefreshTimer = null;
    if (triggerRefreshRunning) return;
    triggerRefreshRunning = true;
    try {
      // Coalesce bursts (create + patch + toggle) into a minimal set of refreshes.
      // Always run at least once per burst.
      while (triggerRefreshRequested) {
        triggerRefreshRequested = false;
        await refreshWorkflowTriggers(token);
      }
    } finally {
      triggerRefreshRunning = false;
    }
  }, 500);
}

async function executeWorkflowTrigger(
  token: string,
  trigger: any,
  record: any,
  opts?: { fireTag?: string; dedupeKey?: string }
) {
  const triggerId = String(trigger?.id || '').trim();
  const workflowId = String(trigger?.workflowId || '').trim();
  const taskId = String(record?.id || '').trim();
  const fireTag = String(opts?.fireTag || trigger?.event || trigger?.statusTo || '').trim() || 'task_event';
  if (!triggerId || !workflowId || !taskId) return;

  // Dedupe: avoid accidental double-firing if PB reconnects or events replay.
  const dedupeKey = String(opts?.dedupeKey || `${triggerId}|${taskId}|${fireTag}`);
  const now = Date.now();
  for (const [k, ts] of recentTriggerFires) {
    if (now - ts > 5 * 60_000) recentTriggerFires.delete(k);
  }
  if (recentTriggerFires.has(dedupeKey)) return;
  recentTriggerFires.set(dedupeKey, now);

  const taskProjectId =
    String(record?.projectId || '').trim() || String(taskCache.get(taskId)?.projectId || '').trim();
  const projectBlockReason = getProjectAutomationBlockReason(taskProjectId);
  if (projectBlockReason) {
    const workflowNameHint = String(trigger?.workflowId || '').trim() || workflowId;
    const summary = `Skipped trigger ${triggerId} (${workflowNameHint}) because ${projectBlockReason}.`;
    const noticeKey = `trigger:${triggerId}:${taskProjectId}:${projectBlockReason}`;
    if (shouldEmitAutomationPolicyNotice(noticeKey)) {
      await createActivity(token, 'workflow_trigger_skipped', summary, taskId, '');
      await createNotification(token, leadAgentId, summary, taskId, 'incident', {
        title: `Trigger skipped`,
        url: taskId ? `/tasks/${taskId}` : '/projects',
      });
    }
    return;
  }

  await applyWorkflowTriggerActions(token, trigger, record);

  let workflow: any;
  try {
    workflow = await pbFetch(`/api/collections/workflows/records/${workflowId}`, { token });
  } catch {
    await createActivity(token, 'workflow_trigger_failed', `Trigger ${triggerId} failed (missing workflow).`, taskId);
    return;
  }

  const kind = String(workflow?.kind || '').trim() || 'manual';
  const pipeline = String(workflow?.pipeline || '').trim();
  const sessionKey = String(trigger?.sessionKey || '').trim();
  const vars = trigger?.vars ?? null;

  const nowIsoStamp = nowIso();
  const runBase: any = {
    workflowId,
    taskId,
    sessionKey: sessionKey || '',
    vars,
    status: kind === 'lobster' ? 'running' : 'failed',
    startedAt: kind === 'lobster' ? nowIsoStamp : '',
    finishedAt: kind === 'lobster' ? '' : nowIsoStamp,
    createdAt: nowIsoStamp,
    updatedAt: nowIsoStamp,
    log: kind === 'lobster' ? '' : `Triggered execution not supported for workflow kind "${kind}".`,
  };

  const createdRun = await pbFetch('/api/collections/workflow_runs/records', { method: 'POST', token, body: runBase });
  const runId = String((createdRun as any)?.id || '').trim();
  const commandId = runId ? `mcwfr-${runId}` : '';
  if (commandId) {
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { commandId, updatedAt: nowIso() },
    }).catch(() => {});
  }

  await createActivity(
    token,
    'workflow_trigger_fired',
    `Workflow trigger fired (${String(workflow?.name || workflowId).trim() || workflowId}) on "${fireTag}".`,
    taskId
  );

  if (kind !== 'lobster') {
    const reason = `unsupported kind "${kind}"`;
    await createActivity(token, 'workflow_run_failed', `Workflow run failed (${reason}).`, taskId);
    await notifyWorkflowFailure(token, {
      workflowName: String(workflow?.name || workflowId).trim() || workflowId,
      reason,
      taskId,
      runId,
    });
    return;
  }
  if (!pipeline) {
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { status: 'failed', log: 'Missing pipeline on workflow.', finishedAt: nowIso(), updatedAt: nowIso() },
    }).catch(() => {});
    await createActivity(token, 'workflow_run_failed', `Workflow run failed (missing pipeline).`, taskId);
    await notifyWorkflowFailure(token, {
      workflowName: String(workflow?.name || workflowId).trim() || workflowId,
      reason: 'missing pipeline',
      taskId,
      runId,
    });
    return;
  }

  try {
    const timeoutMs = 10 * 60_000;
    const args: Record<string, unknown> = { pipeline };
    if (vars) args.vars = vars;
    args.taskId = taskId;
    if (runId) args.runId = runId;
    const out = await toolsInvokeWithOpts(
      'lobster',
      args,
      sessionKey ? { timeoutMs, sessionKey, commandId } : { timeoutMs, commandId }
    );
    const result = invokeParsedJson(out) ?? invokeText(out) ?? out;
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { status: 'succeeded', result, finishedAt: nowIso(), updatedAt: nowIso() },
    });
    await createActivity(token, 'workflow_run_succeeded', `Workflow run succeeded (${String(workflow?.name || workflowId).trim() || workflowId}).`, taskId);
  } catch (err: any) {
    const msg = err?.message || String(err);
    await pbFetch(`/api/collections/workflow_runs/records/${runId}`, {
      method: 'PATCH',
      token,
      body: { status: 'failed', log: msg, finishedAt: nowIso(), updatedAt: nowIso() },
    }).catch(() => {});
    await createActivity(token, 'workflow_run_failed', `Workflow run failed (${String(workflow?.name || workflowId).trim() || workflowId}): ${msg}`, taskId);
    await notifyWorkflowFailure(token, {
      workflowName: String(workflow?.name || workflowId).trim() || workflowId,
      reason: msg,
      taskId,
      runId,
    });
  }
}

let usageTicking = false;
async function runUsageCollectionTick(token: string) {
  if (usageTicking) return;
  usageTicking = true;
  try {
    await refreshTasks(token);
    await collectUsageSnapshot(token);
  } catch (err: any) {
    console.error('[worker] usage collection tick failed', err?.message || err);
  } finally {
    usageTicking = false;
  }
}

let budgetTicking = false;
async function runProjectBudgetCheckTick(token: string) {
  if (budgetTicking) return;
  budgetTicking = true;
  try {
    await refreshTasks(token);
    await checkProjectBudgets(token);
  } catch (err: any) {
    console.error('[worker] budget check tick failed', err?.message || err);
  } finally {
    budgetTicking = false;
  }
}

async function maybeFireWorkflowTriggers(token: string, prev: any, record: any) {
  if (!prev || prev.status === record.status) return;
  const statusTo = String(record.status || '').trim();
  if (!statusTo) return;
  if (record.archived) return;

  const triggers = triggersByStatusTo.get(statusTo) || [];
  if (!triggers.length) return;

  for (const t of triggers) {
    if (!triggerMatchesTask(t, record)) continue;
    await executeWorkflowTrigger(token, t, record, { fireTag: `task_status_to:${statusTo}` });
  }
}

async function maybeFireWorkflowCreateTriggers(token: string, record: any) {
  if (record?.archived) return;
  if (!triggersOnTaskCreate.length) return;
  for (const t of triggersOnTaskCreate) {
    if (!triggerMatchesTask(t, record)) continue;
    await executeWorkflowTrigger(token, t, record, { fireTag: 'task_created' });
  }
}

async function maybeFireWorkflowDueSoonTriggers(token: string) {
  if (!triggersOnTaskDueSoon.length) return;
  const now = Date.now();

  for (const [k, at] of dueSoonTriggerFires) {
    if (now - at > 24 * 60 * 60_000) dueSoonTriggerFires.delete(k);
  }

  const tasks = Array.from(taskCache.values());
  for (const record of tasks) {
    const taskId = String(record?.id || '').trim();
    if (!taskId) continue;
    if (record?.archived) continue;
    const status = String(record?.status || '').trim();
    if (status === 'done' || status === 'blocked') continue;
    const dueAt = String(record?.dueAt || '').trim();
    if (!dueAt) continue;
    const dueMs = Date.parse(dueAt);
    if (!Number.isFinite(dueMs)) continue;

    for (const t of triggersOnTaskDueSoon) {
      if (!triggerMatchesTask(t, record)) continue;
      const withinMinutes = toPositiveNumber(t?.dueWithinMinutes) || 60;
      const withinMs = withinMinutes * 60_000;
      const diffMs = dueMs - now;
      if (diffMs < 0 || diffMs > withinMs) continue;
      const triggerId = String(t?.id || '').trim();
      if (!triggerId) continue;
      const dedupeKey = `${triggerId}|${taskId}|${dueAt}`;
      if (dueSoonTriggerFires.has(dedupeKey)) continue;
      dueSoonTriggerFires.set(dedupeKey, now);
      await executeWorkflowTrigger(token, t, record, { fireTag: 'task_due_soon', dedupeKey });
    }
  }
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
    await pb.collection('tasks').subscribe('*', async (e) => {
      try {
        await handleTaskEvent(token, e.record, e.action);
      } catch (err: any) {
        console.error('[worker] tasks handler failed', err?.message || err);
      }
    });
    await pb.collection('messages').subscribe('*', async (e) => {
      if (e.action !== 'create') return;
      try {
        await handleMessageEvent(token, e.record);
      } catch (err: any) {
        console.error('[worker] messages handler failed', err?.message || err);
      }
    });
    await pb.collection('documents').subscribe('*', async (e) => {
      if (e.action === 'create' || e.action === 'update') {
        try {
          await handleDocumentEvent(token, e.record, e.action);
        } catch (err: any) {
          console.error('[worker] documents handler failed', err?.message || err);
        }
      }
    });
    try {
      await pb.collection('task_files').subscribe('*', async (e) => {
        try {
          await handleTaskFileEvent(token, e.record, e.action);
        } catch (err: any) {
          console.error('[worker] task_files handler failed', err?.message || err);
        }
      });
    } catch {
      // Optional collection (may not exist on older schemas).
    }
    await pb.collection('subtasks').subscribe('*', async (e) => {
      try {
        await handleSubtaskEvent(token, e.record, e.action);
      } catch (err: any) {
        console.error('[worker] subtasks handler failed', err?.message || err);
      }
    });
    await pb.collection('notifications').subscribe('*', async () => scheduleDeliver(token));
    try {
      await pb.collection('workflow_triggers').subscribe('*', async () => scheduleWorkflowTriggerRefresh(token));
    } catch {
      // Optional collection (may not exist on older schemas).
    }
    try {
      await pb.collection('projects').subscribe('*', async () => {
        try {
          await refreshProjects(token);
        } catch (err: any) {
          console.error('[worker] projects refresh failed', err?.message || err);
        }
      });
    } catch {
      // Optional collection (may not exist on older schemas).
    }
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
  await refreshProjects(pbToken);
  await refreshWorkflowTriggers(pbToken);
  await subscribeWithRetry(pbToken);

  // Recover assignments that happened while the worker was down.
  await backfillAssignedTaskNotifications(pbToken);
  await runUsageCollectionTick(pbToken);
  await runProjectBudgetCheckTick(pbToken);
  await maybeFireWorkflowDueSoonTriggers(pbToken);

  // Deliver notifications with a debounce to avoid event storms / overlapping runs.
  // A slow interval acts as a safety net in case realtime misses an event.
  setInterval(() => scheduleDeliver(pbToken), env.MC_DELIVER_INTERVAL_MS);
  setInterval(() => void enforceLeases(pbToken), 10_000);
  setInterval(() => void refreshAgents(pbToken), 60_000 * 5);
  setInterval(() => void refreshProjects(pbToken), 60_000 * 5);
  setInterval(() => void backfillAssignedTaskNotifications(pbToken), 60_000 * 5);
  setInterval(() => void maybeStandup(pbToken), 60_000);
  setInterval(() => void snapshotNodes(pbToken), 60_000 * env.MC_NODE_SNAPSHOT_MINUTES);
  setInterval(() => void runWorkflowSchedules(pbToken), 30_000);
  setInterval(() => void refreshWorkflowTriggers(pbToken), 60_000);
  setInterval(() => void maybeFireWorkflowDueSoonTriggers(pbToken), 60_000);
  setInterval(() => void runUsageCollectionTick(pbToken), 60_000 * env.MC_USAGE_COLLECT_MINUTES);
  setInterval(() => void runProjectBudgetCheckTick(pbToken), 60_000 * env.MC_PROJECT_BUDGET_CHECK_MINUTES);

  // keep alive
  // eslint-disable-next-line no-constant-condition
  while (true) await new Promise((r) => setTimeout(r, 60_000));
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
