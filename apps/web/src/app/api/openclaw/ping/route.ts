import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  try {
    // Deterministic and cheap: does not wake any agents.
    await openclawToolsInvoke<any>('sessions_list', { limit: 1, messageLimit: 0 }, { timeoutMs: 6_000 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'OpenClaw ping failed.' }, { status: 502 });
  }
}

