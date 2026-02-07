import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

function actionsEnabled() {
  return String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

function safeCommands() {
  const raw = String(process.env.MC_NODE_SAFE_INVOKE_COMMANDS || 'system.run');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  if (!actionsEnabled()) {
    return NextResponse.json({ ok: false, error: 'Node actions disabled (set MC_NODE_ACTIONS_ENABLED=true).' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const node = String(body?.node || '').trim();
  const command = String(body?.command || '').trim();
  const params = body?.params ?? {};

  if (!node || !command) return NextResponse.json({ ok: false, error: 'node and command required' }, { status: 400 });

  const allowed = safeCommands();
  if (!allowed.includes(command)) {
    return NextResponse.json({ ok: false, error: `Command not allowed. Allowed: ${allowed.join(', ')}` }, { status: 400 });
  }

  let paramsJson = '{}';
  try {
    paramsJson = JSON.stringify(params || {});
  } catch {
    return NextResponse.json({ ok: false, error: 'params must be JSON-serializable' }, { status: 400 });
  }

  if (paramsJson.length > 20_000) {
    return NextResponse.json({ ok: false, error: 'params too large' }, { status: 400 });
  }

  const res = await runOpenClaw(
    ['nodes', 'invoke', '--node', node, '--command', command, '--params', paramsJson, '--json'],
    { timeoutMs: 45_000 }
  );
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to invoke node command.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, result: parsed });
  } catch {
    return NextResponse.json({ ok: true, raw: redactText(stdout).slice(0, 4000) });
  }
}

