import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactLines } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const limit = clampInt(searchParams.get('limit'), 10, 1000, 200);

  const args = ['logs', '--limit', String(limit), '--plain', '--no-color'];
  const res = await runOpenClaw(args, { timeoutMs: 12_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load OpenClaw logs.' }, { status: 502 });
  }

  const raw = String(res.stdout || '');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  return NextResponse.json({ ok: true, lines: redactLines(lines) });
}

