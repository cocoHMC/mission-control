#!/usr/bin/env node
import 'dotenv/config';

const url = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const token = process.env.OPENCLAW_GATEWAY_TOKEN;
const agentId = process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco';
const message = process.env.MC_PING_MESSAGE || '[Mission Control] tools/invoke healthcheck ping';

if (!token) {
  console.error('Missing OPENCLAW_GATEWAY_TOKEN');
  process.exit(1);
}

const res = await fetch(new URL('/tools/invoke', url), {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    tool: 'sessions_send',
    args: { sessionKey: `agent:${agentId}:main`, message },
  }),
});

const text = await res.text().catch(() => '');
if (!res.ok) {
  console.error(`tools/invoke failed: ${res.status} ${text}`);
  process.exit(1);
}

console.log('tools/invoke ok');
