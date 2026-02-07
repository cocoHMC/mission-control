import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function maskDest(dest: string) {
  const s = String(dest || '').trim();
  if (!s) return s;
  // Phone numbers / chat ids: keep first 3 chars and last 2.
  if (/^[+0-9][0-9+ -]{5,}$/.test(s)) {
    const compact = s.replace(/[^0-9+]/g, '');
    if (compact.length <= 6) return compact;
    return `${compact.slice(0, 3)}…${compact.slice(-2)}`;
  }
  // Emails: show domain, mask local part.
  const at = s.indexOf('@');
  if (at > 1) {
    const domain = s.slice(at + 1);
    return `…@${domain}`;
  }
  return s.length > 18 ? `${s.slice(0, 10)}…` : s;
}

function redactJobs(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  const jobs = clone?.jobs;
  if (Array.isArray(jobs)) {
    for (const j of jobs) {
      const to = j?.payload?.to;
      if (typeof to === 'string') j.payload.toMasked = maskDest(to);
      if (j?.payload && typeof j.payload === 'object') delete j.payload.to;
    }
  }
  return clone;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const all = req.nextUrl.searchParams.get('all') === '1';
  const args = ['cron', 'list', '--json', ...(all ? ['--all'] : [])];
  const res = await runOpenClaw(args, { timeoutMs: 25_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to list cron jobs.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, ...redactJobs(parsed) });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

