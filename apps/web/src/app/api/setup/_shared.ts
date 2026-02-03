import { promises as fs } from 'node:fs';
import path from 'node:path';

export function isPlaceholderSecret(value?: string) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === 'change-me' || normalized === 'changeme';
}

export function isAdminAuthConfigured() {
  const user = process.env.MC_ADMIN_USER;
  const pass = process.env.MC_ADMIN_PASSWORD;
  return Boolean(user && pass && !isPlaceholderSecret(user) && !isPlaceholderSecret(pass));
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function findRepoRoot(startDir: string = process.cwd()) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const envExample = path.join(dir, '.env.example');
    const workspace = path.join(dir, 'pnpm-workspace.yaml');
    if (await exists(envExample)) {
      // If we also find a pnpm workspace file, it's almost certainly the repo root.
      if (await exists(workspace)) return dir;
      // Otherwise still accept `.env.example` as root marker.
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Repo root not found starting from ${startDir}`);
}

export function formatEnvValue(value: string) {
  if (value === '') return '';
  const safe = /^[A-Za-z0-9_./:@-]+$/.test(value);
  if (safe) return value;
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export async function writeEnvFromTemplate(rootDir: string, replacements: Map<string, string>) {
  const examplePath = path.join(rootDir, '.env.example');
  const envPath = path.join(rootDir, '.env');
  const raw = await fs.readFile(examplePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!replacements.has(key)) return line;
    return `${key}=${formatEnvValue(String(replacements.get(key) || ''))}`;
  });

  const existingKeys = new Set<string>();
  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (match) existingKeys.add(match[1]);
  }
  for (const [key, val] of replacements.entries()) {
    if (existingKeys.has(key)) continue;
    out.push(`${key}=${formatEnvValue(val)}`);
  }

  await fs.writeFile(envPath, out.join('\n'), 'utf8');
  return envPath;
}

export function isLoopbackHost(hostname: string) {
  const h = hostname.trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

