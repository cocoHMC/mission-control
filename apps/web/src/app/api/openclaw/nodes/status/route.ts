import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const res = await runOpenClaw(['nodes', 'status', '--json'], { timeoutMs: 12_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    // Return 200 so the UI can gracefully fall back without spamming the browser console
    // with "Failed to load resource" errors when OpenClaw isn't available.
    return NextResponse.json({ ok: false, error: detail || 'Failed to load nodes.' }, { status: 200 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, status: parsed });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 200 }
    );
  }
}
