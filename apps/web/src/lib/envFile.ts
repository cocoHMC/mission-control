import { promises as fs } from 'node:fs';
import path from 'node:path';
import { findRepoRoot, formatEnvValue } from '@/app/api/setup/_shared';

type EnvPaths = {
  appDir: string;
  dataDir: string;
  envPath: string;
  examplePath: string;
};

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveEnvPaths(): Promise<EnvPaths> {
  const appDir = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : await findRepoRoot();
  const dataDir = process.env.MC_DATA_DIR ? path.resolve(process.env.MC_DATA_DIR) : appDir;
  const envPath = path.join(dataDir, '.env');
  const examplePath = path.join(appDir, '.env.example');
  return { appDir, dataDir, envPath, examplePath };
}

export async function patchEnvFile(updates: Map<string, string>) {
  const { dataDir, envPath, examplePath } = await resolveEnvPaths();
  await fs.mkdir(dataDir, { recursive: true });

  // If .env doesn't exist yet (rare outside of desktop), seed it from .env.example.
  if (!(await fileExists(envPath)) && (await fileExists(examplePath))) {
    const raw = await fs.readFile(examplePath, 'utf8');
    await fs.writeFile(envPath, raw, 'utf8');
  }

  const raw = (await fileExists(envPath)) ? await fs.readFile(envPath, 'utf8') : '';
  const lines = raw.split(/\r?\n/);

  const seen = new Set<string>();
  const out = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!updates.has(key)) return line;
    seen.add(key);
    return `${key}=${formatEnvValue(String(updates.get(key) || ''))}`;
  });

  for (const [key, value] of updates.entries()) {
    if (seen.has(key)) continue;
    out.push(`${key}=${formatEnvValue(value)}`);
  }

  await fs.writeFile(envPath, out.join('\n'), 'utf8');
  return envPath;
}

