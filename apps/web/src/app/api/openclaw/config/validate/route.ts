import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  computeUnifiedDiff,
  ensureOpsDirs,
  readConfigFile,
  validateConfigObject,
} from '@/app/api/openclaw/_shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const configText = String(body?.config || '');
  if (!configText.trim()) {
    return NextResponse.json({ ok: false, error: 'config is required' }, { status: 400 });
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
  const diff = computeUnifiedDiff(currentText, configText);

  const { opsDir } = await ensureOpsDirs();
  const pendingPath = path.join(opsDir, 'pending.json');
  await fs.writeFile(pendingPath, configText, 'utf8');

  return NextResponse.json({
    ok: true,
    warnings,
    diff,
    pendingPath,
  });
}
