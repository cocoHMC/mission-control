import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { ensureOpsDirs, readConfigFile, writeConfigFile, computeUnifiedDiff } from '@/app/api/openclaw/_shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

function normalizeAgentId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmed)) return '';
  return trimmed;
}

function normalizeModelKey(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return '';
  // Keep it permissive; OpenClaw supports aliases as well as provider/model keys.
  if (trimmed.length > 200) return '';
  return trimmed;
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const agentId = normalizeAgentId(String(body?.agentId || body?.id || ''));
  const model = normalizeModelKey(String(body?.model || body?.modelKey || ''));

  if (!agentId) {
    return NextResponse.json({ ok: false, error: 'Invalid agentId.' }, { status: 400 });
  }

  const { content: currentText, filePath } = await readConfigFile();
  let config: any;
  try {
    config = JSON.parse(currentText);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `Failed to parse OpenClaw config: ${err?.message || String(err)}` }, { status: 500 });
  }

  const list: any[] = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const idx = list.findIndex((a) => a && typeof a === 'object' && String((a as any).id || '') === agentId);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: `Agent ${agentId} not found in config.` }, { status: 404 });
  }

  if (!model) {
    // Empty model means "inherit defaults".
    delete list[idx].model;
  } else {
    list[idx].model = model;
  }

  if (!config.agents) config.agents = {};
  config.agents.list = list;

  const nextText = JSON.stringify(config, null, 2) + '\n';

  const { backupsDir } = await ensureOpsDirs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `openclaw.json.${timestamp}.bak`);
  await fs.writeFile(backupPath, currentText, 'utf8');

  await writeConfigFile(nextText);

  return NextResponse.json({
    ok: true,
    configPath: filePath,
    backupPath,
    diff: computeUnifiedDiff(currentText, nextText),
    restartRequired: true,
    restartHint: 'Restart the gateway manually: openclaw gateway restart',
  });
}

