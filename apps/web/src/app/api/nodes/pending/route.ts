import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function actionsEnabled() {
  return String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

export async function GET() {
  if (!actionsEnabled()) {
    return NextResponse.json({ error: 'Node actions disabled' }, { status: 403 });
  }

  const cli = process.env.OPENCLAW_CLI || 'openclaw';
  if (cli.includes('/') && !existsSync(cli)) {
    return NextResponse.json({ error: `OPENCLAW_CLI not found at ${cli}` }, { status: 500 });
  }
  try {
    const { stdout } = await execFileAsync(cli, ['nodes', 'pending', '--json']);
    const parsed = stdout ? JSON.parse(stdout) : [];
    return NextResponse.json({ items: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch pending nodes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
