import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function isTruthy(value: string | undefined) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

function requestId(prefix = 'mc-openclaw-status') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

async function fetchWithTimeout(url: URL, opts: { method?: string; headers?: Record<string, string>; body?: any; timeoutMs?: number }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 2_500);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const lines: string[] = [];
  let ok = false;

  const gatewayUrl = String(process.env.OPENCLAW_GATEWAY_URL || '').trim() || 'http://127.0.0.1:18789';
  const token = String(process.env.OPENCLAW_GATEWAY_TOKEN || '').trim();
  const disabled = isTruthy(process.env.OPENCLAW_GATEWAY_DISABLED);

  lines.push(`Gateway: ${gatewayUrl}`);
  lines.push(`Delivery: ${disabled ? 'disabled' : token ? 'enabled' : 'missing token'}`);

  // Prefer HTTP checks (no CLI required). These are deterministic and do not wake the model.
  try {
    const base = new URL(gatewayUrl);
    const health = await fetchWithTimeout(new URL('/api/health', base), { method: 'GET', timeoutMs: 2_500 });
    if (health.ok) {
      ok = true;
      lines.push('Health: ok');
    } else {
      lines.push(`Health: error (${health.status})`);
    }

    if (token) {
      const invokeReqId = requestId();
      const invoke = await fetchWithTimeout(new URL('/tools/invoke', base), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-mission-control': '1',
          'x-mission-control-source': 'status',
          'x-openclaw-request-id': invokeReqId,
        },
        body: { tool: 'sessions_list', args: {} },
        timeoutMs: 5_000,
      });
      const text = await invoke.text().catch(() => '');
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      if (invoke.ok) {
        ok = true;
        let count: number | null = null;
        try {
          const t = parsed?.result?.content?.find((c: any) => c?.type === 'text')?.text;
          if (typeof t === 'string') {
            const j = JSON.parse(t);
            if (typeof j?.count === 'number') count = j.count;
          }
        } catch {
          count = null;
        }
        lines.push(`Tools Invoke: ok${typeof count === 'number' ? ` (sessions: ${count})` : ''}`);
      } else {
        const msg =
          typeof parsed === 'object' && parsed?.error?.message
            ? String(parsed.error.message)
            : typeof parsed === 'string'
              ? parsed
              : `tools/invoke failed (${invoke.status})`;
        lines.push(`Tools Invoke: error (${invoke.status}) ${msg}`.trim());
      }
    } else {
      lines.push('Tools Invoke: not configured (set OPENCLAW_GATEWAY_TOKEN)');
    }
  } catch (err: any) {
    lines.push(`HTTP: error ${err?.message || String(err)}`);
  }

  // Also attempt CLI status if available. This is best-effort and helps debugging.
  const cliRes = await runOpenClaw(['gateway', 'status']);
  if (cliRes.ok) {
    ok = true;
    lines.push('');
    lines.push('CLI: openclaw gateway status');
    lines.push(String(cliRes.stdout || '').trimEnd());
  } else {
    const msg = (cliRes.stderr || cliRes.stdout || cliRes.message || '').trim();
    if (msg) lines.push(`CLI: error ${msg}`);
  }

  if (!ok) {
    return NextResponse.json({ ok: false, error: lines.join('\n') }, { status: 500 });
  }

  return NextResponse.json({ ok: true, output: lines.join('\n') });
}
