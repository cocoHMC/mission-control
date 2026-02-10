import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { findRepoRoot, isLoopbackHost, writeEnvFromTemplate } from '@/app/api/setup/_shared';
import { requireAdminAuth } from '@/lib/adminAuth';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

type ReconfigureBody = {
  mcAdminUser: string;
  mcAdminPassword?: string;
  leadAgentId: string;
  leadAgentName: string;
  pbUrl?: string;
  pbAdminEmail?: string;
  pbAdminPassword?: string;
  pbServiceEmail?: string;
  pbServicePassword?: string;
  connectOpenClaw: boolean;
  openclawGatewayUrl?: string;
  openclawGatewayToken?: string;
  gatewayHostHint?: string;
  gatewayPortHint?: string;
};

function bad(value: unknown) {
  return typeof value !== 'string' || !value.trim();
}

function normalizeUrl(value: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

function vaultMasterKeyFromEnv() {
  const raw = String(process.env.MC_VAULT_MASTER_KEY_B64 || '').trim();
  if (raw) return raw;
  // If missing, generate a new one. WARNING: existing secrets would not be decryptable
  // if any exist; in practice this route should only generate if vault unused.
  return crypto.randomBytes(32).toString('base64');
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const host = req.headers.get('host') || '';
  const hostname = host.split(':')[0] || '';
  if (!isLoopbackHost(hostname)) {
    return NextResponse.json({ ok: false, error: 'Reconfigure is only allowed from localhost.' }, { status: 403 });
  }

  let body: ReconfigureBody;
  try {
    body = (await req.json()) as ReconfigureBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const required = [
    ['mcAdminUser', body.mcAdminUser],
    ['leadAgentId', body.leadAgentId],
    ['leadAgentName', body.leadAgentName],
  ] as const;
  for (const [key, value] of required) {
    if (bad(value)) return NextResponse.json({ ok: false, error: `Missing ${key}` }, { status: 400 });
  }

  const effectiveAdminPassword = String(body.mcAdminPassword || process.env.MC_ADMIN_PASSWORD || '').trim();
  if (!effectiveAdminPassword) {
    return NextResponse.json({ ok: false, error: 'Missing mcAdminPassword (or existing MC_ADMIN_PASSWORD is empty)' }, { status: 400 });
  }

  if (body.connectOpenClaw) {
    if (bad(body.openclawGatewayUrl)) return NextResponse.json({ ok: false, error: 'Missing openclawGatewayUrl' }, { status: 400 });
    if (bad(body.openclawGatewayToken)) return NextResponse.json({ ok: false, error: 'Missing openclawGatewayToken' }, { status: 400 });
  }

  const appDir = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : await findRepoRoot();
  const pbUrl = normalizeUrl(body.pbUrl || process.env.PB_URL || 'http://127.0.0.1:8090');
  const pbAdminEmail = String(body.pbAdminEmail || process.env.PB_ADMIN_EMAIL || 'admin@local.mc').trim();
  const pbAdminPassword = String(body.pbAdminPassword || effectiveAdminPassword).trim();
  const pbServiceEmail = String(body.pbServiceEmail || process.env.PB_SERVICE_EMAIL || 'service@local.mc').trim();
  const pbServicePassword = String(body.pbServicePassword || effectiveAdminPassword).trim();
  const openclawUrl = normalizeUrl(body.openclawGatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789');

  const vaultMasterKeyB64 = vaultMasterKeyFromEnv();
  const vaultKeyWasMissing = !String(process.env.MC_VAULT_MASTER_KEY_B64 || '').trim();

  const replacements = new Map<string, string>();
  replacements.set('MC_ADMIN_USER', body.mcAdminUser.trim());
  replacements.set('MC_ADMIN_PASSWORD', effectiveAdminPassword);
  replacements.set('MC_LEAD_AGENT_ID', body.leadAgentId.trim());
  replacements.set('MC_LEAD_AGENT', body.leadAgentId.trim());
  replacements.set('MC_LEAD_AGENT_NAME', body.leadAgentName);
  replacements.set('NEXT_PUBLIC_MC_LEAD_AGENT_ID', body.leadAgentId.trim());
  replacements.set('NEXT_PUBLIC_MC_LEAD_AGENT_NAME', body.leadAgentName);
  replacements.set('PB_URL', pbUrl);
  replacements.set('NEXT_PUBLIC_PB_URL', pbUrl);
  replacements.set('PB_ADMIN_EMAIL', pbAdminEmail);
  replacements.set('PB_ADMIN_PASSWORD', pbAdminPassword);
  replacements.set('PB_SERVICE_EMAIL', pbServiceEmail);
  replacements.set('PB_SERVICE_PASSWORD', pbServicePassword);
  replacements.set('MC_VAULT_MASTER_KEY_B64', vaultMasterKeyB64);
  replacements.set('OPENCLAW_GATEWAY_URL', openclawUrl);
  replacements.set('OPENCLAW_GATEWAY_TOKEN', body.connectOpenClaw ? (body.openclawGatewayToken || '') : '');
  replacements.set('OPENCLAW_GATEWAY_DISABLED', body.connectOpenClaw ? 'false' : 'true');
  replacements.set('MC_GATEWAY_HOST_HINT', body.gatewayHostHint?.trim() || '');
  replacements.set('MC_GATEWAY_PORT_HINT', body.gatewayPortHint?.trim() || '18789');

  const envPath = await writeEnvFromTemplate(appDir, replacements);

  // Ensure PocketBase reachable before attempting bootstrap.
  try {
    const health = await fetch(new URL('/api/health', pbUrl), { method: 'GET' });
    if (!health.ok) {
      return NextResponse.json({ ok: false, error: `PocketBase healthcheck failed (${health.status}). Is it running at ${pbUrl}?` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: `PocketBase is not reachable at ${pbUrl}. Start it and retry.` }, { status: 400 });
  }

  // Best-effort schema bootstrap (same as first-run).
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PB_URL: pbUrl,
    PB_ADMIN_EMAIL: pbAdminEmail,
    PB_ADMIN_PASSWORD: pbAdminPassword,
    PB_SERVICE_EMAIL: pbServiceEmail,
    PB_SERVICE_PASSWORD: pbServicePassword,
    MC_LEAD_AGENT_ID: body.leadAgentId.trim(),
    MC_LEAD_AGENT: body.leadAgentId.trim(),
    MC_LEAD_AGENT_NAME: body.leadAgentName,
  };

  const nodeBin = process.execPath;
  try {
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_bootstrap.mjs')], { cwd: appDir, env: childEnv });
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_set_settings.mjs')], { cwd: appDir, env: childEnv }).catch(() => {});
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_set_rules.mjs')], { cwd: appDir, env: childEnv }).catch(() => {});
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_backfill_vnext.mjs')], { cwd: appDir, env: childEnv }).catch(() => {});
  } catch (err: unknown) {
    const anyErr = err as { message?: string; stderr?: string; stdout?: string };
    const message = anyErr?.stderr || anyErr?.stdout || anyErr?.message || 'Bootstrap failed';
    return NextResponse.json({ ok: false, error: `Saved .env but bootstrap failed. Details:\n${message}` }, { status: 500 });
  }

  const restartMode = process.env.MC_AUTO_RESTART === '1' ? 'auto' : 'manual';
  const restartExitCode = Number.parseInt(process.env.MC_RESTART_EXIT_CODE || '42', 10) || 42;
  if (restartMode === 'auto') {
    const t = setTimeout(() => process.exit(restartExitCode), 750);
    (t as any).unref?.();
  }

  // Tighten env perms best-effort (macOS/Linux).
  try {
    await fs.chmod(envPath, 0o600);
  } catch {
    // ignore
  }

  return NextResponse.json({
    ok: true,
    envPath,
    vaultMasterKeyB64: vaultKeyWasMissing ? vaultMasterKeyB64 : null,
    restartRequired: true,
    restartMode,
    next:
      restartMode === 'auto'
        ? ['Restarting Mission Control now… (keep this tab open)']
        : [
            'Restart Mission Control (stop the running process and start it again).',
            'Command: ./scripts/run.sh',
            'Open: http://127.0.0.1:4010/ (login with your credentials).',
          ],
  });
}
