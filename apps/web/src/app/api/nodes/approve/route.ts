import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveOpenClawBin, extraPathEntries, runOpenClaw } from '@/app/api/openclaw/cli';

const execAsync = promisify(exec);

function actionsEnabled() {
  return String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  if (!actionsEnabled()) {
    return NextResponse.json({ error: 'Node actions disabled' }, { status: 403 });
  }

  const body = await req.json();
  const requestId = body.requestId;
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

  try {
    const cli = await resolveOpenClawBin();
    const env: NodeJS.ProcessEnv = { ...process.env };
    env.PATH = [env.PATH || '', ...extraPathEntries()].filter(Boolean).join(':');

    const template = process.env.MC_NODE_APPROVE_CMD_TEMPLATE;
    if (template) {
      const command = template
        .replace(/\{cli\}/g, cli)
        .replace(/\{request\}/g, String(requestId))
        .replace(/\{id\}/g, String(requestId));
      const { stdout } = await execAsync(command, { env });
      return NextResponse.json({ ok: true, output: stdout });
    }

    // Older/newer OpenClaw CLIs may accept either positional or --request.
    const primary = await runOpenClaw(['nodes', 'approve', String(requestId)], { timeoutMs: 15_000 });
    if (primary.ok) return NextResponse.json({ ok: true, output: primary.stdout });
    const fallback = await runOpenClaw(['nodes', 'approve', '--request', String(requestId)], { timeoutMs: 15_000 });
    if (fallback.ok) return NextResponse.json({ ok: true, output: fallback.stdout });
    throw new Error((fallback.stderr || fallback.stdout || primary.stderr || primary.stdout || fallback.message || primary.message || 'Failed to approve node').trim());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to approve node';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
