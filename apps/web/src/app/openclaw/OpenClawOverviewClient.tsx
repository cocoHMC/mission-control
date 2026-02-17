'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type ModelStatus = {
  defaultModel?: string;
  resolvedDefault?: string;
  fallbacks?: string[];
  configPath?: string;
  auth?: { oauth?: { profiles?: Array<{ profileId?: string; status?: string; expiresAt?: number; remainingMs?: number }> } };
};

type NodesStatus = {
  ts?: number;
  nodes?: Array<{
    nodeId?: string;
    displayName?: string;
    platform?: string;
    remoteIp?: string;
    paired?: boolean;
    connected?: boolean;
  }>;
};

type ApprovalsSnapshot = {
  path?: string;
  exists?: boolean;
  hash?: string;
  file?: {
    version?: number;
    defaults?: any;
    agents?: Record<string, { allowlist?: Array<{ pattern?: string; lastUsedAt?: number }> }>;
  };
};

type SecurityAudit = {
  ts?: number;
  summary?: { critical?: number; warn?: number; info?: number };
  findings?: Array<{ severity?: string; title?: string; detail?: string; remediation?: string }>;
};

function formatTime(msOrIso?: number | string) {
  if (!msOrIso) return '';
  try {
    const d = typeof msOrIso === 'number' ? new Date(msOrIso) : new Date(msOrIso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  } catch {
    return '';
  }
}

export function OpenClawOverviewClient() {
  const pathname = usePathname();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [gatewayOutput, setGatewayOutput] = React.useState<string>('');
  const [agentsCount, setAgentsCount] = React.useState<number | null>(null);
  const [modelStatus, setModelStatus] = React.useState<ModelStatus | null>(null);
  const [nodesStatus, setNodesStatus] = React.useState<NodesStatus | null>(null);
  const [approvals, setApprovals] = React.useState<ApprovalsSnapshot | null>(null);
  const [security, setSecurity] = React.useState<SecurityAudit | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, agentsRes, modelsRes, nodesRes, approvalsRes, securityRes] = await Promise.all([
        mcFetch('/api/openclaw/status', { cache: 'no-store' }),
        mcFetch('/api/openclaw/agents', { cache: 'no-store' }),
        mcFetch('/api/openclaw/models/status', { cache: 'no-store' }),
        mcFetch('/api/openclaw/nodes/status', { cache: 'no-store' }),
        mcFetch('/api/openclaw/approvals', { cache: 'no-store' }),
        mcFetch('/api/openclaw/security/audit', { cache: 'no-store' }),
      ]);

      const statusJson = await statusRes.json().catch(() => null);
      if (statusRes.ok) setGatewayOutput(String(statusJson?.output || '').trim());
      else setGatewayOutput(String(statusJson?.error || 'OpenClaw status failed.'));

      const agentsJson = await agentsRes.json().catch(() => null);
      if (agentsRes.ok) setAgentsCount(Array.isArray(agentsJson?.agents) ? agentsJson.agents.length : null);
      else setAgentsCount(null);

      const modelsJson = await modelsRes.json().catch(() => null);
      if (modelsRes.ok) setModelStatus((modelsJson?.status as ModelStatus) || null);
      else setModelStatus(null);

      const nodesJson = await nodesRes.json().catch(() => null);
      if (nodesRes.ok) setNodesStatus((nodesJson?.status as NodesStatus) || null);
      else setNodesStatus(null);

      const approvalsJson = await approvalsRes.json().catch(() => null);
      if (approvalsRes.ok) setApprovals((approvalsJson?.approvals as ApprovalsSnapshot) || null);
      else setApprovals(null);

      const securityJson = await securityRes.json().catch(() => null);
      if (securityRes.ok) setSecurity((securityJson?.audit as SecurityAudit) || null);
      else setSecurity(null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  const pairedNodes = nodesStatus?.nodes?.filter((n) => n?.paired).length ?? 0;
  const connectedNodes = nodesStatus?.nodes?.filter((n) => n?.connected).length ?? 0;
  const allowlistCount = (() => {
    const agents = approvals?.file?.agents || {};
    let total = 0;
    for (const a of Object.values(agents)) total += Array.isArray(a?.allowlist) ? a.allowlist.length : 0;
    return total;
  })();

  const navItems = [
    { href: '/openclaw/gateway', label: 'Gateway' },
    { href: '/openclaw/status', label: 'Status + costs' },
    { href: '/openclaw/models', label: 'Models' },
    { href: '/openclaw/channels', label: 'Channels' },
    { href: '/openclaw/skills', label: 'Skills' },
    { href: '/openclaw/memory', label: 'Memory' },
    { href: '/openclaw/cron', label: 'Cron' },
    { href: '/openclaw/system', label: 'System' },
    { href: '/openclaw/devices', label: 'Devices' },
    { href: '/openclaw/approvals', label: 'Approvals' },
    { href: '/openclaw/security', label: 'Security' },
    { href: '/openclaw/doctor', label: 'Doctor' },
    { href: '/openclaw/update', label: 'Update' },
    { href: '/openclaw/plugins', label: 'Plugins' },
    { href: '/openclaw/logs', label: 'Logs' },
    { href: '/agents', label: 'Agents' },
    { href: '/sessions', label: 'Sessions' },
    { href: '/nodes', label: 'Nodes' },
    { href: '/openclaw/configure', label: 'Guided settings' },
    { href: '/openclaw/config', label: 'Advanced config' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Gateway</Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            Agents: {agentsCount ?? '—'}
          </Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            Nodes: {pairedNodes} paired / {connectedNodes} connected
          </Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Allowlist: {allowlistCount}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow)]">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 mc-scroll">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex shrink-0 items-center rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold transition ${
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? 'border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]'
                  : 'bg-[var(--surface)] text-[var(--foreground)] hover:bg-[color:var(--foreground)]/5'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Gateway Status</span>
              <div className="flex items-center gap-2">
                <Link href="/openclaw/gateway">
                  <Button size="sm" variant="secondary">
                    Gateway controls
                  </Button>
                </Link>
                <Link href="/openclaw/configure">
                  <Button size="sm" variant="secondary">
                    Guided settings
                  </Button>
                </Link>
                <Link href="/openclaw/config">
                  <Button size="sm" variant="secondary">
                    Advanced config
                  </Button>
                </Link>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
              <pre className="whitespace-pre-wrap">{gatewayOutput || 'Loading...'}</pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>
              Default:{' '}
              <span className="font-mono text-xs text-[var(--foreground)]">{modelStatus?.defaultModel || '—'}</span>
            </div>
            <div>
              Fallbacks:{' '}
              <span className="font-mono text-xs text-[var(--foreground)]">
                {Array.isArray(modelStatus?.fallbacks) && modelStatus!.fallbacks!.length
                  ? modelStatus!.fallbacks!.join(', ')
                  : '—'}
              </span>
            </div>
            {Array.isArray(modelStatus?.auth?.oauth?.profiles) && modelStatus!.auth!.oauth!.profiles!.length ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">OAuth</div>
                <div className="mt-2 space-y-1">
                  {modelStatus!.auth!.oauth!.profiles!.slice(0, 6).map((p, idx) => (
                    <div key={`${p.profileId || ''}-${idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono">{p.profileId || 'profile'}</span>
                      <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                        {p.status || 'unknown'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nodes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>
              Paired: <span className="font-mono text-xs text-[var(--foreground)]">{pairedNodes}</span>
            </div>
            <div>
              Connected: <span className="font-mono text-xs text-[var(--foreground)]">{connectedNodes}</span>
            </div>
            {nodesStatus?.nodes?.length ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Recent</div>
                <div className="mt-2 space-y-2">
                  {nodesStatus.nodes.slice(0, 3).map((n) => (
                    <div key={n.nodeId || n.displayName} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-[var(--foreground)]">{n.displayName || 'node'}</div>
                        <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                          {n.connected ? 'connected' : 'offline'}
                        </Badge>
                      </div>
                      {n.remoteIp ? <div className="font-mono">{n.remoteIp}</div> : null}
                      {n.nodeId ? (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-1">
                          <span className="min-w-0 truncate font-mono">{n.nodeId}</span>
                          <CopyButton value={n.nodeId} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                No nodes reported by OpenClaw.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>
              File: <span className="font-mono text-xs text-[var(--foreground)]">{approvals?.path || '—'}</span>
            </div>
            <div>
              Allowlist entries: <span className="font-mono text-xs text-[var(--foreground)]">{allowlistCount}</span>
            </div>
            {allowlistCount ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Agents</div>
                <div className="mt-2 space-y-1">
                  {Object.entries(approvals?.file?.agents || {}).slice(0, 6).map(([agentId, val]) => (
                    <div key={agentId} className="flex items-center justify-between gap-2">
                      <span className="font-mono">{agentId}</span>
                      <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                        {Array.isArray(val?.allowlist) ? val.allowlist.length : 0}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                No allowlist entries. Exec will prompt (or fail) depending on your policy.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Security Audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                critical: {security?.summary?.critical ?? '—'}
              </Badge>
              <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                warn: {security?.summary?.warn ?? '—'}
              </Badge>
              <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                info: {security?.summary?.info ?? '—'}
              </Badge>
              {security?.ts ? <span className="text-xs text-muted">ran {formatTime(security.ts)}</span> : null}
            </div>

            {security?.findings?.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {security.findings.slice(0, 6).map((f, idx) => (
                  <div key={`${f.title || ''}-${idx}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[var(--foreground)]">{f.title || 'Finding'}</div>
                      <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">
                        {String(f.severity || 'info')}
                      </Badge>
                    </div>
                    {f.detail ? <div className="mt-2 whitespace-pre-wrap text-xs">{f.detail}</div> : null}
                    {f.remediation ? (
                      <div className="mt-2 text-xs">
                        <span className="font-semibold text-[var(--foreground)]">Remediation:</span> {f.remediation}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
                No findings loaded.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
