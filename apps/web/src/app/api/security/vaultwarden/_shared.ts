import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type VaultwardenEnv = {
  VW_DOMAIN?: string;
  VW_BIND_IP?: string;
  CF_API_TOKEN?: string;
  VW_ADMIN_TOKEN?: string;
  VW_SIGNUPS_ALLOWED?: string;
  VW_ORG_NAME?: string;
};

export function getVaultwardenOpsDir() {
  return path.join(process.cwd(), 'ops', 'vaultwarden');
}

export function getVaultwardenPaths() {
  const opsDir = getVaultwardenOpsDir();
  return {
    opsDir,
    envPath: path.join(opsDir, '.env'),
    composePath: path.join(opsDir, 'docker-compose.yml'),
    caddyfilePath: path.join(opsDir, 'Caddyfile'),
    caddyDir: path.join(opsDir, 'caddy'),
    caddyDockerfilePath: path.join(opsDir, 'caddy', 'Dockerfile'),
    dataDir: path.join(opsDir, 'data'),
  };
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseEnv(raw: string): VaultwardenEnv {
  const out: VaultwardenEnv = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) return;
    (out as any)[key] = value.replace(/^"|"$/g, '');
  });
  return out;
}

export function serializeEnv(entries: Record<string, string>) {
  return Object.entries(entries)
    .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
    .join('\n');
}

function formatEnvValue(value: string) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (/[^A-Za-z0-9_./:-]/.test(raw)) {
    return `"${raw.replace(/"/g, '\\"')}"`;
  }
  return raw;
}

export function normalizeDomain(input: string) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return { host: '', url: '' };
  try {
    const withScheme = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    return { host: url.hostname, url: `${url.protocol}//${url.hostname}` };
  } catch {
    return { host: trimmed.replace(/^https?:\/\//i, ''), url: '' };
  }
}

export function maskValue(value?: string) {
  if (!value) return '';
  if (value.length <= 6) return '******';
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

export function isTruthy(value?: string) {
  const v = String(value || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export async function ensureVaultwardenStack(config: {
  domainHost: string;
  bindIp: string;
  cloudflareToken: string;
  adminToken: string;
  signupsAllowed: boolean;
  orgName: string;
}) {
  const { opsDir, envPath, composePath, caddyfilePath, caddyDir, caddyDockerfilePath, dataDir } = getVaultwardenPaths();
  await fs.mkdir(opsDir, { recursive: true });
  await fs.mkdir(caddyDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const env = serializeEnv({
    VW_DOMAIN: config.domainHost,
    VW_BIND_IP: config.bindIp,
    CF_API_TOKEN: config.cloudflareToken,
    VW_ADMIN_TOKEN: config.adminToken,
    VW_SIGNUPS_ALLOWED: String(config.signupsAllowed),
    VW_ORG_NAME: config.orgName,
  });
  await fs.writeFile(envPath, env + '\n', 'utf8');

  const caddyfile = `${config.domainHost} {
  encode zstd gzip
  reverse_proxy /notifications/hub vaultwarden:3012
  reverse_proxy vaultwarden:80
  tls {
    dns cloudflare {env.CF_API_TOKEN}
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
    Permissions-Policy "geolocation=()"
  }
}
`;
  await fs.writeFile(caddyfilePath, caddyfile, 'utf8');

  const compose = `services:
  vaultwarden:
    image: vaultwarden/server:latest
    restart: unless-stopped
    environment:
      DOMAIN: https://${'${VW_DOMAIN}'}
      SIGNUPS_ALLOWED: ${'${VW_SIGNUPS_ALLOWED:-false}'}
      ADMIN_TOKEN: ${'${VW_ADMIN_TOKEN}'}
      WEBSOCKET_ENABLED: ${'${VW_WEBSOCKET_ENABLED:-true}'}
      WEBSOCKET_ADDRESS: 0.0.0.0
      WEBSOCKET_PORT: 3012
      LOG_FILE: /data/vaultwarden.log
    volumes:
      - ./data:/data

  caddy:
    build:
      context: ./caddy
    restart: unless-stopped
    environment:
      CF_API_TOKEN: ${'${CF_API_TOKEN}'}
    ports:
      - "${'${VW_BIND_IP:-127.0.0.1}'}:80:80"
      - "${'${VW_BIND_IP:-127.0.0.1}'}:443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - vaultwarden

volumes:
  caddy_data:
  caddy_config:
`;
  await fs.writeFile(composePath, compose, 'utf8');

  const dockerfile = `FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
`;
  await fs.writeFile(caddyDockerfilePath, dockerfile, 'utf8');

  return { envPath, composePath, caddyfilePath, caddyDockerfilePath, opsDir };
}

export async function readVaultwardenEnv() {
  const { envPath } = getVaultwardenPaths();
  if (!(await fileExists(envPath))) return null;
  const raw = await fs.readFile(envPath, 'utf8');
  return parseEnv(raw);
}

export function adminTokenLooksHashed(token?: string) {
  const raw = String(token || '');
  return raw.startsWith('$argon2');
}

export async function detectDockerCompose() {
  try {
    await execFileAsync('docker', ['--version']);
  } catch (err: any) {
    return { ok: false as const, error: err?.message || 'docker not found', compose: null };
  }

  try {
    await execFileAsync('docker', ['compose', 'version']);
    return { ok: true as const, compose: 'docker' as const, error: null };
  } catch {
    // fallback
  }

  try {
    await execFileAsync('docker-compose', ['--version']);
    return { ok: true as const, compose: 'docker-compose' as const, error: null };
  } catch (err: any) {
    return { ok: false as const, compose: null, error: err?.message || 'docker compose not found' };
  }
}

export async function runCompose(compose: 'docker' | 'docker-compose', args: string[], opts: { cwd: string }) {
  if (compose === 'docker') {
    return execFileAsync('docker', ['compose', ...args], { cwd: opts.cwd });
  }
  return execFileAsync('docker-compose', args, { cwd: opts.cwd });
}
