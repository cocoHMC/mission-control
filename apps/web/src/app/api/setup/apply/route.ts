import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { findRepoRoot, isAdminAuthConfigured, isLoopbackHost, writeEnvFromTemplate } from '@/app/api/setup/_shared';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

type ApplyBody = {
  mcAdminUser: string;
  mcAdminPassword: string;
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

function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function derivePbAdminEmail(username: string) {
  const raw = String(username || '').trim();
  if (!raw) return 'admin@local.mc';
  if (raw.includes('@')) return raw;
  const safe = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${safe || 'admin'}@local.mc`;
}

export async function POST(req: NextRequest) {
  if (isAdminAuthConfigured()) {
    return NextResponse.json(
      { error: 'Setup already completed. Edit .env manually or reset your dev environment.' },
      { status: 409 }
    );
  }

  const host = req.headers.get('host') || '';
  const hostname = host.split(':')[0] || '';
  if (!isLoopbackHost(hostname)) {
    return NextResponse.json(
      { error: 'Setup is only allowed from localhost. Open the setup page on the gateway host.' },
      { status: 403 }
    );
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const required = [
    ['mcAdminUser', body.mcAdminUser],
    ['mcAdminPassword', body.mcAdminPassword],
    ['leadAgentId', body.leadAgentId],
    ['leadAgentName', body.leadAgentName],
  ] as const;

  for (const [key, value] of required) {
    if (bad(value)) return NextResponse.json({ error: `Missing ${key}` }, { status: 400 });
  }

  if (body.connectOpenClaw) {
    if (bad(body.openclawGatewayUrl)) return NextResponse.json({ error: 'Missing openclawGatewayUrl' }, { status: 400 });
    if (bad(body.openclawGatewayToken)) return NextResponse.json({ error: 'Missing openclawGatewayToken' }, { status: 400 });
  }

  const appDir = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : await findRepoRoot();
  const dataDir = process.env.MC_DATA_DIR ? path.resolve(process.env.MC_DATA_DIR) : appDir;
  const pbUrl = normalizeUrl(body.pbUrl || 'http://127.0.0.1:8090');
  const pbAdminEmail = (body.pbAdminEmail || derivePbAdminEmail(body.mcAdminUser)).trim();
  const pbAdminPassword =
    body.pbAdminPassword && body.pbAdminPassword.trim() ? body.pbAdminPassword : body.mcAdminPassword;
  const pbServiceEmail = (body.pbServiceEmail || 'service@local.mc').trim();
  const pbServicePassword =
    body.pbServicePassword && body.pbServicePassword.trim() ? body.pbServicePassword : body.mcAdminPassword;
  const openclawUrl = normalizeUrl(body.openclawGatewayUrl || 'http://127.0.0.1:18789');

  const replacements = new Map<string, string>();
  replacements.set('MC_ADMIN_USER', body.mcAdminUser.trim());
  replacements.set('MC_ADMIN_PASSWORD', body.mcAdminPassword);
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
  replacements.set('OPENCLAW_GATEWAY_URL', openclawUrl);
  replacements.set('OPENCLAW_GATEWAY_TOKEN', body.connectOpenClaw ? (body.openclawGatewayToken || '') : '');
  replacements.set('OPENCLAW_GATEWAY_DISABLED', body.connectOpenClaw ? 'false' : 'true');
  replacements.set('MC_GATEWAY_HOST_HINT', body.gatewayHostHint?.trim() || '');
  replacements.set('MC_GATEWAY_PORT_HINT', body.gatewayPortHint?.trim() || '18789');

  const envPath = await writeEnvFromTemplate(appDir, replacements);

  // Ensure PocketBase is reachable before attempting to bootstrap.
  try {
    const health = await fetch(new URL('/api/health', pbUrl), { method: 'GET' });
    if (!health.ok) {
      return NextResponse.json({ error: `PocketBase healthcheck failed (${health.status}). Is it running at ${pbUrl}?` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: `PocketBase is not reachable at ${pbUrl}. Start it and retry.` }, { status: 400 });
  }

  // Create/Upsert the PocketBase superuser using the local binary if available.
  const pbBin = process.platform === 'win32' ? path.join(appDir, 'pb', 'pocketbase.exe') : path.join(appDir, 'pb', 'pocketbase');
  const pbDataDir = path.join(dataDir, 'pb', 'pb_data');
  await fs.mkdir(pbDataDir, { recursive: true });
  try {
    await execFileAsync(pbBin, ['superuser', 'upsert', pbAdminEmail, pbAdminPassword, '--dir', pbDataDir], {
      cwd: appDir,
    });
  } catch (err: unknown) {
    // This is optional for Docker-based PB. If the binary isn't available, the user can create a superuser via /_/.
    const anyErr = err as { code?: string; message?: string; stderr?: string };
    const message = anyErr?.stderr || anyErr?.message || 'Failed to run pocketbase superuser upsert';
    return NextResponse.json(
      {
        error:
          `Could not create PocketBase superuser automatically. ` +
          `If you're running PocketBase in Docker, create the first admin via ${pbUrl}/_/ and then retry.\n` +
          message,
      },
      { status: 500 }
    );
  }

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

  // Bootstrap schema and seed lead agent.
  const nodeBin = process.execPath;
  try {
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_bootstrap.mjs')], { cwd: appDir, env: childEnv });
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_set_settings.mjs')], { cwd: appDir, env: childEnv });
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_set_rules.mjs')], { cwd: appDir, env: childEnv });
    await execFileAsync(nodeBin, [path.join(appDir, 'scripts', 'pb_backfill_vnext.mjs')], { cwd: appDir, env: childEnv });
  } catch (err: unknown) {
    const anyErr = err as { message?: string; stderr?: string; stdout?: string };
    const message = anyErr?.stderr || anyErr?.stdout || anyErr?.message || 'Bootstrap failed';
    return NextResponse.json(
      { error: `Saved .env but bootstrap failed. Details:\n${message}` },
      { status: 500 }
    );
  }

  const restartMode = process.env.MC_AUTO_RESTART === '1' ? 'auto' : 'manual';
  // If Mission Control is started via our local runner script, it will restart the stack when
  // the web process exits with this code.
  const restartExitCode = Number.parseInt(process.env.MC_RESTART_EXIT_CODE || '42', 10) || 42;
  if (restartMode === 'auto') {
    // Give the response time to flush before the process exits.
    const t = setTimeout(() => process.exit(restartExitCode), 750);
    // Don’t keep the process alive because of the timer.
    (t as any).unref?.();
  }

  return NextResponse.json({
    ok: true,
    envPath,
    restartRequired: true,
    restartMode,
    next:
      restartMode === 'auto'
        ? ['Restarting Mission Control now… (keep this tab open)']
        : [
            'Restart Mission Control (stop the running process and start it again).',
            'Command: ./scripts/run.sh',
            'Open: http://127.0.0.1:4010/ (login with your new credentials).',
          ],
  });
}
