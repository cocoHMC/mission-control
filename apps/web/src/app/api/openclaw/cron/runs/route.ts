import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function normalizeId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return '';
  if (trimmed.length > 120) return '';
  return trimmed;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const id = normalizeId(String(req.nextUrl.searchParams.get('id') || ''));
  const limitRaw = String(req.nextUrl.searchParams.get('limit') || '50').trim();
  const limit = Math.max(1, Math.min(200, Number.parseInt(limitRaw, 10) || 50));

  const args = ['cron', 'runs', '--limit', String(limit)];
  if (id) args.push('--id', id);

  const res = await runOpenClaw(args, { timeoutMs: 25_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load run history.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, runs: parsed });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

