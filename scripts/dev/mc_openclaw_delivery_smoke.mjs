#!/usr/bin/env node
import 'dotenv/config';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function bad(v) {
  return !v || !String(v).trim();
}

function basicAuth(user, pass) {
  const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json };
}

async function waitForOk(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function extractMessages(payload) {
  // OpenClaw tools/invoke formats can vary by gateway version:
  // - payload.parsedText.messages
  // - JSON in payload.result.content[].text
  // - payload.messages (already flattened)
  const direct = payload?.parsedText ?? payload;
  if (Array.isArray(direct?.messages)) return direct.messages;
  const text = (() => {
    const content = payload?.result?.content;
    if (!Array.isArray(content)) return '';
    const t = content.find((c) => c?.type === 'text')?.text;
    return typeof t === 'string' ? t : '';
  })();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function messageText(m) {
  if (!m || typeof m !== 'object') return '';
  if (typeof m.content === 'string') return m.content;
  if (typeof m.text === 'string') return m.text;
  if (typeof m.message === 'string') return m.message;
  const content = m.content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p) => (p?.type === 'text' && typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function localDeliveryState(taskId, agentId) {
  // Local dev fallback: query PocketBase SQLite directly for deterministic delivery state.
  // This avoids false negatives when sessions_history lags or omits pending user messages.
  const safeTask = String(taskId || '').replace(/'/g, "''");
  const safeAgent = String(agentId || '').replace(/'/g, "''");
  const sql = [
    'select delivered, deliveredAt',
    'from notifications',
    `where taskId='${safeTask}' and toAgentId='${safeAgent}'`,
    'limit 1;',
  ].join(' ');

  try {
    const { stdout } = await execFileAsync('sqlite3', ['pb/pb_data/data.db', sql], { cwd: process.cwd() });
    const line = String(stdout || '').trim();
    if (!line) return { found: false, delivered: false, deliveredAt: '' };
    const [deliveredRaw, deliveredAtRaw] = line.split('|');
    return {
      found: true,
      delivered: String(deliveredRaw || '').trim() === '1',
      deliveredAt: String(deliveredAtRaw || '').trim(),
    };
  } catch {
    return { found: false, delivered: false, deliveredAt: '' };
  }
}

async function main() {
  const base =
    String(process.env.MC_TEST_BASE_URL || process.env.MC_BASE_URL || '').replace(/\/$/, '') ||
    `http://127.0.0.1:${process.env.MC_WEB_PORT || '4010'}`;

  const adminUser = process.env.MC_ADMIN_USER || process.env.MC_BASIC_USER;
  const adminPass = process.env.MC_ADMIN_PASSWORD || process.env.MC_BASIC_PASS;
  if (bad(adminUser) || bad(adminPass)) throw new Error('Missing MC_ADMIN_USER/MC_ADMIN_PASSWORD (or MC_BASIC_USER/MC_BASIC_PASS)');

  const ocUrl = process.env.OPENCLAW_GATEWAY_URL;
  const ocToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (bad(ocUrl) || bad(ocToken)) throw new Error('Missing OPENCLAW_GATEWAY_URL/OPENCLAW_GATEWAY_TOKEN');

  const agentId = String(process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'main').trim();

  await waitForOk(`${base}/api/health`, 60_000);

  const title = `OC delivery smoke ${new Date().toISOString()} ${crypto.randomBytes(3).toString('hex')}`;
  const auth = basicAuth(adminUser, adminPass);

  // 1) Create a task assigned to the lead agent.
  const { res: createRes, json: created } = await fetchJson(`${base}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({
      title,
      description: 'Created by mc_openclaw_delivery_smoke.mjs',
      context: '',
      assigneeIds: [agentId],
      status: 'assigned',
      labels: ['smoke', 'openclaw'],
      requiresReview: false,
    }),
  });
  if (!createRes.ok) throw new Error(`Create task failed: ${createRes.status} ${JSON.stringify(created)}`);
  const taskId = String(created?.id || '').trim();
  if (bad(taskId)) throw new Error('Create task did not return an id');

  // 2) Poll the OpenClaw session history for the corresponding MC session key.
  const sessionKey = `agent:${agentId}:mc:${taskId}`;
  const start = Date.now();
  const timeoutMs = Number(process.env.MC_OPENCLAW_DELIVERY_TIMEOUT_MS || 90_000);
  const needle = `Assigned: ${title}`;

  while (Date.now() - start < timeoutMs) {
    const local = await localDeliveryState(taskId, agentId);
    if (local.found && local.delivered) {
      console.log('[openclaw-delivery] ok', JSON.stringify({ taskId, sessionKey, deliveredAt: local.deliveredAt || null, ms: Date.now() - start }));
      return;
    }

    const reqId = `mc-delivery-smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const { res, json } = await fetchJson(new URL('/tools/invoke', ocUrl).toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ocToken}`,
        'x-mission-control': '1',
        'x-mission-control-source': 'delivery-smoke',
        'x-openclaw-request-id': reqId,
      },
      body: JSON.stringify({ tool: 'sessions_history', args: { sessionKey, limit: 80, includeTools: false } }),
    });
    if (res.ok) {
      const messages = extractMessages(json);
      const found = messages.some((m) => messageText(m).includes(needle));
      if (found) {
        console.log('[openclaw-delivery] ok', JSON.stringify({ taskId, sessionKey, ms: Date.now() - start }));
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  throw new Error(`[openclaw-delivery] timeout: did not find "${needle}" in ${sessionKey} within ${timeoutMs}ms`);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
