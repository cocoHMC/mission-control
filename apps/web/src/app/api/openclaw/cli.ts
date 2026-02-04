import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

const execFileAsync = promisify(execFile);

export function extraPathEntries() {
  if (process.platform === 'darwin') return ['/usr/local/bin', '/opt/homebrew/bin'];
  if (process.platform === 'linux') return ['/usr/local/bin', '/usr/bin'];
  return [];
}

export async function resolveOpenClawBin() {
  const configured = String(process.env.OPENCLAW_CLI || '').trim();
  const candidates: string[] = [];

  if (configured && configured.includes('/')) candidates.push(configured);

  if (process.platform === 'darwin') {
    candidates.push('/usr/local/bin/openclaw', '/opt/homebrew/bin/openclaw');
  } else if (process.platform === 'linux') {
    candidates.push('/usr/local/bin/openclaw', '/usr/bin/openclaw');
  }

  candidates.push(configured || 'openclaw');
  if ((configured || 'openclaw') !== 'openclaw') candidates.push('openclaw');

  for (const c of candidates) {
    if (!c) continue;
    if (!c.includes('/')) return c;
    try {
      await access(c, fsConstants.X_OK);
      return c;
    } catch {
      // keep looking
    }
  }
  return configured || 'openclaw';
}

export async function runOpenClaw(args: string[], opts: { timeoutMs?: number } = {}) {
  const bin = await resolveOpenClawBin();
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.PATH = [env.PATH || '', ...extraPathEntries()].filter(Boolean).join(':');
  try {
    const res = await execFileAsync(bin, args, { timeout: opts.timeoutMs ?? 5_000, env });
    return { ok: true as const, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } catch (err: any) {
    const stdout = err?.stdout ?? '';
    const stderr = err?.stderr ?? '';
    const message = err?.message ?? String(err);
    return { ok: false as const, stdout, stderr, message };
  }
}

