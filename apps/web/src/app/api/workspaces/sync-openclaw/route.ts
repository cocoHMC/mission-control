import { NextRequest, NextResponse } from 'next/server';
import { probeOpenClawWorkspaces, syncMissionControlWorkspacesFromOpenClaw } from '@/lib/openclawWorkspaceSync';
import { requireAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';

function parseSeedWhenEmptyOnly(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'seed-only'].includes(raw);
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const seedWhenEmptyOnly = parseSeedWhenEmptyOnly(new URL(req.url).searchParams.get('seedWhenEmptyOnly'));
  const probe = await probeOpenClawWorkspaces();
  return NextResponse.json({
    ok: true,
    seedWhenEmptyOnly,
    connected: probe.connected,
    defaultPath: probe.defaultPath,
    candidatePaths: probe.candidatePaths,
    createdWorkspaceIds: [],
    linkedWorkspaceId: '',
    errors: probe.errors || [],
  });
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const seedWhenEmptyOnly = parseSeedWhenEmptyOnly(body?.seedWhenEmptyOnly);
  const sync = await syncMissionControlWorkspacesFromOpenClaw({ seedWhenEmptyOnly });
  return NextResponse.json({
    ok: true,
    connected: sync.connected,
    defaultPath: sync.defaultPath,
    candidatePaths: sync.candidatePaths,
    createdWorkspaceIds: sync.createdWorkspaceIds,
    linkedWorkspaceId: sync.linkedWorkspaceId,
    errors: sync.errors,
  });
}
