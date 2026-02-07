import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { requireAdminAuth } from '@/lib/adminAuth';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { findRepoRoot } from '@/app/api/setup/_shared';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  const name = String(body?.name || '').trim();
  const role = String(body?.role || '').trim() || 'Agent';
  const modelTier = String(body?.modelTier || 'mid').trim() || 'mid';
  const createWorkspace = Boolean(body?.createWorkspace ?? true);
  const workspace = String(body?.workspace || '').trim() || '';

  if (!id || !name) {
    return NextResponse.json({ ok: false, error: 'id and name are required' }, { status: 400 });
  }

  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `openclawAgentId = "${id}" || id = "${id}"`,
  });
  const existing = await pbFetch<{ items?: unknown[] }>(`/api/collections/agents/records?${q.toString()}`);
  if (existing?.items?.length) {
    return NextResponse.json({ ok: false, error: `Agent ${id} already exists` }, { status: 409 });
  }

  const agent = await pbFetch('/api/collections/agents/records', {
    method: 'POST',
    body: {
      openclawAgentId: id,
      displayName: name,
      role,
      status: 'idle',
      modelTier,
    },
  });

  let workspaceError = '';
  if (createWorkspace) {
    try {
      const appDir = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : await findRepoRoot();
      const script = path.join(appDir, 'scripts', 'agent_init.mjs');
      const args = [script, '--id', id, '--name', name, '--role', role];
      if (workspace) args.push('--workspace', workspace);
      await execFileAsync('node', args, { cwd: appDir, env: process.env });
    } catch (err: unknown) {
      workspaceError = err instanceof Error ? err.message : 'Failed to create workspace';
    }
  }

  return NextResponse.json({
    ok: true,
    agent,
    workspaceCreated: createWorkspace && !workspaceError,
    workspaceError: workspaceError || null,
  });
}
