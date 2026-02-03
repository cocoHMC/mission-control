import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  ensureOpsDirs,
  getOpenClawConfigPath,
  readConfigFile,
  validateConfigObject,
  writeConfigFile,
} from '@/app/api/openclaw/_shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const inputText = typeof body?.config === 'string' ? body.config : '';

  const { opsDir, backupsDir } = await ensureOpsDirs();
  const pendingPath = path.join(opsDir, 'pending.json');

  let configText = inputText;
  if (!configText.trim()) {
    try {
      configText = await fs.readFile(pendingPath, 'utf8');
    } catch {
      return NextResponse.json({ ok: false, error: 'No pending config found' }, { status: 400 });
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(configText);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'parse error';
    return NextResponse.json({ ok: false, error: `Invalid JSON: ${message}` }, { status: 400 });
  }

  const { missing, warnings } = validateConfigObject(parsed);
  if (missing.length) {
    return NextResponse.json(
      { ok: false, error: `Missing required keys: ${missing.join(', ')}`, warnings },
      { status: 400 }
    );
  }

  const { content: currentText } = await readConfigFile();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `openclaw.json.${timestamp}.bak`);
  await fs.writeFile(backupPath, currentText, 'utf8');

  await fs.writeFile(pendingPath, configText, 'utf8');
  const appliedPath = await writeConfigFile(configText);

  return NextResponse.json({
    ok: true,
    appliedPath,
    backupPath,
    warnings,
    restartRequired: true,
    restartHint: 'Restart the gateway manually: openclaw gateway restart',
    configPath: getOpenClawConfigPath(),
  });
}
