import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { ensureVaultwardenStack, normalizeDomain } from '@/app/api/security/vaultwarden/_shared';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const domainInput = String(body?.domain || '').trim();
  const bindIp = String(body?.bindIp || '').trim();
  const cloudflareToken = String(body?.cloudflareToken || '').trim();
  const adminToken = String(body?.adminToken || '').trim();
  const signupsAllowed = Boolean(body?.signupsAllowed);
  const orgName = String(body?.orgName || 'OpenClaw').trim() || 'OpenClaw';

  const { host } = normalizeDomain(domainInput);
  if (!host) {
    return NextResponse.json({ ok: false, error: 'domain is required' }, { status: 400 });
  }

  const applied = await ensureVaultwardenStack({
    domainHost: host,
    bindIp,
    cloudflareToken,
    adminToken,
    signupsAllowed,
    orgName,
  });

  return NextResponse.json({
    ok: true,
    ...applied,
  });
}
