import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  adminTokenLooksHashed,
  detectDockerCompose,
  fileExists,
  getVaultwardenPaths,
  isTruthy,
  readVaultwardenEnv,
  runCompose,
} from '@/app/api/security/vaultwarden/_shared';

export const runtime = 'nodejs';

async function checkHealth(url: string) {
  if (!url) return { ok: false, error: 'No URL configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Health check failed' };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const { envPath, composePath, caddyfilePath, caddyDockerfilePath, opsDir } = getVaultwardenPaths();
  const [envExists, composeExists, caddyExists, caddyDockerExists] = await Promise.all([
    fileExists(envPath),
    fileExists(composePath),
    fileExists(caddyfilePath),
    fileExists(caddyDockerfilePath),
  ]);

  const env = await readVaultwardenEnv();
  const domain = env?.VW_DOMAIN || '';
  const bindIp = env?.VW_BIND_IP || '';
  const orgName = env?.VW_ORG_NAME || '';
  const signupsAllowed = isTruthy(env?.VW_SIGNUPS_ALLOWED);
  const hasCloudflareToken = Boolean(env?.CF_API_TOKEN);
  const hasAdminToken = Boolean(env?.VW_ADMIN_TOKEN);
  const adminTokenHashed = adminTokenLooksHashed(env?.VW_ADMIN_TOKEN);

  const docker = await detectDockerCompose();
  let services: Array<{ name: string; running: boolean }> = [];
  let stackRunning = false;
  let composeError: string | null = null;

  if (docker.ok && docker.compose && composeExists) {
    try {
      const list = await runCompose(docker.compose, ['ps', '--services'], { cwd: opsDir });
      const names = String(list.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const runningRes = await runCompose(docker.compose, ['ps', '--services', '--status', 'running'], { cwd: opsDir });
      const running = new Set(
        String(runningRes.stdout || '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      );

      services = names.map((name) => ({ name, running: running.has(name) }));
      stackRunning = services.length > 0 && services.every((service) => service.running);
    } catch (err: any) {
      composeError = err?.message || 'Failed to query docker compose';
    }
  }

  const healthUrl = domain ? `https://${domain}` : '';
  const health = domain ? await checkHealth(healthUrl) : { ok: false, error: 'Domain not configured' };

  const actionsEnabled = String(process.env.MC_SECURITY_ACTIONS_ENABLED || '').toLowerCase() === 'true';

  return NextResponse.json({
    ok: true,
    opsDir,
    files: { env: envExists, compose: composeExists, caddy: caddyExists, caddyDocker: caddyDockerExists },
    config: {
      domain,
      bindIp,
      orgName,
      signupsAllowed,
      hasCloudflareToken,
      hasAdminToken,
      adminTokenHashed,
    },
    docker: {
      installed: docker.ok,
      compose: docker.compose,
      error: docker.ok ? null : docker.error,
    },
    stack: {
      running: stackRunning,
      services,
      error: composeError,
    },
    health: {
      ...health,
      url: healthUrl,
    },
    actionsEnabled,
    ts: new Date().toISOString(),
  });
}
