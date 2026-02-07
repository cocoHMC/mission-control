import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function isThinkingLevel(value: string) {
  return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(value);
}

function isCompactionMode(value: string) {
  return ['off', 'safeguard', 'auto', 'manual'].includes(value);
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const res = await runOpenClaw(['config', 'get', 'agents.defaults', '--json'], { timeoutMs: 10_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load OpenClaw agent defaults.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    return NextResponse.json({ ok: true, defaults: stdout ? JSON.parse(stdout) : {} });
  } catch {
    return NextResponse.json({ ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const thinkingDefault = safeString(body?.thinkingDefault);
  const workspace = safeString(body?.workspace);
  const compactionMode = safeString(body?.compactionMode);
  const modelPrimary = safeString(body?.modelPrimary);
  const modelFallbacks = Array.isArray(body?.modelFallbacks)
    ? (body.modelFallbacks as unknown[]).map((v) => safeString(v)).filter(Boolean)
    : null;
  const maxConcurrent = safeNumber(body?.maxConcurrent);
  const subagentsMaxConcurrent = safeNumber(body?.subagentsMaxConcurrent);

  const changes: { path: string; value: string; json: boolean }[] = [];
  if (thinkingDefault) {
    if (!isThinkingLevel(thinkingDefault)) {
      return NextResponse.json(
        { ok: false, error: `Invalid thinkingDefault. Expected one of off|minimal|low|medium|high|xhigh.` },
        { status: 400 }
      );
    }
    changes.push({ path: 'agents.defaults.thinkingDefault', value: thinkingDefault, json: false });
  }
  if (workspace) changes.push({ path: 'agents.defaults.workspace', value: workspace, json: false });
  if (compactionMode) {
    if (!isCompactionMode(compactionMode)) {
      return NextResponse.json(
        { ok: false, error: `Invalid compactionMode. Expected one of off|safeguard|auto|manual.` },
        { status: 400 }
      );
    }
    changes.push({ path: 'agents.defaults.compaction.mode', value: compactionMode, json: false });
  }
  if (modelPrimary) changes.push({ path: 'agents.defaults.model.primary', value: modelPrimary, json: false });
  if (modelFallbacks) changes.push({ path: 'agents.defaults.model.fallbacks', value: JSON.stringify(modelFallbacks), json: true });
  if (typeof maxConcurrent === 'number') changes.push({ path: 'agents.defaults.maxConcurrent', value: String(maxConcurrent), json: true });
  if (typeof subagentsMaxConcurrent === 'number') {
    changes.push({ path: 'agents.defaults.subagents.maxConcurrent', value: String(subagentsMaxConcurrent), json: true });
  }

  if (!changes.length) {
    return NextResponse.json({ ok: false, error: 'No changes provided.' }, { status: 400 });
  }

  for (const change of changes) {
    const args = ['config', 'set', change.path, change.value, ...(change.json ? ['--json'] : [])];
    const res = await runOpenClaw(args, { timeoutMs: 12_000 });
    if (!res.ok) {
      const detail = [res.message, res.stderr].filter(Boolean).join('\n').trim();
      return NextResponse.json(
        { ok: false, error: detail || `Failed to set ${change.path}.` },
        { status: 502 }
      );
    }
  }

  const refreshed = await runOpenClaw(['config', 'get', 'agents.defaults', '--json'], { timeoutMs: 10_000 });
  if (!refreshed.ok) {
    return NextResponse.json({ ok: true, updated: true, restartHint: 'Restart OpenClaw if changes do not apply immediately.' });
  }
  try {
    const defaults = String(refreshed.stdout || '').trim();
    return NextResponse.json({
      ok: true,
      defaults: defaults ? JSON.parse(defaults) : {},
      restartHint: 'Restart OpenClaw if changes do not apply immediately.',
    });
  } catch {
    return NextResponse.json({ ok: true, updated: true, restartHint: 'Restart OpenClaw if changes do not apply immediately.' });
  }
}
