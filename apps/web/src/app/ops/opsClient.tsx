'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';
import { cn, formatShortDate } from '@/lib/utils';

type HealthRow = { ok: boolean; label: string; detail?: string; raw?: any };

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function badgeClass(ok: boolean) {
  return ok ? 'bg-emerald-600 text-white border-none' : 'bg-red-600 text-white border-none';
}

export function OpsClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);

  const [health, setHealth] = React.useState<HealthRow[]>([]);
  const [approvals, setApprovals] = React.useState<any>(null);
  const [mcSessions, setMcSessions] = React.useState<any[]>([]);
  const [runs, setRuns] = React.useState<any[]>([]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [mcHealthRes, pbHealthRes, ocPingRes, ocStatusRes, approvalsRes, sessionsRes, runsRes] = await Promise.all([
        mcFetch('/api/health', { cache: 'no-store' }),
        mcFetch('/api/pb/health', { cache: 'no-store' }),
        mcFetch('/api/openclaw/ping', { cache: 'no-store' }),
        mcFetch('/api/openclaw/status', { cache: 'no-store' }),
        mcFetch('/api/openclaw/approvals', { cache: 'no-store' }),
        mcFetch(`/api/openclaw/sessions?${new URLSearchParams({ limit: '200', offset: '0', messageLimit: '1' }).toString()}`, {
          cache: 'no-store',
        }),
        mcFetch(`/api/workflow-runs?${new URLSearchParams({ page: '1', perPage: '20', sort: '-createdAt' }).toString()}`, {
          cache: 'no-store',
        }),
      ]);

      const [mcHealth, pbHealth, ocPing, ocStatus, approvalsJson, sessionsJson, runsJson] = await Promise.all([
        mcHealthRes.json().catch(() => null),
        pbHealthRes.json().catch(() => null),
        ocPingRes.json().catch(() => null),
        ocStatusRes.json().catch(() => null),
        approvalsRes.json().catch(() => null),
        sessionsRes.json().catch(() => null),
        runsRes.json().catch(() => null),
      ]);

      const rows: HealthRow[] = [
        { ok: Boolean(mcHealthRes.ok && mcHealth?.ok), label: 'Mission Control web', detail: mcHealth?.ts || '' , raw: mcHealth },
        { ok: Boolean(pbHealthRes.ok && pbHealth?.ok), label: 'PocketBase', detail: pbHealth?.health?.code ? String(pbHealth.health.code) : '' , raw: pbHealth },
        { ok: Boolean(ocPingRes.ok && ocPing?.ok), label: 'OpenClaw gateway tools', detail: ocPing?.ok ? 'tools/invoke ok' : (ocPing?.error || ''), raw: ocPing },
        { ok: Boolean(ocStatusRes.ok && ocStatus?.ok), label: 'OpenClaw status', detail: ocStatusRes.ok ? 'ok' : (ocStatus?.error || ''), raw: ocStatus },
      ];
      setHealth(rows);

      setApprovals(approvalsRes.ok ? approvalsJson?.approvals : approvalsJson);

      const sessRows = Array.isArray(sessionsJson?.rows) ? (sessionsJson.rows as any[]) : [];
      const filtered = sessRows
        .filter((r) => typeof r?.sessionKey === 'string' && r.sessionKey.includes(':mc:'))
        .sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')))
        .slice(0, 15);
      setMcSessions(filtered);

      const runItems = Array.isArray(runsJson?.items) ? (runsJson.items as any[]) : [];
      setRuns(runItems.slice(0, 20));

      setUpdatedAt(new Date().toISOString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted">
          {updatedAt ? (
            <>
              Updated <span className="font-mono">{formatShortDate(updatedAt)}</span>
            </>
          ) : (
            'Loading…'
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Health</div>
          <div className="mt-4 space-y-3">
            {health.map((h) => (
              <details key={h.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <summary className="cursor-pointer">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{h.label}</div>
                      {h.detail ? <div className="mt-1 text-xs text-muted">{h.detail}</div> : null}
                    </div>
                    <Badge className={badgeClass(h.ok)}>{h.ok ? 'ok' : 'fail'}</Badge>
                  </div>
                </summary>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)]">
                  {safeJsonStringify(h.raw)}
                </pre>
              </details>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Link href="/openclaw">
              <Button size="sm" variant="secondary">
                OpenClaw console
              </Button>
            </Link>
            <Link href="/workflows">
              <Button size="sm" variant="secondary">
                Workflows
              </Button>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Approvals Snapshot</div>
            <Link href="/openclaw/approvals">
              <Button size="sm" variant="secondary">
                Manage
              </Button>
            </Link>
          </div>
          <div className="mt-2 text-xs text-muted">
            If the gateway is stuck waiting for exec approvals, workflows and agents will stall.
          </div>
          <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
            {approvals ? safeJsonStringify(approvals) : '(no data)'}
          </pre>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Recent Mission Control Sessions</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{mcSessions.length}</span>
              <Link href="/sessions">
                <Button size="sm" variant="secondary">
                  All sessions
                </Button>
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {mcSessions.map((s) => {
              const key = String(s?.sessionKey || '');
              const meta = [
                s?.model ? `model ${s.model}` : '',
                typeof s?.tokensPct === 'number' ? `ctx ${s.tokensPct}%` : '',
                s?.updatedAt ? `updated ${formatShortDate(s.updatedAt)}` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={key} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-[var(--foreground)]">{key}</div>
                      {meta ? <div className="mt-1 text-xs text-muted">{meta}</div> : null}
                      {s?.previewText ? (
                        <div className="mt-2 line-clamp-3 text-xs text-muted">{String(s.previewText)}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <CopyButton value={key} label="Copy" />
                      <Link href={`/sessions/${encodeURIComponent(key)}`}>
                        <Button size="sm" variant="secondary">
                          Open
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
            {!mcSessions.length ? <div className="text-sm text-muted">No Mission Control sessions found.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Recent Workflow Runs</div>
            <Link href="/workflows">
              <Button size="sm" variant="secondary">
                Open
              </Button>
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {runs.map((r) => (
              <details key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <summary className="cursor-pointer">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {r.status || 'queued'}{' '}
                        <span className="text-xs text-muted">
                          {String(r.workflowId || '').slice(0, 8)}
                          {r.taskId ? ` · task ${String(r.taskId).slice(0, 8)}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {r.createdAt ? formatShortDate(r.createdAt) : ''} {r.sessionKey ? ` · ${r.sessionKey}` : ''}
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        'border-none',
                        r.status === 'failed'
                          ? 'bg-red-600 text-white'
                          : r.status === 'succeeded'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[var(--accent)] text-[var(--background)]'
                      )}
                    >
                      {r.status || 'queued'}
                    </Badge>
                  </div>
                </summary>
                {r.log ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)]">
                    {String(r.log)}
                  </pre>
                ) : null}
              </details>
            ))}
            {!runs.length ? <div className="text-sm text-muted">No workflow runs yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

