import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

type SessionRow = {
  key: string;
  updatedAtMs: number;
  model: string;
  kind: string;
};

function toInt(value: string | null, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sessionStatusText(raw: any) {
  const details = raw?.result?.details;
  if (details && typeof details?.statusText === 'string' && details.statusText.trim()) return details.statusText.trim();
  const content = raw?.result?.content;
  if (!Array.isArray(content)) return '';
  const t = content.find((c: any) => c?.type === 'text')?.text;
  return typeof t === 'string' ? t.trim() : '';
}

function parseQueue(statusText: string) {
  const line = statusText
    .split('\n')
    .map((s) => s.trim())
    .find((s) => /queue:/i.test(s));
  if (!line) return { mode: '', depth: null as number | null, line: '' };

  const after = line.replace(/^.*?queue:\s*/i, '').trim();
  const mode = after.replace(/\(.*$/, '').trim().split(/\s+/)[0] || '';
  const depthMatch = after.match(/\bdepth\s+(\d+)\b/i);
  const depth = depthMatch ? Number.parseInt(depthMatch[1], 10) : null;
  return { mode, depth: Number.isFinite(depth as number) ? depth : null, line };
}

function sessionRows(parsed: any) {
  const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
  return sessions
    .map((s: any) => ({
      key: typeof s?.key === 'string' ? s.key : '',
      updatedAtMs: typeof s?.updatedAt === 'number' && Number.isFinite(s.updatedAt) ? s.updatedAt : 0,
      model: typeof s?.model === 'string' ? s.model : '',
      kind: typeof s?.kind === 'string' ? s.kind : '',
    }))
    .filter((s: SessionRow) => s.key && s.key.startsWith('agent:'))
    .sort((a: SessionRow, b: SessionRow) => b.updatedAtMs - a.updatedAtMs);
}

function parseDateMs(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const sessionLimit = toInt(url.searchParams.get('sessionLimit'), 8, 1, 20);
  const backlogSloSeconds = toInt(url.searchParams.get('backlogSloSeconds'), 120, 10, 3600);
  const queueDepthSlo = toInt(url.searchParams.get('queueDepthSlo'), 0, 0, 1000);

  const warnings: string[] = [];
  let sessionsParsed: any = null;
  try {
    const listOut = await openclawToolsInvoke<any>('sessions_list', { limit: 200, messageLimit: 0 }, { timeoutMs: 10_000 });
    sessionsParsed = listOut.parsedText;
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to list sessions.' }, { status: 502 });
  }
  if (!sessionsParsed || typeof sessionsParsed !== 'object') {
    return NextResponse.json({ ok: false, error: 'OpenClaw returned an unexpected sessions payload.' }, { status: 502 });
  }

  const rows: SessionRow[] = sessionRows(sessionsParsed);
  const leadAgent = String(process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'main').trim() || 'main';
  const preferredMain = `agent:${leadAgent}:main`;
  const mcFirst = [...rows.filter((r: SessionRow) => r.key.includes(':mc:')), ...rows.filter((r: SessionRow) => !r.key.includes(':mc:'))];

  const selectedKeys: string[] = [];
  if (rows.some((r: SessionRow) => r.key === preferredMain)) selectedKeys.push(preferredMain);
  for (const r of mcFirst) {
    if (selectedKeys.includes(r.key)) continue;
    selectedKeys.push(r.key);
    if (selectedKeys.length >= sessionLimit) break;
  }

  const probeResults = await Promise.all(
    selectedKeys.map(async (sessionKey) => {
      try {
        const out = await openclawToolsInvoke<any>('session_status', {}, { sessionKey, timeoutMs: 10_000 });
        const statusText = sessionStatusText(out.raw);
        const queue = parseQueue(statusText);
        const row = rows.find((r) => r.key === sessionKey);
        return {
          ok: true,
          sessionKey,
          updatedAtMs: row?.updatedAtMs || 0,
          model: row?.model || '',
          kind: row?.kind || '',
          queueMode: queue.mode || '',
          queueDepth: queue.depth,
          queueLine: queue.line,
        };
      } catch (err: any) {
        warnings.push(`session_status failed for ${sessionKey}: ${err?.message || err}`);
        return {
          ok: false,
          sessionKey,
          updatedAtMs: 0,
          model: '',
          kind: '',
          queueMode: '',
          queueDepth: null as number | null,
          queueLine: '',
        };
      }
    })
  );

  const depths = probeResults
    .map((s) => s.queueDepth)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const totalDepth = depths.reduce((acc, n) => acc + n, 0);
  const maxDepth = depths.length ? Math.max(...depths) : 0;
  const avgDepth = depths.length ? totalDepth / depths.length : 0;
  const nonZeroDepthSessions = probeResults
    .filter((s) => typeof s.queueDepth === 'number' && s.queueDepth > 0)
    .map((s) => s.sessionKey);

  const modeCounts: Record<string, number> = {};
  for (const s of probeResults) {
    const mode = String(s.queueMode || '').trim() || 'unknown';
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
  }

  let pendingNotifications = 0;
  let oldestPendingAgeSeconds = 0;
  let backlogOverdueCount = 0;
  let deliveryDlqTotal = 0;
  let deliveryDlqLast24h = 0;
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      filter: 'delivered = false',
    });
    const pending = await pbFetch<any>(`/api/collections/notifications/records?${q.toString()}`);
    const items = Array.isArray(pending?.items) ? pending.items : [];
    const totalItems = typeof pending?.totalItems === 'number' ? pending.totalItems : items.length;
    pendingNotifications = totalItems;

    const now = Date.now();
    const oldestMs = items.length
      ? items.reduce((min: number, n: any) => {
          const ms = parseDateMs(n?.created);
          if (!ms) return min;
          if (!min) return ms;
          return Math.min(min, ms);
        }, 0)
      : 0;
    oldestPendingAgeSeconds = oldestMs ? Math.max(0, Math.floor((now - oldestMs) / 1000)) : 0;
    backlogOverdueCount = items.reduce((acc: number, n: any) => {
      const createdMs = parseDateMs(n?.created);
      if (!createdMs) return acc;
      return now - createdMs > backlogSloSeconds * 1000 ? acc + 1 : acc;
    }, 0);
  } catch (err: any) {
    warnings.push(`Pending notification probe failed: ${err?.message || err}`);
  }

  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      filter: `type = "delivery_dlq"`,
    });
    const dlq = await pbFetch<any>(`/api/collections/activities/records?${q.toString()}`);
    const items = Array.isArray(dlq?.items) ? dlq.items : [];
    deliveryDlqTotal = typeof dlq?.totalItems === 'number' ? dlq.totalItems : items.length;
    const cutoff = Date.now() - 24 * 60 * 60_000;
    deliveryDlqLast24h = items.reduce((acc: number, a: any) => {
      const ms = parseDateMs(a?.createdAt || a?.created);
      if (!ms) return acc;
      return ms >= cutoff ? acc + 1 : acc;
    }, 0);
  } catch (err: any) {
    warnings.push(`Delivery DLQ probe failed: ${err?.message || err}`);
  }

  const violations: string[] = [];
  if (maxDepth > queueDepthSlo) violations.push(`Queue depth exceeded SLO (${maxDepth} > ${queueDepthSlo}).`);
  if (oldestPendingAgeSeconds > backlogSloSeconds) {
    violations.push(`Oldest pending notification exceeded SLO (${oldestPendingAgeSeconds}s > ${backlogSloSeconds}s).`);
  }

  return NextResponse.json({
    ok: true,
    telemetry: {
      capturedAt: new Date().toISOString(),
      monitoredSessions: probeResults.length,
      queue: {
        sampledSessions: depths.length,
        totalDepth,
        maxDepth,
        avgDepth: Number(avgDepth.toFixed(2)),
        nonZeroDepthSessions,
        modes: modeCounts,
      },
      dispatch: {
        pendingNotifications,
        oldestPendingAgeSeconds,
        backlogOverdueCount,
        deliveryDlqTotal,
        deliveryDlqLast24h,
      },
      slo: {
        healthy: violations.length === 0,
        queueDepthSlo,
        backlogSloSeconds,
        violations,
      },
      sessions: probeResults,
      warnings,
    },
  });
}
