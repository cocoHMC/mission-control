import { NextRequest, NextResponse } from 'next/server';
import { exec, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
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

  const cli = process.env.OPENCLAW_CLI || 'openclaw';
  if (cli.includes('/') && !existsSync(cli)) {
    return NextResponse.json({ error: `OPENCLAW_CLI not found at ${cli}` }, { status: 500 });
  }
  try {
    const template = process.env.MC_NODE_HEALTH_CMD_TEMPLATE;
    if (template) {
      const command = template
        .replace(/\{cli\}/g, cli)
        .replace(/\{node\}/g, String(nodeId))
        .replace(/\{cmd\}/g, cmd);
      const { stdout } = await execAsync(command);
      return NextResponse.json({ ok: true, output: stdout });
    }

    try {
      const { stdout } = await execFileAsync(cli, ['nodes', 'exec', '--node', String(nodeId), '--cmd', cmd, '--json']);
      return NextResponse.json({ ok: true, output: stdout });
    } catch {
      const { stdout } = await execFileAsync(cli, ['nodes', 'exec', '--id', String(nodeId), '--cmd', cmd, '--json']);
      return NextResponse.json({ ok: true, output: stdout });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run health command';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
