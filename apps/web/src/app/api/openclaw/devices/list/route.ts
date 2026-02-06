import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function maskKey(value: string) {
  const s = String(value || '').trim();
  if (!s) return s;
  if (s.length <= 8) return '…';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function redact(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  const lists = ['pending', 'paired'];
  for (const k of lists) {
    const arr = clone?.[k];
    if (!Array.isArray(arr)) continue;
    for (const d of arr) {
      if (typeof d?.publicKey === 'string') d.publicKeyMasked = maskKey(d.publicKey);
      delete d.publicKey;
    }
  }
  return clone;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const res = await runOpenClaw(['devices', 'list', '--json'], { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to list devices.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, ...redact(parsed) });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

