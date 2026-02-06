import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { findRepoRoot } from '@/app/api/setup/_shared';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

function expandHome(p: string) {
  const trimmed = p.trim();
  if (!trimmed) return trimmed;
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

function normalizeAgentId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return '';
  // OpenClaw agent ids are commonly short slugs (used in session keys like agent:<id>:main).
  // Keep this strict to avoid surprising shell/glob behaviors.
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmed)) return '';
  return trimmed;
}

async function resolveWorkspace(input: string, agentId: string) {
  const base = process.env.MC_DATA_DIR ? path.resolve(process.env.MC_DATA_DIR) : await findRepoRoot();
  const raw = expandHome(input || '').trim();
  const fallback = path.join(base, 'agents', agentId);
  if (!raw) return { base, workspace: fallback, isFallback: true };
  const workspace = path.isAbsolute(raw) ? raw : path.resolve(base, raw);
  return { base, workspace, isFallback: false };
}

async function scaffoldWorkspace(opts: { agentId: string; name: string; role: string; workspace: string }) {
  const appDir = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : await findRepoRoot();
  const script = path.join(appDir, 'scripts', 'agent_init.mjs');
  const args = [
    script,
    '--id',
    opts.agentId,
    '--name',
    opts.name,
    '--role',
    opts.role,
    '--workspace',
    opts.workspace,
  ];
  await execFileAsync('node', args, { cwd: appDir, env: process.env });
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const agentId = normalizeAgentId(String(body?.agentId || body?.id || ''));
  const name = String(body?.name || body?.displayName || agentId || '').trim() || agentId;
  const emoji = String(body?.emoji || '').trim();
  const role = String(body?.role || 'Agent').trim() || 'Agent';
  const workspaceInput = String(body?.workspace || '').trim();
  const model = String(body?.model || '').trim();
  const scaffold = Boolean(body?.scaffoldWorkspace ?? true);

  if (!agentId) {
    return NextResponse.json({ ok: false, error: 'Invalid agentId. Use letters/numbers/underscore/dash.' }, { status: 400 });
  }

  const { workspace, isFallback } = await resolveWorkspace(workspaceInput, agentId);
  try {
    await fs.mkdir(workspace, { recursive: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: `Failed to create workspace dir: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }

  if (scaffold) {
    try {
      await scaffoldWorkspace({ agentId, name, role, workspace });
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: `Workspace scaffold failed: ${err?.message || String(err)}` },
        { status: 500 }
      );
    }
  }

  const args = ['agents', 'add', agentId, '--workspace', workspace, '--non-interactive', '--json'];
  if (model) args.push('--model', model);

  const res = await runOpenClaw(args, { timeoutMs: 20_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to create OpenClaw agent.' }, { status: 502 });
  }

  let created: any = null;
  const stdout = String(res.stdout || '').trim();
  try {
    created = stdout ? JSON.parse(stdout) : null;
  } catch {
    created = { raw: stdout };
  }

  if (name || emoji) {
    const identityArgs = ['agents', 'set-identity', '--agent', agentId];
    if (name) identityArgs.push('--name', name);
    if (emoji) identityArgs.push('--emoji', emoji);
    identityArgs.push('--json');
    await runOpenClaw(identityArgs, { timeoutMs: 10_000 }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    agentId,
    workspace,
    workspaceWasDefault: isFallback,
    created,
  });
}

