import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { runOpenClaw } from '@/app/api/openclaw/cli';

function nowIso() {
  return new Date().toISOString();
}

type OpenClawNode =
  | {
      id?: string;
      nodeId?: string;
      name?: string;
      displayName?: string;
      paired?: boolean;
      lastSeenAt?: string;
      os?: string;
      arch?: string;
      platform?: string;
      capabilities?: unknown;
      execPolicy?: string;
      allowlistSummary?: string;
      remoteIp?: string;
      version?: string;
      caps?: unknown;
      commands?: unknown;
      connected?: boolean;
      connectedAtMs?: number;
      pathEnv?: string;
    }
  | Record<string, unknown>;

function normalizeNodeList(parsed: any): OpenClawNode[] {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed as OpenClawNode[];
  if (Array.isArray(parsed.nodes)) return parsed.nodes as OpenClawNode[];
  // `openclaw nodes list --json` uses `{ pending: [], paired: [] }` in some versions.
  if (Array.isArray(parsed.paired)) return parsed.paired as OpenClawNode[];
  return [];
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const res = await runOpenClaw(['nodes', 'status', '--json'], { timeoutMs: 12_000 });
  if (!res.ok) {
    const msg = (res.stderr || res.stdout || res.message || 'Failed to query OpenClaw nodes').trim();
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let parsed: any = null;
  try {
    parsed = res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    parsed = null;
  }

  const list = normalizeNodeList(parsed);
  const stamp = nowIso();

  let upserted = 0;
  for (const node of list) {
    const n = node as any;
    const nodeId = n.nodeId || n.id || n.name;
    if (!nodeId) continue;

    const q = new URLSearchParams({ page: '1', perPage: '1', filter: `nodeId = "${nodeId}"` });
    const existing = await pbFetch<any>(`/api/collections/nodes/records?${q.toString()}`);

    const payload = {
      nodeId,
      displayName: n.displayName || n.name || nodeId,
      paired: typeof n.paired === 'boolean' ? n.paired : true,
      lastSeenAt: n.lastSeenAt || stamp,
      os: n.os || n.platform || 'unknown',
      arch: n.arch || 'unknown',
      // Store the full node status snapshot for debugging and UI upgrades.
      capabilities: n.capabilities || {
        remoteIp: n.remoteIp,
        version: n.version,
        caps: n.caps,
        commands: n.commands,
        connected: n.connected,
        connectedAtMs: n.connectedAtMs,
        pathEnv: n.pathEnv,
      },
      execPolicy: n.execPolicy || 'deny',
      allowlistSummary: n.allowlistSummary || '',
    };

    if (existing?.items?.length) {
      await pbFetch(`/api/collections/nodes/records/${existing.items[0].id}`, { method: 'PATCH', body: payload });
    } else {
      await pbFetch('/api/collections/nodes/records', { method: 'POST', body: payload });
    }
    upserted++;
  }

  return NextResponse.json({ ok: true, upserted });
}

