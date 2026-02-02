import 'dotenv/config';
import { z } from 'zod';

/**
 * Worker v0:
 * - Deterministic (no LLM)
 * - Pushes messages to OpenClaw agents via /tools/invoke
 * - Uses PocketBase via REST (polling) to avoid JS SDK/server version mismatch
 */

const Env = z.object({
  PB_URL: z.string().url().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.string().email(),
  PB_SERVICE_PASSWORD: z.string().min(1),

  OPENCLAW_GATEWAY_URL: z.string().url().default('http://127.0.0.1:18789'),
  OPENCLAW_GATEWAY_TOKEN: z.string().min(1),

  LEASE_MINUTES: z.coerce.number().int().positive().default(45),
});

const env = Env.parse({
  PB_URL: process.env.PB_URL,
  PB_SERVICE_EMAIL: process.env.PB_SERVICE_EMAIL,
  PB_SERVICE_PASSWORD: process.env.PB_SERVICE_PASSWORD,
  OPENCLAW_GATEWAY_URL: process.env.OPENCLAW_GATEWAY_URL,
  OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN,
  LEASE_MINUTES: process.env.LEASE_MINUTES,
});

const PB_URL = env.PB_URL;

type Task = {
  id: string;
  title: string;
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';
  assigneeIds?: string[];
  leaseOwnerAgentId?: string;
  leaseExpiresAt?: string;
  attemptCount?: number;
  lastProgressAt?: string;
  maxAutoNudges?: number;
  escalationAgentId?: string;
};

async function pbFetch(path: string, opts: { method?: string; token?: string; body?: any } = {}) {
  const res = await fetch(new URL(path, PB_URL), {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
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

async function authServiceUser(): Promise<string> {
  const r = await pbFetch('/api/collections/service_users/auth-with-password', {
    method: 'POST',
    body: { identity: env.PB_SERVICE_EMAIL, password: env.PB_SERVICE_PASSWORD },
  });
  return r.token as string;
}

async function toolsInvoke(tool: string, args: unknown) {
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

async function sendToAgent(agentId: string, message: string) {
  const sessionKey = sessionKeyForAgent(agentId);
  await toolsInvoke('sessions_send', { sessionKey, message });
}

function nowIso() {
  return new Date().toISOString();
}

function minutesFromNow(mins: number) {
  return new Date(Date.now() + mins * 60_000).toISOString();
}

async function createActivity(token: string, type: string, summary: string, taskId?: string, actorAgentId?: string) {
  await pbFetch('/api/collections/activities/records', {
    method: 'POST',
    token,
    body: { type, summary, taskId: taskId ?? '', actorAgentId: actorAgentId ?? '' },
  });
}

async function createNotification(token: string, toAgentId: string, content: string, taskId?: string) {
  await pbFetch('/api/collections/notifications/records', {
    method: 'POST',
    token,
    body: { toAgentId, taskId: taskId ?? '', content, delivered: false },
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
    const agentId = n.toAgentId as string;
    const taskId = (n.taskId as string) || '';
    const content = n.content as string;

    try {
      await sendToAgent(agentId, `[Mission Control] ${content}${taskId ? ` (task ${taskId})` : ''}`);
      await pbFetch(`/api/collections/notifications/records/${n.id}`, {
        method: 'PATCH',
        token,
        body: { delivered: true, deliveredAt: nowIso() },
      });
    } catch (err: any) {
      console.error('[worker] deliver failed', n.id, err?.message || err);
    }
  }
}

async function enforceLeases(token: string) {
  const now = new Date();
  const q = new URLSearchParams({
    page: '1',
    perPage: '50',
    filter: `status = "in_progress" && leaseExpiresAt != "" && leaseExpiresAt < "${now.toISOString()}"`,
  });
  const due = await pbFetch(`/api/collections/tasks/records?${q.toString()}`, { token });

  for (const t of (due.items ?? []) as any as Task[]) {
    const owner = t.leaseOwnerAgentId || t.assigneeIds?.[0];
    if (!owner) continue;

    const attempt = (t.attemptCount ?? 0) + 1;
    const max = t.maxAutoNudges ?? 3;
    const escalation = t.escalationAgentId ?? 'jarvis';

    if (attempt <= max) {
      await createNotification(token, owner, `NUDGE: post progress or mark blocked for "${t.title}" (attempt ${attempt}/${max})`, t.id);
      await pbFetch(`/api/collections/tasks/records/${t.id}`, {
        method: 'PATCH',
        token,
        body: { attemptCount: attempt, leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES) },
      });
      await createActivity(token, 'lease_nudge', `Nudged ${owner} for "${t.title}"`, t.id, owner);
    } else {
      await createNotification(token, escalation, `ESCALATION: "${t.title}" stalled. Owner=${owner}.`, t.id);
      await createActivity(token, 'lease_escalated', `Escalated "${t.title}" to ${escalation}`, t.id, escalation);
      await pbFetch(`/api/collections/tasks/records/${t.id}`, {
        method: 'PATCH',
        token,
        body: { leaseExpiresAt: minutesFromNow(env.LEASE_MINUTES), attemptCount: attempt },
      });
    }
  }
}

async function main() {
  console.log('[worker] starting');
  console.log('[worker] PB_URL', env.PB_URL);
  console.log('[worker] OPENCLAW_GATEWAY_URL', env.OPENCLAW_GATEWAY_URL);

  const pbToken = await authServiceUser();
  console.log('[worker] pocketbase authed as service user');

  await toolsInvoke('sessions_list', { limit: 1 });
  console.log('[worker] tools/invoke ok');

  setInterval(() => void deliverPendingNotifications(pbToken), 1500);
  setInterval(() => void enforceLeases(pbToken), 10_000);

  // keep alive
  // eslint-disable-next-line no-constant-condition
  while (true) await new Promise((r) => setTimeout(r, 60_000));
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
