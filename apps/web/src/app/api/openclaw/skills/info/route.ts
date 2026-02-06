import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function normalizeName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(trimmed)) return '';
  return trimmed;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const name = normalizeName(String(req.nextUrl.searchParams.get('name') || ''));
  if (!name) return NextResponse.json({ ok: false, error: 'Missing skill name' }, { status: 400 });

  const res = await runOpenClaw(['skills', 'info', name, '--json'], { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load skill info.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, skill: parsed });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

