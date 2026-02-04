import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { requireAdminAuth } from '@/lib/adminAuth';
import { extraPathEntries, resolveOpenClawBin, runOpenClaw } from '@/app/api/openclaw/cli';

const execAsync = promisify(exec);

function actionsEnabled() {
  return String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

function allowedCommands() {
  const raw = process.env.MC_NODE_HEALTH_CMDS || 'uname,uptime,df -h';
  return raw
    .split(',')
    .map((cmd) => cmd.trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  if (!actionsEnabled()) {
    return NextResponse.json({ error: 'Node actions disabled' }, { status: 403 });
  }

  const body = await req.json();
  const nodeId = body.nodeId;
  const cmd = body.cmd;
  if (!nodeId || !cmd) return NextResponse.json({ error: 'nodeId and cmd required' }, { status: 400 });

  const allowed = allowedCommands();
  if (!allowed.includes(cmd)) {
    return NextResponse.json({ error: `Command not allowed. Allowed: ${allowed.join(', ')}` }, { status: 400 });
  }

  try {
    const cli = await resolveOpenClawBin();
    const env: NodeJS.ProcessEnv = { ...process.env };
    env.PATH = [env.PATH || '', ...extraPathEntries()].filter(Boolean).join(':');

    const template = process.env.MC_NODE_HEALTH_CMD_TEMPLATE;
    if (template) {
      const command = template
        .replace(/\{cli\}/g, cli)
        .replace(/\{node\}/g, String(nodeId))
        .replace(/\{cmd\}/g, cmd);
      const { stdout } = await execAsync(command, { env });
      return NextResponse.json({ ok: true, output: stdout });
    }

    const primary = await runOpenClaw(['nodes', 'exec', '--node', String(nodeId), '--cmd', cmd, '--json'], { timeoutMs: 20_000 });
    if (primary.ok) return NextResponse.json({ ok: true, output: primary.stdout });
    const fallback = await runOpenClaw(['nodes', 'exec', '--id', String(nodeId), '--cmd', cmd, '--json'], { timeoutMs: 20_000 });
    if (fallback.ok) return NextResponse.json({ ok: true, output: fallback.stdout });
    throw new Error((fallback.stderr || fallback.stdout || primary.stderr || primary.stdout || fallback.message || primary.message || 'Failed to run health command').trim());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run health command';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
