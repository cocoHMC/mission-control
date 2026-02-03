import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const cli = process.env.OPENCLAW_CLI || 'openclaw';
  try {
    const { stdout } = await execFileAsync(cli, ['gateway', 'status']);
    return NextResponse.json({ ok: true, output: stdout });
  } catch (err: unknown) {
    const anyErr = err as { stdout?: string; stderr?: string; message?: string };
    const message = anyErr?.stdout || anyErr?.stderr || anyErr?.message || 'Failed to run openclaw';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
