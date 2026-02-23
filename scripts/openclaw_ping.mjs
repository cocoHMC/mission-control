#!/usr/bin/env node
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const preferredUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const token = process.env.OPENCLAW_GATEWAY_TOKEN;
const timeoutMs = Number(process.env.OPENCLAW_TOOLS_TIMEOUT_MS || 10_000);

function normalizeUrl(value) {
  try {
    return new URL(String(value || '').trim()).toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
}

function pushUniqueUrl(target, value) {
  const normalized = normalizeUrl(value);
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

async function gatewayCandidates() {
  const out = [];
  pushUniqueUrl(out, preferredUrl);

  try {
    const preferred = new URL(preferredUrl);
    if (preferred.port) {
      pushUniqueUrl(out, `http://127.0.0.1:${preferred.port}`);
      pushUniqueUrl(out, `http://localhost:${preferred.port}`);
    }
  } catch {
    // ignore
  }

  try {
    const { stdout } = await execFileAsync('openclaw', ['gateway', 'status', '--json', '--no-probe', '--timeout', '3000'], {
      timeout: 6_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const parsed = JSON.parse(String(stdout || '{}'));
    const host = String(parsed?.gateway?.bindHost || '').trim();
    const port = Number(parsed?.gateway?.port || 0);
    if (host && Number.isFinite(port) && port > 0) {
      pushUniqueUrl(out, `http://${host}:${port}`);
      pushUniqueUrl(out, `http://127.0.0.1:${port}`);
      pushUniqueUrl(out, `http://localhost:${port}`);
    }
  } catch {
    // ignore
  }

  if (!out.length) pushUniqueUrl(out, 'http://127.0.0.1:18789');
  return out;
}

async function invokeOnce(url) {
  const reqId = `mc-ping-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(new URL('/tools/invoke', url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-mission-control': '1',
        'x-mission-control-source': 'healthcheck',
        'x-openclaw-request-id': reqId,
      },
      body: JSON.stringify({
        tool: 'sessions_list',
        args: { limit: 1, messageLimit: 0 },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

if (!token) {
  console.error('Missing OPENCLAW_GATEWAY_TOKEN');
  process.exit(1);
}

const candidates = await gatewayCandidates();
let lastError = '';

for (const url of candidates) {
  try {
    const res = await invokeOnce(url);
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      lastError = `tools/invoke failed @ ${url}: ${res.status} ${text}`;
      if (res.status === 401) {
        console.error(lastError);
        process.exit(1);
      }
      continue;
    }
    console.log(`tools/invoke sessions_list ok via ${url}`);
    process.exit(0);
  } catch (err) {
    if (err?.name === 'AbortError') {
      lastError = `tools/invoke timed out after ${timeoutMs}ms @ ${url}`;
      continue;
    }
    lastError = String(err?.message || err);
  }
}

console.error(lastError || `tools/invoke failed; no reachable gateway candidate (tried ${candidates.length})`);
process.exit(1);
