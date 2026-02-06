import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function redact(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  // Remove/redact anything that could resemble credentials. The CLI already redacts most keys,
  // but we strip remaining detail fields for safety.
  const clone = JSON.parse(JSON.stringify(obj));

  const providers = clone?.auth?.providers;
  if (Array.isArray(providers)) {
    for (const p of providers) {
      if (!p || typeof p !== 'object') continue;
      if (p?.effective && typeof p.effective === 'object') {
        if (typeof p.effective.detail === 'string') p.effective.detail = 'redacted';
      }
      if (p?.modelsJson && typeof p.modelsJson === 'object') {
        if (typeof p.modelsJson.value === 'string') p.modelsJson.value = 'redacted';
      }
    }
  }

  return clone;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const res = await runOpenClaw(['models', 'status', '--json'], { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load model status.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, status: redact(parsed) });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

