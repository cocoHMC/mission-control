import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createTwoFilesPatch } from 'diff';

export const RUNTIME = 'nodejs';

export function getOpenClawConfigPath() {
  return process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

export function getOpenClawOpsDir() {
  return path.join(process.cwd(), 'ops', 'openclaw');
}

export async function readConfigFile() {
  const filePath = getOpenClawConfigPath();
  const content = await fs.readFile(filePath, 'utf8');
  return { filePath, content };
}

export async function writeConfigFile(content: string) {
  const filePath = getOpenClawConfigPath();
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

export async function ensureOpsDirs() {
  const opsDir = getOpenClawOpsDir();
  const backupsDir = path.join(opsDir, 'backups');
  await fs.mkdir(backupsDir, { recursive: true });
  return { opsDir, backupsDir };
}

export function validateConfigObject(obj: Record<string, unknown>) {
  const missing: string[] = [];
  for (const key of ['gateway', 'auth', 'tools', 'agents']) {
    if (!(key in obj)) missing.push(key);
  }

  const warnings: string[] = [];
  const gateway = (obj.gateway as Record<string, unknown>) || {};
  if (!gateway || typeof gateway !== 'object') {
    warnings.push('gateway is not an object.');
  } else {
    if (!('auth' in gateway)) warnings.push('gateway.auth is missing.');
    if (!('bind' in gateway)) warnings.push('gateway.bind is missing.');
    if (!('tailscale' in gateway)) warnings.push('gateway.tailscale is missing.');
  }

  return { missing, warnings };
}

export function computeUnifiedDiff(beforeText: string, afterText: string) {
  return createTwoFilesPatch('openclaw.json (current)', 'openclaw.json (pending)', beforeText, afterText, '', '');
}
