import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

type ModelCapability = {
  reasoningSupported: boolean | null;
  thinkingLevels: string[];
};

function inferCapabilityFromKey(modelKey: string): ModelCapability {
  const key = String(modelKey || '').trim();
  const lower = key.toLowerCase();

  // Conservative: only return false when we know it is false (from config).
  // Otherwise return null and let the UI show reasoning choices but warn that it may be ignored.
  const reasoningHeuristic =
    lower.startsWith('openai-codex/') ? true : lower.includes('thinking') ? true : null;

  const reasoningSupported = reasoningHeuristic;
  const thinkingLevels = reasoningSupported ? ['low', 'medium', 'high', 'xhigh'] : [];
  return { reasoningSupported, thinkingLevels };
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const res = await runOpenClaw(['models', 'list', '--json'], { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to list models.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    const models = Array.isArray(parsed?.models) ? (parsed.models as Array<{ key?: string }>) : [];

    // Merge in per-model capability hints from OpenClaw config when available.
    // Important: do not return the raw config because it can contain secrets (API keys).
    const capsByKey: Record<string, ModelCapability> = {};
    const configModelReasoning: Record<string, boolean> = {};
    try {
      const cfg = await runOpenClaw(['config', 'get', 'models', '--json'], { timeoutMs: 15_000 });
      if (cfg.ok) {
        const cfgJson = String(cfg.stdout || '').trim();
        const cfgParsed = cfgJson ? JSON.parse(cfgJson) : null;
        const providers = cfgParsed?.providers && typeof cfgParsed.providers === 'object' ? cfgParsed.providers : null;
        if (providers) {
          for (const [providerName, providerCfg] of Object.entries<any>(providers)) {
            const list = Array.isArray((providerCfg as any)?.models) ? (providerCfg as any).models : [];
            for (const m of list) {
              const id = typeof m?.id === 'string' ? m.id.trim() : '';
              if (!id) continue;
              const key = `${providerName}/${id}`;
              if (typeof m?.reasoning === 'boolean') configModelReasoning[key] = m.reasoning;
            }
          }
        }
      }
    } catch {
      // ignore config parsing issues; the list is still useful.
    }

    for (const m of models) {
      const key = typeof m?.key === 'string' ? m.key.trim() : '';
      if (!key) continue;
      const fromCfg = Object.prototype.hasOwnProperty.call(configModelReasoning, key) ? configModelReasoning[key] : undefined;
      if (typeof fromCfg === 'boolean') {
        capsByKey[key] = {
          reasoningSupported: fromCfg,
          thinkingLevels: fromCfg ? ['low', 'medium', 'high', 'xhigh'] : [],
        };
      } else {
        capsByKey[key] = inferCapabilityFromKey(key);
      }
    }

    return NextResponse.json({ ok: true, ...parsed, capabilitiesByKey: capsByKey });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}
