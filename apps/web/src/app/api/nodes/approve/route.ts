import { NextRequest, NextResponse } from 'next/server';
import { exec, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

function actionsEnabled() {
  return String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

export async function POST(req: NextRequest) {
  if (!actionsEnabled()) {
    return NextResponse.json({ error: 'Node actions disabled' }, { status: 403 });
  }

  const body = await req.json();
  const requestId = body.requestId;
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

  const cli = process.env.OPENCLAW_CLI || 'openclaw';
  if (cli.includes('/') && !existsSync(cli)) {
    return NextResponse.json({ error: `OPENCLAW_CLI not found at ${cli}` }, { status: 500 });
  }
  try {
    const template = process.env.MC_NODE_APPROVE_CMD_TEMPLATE;
    if (template) {
      const command = template
        .replace(/\{cli\}/g, cli)
        .replace(/\{request\}/g, String(requestId))
        .replace(/\{id\}/g, String(requestId));
      const { stdout } = await execAsync(command);
      return NextResponse.json({ ok: true, output: stdout });
    }

    try {
      const { stdout } = await execFileAsync(cli, ['nodes', 'approve', String(requestId)]);
      return NextResponse.json({ ok: true, output: stdout });
    } catch {
      const { stdout } = await execFileAsync(cli, ['nodes', 'approve', '--request', String(requestId)]);
      return NextResponse.json({ ok: true, output: stdout });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to approve node';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
